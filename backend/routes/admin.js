// Settings -> Audit Log, and generic CSV Import/Export.
//
// Audit rows are written by services/workflowAutomation.js's writeAudit(),
// which runs on every module's create/update path.
//
// Mount: app.use('/api/admin', requireAuth, require('./routes/admin'));

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const svc = require('../services/metadataService');

// ===== Audit log =====
router.get('/audit', requirePermission('settings', 'view'), (req, res) => {
  const { module: moduleApiName, record_id, user_id, action, limit } = req.query;
  let sql = `
    SELECT a.*, m.api_name AS module_api_name, m.singular_label, u.username, u.full_name
    FROM module_audit_log a
    JOIN modules m ON m.id = a.module_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE 1=1`;
  const params = [];
  if (moduleApiName) { sql += ' AND m.api_name = ?'; params.push(moduleApiName); }
  if (record_id) { sql += ' AND a.record_id = ?'; params.push(record_id); }
  if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id); }
  if (action) { sql += ' AND a.action = ?'; params.push(action); }
  sql += ' ORDER BY a.created_at DESC, a.id DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 200, 1000));
  res.json(db.prepare(sql).all(...params));
});

// ===== CSV helpers =====
// Deliberately hand-rolled rather than adding a CSV dependency: the format
// here is narrow (quote fields containing a comma, quote or newline; double
// up embedded quotes) and this keeps the dependency surface small.
function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
}

function parseCsv(text) {
  // Handles quoted fields, embedded commas/newlines, and doubled quotes.
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function resolveModuleOrThrow(apiName) {
  const mod = svc.getModule(apiName);
  if (!mod) throw Object.assign(new Error(`Module "${apiName}" not found`), { status: 404 });
  if (!mod.table_name) throw Object.assign(new Error('Import/export is only available for modules with their own table'), { status: 400 });
  return mod;
}

// Real physical columns, minus the ones a user should never set by hand.
const SYSTEM_COLS = new Set(['id', 'created_at', 'updated_at', 'created_by']);
function importableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((c) => c.name).filter((n) => !SYSTEM_COLS.has(n));
}

// ===== Export =====
// GET /api/admin/export/:module -> text/csv
router.get('/export/:module', requirePermission('settings', 'view'), (req, res) => {
  try {
    const mod = resolveModuleOrThrow(req.params.module);
    const perm = req.user.permissions?.[mod.api_name];
    if (!perm?.export && !perm?.view) return res.status(403).json({ error: `You don't have export access to ${mod.plural_label}` });

    const cols = db.prepare(`PRAGMA table_info(${mod.table_name})`).all().map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM ${mod.table_name}`).all();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${mod.api_name}.csv`);
    res.send(toCsv(rows, cols));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/admin/import-template/:module -> a header-only CSV to fill in
router.get('/import-template/:module', requirePermission('settings', 'view'), (req, res) => {
  try {
    const mod = resolveModuleOrThrow(req.params.module);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${mod.api_name}-template.csv`);
    res.send(importableColumns(mod.table_name).join(',') + '\n');
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ===== Import =====
// POST /api/admin/import/:module  { csv: "...", dry_run?: true }
// Always validates the whole file first and reports every problem before
// writing anything — a half-imported file is worse than a rejected one.
router.post('/import/:module', requirePermission('settings', 'edit'), (req, res) => {
  try {
    const mod = resolveModuleOrThrow(req.params.module);
    const perm = req.user.permissions?.[mod.api_name];
    if (!perm?.create) return res.status(403).json({ error: `You don't have create access to ${mod.plural_label}` });

    const rows = parseCsv(req.body.csv || '');
    if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row' });

    const header = rows[0].map((h) => h.trim());
    const allowed = importableColumns(mod.table_name);
    const unknown = header.filter((h) => h && !allowed.includes(h));
    if (unknown.length) {
      return res.status(400).json({ error: `Unknown column(s): ${unknown.join(', ')}`, allowed_columns: allowed });
    }
    const usable = header.filter((h) => allowed.includes(h));
    if (usable.length === 0) return res.status(400).json({ error: 'No recognised columns in the header row', allowed_columns: allowed });

    // Validate NOT NULL columns that have no default — the most common
    // cause of a partially-failed import.
    const tableInfo = db.prepare(`PRAGMA table_info(${mod.table_name})`).all();
    const required = tableInfo.filter((c) => c.notnull && c.dflt_value === null && !SYSTEM_COLS.has(c.name)).map((c) => c.name);
    const missingRequired = required.filter((r) => !usable.includes(r));

    const errors = [];
    const dataRows = rows.slice(1);
    dataRows.forEach((r, idx) => {
      const lineNo = idx + 2; // 1-indexed, +1 for the header
      if (missingRequired.length) return; // reported once below instead of per row
      usable.forEach((col, ci) => {
        if (required.includes(col) && !String(r[ci] ?? '').trim()) {
          errors.push(`Line ${lineNo}: "${col}" is required but empty`);
        }
      });
    });
    if (missingRequired.length) {
      return res.status(400).json({ error: `Missing required column(s): ${missingRequired.join(', ')}`, allowed_columns: allowed });
    }
    if (errors.length) return res.status(400).json({ error: 'Import rejected — nothing was written', issues: errors.slice(0, 50), total_issues: errors.length });

    if (req.body.dry_run) {
      return res.json({ dry_run: true, would_import: dataRows.length, columns: usable });
    }

    const placeholders = usable.map(() => '?').join(',');
    const insert = db.prepare(`INSERT INTO ${mod.table_name} (${usable.join(',')}) VALUES (${placeholders})`);
    const headerIndex = usable.map((c) => header.indexOf(c));
    let imported = 0;
    const tx = db.transaction(() => {
      for (const r of dataRows) {
        insert.run(headerIndex.map((hi) => {
          const v = r[hi];
          return v === undefined || v === '' ? null : v;
        }));
        imported++;
      }
    });
    tx(); // all-or-nothing: a mid-file failure rolls the whole import back
    res.json({ imported, columns: usable });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
