// Email account settings — org and per-user SMTP identities, plus a real
// test-send so you find out the credentials are wrong here rather than when
// a customer email silently fails.
//
// Mount: app.use('/api/email-settings', requireAuth, require('./routes/emailSettings'));

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/whatsapp/crypto');
const { newRequestId, logEmailAttempt } = require('../services/emailDiagnostics');

// Credentials are encrypted at rest with the app's shared encryption key.
// If it's missing or malformed, say so in email terms — an admin on this
// screen shouldn't have to decode an error naming a different feature.
function assertEncryptionReady() {
  try {
    encrypt('probe');
  } catch (e) {
    const err = new Error(
      'Cannot store the mail password securely: the backend encryption key is missing or invalid. '
      + 'Set WHATSAPP_ENCRYPTION_KEY to a base64 value that decodes to exactly 32 bytes — generate one with: '
      + 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))". '
      + `(underlying: ${e.message})`);
    err.status = 503;
    throw err;
  }
}

// Never let a stored password leave the server, in any response.
const SAFE = `id, scope, user_id, from_name, from_email, smtp_host, smtp_port, smtp_user,
  use_tls, imap_host, imap_port, imap_user, inbound_enabled, active,
  last_tested_at, last_test_ok, last_test_error, created_at, updated_at,
  CASE WHEN smtp_pass_encrypted IS NOT NULL THEN 1 ELSE 0 END AS has_password`;

