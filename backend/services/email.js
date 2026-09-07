// SMTP email sending — works with Gmail, Outlook, or any standard mail server.
// Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in the environment.
// For Gmail specifically: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, and
// SMTP_PASS must be an "App Password" (Google Account → Security → App
// Passwords) — a normal Gmail password will NOT work due to Google's
// security policy, this is not something this code can work around.
const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isConfigured()) {
    throw new Error('Email is not configured yet — set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS on the backend.');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587/others (STARTTLS)
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/**
 * @param {{to: string, subject: string, text?: string, html?: string, attachments?: Array}} opts
 */
async function sendEmail({ to, subject, text, html, attachments }) {
  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text, html, attachments,
  });
  return { messageId: info.messageId };
}

module.exports = { sendEmail, isConfigured };
