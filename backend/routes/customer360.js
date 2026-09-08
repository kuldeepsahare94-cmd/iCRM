// Customer 360 — the unified account command centre from the brief.
// One request returns the whole picture so the page renders in a single
// round-trip instead of a dozen chained fetches.
//
// Mount: app.use('/api/c360', requireAuth, require('./routes/customer360'));

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { scoreAccount, scoreLead } = require('../services/scoring');

router.get('/accounts/:id', requirePermission('accounts', 'view'), (req, res) => {
  const id = req.params.id;
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const all = (sql, ...p) => db.prepare(sql).all(id, ...p);
  const one = (sql, ...p) => db.prepare(sql).get(id, ...p) || {};

  const contacts = all(`SELECT id, first_name, last_name, job_title, email, mobile, contact_status
                        FROM contacts WHERE account_id=? ORDER BY first_name`);
  const opportunities = all(`
    SELECT o.id, o.opportunity_name, o.amount, o.currency, o.probability, o.expected_close_date,
           s.name AS stage, s.color AS stage_color, s.is_won, s.is_lost
    FROM opportunities o LEFT JOIN module_pipeline_stages s ON s.id=o.stage_id
    WHERE o.account_id=? ORDER BY o.updated_at DESC`);
  const quotations = all(`SELECT id, quote_number, status, grand_total, currency, quote_date, valid_until
                          FROM quotations WHERE account_id=? ORDER BY quote_date DESC`);
  const subscriptions = all(`SELECT id, subscription_number, plan, status, recurring_amount, billing_cycle, renewal_date
                             FROM subscriptions WHERE account_id=? ORDER BY renewal_date`);
  const tickets = all(`SELECT id, ticket_number, subject, status, priority, created_at, resolved_at
                       FROM tickets WHERE account_id=? ORDER BY created_at DESC LIMIT 20`);
  const payments = all(`SELECT id, payment_number, amount, status, payment_date
                        FROM payments WHERE account_id=? ORDER BY payment_date DESC LIMIT 20`);
  const documents = all(`SELECT id, title, file_name, external_url, size_bytes, created_at
                         FROM documents WHERE related_module='accounts' AND related_record_id=? ORDER BY created_at DESC`);
  const tasks = all(`SELECT id, task_title, status, priority, due_date
                     FROM tasks WHERE related_module='accounts' AND related_record_id=? AND status!='Completed'
                     ORDER BY due_date`);

  // One merged timeline across every activity type, newest first.
  const timeline = db.prepare(`
    SELECT 'call' AS type, id, call_subject AS title, call_outcome AS detail,
           COALESCE(disposed_at, created_at) AS at, duration_seconds
    FROM calls WHERE related_module='accounts' AND related_record_id=?
    UNION ALL
    SELECT 'meeting', id, meeting_title, status, COALESCE(start_datetime, created_at), NULL
    FROM meetings WHERE related_module='accounts' AND related_record_id=?
    UNION ALL
    SELECT 'note', id, COALESCE(title, substr(body,1,60)), NULL, created_at, NULL
    FROM notes WHERE related_module='accounts' AND related_record_id=?
    UNION ALL
    SELECT 'email', id, subject, direction, COALESCE(sent_at, created_at), NULL
    FROM emails WHERE related_module='accounts' AND related_record_id=?
    ORDER BY at DESC LIMIT 30
  `).all(id, id, id, id);

  const commercial = {
    won_value: opportunities.filter((o) => o.is_won).reduce((s, o) => s + (o.amount || 0), 0),
    open_pipeline: opportunities.filter((o) => !o.is_won && !o.is_lost).reduce((s, o) => s + (o.amount || 0), 0),
    weighted_pipeline: opportunities.filter((o) => !o.is_won && !o.is_lost)
      .reduce((s, o) => s + (o.amount || 0) * ((o.probability ?? 0) / 100), 0),
    mrr: subscriptions.filter((s) => s.status === 'Active')
      .reduce((sum, s) => sum + (s.billing_cycle === 'Yearly' ? s.recurring_amount / 12
        : s.billing_cycle === 'Quarterly' ? s.recurring_amount / 3 : s.recurring_amount || 0), 0),
    paid_total: payments.filter((p) => p.status === 'Paid').reduce((s, p) => s + (p.amount || 0), 0),
    open_quotes: quotations.filter((q) => ['Draft', 'Sent', 'Viewed'].includes(q.status)).length,
  };
  commercial.arr = commercial.mrr * 12;

  // "Attention required" — computed from real state, so the page can lead
  // with what's actually wrong rather than a generic banner.
  const today = new Date().toISOString().slice(0, 10);
  const attention = [];
  const urgentTickets = tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status) && ['High', 'Urgent'].includes(t.priority));
  if (urgentTickets.length) attention.push({ severity: 'high', text: `${urgentTickets.length} high-priority ticket(s) open` });
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today);
  if (overdueTasks.length) attention.push({ severity: 'high', text: `${overdueTasks.length} overdue task(s)` });
  const renewals = subscriptions.filter((s) => s.status === 'Active' && s.renewal_date
    && (new Date(s.renewal_date) - Date.now()) / 86400000 <= 30);
  if (renewals.length) attention.push({ severity: 'medium', text: `${renewals.length} subscription(s) renewing within 30 days` });
  const staleQuotes = quotations.filter((q) => q.status === 'Sent' && q.valid_until && q.valid_until.slice(0, 10) < today);
  if (staleQuotes.length) attention.push({ severity: 'medium', text: `${staleQuotes.length} quotation(s) past their valid-until date` });
  if (contacts.length === 0) attention.push({ severity: 'medium', text: 'No contacts on this account' });
  const lastTouch = timeline[0]?.at;
  if (lastTouch) {
    const quiet = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
    if (quiet > 45) attention.push({ severity: 'medium', text: `No activity logged for ${quiet} days` });
  } else attention.push({ severity: 'low', text: 'No activity has been logged yet' });

  res.json({
    account,
    scoring: scoreAccount(Number(id)),
    commercial,
    contacts,
    opportunities,
    quotations,
    subscriptions,
    tickets,
    payments,
    documents,
    tasks,
    timeline,
    attention,
  });
});

// Lead score with its full explanation, for the lead detail header.
router.get('/leads/:id/score', requirePermission('leads', 'view'), (req, res) => {
  const result = scoreLead(Number(req.params.id));
  if (!result) return res.status(404).json({ error: 'Lead not found' });
  res.json(result);
});

module.exports = router;
