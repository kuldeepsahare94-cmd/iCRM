const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { fireEvent } = require('../services/whatsapp/workflowEngine');
const { fireWorkflows } = require('../services/workflowAutomation');
const { buildQuotationPdf, renderQuotationPdfBuffer } = require('../services/quotationPdf');
const { sendEmail, isConfigured: emailConfigured } = require('../services/email');

function resolveMobile(accountId, contactId) {
  if (contactId) {
    const c = db.prepare('SELECT whatsapp, mobile FROM contacts WHERE id=?').get(contactId);
    if (c) return c.whatsapp || c.mobile || null;
  }
  if (accountId) {
    const a = db.prepare('SELECT whatsapp, phone FROM accounts WHERE id=?').get(accountId);
    if (a) return a.whatsapp || a.phone || null;
  }
  return null;
}

function recalcTotals(quotationId) {
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(quotationId);
  let subtotal = 0, totalDiscount = 0, taxTotal = 0;
  const updateItem = db.prepare('UPDATE quotation_items SET line_total=? WHERE id=?');
  for (const item of items) {
    const gross = item.quantity * item.unit_price;
    const discountAmt = gross * ((item.discount_percent || 0) / 100);
    const taxable = gross - discountAmt;
    const taxAmt = taxable * ((item.tax_percent || 0) / 100);
    const lineTotal = taxable + taxAmt;
    updateItem.run(lineTotal, item.id);
    subtotal += gross;
    totalDiscount += discountAmt;
    taxTotal += taxAmt;
  }
  const grandTotal = subtotal - totalDiscount + taxTotal;
  db.prepare(`UPDATE quotations SET subtotal=?, total_discount=?, tax_total=?, grand_total=?, updated_at=datetime('now') WHERE id=?`)
    .run(subtotal, totalDiscount, taxTotal, grandTotal, quotationId);
  return { subtotal, totalDiscount, taxTotal, grandTotal };
}

function nextQuoteNumber() {
  const count = db.prepare('SELECT COUNT(*) c FROM quotations').get().c;
  return `QT-${String(count + 1).padStart(5, '0')}`;
}

