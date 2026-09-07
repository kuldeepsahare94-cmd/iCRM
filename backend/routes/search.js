// Universal Global Search (master prompt section 18). Searches across every
// enabled module the requesting user has 'view' permission for, grouped by
// module. Three storage shapes exist in this app, so three search paths:
//
//   1. Modules with module_fields metadata (Accounts, Contacts, Calls, ...):
//      search across their real text-like columns, driven by field_type —
//      genuinely metadata-driven, works for a future custom module too.
//   2. Legacy modules with a real table but no module_fields rows yet
//      (Leads, Students, companies_legacy, Courses, Admissions, Placements):
//      a small hardcoded per-table column list, same idea as the original
//      GlobalSearch component this replaces, just centralized server-side.
//   3. Custom (JSON-backed) modules: search their record_name column.
//
// Mount in server.js as: app.use('/api/search', requireAuth, require('./routes/search'));

const express = require('express');
const router = express.Router();
const db = require('../db');

// Field types worth a LIKE match — deliberately narrower than the stored
// `searchable` flag on module_fields (which defaults to 1 for every field
// regardless of type, including numbers/dates/checkboxes — LIKE against
// those produces confusing partial-number matches, not useful search).
const SEARCHABLE_TYPES = new Set(['text', 'email', 'phone', 'url', 'textarea', 'dropdown', 'radio']);

// Legacy tables that predate the module/field metadata layer.
const LEGACY_SEARCH = {
  leads: { columns: ['student_name', 'mobile', 'source'], label: (r) => r.student_name, sub: (r) => r.mobile },
  students: { columns: ['student_name', 'mobile', 'email'], label: (r) => r.student_name, sub: (r) => r.mobile },
  companies_legacy: { table: 'companies', columns: ['company_name', 'industry'], label: (r) => r.company_name, sub: (r) => r.industry },
  courses: { columns: ['course_name'], label: (r) => r.course_name, sub: () => '' },
  admissions: { columns: ['admission_number'], label: (r) => r.admission_number, sub: () => '' },
  placements: { columns: [], label: (r) => `Placement #${r.id}`, sub: () => '' }, // no obvious text column — skipped below
};

function hasView(user, moduleApiName) {
  const perm = user.permissions && user.permissions[moduleApiName];
  return !!(perm && perm.view);
}

// Best-effort "what's the title of this record" for metadata-driven modules
// — mirrors the frontend's recordTitle() heuristic in fieldUtils.jsx, kept
// in sync deliberately so search results read the same as the record's own
// list/detail page.
function pickDisplayField(fields) {
  return fields.find((f) => ['name', 'title', 'subject'].some((k) => f.api_name.includes(k)))
    || fields.find((f) => f.required) || fields[0];
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 5, 20);
  if (!q || q.length < 2) return res.json({ groups: [] });
  const like = `%${q}%`;

  const modules = db.prepare('SELECT * FROM modules WHERE enabled=1 ORDER BY sidebar_group, sidebar_order, plural_label').all();
  const groups = [];

  for (const mod of modules) {
    if (!hasView(req.user, mod.api_name)) continue;

    // Path 2: legacy hardcoded tables
    if (LEGACY_SEARCH[mod.api_name]) {
      const cfg = LEGACY_SEARCH[mod.api_name];
      if (cfg.columns.length === 0) continue;
      const table = cfg.table || mod.api_name;
      const where = cfg.columns.map((c) => `${c} LIKE ?`).join(' OR ');
      const rows = db.prepare(`SELECT * FROM ${table} WHERE ${where} LIMIT ?`).all(...cfg.columns.map(() => like), limit);
      if (rows.length) groups.push({ module: { api_name: mod.api_name, plural_label: mod.plural_label, icon: mod.icon, color: mod.color },
        results: rows.map((r) => ({ id: r.id, label: cfg.label(r), sub: cfg.sub(r) })) });
      continue;
    }

    // Path 3: custom (JSON-backed) modules
    if (!mod.table_name) {
      const rows = db.prepare('SELECT id, record_name FROM custom_module_records WHERE module_id=? AND record_name LIKE ? LIMIT ?').all(mod.id, like, limit);
      if (rows.length) groups.push({ module: { api_name: mod.api_name, plural_label: mod.plural_label, icon: mod.icon, color: mod.color },
        results: rows.map((r) => ({ id: r.id, label: r.record_name || `#${r.id}` })) });
      continue;
    }

    // Path 1: metadata-driven modules
    const fields = db.prepare('SELECT * FROM module_fields WHERE module_id=? AND is_system=1').all(mod.id);
    const searchFields = fields.filter((f) => SEARCHABLE_TYPES.has(f.field_type));
    if (searchFields.length === 0) continue;
    const displayField = pickDisplayField(fields) || searchFields[0];
    const where = searchFields.map((f) => `${f.api_name} LIKE ?`).join(' OR ');
    const rows = db.prepare(`SELECT * FROM ${mod.table_name} WHERE ${where} LIMIT ?`).all(...searchFields.map(() => like), limit);
    if (rows.length) groups.push({ module: { api_name: mod.api_name, plural_label: mod.plural_label, icon: mod.icon, color: mod.color },
      results: rows.map((r) => ({ id: r.id, label: r[displayField.api_name] || `#${r.id}`, sub: '' })) });
  }

  res.json({ groups });
});

module.exports = router;
