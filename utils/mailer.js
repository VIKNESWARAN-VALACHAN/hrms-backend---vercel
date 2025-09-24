// // File: utils/mailer.js

// const nodemailer = require('nodemailer');
// const fs = require('fs');
// const path = require('path');
// const { dbPromise } = require('../models/db');

// const transporter = nodemailer.createTransport({
//   host: 'smtp-relay.brevo.com',
//   port: 587,
//   secure: false,
//   auth: {
//     user: '90683a002@smtp-brevo.com',
//     pass: 'Th83ZE5X9Vaz4cNB'
//   }
// });

// async function sendEmail({ to, subject, templateName, variables = {}, text = '' }) {
//   const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
//   if (!fs.existsSync(templatePath)) throw new Error('Template not found');

//   let html = fs.readFileSync(templatePath, 'utf8');
//   for (const [key, val] of Object.entries(variables)) {
//     html = html.replace(new RegExp(`{{${key}}}`, 'g'), val);
//   }

//   const mailOptions = {
//     from: 'HRMS Notify <viccnnss@gmail.com>',
//     to,
//     subject,
//     html,
//     text
//   };

//   try {
//     const info = await transporter.sendMail(mailOptions);

//     await dbPromise.query('INSERT INTO email_logs (recipient, subject, status, response, sent_at) VALUES (?, ?, ?, ?, NOW())',
//       [to, subject, 'success', info.response]);

//     console.log(`✅ Email sent to ${to}`);
//     return true;
//   } catch (err) {
//     console.error(`❌ Email failed for ${to}:`, err);

//     await dbPromise.query('INSERT INTO email_logs (recipient, subject, status, response, sent_at) VALUES (?, ?, ?, ?, NOW())',
//       [to, subject, 'fail', err.message]);

//     return false;
//   }
// }

// module.exports = { sendEmail };

// File: utils/mailer.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { dbPromise } = require('../models/db');

// Load .env locally if not already loaded by your runtime
try { require('dotenv').config(); } catch (_) { /* noop */ }

const SENDER = process.env.GMAIL_SENDER;           // e.g. you@gmail.com or user@yourworkspace.com
const APP_PASSWORD = process.env.GMAIL_APP_PASSWORD; // 16-char App Password
const FROM_NAME = process.env.GMAIL_FROM_NAME || 'HRMS Notify';

// Basic validation so failures are obvious
if (!SENDER || !APP_PASSWORD) {
  // eslint-disable-next-line no-console
  console.warn('[mailer] Missing GMAIL_SENDER or GMAIL_APP_PASSWORD in env. Emails will fail to send.');
}

// Create a pooled Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,               // use 587 with secure:false if 465 is blocked
  secure: true,            // true for 465, false for 587
  auth: {
    user: SENDER,
    pass: APP_PASSWORD,
  },
  pool: true,              // reuse connection(s)
  maxConnections: 3,
  maxMessages: 50,
  // logger: true,         // uncomment for verbose SMTP logs
  debug: true,
});

/**
 * Send an email using an HTML template
 * @param {Object} opts
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} opts.templateName - file name in ../templates without .html
 * @param {Record<string,string>} [opts.variables] - {{placeholders}} in template
 * @param {string} [opts.text] - optional plain text fallback
 * @param {string} [opts.replyTo] - optional reply-to
 */
async function sendEmail({ to, subject, templateName, variables = {}, text = '', replyTo }) {
  // Resolve and read template
  const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templateName}.html`);

  let html = fs.readFileSync(templatePath, 'utf8');

  // Simple {{key}} replacement
  for (const [key, val] of Object.entries(variables)) {
    const safe = String(val ?? '');
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), safe);
  }

  // If no text provided, fall back to a stripped version of HTML (very basic)
  const plainText =
    text ||
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const mailOptions = {
    from: `${FROM_NAME} <${SENDER}>`, // Gmail prefers From to match the authenticated user
    to,
    subject,
    html,
    text: plainText,
    ...(replyTo ? { replyTo } : {}),
  };

  try {
    // Optional: verify once on first send
    // await transporter.verify();

    const info = await transporter.sendMail(mailOptions);

    await dbPromise.query(
      'INSERT INTO email_logs (recipient, subject, status, response, sent_at) VALUES (?, ?, ?, ?, NOW())',
      [Array.isArray(to) ? to.join(',') : to, subject, 'success', info.response || info.messageId || 'OK']
    );

    console.log(`✅ Email sent to ${Array.isArray(to) ? to.join(', ') : to}`);
    return { ok: true, id: info.messageId, response: info.response };
  } catch (err) {
    console.error(`❌ Email failed for ${Array.isArray(to) ? to.join(', ') : to}:`, err);

    await dbPromise.query(
      'INSERT INTO email_logs (recipient, subject, status, response, sent_at) VALUES (?, ?, ?, ?, NOW())',
      [Array.isArray(to) ? to.join(',') : to, subject, 'fail', err?.response || err?.message || String(err)]
    );

    return { ok: false, error: err?.response || err?.message || String(err) };
  }
}

module.exports = { sendEmail };