router.get('/', requirePermission('quotations', 'view'), (req, res) => {
  const { account_id, opportunity_id, status, q } = req.query;
  let sql = `SELECT q.*, a.account_name FROM quotations q LEFT JOIN accounts a ON a.id = q.account_id WHERE 1=1`;
  const params = [];
  if (account_id) { sql += ' AND q.account_id = ?'; params.push(account_id); }
  if (opportunity_id) { sql += ' AND q.opportunity_id = ?'; params.push(opportunity_id); }
  if (status) { sql += ' AND q.status = ?'; params.push(status); }
  if (q) { sql += ' AND q.quote_number LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY q.quote_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', requirePermission('quotations', 'view'), (req, res) => {
  const quote = db.prepare(`
    SELECT q.*, a.account_name, c.first_name || ' ' || COALESCE(c.last_name,'') AS contact_name
    FROM quotations q LEFT JOIN accounts a ON a.id = q.account_id LEFT JOIN contacts c ON c.id = q.contact_id
    WHERE q.id=?
  `).get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(`
    SELECT qi.*, p.product_name FROM quotation_items qi LEFT JOIN products p ON p.id = qi.product_id
    WHERE qi.quotation_id=? ORDER BY qi.sort_order, qi.id
  `).all(req.params.id);
  res.json({ ...quote, items });
});

// Body: { ...header fields, items: [{ product_id, description, quantity, unit_price, discount_percent, tax_percent }] }
router.post('/', requirePermission('quotations', 'create'), (req, res) => {
  const b = req.body;
  if (!b.account_id) return res.status(400).json({ error: 'account_id is required' });
  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO quotations (
        quote_number, quote_date, valid_until, account_id, contact_id, opportunity_id, billing_address,
        shipping_address, currency, payment_terms, salesperson_id, notes, terms, status
      ) VALUES (@quote_number, @quote_date, @valid_until, @account_id, @contact_id, @opportunity_id, @billing_address,
        @shipping_address, @currency, @payment_terms, @salesperson_id, @notes, @terms, @status)
    `).run({
      quote_number: b.quote_number || nextQuoteNumber(),
      quote_date: b.quote_date || new Date().toISOString(),
      valid_until: null, contact_id: null, opportunity_id: null, billing_address: null, shipping_address: null,
      currency: 'INR', payment_terms: null, salesperson_id: req.user.id, notes: null, terms: null, status: 'Draft',
      ...b,
    });
    const quotationId = info.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, sort_order)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    (b.items || []).forEach((item, i) => {
      insertItem.run(quotationId, item.product_id || null, item.description || null, item.quantity || 1,
        item.unit_price || 0, item.discount_percent || 0, item.tax_percent || 0, i);
    });
    recalcTotals(quotationId);
    return quotationId;
  });
  const quotationId = tx();
  const createdQuote = db.prepare('SELECT * FROM quotations WHERE id=?').get(quotationId);
  fireWorkflows('quotations', 'record_created', createdQuote, null, req.user.id);
  res.status(201).json({ ...db.prepare('SELECT * FROM quotations WHERE id=?').get(quotationId),
    items: db.prepare('SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY sort_order').all(quotationId) });
});

router.put('/:id', requirePermission('quotations', 'edit'), (req, res) => {
  const existing = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  const m = { ...existing, ...b };

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE quotations SET quote_date=?, valid_until=?, account_id=?, contact_id=?, opportunity_id=?, billing_address=?,
        shipping_address=?, currency=?, payment_terms=?, notes=?, terms=?, status=?,
        sent_at=CASE WHEN ?='Sent' AND status!='Sent' THEN datetime('now') ELSE sent_at END,
        accepted_at=CASE WHEN ?='Accepted' AND status!='Accepted' THEN datetime('now') ELSE accepted_at END,
        rejected_at=CASE WHEN ?='Rejected' AND status!='Rejected' THEN datetime('now') ELSE rejected_at END,
        updated_at=datetime('now')
      WHERE id=?
    `).run(m.quote_date, m.valid_until, m.account_id, m.contact_id, m.opportunity_id, m.billing_address,
      m.shipping_address, m.currency, m.payment_terms, m.notes, m.terms, m.status, m.status, m.status, m.status, req.params.id);

    if (Array.isArray(b.items)) {
      db.prepare('DELETE FROM quotation_items WHERE quotation_id=?').run(req.params.id);
      const insertItem = db.prepare(`
        INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, sort_order)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      b.items.forEach((item, i) => {
        insertItem.run(req.params.id, item.product_id || null, item.description || null, item.quantity || 1,
          item.unit_price || 0, item.discount_percent || 0, item.tax_percent || 0, i);
      });
    }
    recalcTotals(req.params.id);
  });
  tx();
  const updated = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
  if (m.status === 'Sent' && existing.status !== 'Sent') {
    const account = updated.account_id && db.prepare('SELECT account_name FROM accounts WHERE id=?').get(updated.account_id);
    const contact = updated.contact_id && db.prepare("SELECT first_name || ' ' || COALESCE(last_name,'') AS name FROM contacts WHERE id=?").get(updated.contact_id);
    fireEvent('quotation_sent', {
      entityType: 'quotation', entityId: updated.id, mobile: resolveMobile(updated.account_id, updated.contact_id),
      fields: { quote_number: updated.quote_number, account_name: account?.account_name || '', contact_name: contact?.name || '', grand_total: updated.grand_total, valid_until: updated.valid_until },
    });
  }
  fireWorkflows('quotations', 'record_updated', updated, existing, req.user.id);
  fireWorkflows('quotations', 'field_changed', updated, existing, req.user.id);
  res.json({ ...db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id),
    items: db.prepare('SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY sort_order').all(req.params.id) });
});

router.post('/:id/duplicate', requirePermission('quotations', 'create'), (req, res) => {
  const existing = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(req.params.id);
  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO quotations (quote_number, quote_date, valid_until, account_id, contact_id, opportunity_id,
        billing_address, shipping_address, currency, payment_terms, salesperson_id, notes, terms, status)
      VALUES (?,datetime('now'),?,?,?,?,?,?,?,?,?,?,?,'Draft')
    `).run(nextQuoteNumber(), existing.valid_until, existing.account_id, existing.contact_id, existing.opportunity_id,
      existing.billing_address, existing.shipping_address, existing.currency, existing.payment_terms, req.user.id,
      existing.notes, existing.terms);
    const newId = info.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, sort_order)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    items.forEach((item) => insertItem.run(newId, item.product_id, item.description, item.quantity, item.unit_price,
      item.discount_percent, item.tax_percent, item.sort_order));
    recalcTotals(newId);
    return newId;
  });
  const newId = tx();
  res.status(201).json(db.prepare('SELECT * FROM quotations WHERE id=?').get(newId));
});