function buildTransport(acct, plainPass) {
  return nodemailer.createTransport({
    host: acct.smtp_host,
    port: Number(acct.smtp_port || 587),
    secure: Number(acct.smtp_port) === 465,
    auth: { user: acct.smtp_user, pass: plainPass },
    // Without explicit timeouts nodemailer waits a very long time. Many
    // hosting platforms block outbound SMTP, so the connection simply hangs
    // and the platform's proxy kills the request first — the user sees a
    // generic failure instead of the real reason. Failing fast lets us say
    // what actually went wrong.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

// ===== Org account (admin only) =====
router.get('/org', requirePermission('email_settings', 'view'), (req, res) => {
  const row = db.prepare(`SELECT ${SAFE} FROM email_accounts WHERE scope='org'`).get();
  // Report the env-var fallback too, so an admin can see where mail is
  // currently going out from even before they configure anything here.
  res.json({
    account: row || null,
    env_fallback: {
      configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      host: process.env.SMTP_HOST || null,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
    },
  });
});

function upsert(scope, userId, body) {
  const existing = scope === 'org'
    ? db.prepare("SELECT * FROM email_accounts WHERE scope='org'").get()
    : db.prepare("SELECT * FROM email_accounts WHERE scope='user' AND user_id=?").get(userId);

  // A blank password on update means "keep the existing one" — otherwise
  // editing the from-name would silently wipe the stored credential.
  const encPass = body.smtp_pass
    ? encrypt(body.smtp_pass)
    : (existing ? existing.smtp_pass_encrypted : null);
  const encImap = body.imap_pass
    ? encrypt(body.imap_pass)
    : (existing ? existing.imap_pass_encrypted : null);

  if (existing) {
    db.prepare(`UPDATE email_accounts SET from_name=?, from_email=?, smtp_host=?, smtp_port=?,
      smtp_user=?, smtp_pass_encrypted=?, use_tls=?, imap_host=?, imap_port=?, imap_user=?,
      imap_pass_encrypted=?, inbound_enabled=?, active=?, updated_at=datetime('now') WHERE id=?`)
      .run(body.from_name || null, body.from_email, body.smtp_host, body.smtp_port || 587,
        body.smtp_user, encPass, body.use_tls === false ? 0 : 1,
        body.imap_host || null, body.imap_port || 993, body.imap_user || null,
        encImap, body.inbound_enabled ? 1 : 0, body.active === false ? 0 : 1, existing.id);
    return existing.id;
  }
  return db.prepare(`INSERT INTO email_accounts (scope, user_id, from_name, from_email, smtp_host,
    smtp_port, smtp_user, smtp_pass_encrypted, use_tls, imap_host, imap_port, imap_user,
    imap_pass_encrypted, inbound_enabled, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(scope, userId, body.from_name || null, body.from_email, body.smtp_host,
      body.smtp_port || 587, body.smtp_user, encPass, body.use_tls === false ? 0 : 1,
      body.imap_host || null, body.imap_port || 993, body.imap_user || null,
      encImap, body.inbound_enabled ? 1 : 0, body.active === false ? 0 : 1).lastInsertRowid;
}

function validate(body, isNew) {
  if (!body.from_email) return 'from_email is required';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.from_email)) return 'from_email is not a valid email address';
  if (!body.smtp_host) return 'smtp_host is required';
  if (!body.smtp_user) return 'smtp_user is required';
  if (isNew && !body.smtp_pass) return 'smtp_pass is required when setting up a new account';
  return null;
}

router.put('/org', requirePermission('email_settings', 'edit'), (req, res) => {
  const existing = db.prepare("SELECT id FROM email_accounts WHERE scope='org'").get();
  const err = validate(req.body, !existing);
  if (err) return res.status(400).json({ error: err });
  try {
    assertEncryptionReady();
    upsert('org', null, req.body);
    res.json(db.prepare(`SELECT ${SAFE} FROM email_accounts WHERE scope='org'`).get());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ===== Per-user account =====
// Any authenticated user may manage their OWN identity; only an admin may
// touch someone else's.
function targetUserId(req) {
  const requested = req.query.user_id || req.body?.user_id;
  if (!requested || Number(requested) === req.user.id) return req.user.id;
  if (!req.user.permissions?.users?.edit) return null;   // not allowed
  return Number(requested);
}

router.get('/me', (req, res) => {
  const uid = targetUserId(req);
  if (!uid) return res.status(403).json({ error: "You can only view your own email settings." });
  res.json(db.prepare(`SELECT ${SAFE} FROM email_accounts WHERE scope='user' AND user_id=?`).get(uid) || null);
});

router.put('/me', (req, res) => {
  const uid = targetUserId(req);
  if (!uid) return res.status(403).json({ error: "You can only change your own email settings." });
  const existing = db.prepare("SELECT id FROM email_accounts WHERE scope='user' AND user_id=?").get(uid);
  const err = validate(req.body, !existing);
  if (err) return res.status(400).json({ error: err });
  try {
    assertEncryptionReady();
    upsert('user', uid, req.body);
    res.json(db.prepare(`SELECT ${SAFE} FROM email_accounts WHERE scope='user' AND user_id=?`).get(uid));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/me', (req, res) => {
  const uid = targetUserId(req);
  if (!uid) return res.status(403).json({ error: 'Not allowed.' });
  db.prepare("DELETE FROM email_accounts WHERE scope='user' AND user_id=?").run(uid);
  res.status(204).end();
});

// ===== Test send =====
// Actually connects and sends. Verifying credentials at configuration time
// is the whole point — a silent failure later is much worse.
router.post('/test', async (req, res) => {
  const requestId = newRequestId();
  const scope = req.body.scope === 'org' ? 'org' : 'user';
  if (scope === 'org' && !req.user.permissions?.email_settings?.edit) {
    return res.status(403).json({ error: 'Not allowed to test the organisation account.', request_id: requestId });
  }
  const acct = scope === 'org'
    ? db.prepare("SELECT * FROM email_accounts WHERE scope='org'").get()
    : db.prepare("SELECT * FROM email_accounts WHERE scope='user' AND user_id=?").get(req.user.id);
  if (!acct) return res.status(404).json({ error: 'Save the account first, then test it.', request_id: requestId });
  if (!acct.smtp_pass_encrypted) return res.status(400).json({ error: 'No password stored for this account.', request_id: requestId });

  const to = req.body.to || acct.from_email;
  const startedAt = Date.now();
  let ok = false; let errMsg = null; let rawError = null;
  try {
    const pass = decrypt(acct.smtp_pass_encrypted);
    const transport = buildTransport(acct, pass);
    // Hard ceiling on the whole attempt, so this endpoint always answers.
    const withDeadline = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(Object.assign(new Error(`${label} timed out after ${ms / 1000}s. The mail server did not respond — this is usually a blocked port or a wrong host/port.`), { code: 'DEADLINE_EXCEEDED' })), ms)),
    ]);
    await withDeadline(transport.verify(), 20000, 'Connecting to the mail server');
    await withDeadline(transport.sendMail({
      from: acct.from_name ? `"${acct.from_name}" <${acct.from_email}>` : acct.from_email,
      to,
      subject: 'iCRM email configuration test',
      text: `This is a test message from iCRM. If you received it, sending is configured correctly. (diagnostic id: ${requestId})`,
    }), 30000, 'Sending the message');
    ok = true;
  } catch (e) {
    rawError = e;
    // Common causes translated into something actionable, because SMTP
    // errors are notoriously opaque. The RAW error (e.message, e.code) is
    // never discarded — it's logged and returned alongside this friendly
    // version, specifically so a user reporting "it says X" and someone
    // debugging it are looking at the same underlying fact.
    const raw = e.message || String(e);
    if (/invalid login|535|authentication/i.test(raw)) {
      errMsg = 'Authentication failed. For Gmail you must use an App Password, not your normal password.';
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
      errMsg = 'Could not reach that SMTP host — check the hostname.';
    } else if (/ECONNREFUSED|ETIMEDOUT|connection timeout|greeting never received|DEADLINE_EXCEEDED/i.test(raw) || e.code === 'DEADLINE_EXCEEDED') {
      errMsg = `Could not reach ${acct.smtp_host}:${acct.smtp_port}. The mail server never answered. `
        + 'Check the host and port (Gmail: smtp.gmail.com port 587). If those are right, your hosting provider '
        + 'is probably blocking outbound SMTP — many free tiers do, and you would need a mail API such as '
        + 'SendGrid, Resend or Brevo instead.';
    } else if (/self signed|certificate/i.test(raw)) {
      errMsg = 'TLS certificate problem on the mail server.';
    } else {
      errMsg = raw;
    }
  }
  const durationMs = Date.now() - startedAt;

  db.prepare(`UPDATE email_accounts SET last_tested_at=datetime('now'), last_test_ok=?, last_test_error=? WHERE id=?`)
    .run(ok ? 1 : 0, errMsg, acct.id);

  logEmailAttempt({
    requestId, kind: 'test_send', accountScope: scope, userId: req.user.id,
    smtpHost: acct.smtp_host, smtpPort: acct.smtp_port, toAddress: to,
    outcome: ok ? 'success' : 'failed', durationMs, error: rawError, friendlyMessage: errMsg,
  });

  if (ok) return res.json({ ok: true, sent_to: to, request_id: requestId, duration_ms: durationMs });
  res.status(400).json({
    ok: false, error: errMsg, request_id: requestId, duration_ms: durationMs,
    // The raw detail, for anyone actually debugging this — the UI can show
    // it in a collapsed "technical details" section rather than hiding it.
    raw_error: rawError ? { code: rawError.code || null, message: rawError.message } : null,
  });
});

// GET /api/email-settings/diagnostics — the actual answer to "did the fix
// work", without needing hosting-dashboard access. Admins see everyone's
// attempts; everyone else sees only their own.
router.get('/diagnostics', (req, res) => {
  const isAdmin = !!req.user.permissions?.email_settings?.edit;
  let sql = `SELECT d.*, COALESCE(u.full_name, u.username) AS user_name
             FROM email_diagnostic_log d LEFT JOIN users u ON u.id = d.user_id WHERE 1=1`;
  const params = [];
  if (!isAdmin) { sql += ' AND d.user_id = ?'; params.push(req.user.id); }
  if (req.query.outcome) { sql += ' AND d.outcome = ?'; params.push(req.query.outcome); }
  sql += ' ORDER BY d.created_at DESC LIMIT ?';
  params.push(Math.min(Number(req.query.limit) || 50, 200));
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
