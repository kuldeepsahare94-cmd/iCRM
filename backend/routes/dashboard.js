const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');


// ============================================================================
// Universal CRM dashboard (master prompt section 17). Kept in this same file
// since it's additive to the existing dashboard route, not a replacement —
// GET /api/dashboard still returns the original placement/education view
// unchanged; this is a second, separate summary the frontend renders as a
// second tab.
// ============================================================================
router.get('/crm', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;
  const sum = (sql, ...params) => db.prepare(sql).get(...params).s || 0;

  const cards = {
    total_leads: count('SELECT COUNT(*) c FROM leads'),
    open_opportunities: count(`
      SELECT COUNT(*) c FROM opportunities o LEFT JOIN module_pipeline_stages s ON s.id=o.stage_id
      WHERE COALESCE(s.is_won,0)=0 AND COALESCE(s.is_lost,0)=0
    `),
    pipeline_value: sum(`
      SELECT COALESCE(SUM(o.amount),0) s FROM opportunities o LEFT JOIN module_pipeline_stages st ON st.id=o.stage_id
      WHERE COALESCE(st.is_won,0)=0 AND COALESCE(st.is_lost,0)=0
    `),
    weighted_pipeline: sum(`
      SELECT COALESCE(SUM(o.amount * COALESCE(o.probability, st.probability, 0) / 100.0),0) s
      FROM opportunities o LEFT JOIN module_pipeline_stages st ON st.id=o.stage_id
      WHERE COALESCE(st.is_won,0)=0 AND COALESCE(st.is_lost,0)=0
    `),
    won_revenue_month: sum(`
      SELECT COALESCE(SUM(o.amount),0) s FROM opportunities o JOIN module_pipeline_stages st ON st.id=o.stage_id
      WHERE st.is_won=1 AND date(o.updated_at) >= date(?)
    `, monthStart),
    lost_this_month: count(`
      SELECT COUNT(*) c FROM opportunities o JOIN module_pipeline_stages st ON st.id=o.stage_id
      WHERE st.is_lost=1 AND date(o.updated_at) >= date(?)
    `, monthStart),
    open_tickets: count(`SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('Resolved','Closed')`),
    overdue_tasks: count(`SELECT COUNT(*) c FROM tasks WHERE status != 'Completed' AND due_date IS NOT NULL AND date(due_date) < date(?)`, today),
    todays_calls: count(`SELECT COUNT(*) c FROM calls WHERE date(COALESCE(start_time, created_at)) = date(?)`, today),
    todays_meetings: count(`SELECT COUNT(*) c FROM meetings WHERE date(COALESCE(start_datetime, created_at)) = date(?)`, today),
    followups_due_today: count(`
      SELECT COUNT(*) c FROM (
        SELECT follow_up_date d FROM leads WHERE date(follow_up_date) = date(?)
        UNION ALL SELECT next_followup d FROM contacts WHERE date(next_followup) = date(?)
        UNION ALL SELECT expected_close_date d FROM opportunities WHERE date(expected_close_date) = date(?)
      )
    `, today, today, today),
    followups_overdue: count(`
      SELECT COUNT(*) c FROM (
        SELECT follow_up_date d FROM leads WHERE follow_up_date IS NOT NULL AND date(follow_up_date) < date(?)
        UNION ALL SELECT next_followup d FROM contacts WHERE next_followup IS NOT NULL AND date(next_followup) < date(?)
        UNION ALL SELECT expected_close_date d FROM opportunities WHERE expected_close_date IS NOT NULL AND date(expected_close_date) < date(?)
      )
    `, today, today, today),
  };

  // MRR/ARR — normalize every billing cycle to a monthly figure so they're
  // comparable, same logic as routes/subscriptions.js's /summary endpoint.
  const activeSubs = db.prepare(`SELECT recurring_amount, billing_cycle FROM subscriptions WHERE status='Active'`).all();
  const monthly = (s) => (s.billing_cycle === 'Yearly' ? s.recurring_amount / 12 : s.billing_cycle === 'Quarterly' ? s.recurring_amount / 3 : s.recurring_amount);
  const mrr = activeSubs.reduce((total, s) => total + monthly(s), 0);
  cards.mrr = mrr;
  cards.arr = mrr * 12;

  const leads_by_source = db.prepare(`
    SELECT COALESCE(source, 'Unknown') AS source, COUNT(*) c FROM leads GROUP BY source ORDER BY c DESC LIMIT 8
  `).all();

  const opportunities_by_stage = db.prepare(`
    SELECT s.name AS stage, s.color, COUNT(o.id) c, COALESCE(SUM(o.amount),0) total
    FROM module_pipeline_stages s
    JOIN module_pipelines p ON p.id = s.pipeline_id AND p.is_default = 1
    JOIN modules m ON m.id = p.module_id AND m.api_name = 'opportunities'
    LEFT JOIN opportunities o ON o.stage_id = s.id
    GROUP BY s.id ORDER BY s.sort_order
  `).all();

  const revenue_by_month = db.prepare(`
    SELECT strftime('%Y-%m', payment_date) month, COALESCE(SUM(amount),0) revenue
    FROM subscription_payments WHERE status='Paid' AND payment_date IS NOT NULL
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();

  // Global recent-activity feed — same five-table union as routes/activities.js,
  // but without a related_record filter, so this is "what happened recently
  // across the whole CRM" rather than one record's timeline.
  const recentSources = [
    { type: 'call', table: 'calls', titleCol: 'call_subject', dateCol: 'start_time' },
    { type: 'meeting', table: 'meetings', titleCol: 'meeting_title', dateCol: 'start_datetime' },
    { type: 'task', table: 'tasks', titleCol: 'task_title', dateCol: 'due_date' },
    { type: 'note', table: 'notes', titleCol: 'body', dateCol: 'created_at' },
    { type: 'email', table: 'emails', titleCol: 'subject', dateCol: 'sent_at' },
  ];
  let recent_activities = [];
  for (const s of recentSources) {
    const rows = db.prepare(`
      SELECT id, ${s.titleCol} AS title, related_module, related_record_id, created_at,
        COALESCE(${s.dateCol}, created_at) AS activity_date
      FROM ${s.table} ORDER BY created_at DESC LIMIT 10
    `).all();
    rows.forEach((r) => recent_activities.push({ ...r, type: s.type }));
  }
  recent_activities.sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
  recent_activities = recent_activities.slice(0, 8);


  // ---- Executive additions (brief §8): answer "what is happening in my
  // CRM today?" rather than only showing totals. All real data.

  // Today's agenda — what actually needs doing, not a generic counter.
  const agenda = {
    follow_ups: db.prepare(`
      SELECT id, student_name AS title, mobile, status, follow_up_date
      FROM leads WHERE date(follow_up_date) = date(?) ORDER BY student_name LIMIT 10`).all(today),
    meetings: db.prepare(`
      SELECT id, meeting_title AS title, start_datetime, related_module, related_record_id
      FROM meetings WHERE date(COALESCE(start_datetime, created_at)) = date(?) ORDER BY start_datetime LIMIT 10`).all(today),
    tasks_due: db.prepare(`
      SELECT id, task_title AS title, priority, due_date, related_module, related_record_id
      FROM tasks WHERE status != 'Completed' AND date(due_date) <= date(?) ORDER BY due_date LIMIT 10`).all(today),
  };

  // Win rate over closed deals only — including open deals in the
  // denominator would understate it and drift as the pipeline grows.
  const closed = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN s.is_won=1 THEN 1 ELSE 0 END),0) won,
           COALESCE(SUM(CASE WHEN s.is_lost=1 THEN 1 ELSE 0 END),0) lost
    FROM opportunities o JOIN module_pipeline_stages s ON s.id=o.stage_id
    WHERE s.is_won=1 OR s.is_lost=1`).get();
  const closedTotal = (closed.won || 0) + (closed.lost || 0);
  const performance = {
    won: closed.won || 0,
    lost: closed.lost || 0,
    // null rather than 0 when nothing has closed — 0% would read as failure.
    win_rate: closedTotal > 0 ? Math.round((closed.won / closedTotal) * 1000) / 10 : null,
    avg_deal_size: closed.won > 0
      ? Math.round(db.prepare(`SELECT COALESCE(AVG(o.amount),0) v FROM opportunities o
          JOIN module_pipeline_stages s ON s.id=o.stage_id WHERE s.is_won=1`).get().v)
      : 0,
  };

  // Things that need a human decision, ranked.
  const attention = [];
  const overdueFollowUps = count(`SELECT COUNT(*) c FROM leads
    WHERE follow_up_date IS NOT NULL AND date(follow_up_date) < date(?)
    AND status NOT IN ('Converted','Not Interested','Dropped')`, today);
  if (overdueFollowUps) attention.push({ severity: 'high', text: `${overdueFollowUps} overdue lead follow-up(s)`, link: '/leads' });
  const urgentTickets = count(`SELECT COUNT(*) c FROM tickets
    WHERE status NOT IN ('Resolved','Closed') AND priority IN ('High','Urgent')`);
  if (urgentTickets) attention.push({ severity: 'high', text: `${urgentTickets} high-priority ticket(s) open`, link: '/records/tickets' });
  const overdueTasks = count(`SELECT COUNT(*) c FROM tasks
    WHERE status != 'Completed' AND due_date IS NOT NULL AND date(due_date) < date(?)`, today);
  if (overdueTasks) attention.push({ severity: 'high', text: `${overdueTasks} overdue task(s)`, link: '/records/tasks' });
  const staleDeals = count(`SELECT COUNT(*) c FROM opportunities o
    LEFT JOIN module_pipeline_stages s ON s.id=o.stage_id
    WHERE COALESCE(s.is_won,0)=0 AND COALESCE(s.is_lost,0)=0
    AND julianday('now') - julianday(o.updated_at) > 30`);
  if (staleDeals) attention.push({ severity: 'medium', text: `${staleDeals} deal(s) with no movement in 30+ days`, link: '/records/opportunities' });
  const expiringQuotes = count(`SELECT COUNT(*) c FROM quotations
    WHERE status='Sent' AND valid_until IS NOT NULL AND date(valid_until) < date(?)`, today);
  if (expiringQuotes) attention.push({ severity: 'medium', text: `${expiringQuotes} quotation(s) past their valid-until date`, link: '/records/quotations' });
  const renewals = count(`SELECT COUNT(*) c FROM subscriptions
    WHERE status='Active' AND renewal_date IS NOT NULL
    AND julianday(renewal_date) - julianday('now') BETWEEN 0 AND 30`);
  if (renewals) attention.push({ severity: 'medium', text: `${renewals} subscription(s) renewing within 30 days`, link: '/records/subscriptions' });

  res.json({ cards, agenda, performance, attention, leads_by_source, opportunities_by_stage, revenue_by_month, recent_activities });
});

module.exports = router;
