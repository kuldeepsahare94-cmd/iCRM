/*
 * Demo data generator — for TESTING AND DEMOS ONLY.
 *
 * This exists so the Reports module can be checked against data that has
 * shape: several months of history, deals that won and lost, tickets that
 * breached SLA, payments that are still pending. Empty tables make every
 * chart look correct because every chart is empty.
 *
 * It is NOT wired into the server and never runs on boot. Run it by hand:
 *
 *     node seed-demo-data.js            # add demo data
 *     node seed-demo-data.js --wipe     # remove ONLY rows this script added
 *
 * Everything it inserts is tagged (accounts, leads and so on carry a
 * recognisable marker) so --wipe can remove exactly what it created and
 * leave real records alone. Do not run this on an instance holding real
 * customer data; there is no reason to, and the tagging is a safety net,
 * not a guarantee.
 */

const db = require('./db');

const TAG = '[demo]';

const INDUSTRIES = ['Education', 'Manufacturing', 'IT Services', 'Healthcare', 'Retail', 'Logistics', 'Finance'];
const SOURCES = ['Website', 'Referral', 'Facebook Ads', 'Google Ads', 'Cold Call', 'Exhibition', 'Partner'];
const CAMPAIGNS = ['Q1 Webinar', 'Diwali Offer', 'LinkedIn Outreach', 'Trade Show Mumbai', 'Email Nurture'];
const CITIES = ['Nagpur', 'Pune', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Delhi', 'Indore', 'Nashik'];
const RATINGS = ['Hot', 'Warm', 'Cold'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Demo Done', 'Proposal Sent', 'Lost'];
const MODES = ['UPI', 'Bank Transfer', 'Cheque', 'Cash', 'Card'];
const CATEGORIES = ['Billing', 'Technical', 'Onboarding', 'Feature Request', 'Data Import'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const LOSS_REASONS = ['Price too high', 'Chose competitor', 'No budget', 'No decision', 'Bad timing'];

let seed = 20260919;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function int(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function dateAgo(n) { return daysAgo(n).slice(0, 10); }
function dateAhead(n) { return dateAgo(-n); }

function wipe() {
  const stmts = [
    "DELETE FROM opportunity_stage_history WHERE opportunity_id IN (SELECT id FROM opportunities WHERE description LIKE '%' || ? || '%')",
    "DELETE FROM quotation_items WHERE quotation_id IN (SELECT id FROM quotations WHERE notes LIKE '%' || ? || '%')",
    "DELETE FROM quotations WHERE notes LIKE '%' || ? || '%'",
    "DELETE FROM payments WHERE remarks LIKE '%' || ? || '%'",
    "DELETE FROM subscriptions WHERE notes LIKE '%' || ? || '%'",
    "DELETE FROM tickets WHERE description LIKE '%' || ? || '%'",
    "DELETE FROM calls WHERE notes LIKE '%' || ? || '%'",
    "DELETE FROM meetings WHERE agenda LIKE '%' || ? || '%'",
    "DELETE FROM tasks WHERE description LIKE '%' || ? || '%'",
    "DELETE FROM emails WHERE body LIKE '%' || ? || '%'",
    "DELETE FROM opportunities WHERE description LIKE '%' || ? || '%'",
    "DELETE FROM contacts WHERE notes LIKE '%' || ? || '%'",
    "DELETE FROM leads WHERE remarks LIKE '%' || ? || '%'",
    "DELETE FROM products WHERE description LIKE '%' || ? || '%'",
    "DELETE FROM accounts WHERE description LIKE '%' || ? || '%'",
  ];
  let total = 0;
  for (const s of stmts) {
    try { total += db.prepare(s).run(TAG).changes; } catch (e) { console.warn('skip:', e.message); }
  }
  console.log(`removed ${total} demo rows`);
}

function seedAll() {
  const users = db.prepare('SELECT id FROM users WHERE active = 1').all().map((u) => u.id);
  if (!users.length) throw new Error('No users — create at least one user first.');
  const stages = db.prepare(`
    SELECT s.id, s.name, s.is_won, s.is_lost, s.sort_order FROM module_pipeline_stages s
    JOIN module_pipelines p ON p.id = s.pipeline_id JOIN modules m ON m.id = p.module_id
    WHERE m.api_name = 'opportunities' ORDER BY s.sort_order
  `).all();
  if (!stages.length) throw new Error('No opportunity pipeline configured.');

  // ---- products -----------------------------------------------------------
  const productNames = [
    ['CRM Professional Licence', 'Software', 45000],
    ['CRM Enterprise Licence', 'Software', 180000],
    ['Implementation & Setup', 'Services', 60000],
    ['Annual Support Plan', 'Support', 36000],
    ['Data Migration', 'Services', 25000],
    ['Onsite Training (2 days)', 'Services', 30000],
  ];
  const insProduct = db.prepare(`INSERT INTO products (product_name, sku, product_type, category, description,
    unit, selling_price, cost_price, tax_percent, currency, recurring, billing_frequency, active, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'Unit', ?, ?, 18, 'INR', ?, ?, 1, ?, ?)`);
  const productIds = productNames.map(([name, cat, price], i) => insProduct.run(
    name, `SKU-${1000 + i}`, cat === 'Software' ? 'Product' : 'Service', cat, `${TAG} demo catalogue item`,
    price, Math.round(price * 0.4), cat === 'Support' ? 1 : 0, cat === 'Support' ? 'Annual' : null,
    pick(users), daysAgo(400),
  ).lastInsertRowid);

  // ---- accounts + contacts ------------------------------------------------
  const companyBases = ['Sunrise', 'Vertex', 'Blue Orbit', 'Sharma', 'Greenfield', 'Nova', 'Pinnacle', 'Kumar',
    'Orion', 'Silverline', 'Deccan', 'Everest', 'Lotus', 'Vega', 'Summit', 'Crestwood', 'Aurora', 'Meridian'];
  const suffixes = ['Technologies', 'Industries', 'Solutions', 'Enterprises', 'Systems', 'Group'];
  const insAccount = db.prepare(`INSERT INTO accounts (account_name, account_type, industry, website, email, phone,
    employees_count, annual_revenue, country, state, city, status, customer_since, owner_id, lead_source,
    description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'India', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insContact = db.prepare(`INSERT INTO contacts (first_name, last_name, job_title, account_id, email, phone,
    mobile, city, contact_type, contact_status, owner_id, lead_source, last_contacted, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const accountIds = [];
  companyBases.forEach((base, i) => {
    const created = int(30, 420);
    const name = `${base} ${pick(suffixes)}`;
    const city = pick(CITIES);
    const id = insAccount.run(
      name, i % 4 === 0 ? 'Prospect' : 'Customer', pick(INDUSTRIES),
      `https://${base.toLowerCase().replace(/\s/g, '')}.example.com`,
      `contact@${base.toLowerCase().replace(/\s/g, '')}.example.com`,
      `0712${String(4000000 + i * 1337).slice(0, 7)}`,
      int(10, 800), int(50, 900) * 100000, 'Maharashtra', city,
      i % 7 === 0 ? 'Inactive' : 'Active', dateAgo(created), pick(users), pick(SOURCES),
      `${TAG} demo account`, daysAgo(created), daysAgo(int(1, created)),
    ).lastInsertRowid;
    accountIds.push(id);

    for (let c = 0; c < int(1, 3); c += 1) {
      insContact.run(
        pick(['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anita', 'Rajesh', 'Meera', 'Arjun', 'Kavita']),
        pick(['Sharma', 'Patel', 'Reddy', 'Nair', 'Joshi', 'Desai', 'Kulkarni', 'Iyer']),
        pick(['Director', 'IT Manager', 'Owner', 'Operations Head', 'Finance Manager', 'Principal']),
        id, `person${i}${c}@${base.toLowerCase().replace(/\s/g, '')}.example.com`,
        `0712${String(5000000 + i * 91 + c).slice(0, 7)}`, `98${String(60000000 + i * 7919 + c).slice(0, 8)}`,
        city, 'Primary', 'Active', pick(users), pick(SOURCES),
        // A third of contacts are deliberately left with no last_contacted,
        // so the engagement report has a real "never contacted" bucket.
        c % 3 === 0 ? null : dateAgo(int(1, 200)),
        `${TAG} demo contact`, daysAgo(int(1, created)),
      );
    }
  });

  // ---- leads --------------------------------------------------------------
  const insLead = db.prepare(`INSERT INTO leads (student_name, account_name, mobile, email, city, source, status,
    assigned_counselor, lead_rating, lead_score, campaign, product_interest, remarks, created_at,
    converted_account_id, converted_opportunity_id, converted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const userNames = db.prepare('SELECT id, COALESCE(full_name, username) AS name FROM users WHERE active = 1').all();

  const insOpp = db.prepare(`INSERT INTO opportunities (opportunity_name, account_id, primary_contact_id, pipeline_id,
    stage_id, opportunity_type, lead_source, owner_id, amount, currency, probability, expected_close_date,
    product_service, description, lost_reason, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT id FROM module_pipelines WHERE active = 1 LIMIT 1), ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?)`);
  const insHistory = db.prepare(`INSERT INTO opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?)`);

  const oppIds = [];
  for (let i = 0; i < 240; i += 1) {
    const createdDays = int(1, 400);
    const counselor = pick(userNames);
    const converts = rnd() < 0.28;
    const accountId = pick(accountIds);

    let oppId = null;
    if (converts) {
      // A converted lead produces a real deal, and that deal walks through
      // the pipeline leaving stage history behind — which is what the
      // velocity and funnel reports read.
      const target = pick(stages);
      const path = stages.filter((s) => s.sort_order <= target.sort_order && !s.is_lost);
      const won = target.is_won ? 1 : 0;
      const lost = rnd() < 0.22 && !won;
      const finalStage = lost ? stages.find((s) => s.is_lost) : target;
      const amount = pick([25000, 45000, 60000, 120000, 180000, 240000, 450000, 900000, 1400000]);
      const closedDays = int(0, Math.max(1, createdDays - 5));

      oppId = insOpp.run(
        `${pick(['CRM rollout', 'Licence renewal', 'Expansion', 'New implementation', 'Support contract'])} — deal ${i + 1}`,
        accountId, null, finalStage.id, pick(['New Business', 'Renewal', 'Upsell']), pick(SOURCES),
        counselor.id, amount, finalStage.probability ?? int(10, 90),
        (won || lost) ? dateAgo(closedDays) : dateAhead(int(1, 120)),
        pick(productNames)[0], `${TAG} demo opportunity`,
        lost ? pick(LOSS_REASONS) : null,
        daysAgo(createdDays), daysAgo((won || lost) ? closedDays : int(0, createdDays)),
      ).lastInsertRowid;
      oppIds.push(oppId);

      let prev = null;
      let at = createdDays;
      for (const s of path) {
        insHistory.run(oppId, prev, s.id, counselor.id, daysAgo(at));
        prev = s.id;
        at = Math.max(0, at - int(2, 18));
      }
      if (lost) insHistory.run(oppId, prev, finalStage.id, counselor.id, daysAgo(Math.max(0, at - 2)));
    }

    insLead.run(
      `${pick(['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anita', 'Deepak', 'Neha'])} ${pick(['Sharma', 'Patel', 'Reddy', 'Nair', 'Joshi'])}`,
      `${pick(companyBases)} ${pick(suffixes)}`,
      `9${String(700000000 + i * 137).slice(0, 9)}`, `lead${i}@example.com`,
      pick(CITIES), pick(SOURCES),
      converts ? 'Qualified' : pick(LEAD_STATUSES),
      counselor.name, pick(RATINGS), int(10, 100), pick(CAMPAIGNS), pick(productNames)[0],
      `${TAG} demo lead`, daysAgo(createdDays),
      converts ? accountId : null, oppId, converts ? daysAgo(int(0, createdDays)) : null,
    );
  }

  // ---- quotations ---------------------------------------------------------
  const insQuote = db.prepare(`INSERT INTO quotations (quote_number, quote_date, valid_until, account_id,
    opportunity_id, currency, salesperson_id, subtotal, total_discount, tax_total, grand_total, notes, status,
    sent_at, accepted_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insItem = db.prepare(`INSERT INTO quotation_items (quotation_id, product_id, description, quantity,
    unit_price, discount_percent, tax_percent, line_total, sort_order) VALUES (?, ?, ?, ?, ?, ?, 18, ?, ?)`);

  for (let i = 0; i < 90; i += 1) {
    const created = int(1, 330);
    const status = pick(['Draft', 'Sent', 'Sent', 'Accepted', 'Accepted', 'Rejected', 'Expired']);
    const lines = int(1, 3);
    let subtotal = 0; let discount = 0;
    const items = [];
    for (let l = 0; l < lines; l += 1) {
      const pi = int(0, productIds.length - 1);
      const qty = int(1, 5);
      const unit = productNames[pi][2];
      const disc = pick([0, 0, 5, 10, 15, 20]);
      const lineTotal = Math.round(qty * unit * (1 - disc / 100));
      subtotal += qty * unit;
      discount += qty * unit - lineTotal;
      items.push([productIds[pi], productNames[pi][0], qty, unit, disc, lineTotal, l]);
    }
    const net = subtotal - discount;
    const tax = Math.round(net * 0.18);
    const qid = insQuote.run(
      `QT-${2600 + i}`, dateAgo(created), dateAgo(created - 30), pick(accountIds),
      oppIds.length ? pick(oppIds) : null, pick(users),
      subtotal, discount, tax, net + tax, `${TAG} demo quotation`, status,
      status === 'Draft' ? null : daysAgo(created - 1),
      status === 'Accepted' ? daysAgo(Math.max(0, created - 6)) : null,
      daysAgo(created),
    ).lastInsertRowid;
    for (const [pid, desc, qty, unit, disc, lineTotal, sort] of items) {
      insItem.run(qid, pid, desc, qty, unit, disc, lineTotal, sort);
    }
  }

  // ---- payments -----------------------------------------------------------
  const insPayment = db.prepare(`INSERT INTO payments (payment_number, payment_date, account_id, payer_name,
    description, amount, payment_mode, transaction_number, status, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 200; i += 1) {
    const days = int(1, 380);
    const status = pick(['Paid', 'Paid', 'Paid', 'Paid', 'Pending', 'Partial']);
    insPayment.run(
      `PMT-${5200 + i}`, dateAgo(days), pick(accountIds), 'Accounts Department',
      pick(['Licence fee', 'Implementation', 'Annual support', 'Training', 'Renewal']),
      pick([25000, 36000, 45000, 60000, 90000, 120000, 180000, 240000]),
      pick(MODES), `TXN${900000 + i}`, status, `${TAG} demo payment`, daysAgo(days),
    );
  }

  // ---- subscriptions ------------------------------------------------------
  const insSub = db.prepare(`INSERT INTO subscriptions (subscription_number, account_id, product_id, plan,
    start_date, end_date, billing_cycle, quantity, unit_price, recurring_amount, currency, auto_renewal,
    renewal_date, status, owner_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 48; i += 1) {
    const start = int(30, 700);
    const cycle = pick(['Monthly', 'Quarterly', 'Annual', 'Annual']);
    const amount = pick([3000, 9000, 15000, 36000, 60000, 120000]);
    const status = pick(['Active', 'Active', 'Active', 'Active', 'Cancelled', 'Expired']);
    insSub.run(
      `SUB-${800 + i}`, pick(accountIds), pick(productIds), pick(['Starter', 'Professional', 'Enterprise']),
      dateAgo(start), dateAhead(int(-60, 300)), cycle, 1, amount, amount,
      rnd() < 0.7 ? 1 : 0, dateAhead(int(-40, 300)), status, pick(users), `${TAG} demo subscription`, daysAgo(start),
    );
  }

  // ---- tickets ------------------------------------------------------------
  const insTicket = db.prepare(`INSERT INTO tickets (ticket_number, subject, account_id, category, priority,
    status, source, assigned_agent_id, sla_tier, sla_due_at, first_response_at, resolution_at, resolved_at,
    closed_at, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 160; i += 1) {
    const created = int(1, 300);
    const resolved = rnd() < 0.72;
    const respHours = int(1, 30);
    const resHours = respHours + int(2, 90);
    const slaHours = pick([8, 24, 48]);
    const createdAt = daysAgo(created);
    const plus = (hrs) => {
      const d = new Date(createdAt.replace(' ', 'T') + 'Z');
      d.setHours(d.getHours() + hrs);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };
    insTicket.run(
      `TKT-${3100 + i}`,
      pick(['Cannot log in', 'Invoice mismatch', 'Import failed', 'Need extra user licence',
        'Report shows wrong total', 'Request for training', 'Email not syncing']),
      pick(accountIds), pick(CATEGORIES), pick(PRIORITIES),
      resolved ? pick(['Resolved', 'Closed']) : pick(['Open', 'In Progress', 'Pending']),
      pick(['Email', 'Phone', 'Portal']), pick(users),
      `${slaHours}h`, plus(slaHours), plus(respHours),
      resolved ? plus(resHours) : null, resolved ? plus(resHours) : null,
      resolved && rnd() < 0.6 ? plus(resHours + 4) : null,
      `${TAG} demo ticket`, createdAt,
    );
  }

  // ---- calls, meetings, tasks, emails -------------------------------------
  const insCall = db.prepare(`INSERT INTO calls (call_subject, related_module, related_record_id, phone_number,
    call_type, direction, start_time, duration_minutes, duration_seconds, connected, assigned_user_id, status,
    call_outcome, notes, created_by, created_at)
    VALUES (?, 'leads', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?, ?, ?)`);
  for (let i = 0; i < 420; i += 1) {
    const days = int(0, 240);
    const connected = rnd() < 0.55;
    const mins = connected ? int(1, 24) : 0;
    const u = pick(users);
    insCall.run(
      pick(['Follow-up call', 'Demo scheduling', 'Renewal discussion', 'Cold outreach', 'Payment reminder']),
      null, `98${String(70000000 + i * 31).slice(0, 8)}`,
      'Voice', rnd() < 0.25 ? 'Inbound' : 'Outbound', daysAgo(days), mins, mins * 60,
      connected ? 1 : 0, u,
      connected ? pick(['Interested', 'Demo Scheduled', 'Call Back Later', 'Not Interested', 'Converted'])
        : pick(['No Answer', 'Busy', 'Switched Off', 'Wrong Number']),
      `${TAG} demo call`, u, daysAgo(days),
    );
  }

  const insMeeting = db.prepare(`INSERT INTO meetings (meeting_title, related_module, meeting_type, location,
    start_datetime, end_datetime, organizer_id, assigned_user_id, status, agenda, created_by, created_at)
    VALUES (?, 'accounts', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 130; i += 1) {
    const days = int(-20, 240);
    const u = pick(users);
    insMeeting.run(
      pick(['Product demo', 'Requirement discussion', 'Commercial negotiation', 'Quarterly review', 'Kick-off']),
      pick(['Online', 'Onsite', 'Office']), pick(CITIES), daysAgo(days), daysAgo(days),
      u, u,
      days < 0 ? 'Scheduled' : pick(['Held', 'Held', 'Held', 'Cancelled', 'No Show']),
      `${TAG} demo meeting`, u, daysAgo(Math.max(0, days)),
    );
  }

  const insTask = db.prepare(`INSERT INTO tasks (task_title, related_module, assigned_to_id, priority, status,
    start_date, due_date, description, completed_date, created_by, created_at)
    VALUES (?, 'leads', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 260; i += 1) {
    const days = int(0, 200);
    const done = rnd() < 0.62;
    const u = pick(users);
    insTask.run(
      pick(['Send proposal', 'Call back', 'Share brochure', 'Schedule demo', 'Collect payment', 'Prepare quote']),
      u, pick(PRIORITIES), done ? 'Completed' : pick(['Open', 'In Progress', 'Pending']),
      dateAgo(days), dateAgo(days - int(-40, 20)), `${TAG} demo task`,
      done ? dateAgo(Math.max(0, days - int(0, 10))) : null, u, daysAgo(days),
    );
  }

  const insEmail = db.prepare(`INSERT INTO emails (subject, from_address, to_address, related_module, direction,
    status, body, sent_at, received_at, created_by, created_at)
    VALUES (?, ?, ?, 'accounts', ?, 'Sent', ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 300; i += 1) {
    const days = int(0, 260);
    const inbound = rnd() < 0.4;
    insEmail.run(
      pick(['Proposal attached', 'Re: Pricing', 'Meeting confirmation', 'Invoice', 'Follow-up']),
      inbound ? 'customer@example.com' : 'sales@example.com',
      inbound ? 'sales@example.com' : 'customer@example.com',
      inbound ? 'Inbound' : 'Outbound', `${TAG} demo email`,
      inbound ? null : daysAgo(days), inbound ? daysAgo(days) : null, pick(users), daysAgo(days),
    );
  }

  console.log('demo data inserted:');
  for (const t of ['accounts', 'contacts', 'leads', 'opportunities', 'opportunity_stage_history', 'quotations',
    'quotation_items', 'payments', 'subscriptions', 'tickets', 'calls', 'meetings', 'tasks', 'emails', 'products']) {
    console.log(`  ${t.padEnd(26)} ${db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c}`);
  }
}

if (process.argv.includes('--wipe')) wipe();
else db.transaction(seedAll)();