router.delete('/:id', requirePermission('quotations', 'delete'), (req, res) => {
  db.prepare('DELETE FROM quotations WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ===== PDF + send =====
// Loads a quotation with everything the PDF needs. `template` reuses the
// receipt_templates rows so letterhead details are configured once.
function loadForPdf(id, institute) {
  const quotation = db.prepare(`
    SELECT q.*, a.account_name, c.first_name || ' ' || COALESCE(c.last_name,'') AS contact_name, c.email AS contact_email
    FROM quotations q LEFT JOIN accounts a ON a.id = q.account_id LEFT JOIN contacts c ON c.id = q.contact_id
    WHERE q.id=?
  `).get(id);
  if (!quotation) return null;
  const items = db.prepare(`
    SELECT qi.*, p.product_name FROM quotation_items qi LEFT JOIN products p ON p.id = qi.product_id
    WHERE qi.quotation_id=? ORDER BY qi.sort_order, qi.id
  `).all(id);
  const template = db.prepare('SELECT * FROM receipt_templates WHERE id=?').get((institute || 'A').toUpperCase());
  return { quotation, items, template };
}

// GET /api/quotations/:id/pdf?institute=A
router.get('/:id/pdf', requirePermission('quotations', 'view'), (req, res) => {
  const payload = loadForPdf(req.params.id, req.query.institute);
  if (!payload) return res.status(404).json({ error: 'Quotation not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${payload.quotation.quote_number || 'quotation'}.pdf`);
  buildQuotationPdf(payload, res);
});

// POST /api/quotations/:id/send  { to?, subject?, message?, institute? }
// Emails the quotation as a PDF attachment and flips its status to Sent
// (which is the same transition the PUT handler uses, so the existing
// quotation_sent WhatsApp workflow event fires from here too).
router.post('/:id/send', requirePermission('quotations', 'edit'), async (req, res) => {
  const payload = loadForPdf(req.params.id, req.body.institute);
  if (!payload) return res.status(404).json({ error: 'Quotation not found' });
  if (!emailConfigured(req.user.id)) {
    return res.status(503).json({ error: "Email isn't configured yet — set it up in Settings → Email." });
  }

  const { quotation } = payload;
  const to = req.body.to || quotation.contact_email;
  if (!to) return res.status(400).json({ error: 'No recipient — pass "to", or set an email on the linked contact.' });

  try {
    const pdf = await renderQuotationPdfBuffer(payload);
    const subject = req.body.subject || `Quotation ${quotation.quote_number || ''}`.trim();
    const text = req.body.message || `Please find attached quotation ${quotation.quote_number || ''}.`;
    await sendEmail({
      to, subject, text,
      attachments: [{ filename: `${quotation.quote_number || 'quotation'}.pdf`, content: pdf }],
      // Sends from this user's own address where they've configured one.
      userId: req.user.id,
    });

    const existing = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
    if (existing.status !== 'Sent') {
      db.prepare(`UPDATE quotations SET status='Sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(req.params.id);
      const updated = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
      fireEvent('quotation_sent', {
        entityType: 'quotation', entityId: updated.id, mobile: resolveMobile(updated.account_id, updated.contact_id),
        fields: { quote_number: updated.quote_number, account_name: quotation.account_name || '', contact_name: quotation.contact_name || '', grand_total: updated.grand_total, valid_until: updated.valid_until },
      });
      fireWorkflows('quotations', 'record_updated', updated, existing, req.user.id);
      fireWorkflows('quotations', 'field_changed', updated, existing, req.user.id);
    }
    res.json({ sent_to: to, quotation: db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id) });
  } catch (e) {
    res.status(502).json({ error: 'Could not send: ' + e.message });
  }
});

module.exports = router;
