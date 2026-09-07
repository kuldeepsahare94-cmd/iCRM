// Database backup — this is a SAFETY NET, not a fix for the underlying issue.
// If you're on Render's free tier, the disk is wiped on every restart/redeploy
// regardless of backups taken — the only real fixes are (a) upgrade to a plan
// with a persistent disk, or (b) deploy to a real server (see the deployment
// guide). What this DOES give you: a way to recover data after an unexpected
// wipe, by downloading or emailing yourself a copy periodically — point an
// external scheduler (cron-job.org) at /api/backup/email-now daily, same
// pattern as the WhatsApp scheduled-checks endpoints.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requirePermission } = require('../middleware/auth');
const { sendEmail, isConfigured } = require('../services/email');

const DB_PATH = path.join(__dirname, '..', 'crm.db');

router.get('/download', requirePermission('settings', 'edit'), (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'Database file not found.' });
  const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.db`;
  res.download(DB_PATH, filename);
});

router.post('/email-now', requirePermission('settings', 'edit'), async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Email is not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS on the backend first.' });
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'Database file not found.' });

  const { to } = req.body || {};
  const recipient = to || process.env.SMTP_FROM || process.env.SMTP_USER;
  const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.db`;
  const sizeMB = (fs.statSync(DB_PATH).size / (1024 * 1024)).toFixed(1);

  try {
    await sendEmail({
      to: recipient,
      subject: `EduPlace CRM database backup — ${new Date().toISOString().slice(0, 10)}`,
      text: `Attached is your CRM database backup (${sizeMB} MB). Keep this somewhere safe — to restore, replace backend/crm.db with this file and restart the backend.`,
      attachments: [{ filename, path: DB_PATH }],
    });
    res.json({ ok: true, sent_to: recipient, size_mb: sizeMB });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
