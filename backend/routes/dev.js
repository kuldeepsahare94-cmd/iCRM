const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

// Admin-only, one-click sample data so every module has something to look at.
// Safe to call more than once — existing rows are matched by name/number and
// skipped rather than duplicated.
router.post('/seed-demo-data', requirePermission('settings', 'edit'), (req, res) => {
  const counts = {};

  // ---- Leads (industry-neutral: company contacts evaluating a product) ----
  const owners = ['Ravi', 'Meena', 'Farah'];
  const sources = ['Referral', 'Walk-in', 'Instagram', 'Google', 'Website'];
  const leadNames = ['Anita Kumar', 'Sunil Rao', 'Priya Verma', 'Rahul Sharma', 'Divya Iyer', 'Karan Malhotra', 'Neha Joshi', 'Vikram Singh'];
  const statuses = ['New', 'Contacted', 'Interested', 'Follow-up', 'Not Interested'];
  const ratings = ['Hot', 'Warm', 'Cold'];
  const interests = ['CRM Platform', 'Analytics Add-on', 'Support Plan'];
  const leadIds = [];
  leadNames.forEach((name, i) => {
    const exists = db.prepare('SELECT id FROM leads WHERE student_name=?').get(name);
    if (exists) { leadIds.push(exists.id); return; }
    const info = db.prepare(`
      INSERT INTO leads (student_name, mobile, source, city, assigned_counselor, status, follow_up_date, lead_rating, lead_score, product_interest, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      name, `98765${String(10000 + i)}`, sources[i % sources.length], 'Nagpur',
      owners[i % owners.length], statuses[i % statuses.length],
      i % 3 === 0 ? new Date().toISOString().slice(0, 10) : null,
      ratings[i % ratings.length], 40 + (i * 7) % 60, interests[i % interests.length],
      daysAgo(i)
    );
    leadIds.push(info.lastInsertRowid);
  });
  counts.leads = leadIds.length;


  // ---- Universal CRM modules (Accounts, Contacts, Opportunities, Quotations, Products, Subscriptions, Tickets) ----
const accountDefs = [
  ['Meridian Manufacturing', 'Manufacturing', 'Customer', 'Nagpur'],
  ['Solstice Retail Group', 'Retail', 'Customer', 'Pune'],
  ['Northwind Logistics', 'Logistics', 'Prospect', 'Mumbai'],
];
const accountIds = [];
for (const [name, industry, type, city] of accountDefs) {
  const exists = db.prepare('SELECT id FROM accounts WHERE account_name=?').get(name);
  if (exists) { accountIds.push(exists.id); continue; }
  const info = db.prepare(`INSERT INTO accounts (account_name, industry, account_type, city, status) VALUES (?,?,?,?, 'Active')`)
    .run(name, industry, type, city);
  accountIds.push(info.lastInsertRowid);
}
counts.accounts = accountIds.length;

const contactDefs = [
  ['Rohan', 'Deshpande', accountIds[0], 'Operations Head', '9900011001'],
  ['Simran', 'Kaur', accountIds[1], 'Procurement Manager', '9900011002'],
  ['Arvind', 'Nair', accountIds[2], 'CEO', '9900011003'],
];
const contactIds = [];
for (const [first, last, accountId, title, mobile] of contactDefs) {
  const exists = db.prepare('SELECT id FROM contacts WHERE first_name=? AND last_name=?').get(first, last);
  if (exists) { contactIds.push(exists.id); continue; }
  const info = db.prepare(`INSERT INTO contacts (first_name, last_name, account_id, job_title, mobile, contact_status) VALUES (?,?,?,?,?, 'Active')`)
    .run(first, last, accountId, title, mobile);
  contactIds.push(info.lastInsertRowid);
}
counts.contacts = contactIds.length;

const productDefs = [
  ['CRM Implementation Package', 'CRM-IMPL', 'Service', 75000, 0, null],
  ['Standard Support Plan', 'SUP-STD', 'Subscription', 8000, 1, 'Monthly'],
  ['Data Migration Add-on', 'CRM-MIG', 'Service', 20000, 0, null],
];
const productIds = [];
for (const [name, sku, type, price, recurring, freq] of productDefs) {
  const exists = db.prepare('SELECT id FROM products WHERE sku=?').get(sku);
  if (exists) { productIds.push(exists.id); continue; }
  const info = db.prepare(`INSERT INTO products (product_name, sku, product_type, selling_price, tax_percent, recurring, billing_frequency, active) VALUES (?,?,?,?,18,?,?,1)`)
    .run(name, sku, type, price, recurring, freq);
  productIds.push(info.lastInsertRowid);
}
counts.products = productIds.length;

// Opportunities across the default pipeline's stages, so the Kanban board has something on every column.
const oppModule = db.prepare("SELECT id FROM modules WHERE api_name='opportunities'").get();
const pipeline = oppModule && db.prepare('SELECT id FROM module_pipelines WHERE module_id=? AND is_default=1').get(oppModule.id);
const stages = pipeline ? db.prepare('SELECT * FROM module_pipeline_stages WHERE pipeline_id=? ORDER BY sort_order').all(pipeline.id) : [];
const oppDefs = [
  ['Meridian — CRM Rollout', accountIds[0], contactIds[0], 250000, 0],
  ['Solstice — Support Renewal', accountIds[1], contactIds[1], 96000, 2],
  ['Northwind — New Business', accountIds[2], contactIds[2], 400000, 4],
];
const oppIds = [];
for (const [name, accountId, contactId, amount, stageIdx] of oppDefs) {
  const exists = db.prepare('SELECT id FROM opportunities WHERE opportunity_name=?').get(name);
  if (exists) { oppIds.push(exists.id); continue; }
  const stage = stages[stageIdx] || stages[0];
  const info = db.prepare(`
    INSERT INTO opportunities (opportunity_name, account_id, primary_contact_id, pipeline_id, stage_id, amount, currency, probability, expected_close_date)
    VALUES (?,?,?,?,?,?, 'INR', ?, ?)
  `).run(name, accountId, contactId, pipeline?.id || null, stage?.id || null, amount, stage?.probability ?? 20, daysAgo(-14));
  const oppId = info.lastInsertRowid;
  if (stage) db.prepare('INSERT INTO opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id) VALUES (?,?,?)').run(oppId, null, stage.id);
  oppIds.push(oppId);
}
counts.opportunities = oppIds.length;

// One quotation with two line items, totals computed the same way routes/quotations.js does.
const quoteExists = db.prepare("SELECT id FROM quotations WHERE quote_number='QT-DEMO1'").get();
let quoteId = quoteExists?.id;
if (!quoteExists) {
  const qInfo = db.prepare(`
    INSERT INTO quotations (quote_number, account_id, contact_id, opportunity_id, status, currency)
    VALUES ('QT-DEMO1', ?, ?, ?, 'Sent', 'INR')
  `).run(accountIds[0], contactIds[0], oppIds[0]);
  quoteId = qInfo.lastInsertRowid;
  const items = [
    { product_id: productIds[0], description: 'Implementation', quantity: 1, unit_price: 75000, discount_percent: 0, tax_percent: 18 },
    { product_id: productIds[2], description: 'Data migration', quantity: 1, unit_price: 20000, discount_percent: 5, tax_percent: 18 },
  ];
  let subtotal = 0, totalDiscount = 0, taxTotal = 0;
  const insertItem = db.prepare(`INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`);
  items.forEach((it, i) => {
    const gross = it.quantity * it.unit_price;
    const discountAmt = gross * (it.discount_percent / 100);
    const taxAmt = (gross - discountAmt) * (it.tax_percent / 100);
    const lineTotal = gross - discountAmt + taxAmt;
    insertItem.run(quoteId, it.product_id, it.description, it.quantity, it.unit_price, it.discount_percent, it.tax_percent, lineTotal, i);
    subtotal += gross; totalDiscount += discountAmt; taxTotal += taxAmt;
  });
  db.prepare(`UPDATE quotations SET subtotal=?, total_discount=?, tax_total=?, grand_total=?, sent_at=? WHERE id=?`)
    .run(subtotal, totalDiscount, taxTotal, subtotal - totalDiscount + taxTotal, daysAgo(10), quoteId);
}
counts.quotations = quoteExists ? 0 : 1;

// One active subscription with a payment on it.
const subExists = db.prepare("SELECT id FROM subscriptions WHERE subscription_number='SUB-DEMO1'").get();
if (!subExists) {
  const sInfo = db.prepare(`
    INSERT INTO subscriptions (subscription_number, account_id, contact_id, product_id, plan, billing_cycle, recurring_amount, currency, status, start_date, renewal_date)
    VALUES ('SUB-DEMO1', ?, ?, ?, 'Standard Support', 'Monthly', 8000, 'INR', 'Active', ?, ?)
  `).run(accountIds[1], contactIds[1], productIds[1], daysAgo(60), daysAgo(-30));
  const subId = sInfo.lastInsertRowid;
  db.prepare(`INSERT INTO subscription_payments (subscription_id, payment_date, amount, currency, payment_method, status) VALUES (?,?,?,?,?, 'Paid')`)
    .run(subId, daysAgo(30), 8000, 'INR', 'Bank Transfer');
}
counts.subscriptions = subExists ? 0 : 1;

// A couple of tickets, one already replied to.
const ticketDefs = [
  ['Login page throwing 500 error', accountIds[0], contactIds[0], 'High', 'Open'],
  ['Question about invoice GST breakup', accountIds[1], contactIds[1], 'Low', 'Resolved'],
];
let ticketCount = 0;
for (const [subject, accountId, contactId, priority, status] of ticketDefs) {
  const exists = db.prepare('SELECT id FROM tickets WHERE subject=?').get(subject);
  if (exists) continue;
  const tInfo = db.prepare(`INSERT INTO tickets (ticket_number, subject, account_id, contact_id, priority, status, source) VALUES (?,?,?,?,?,?, 'Email')`)
    .run(`TKT-DEMO${ticketCount + 1}`, subject, accountId, contactId, priority, status);
  if (status === 'Resolved') {
    db.prepare(`INSERT INTO ticket_replies (ticket_id, is_internal, body) VALUES (?,0,?)`)
      .run(tInfo.lastInsertRowid, 'The GST breakup is 9% CGST + 9% SGST, shown on page 2 of the invoice PDF.');
    db.prepare(`UPDATE tickets SET first_response_at=datetime('now'), resolved_at=datetime('now') WHERE id=?`).run(tInfo.lastInsertRowid);
  }
  ticketCount++;
}
counts.tickets = ticketCount;

  res.json({ message: 'Demo data loaded', counts });
});

module.exports = router;
