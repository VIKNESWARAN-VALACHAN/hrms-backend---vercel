// controllers/notifications.controller.js
const { sendEmail } = require('../utils/mailer');
const { dbPromise } = require('../models/db');


exports.sendBirthdayEmail = async (req, res) => {
  try {
    const { to, nickname, companyName } = req.body;

    if (!to || !nickname || !companyName) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: to, nickname, companyName',
      });
    }

    const result = await sendEmail({
      to,
      subject: `🎉 Happy Birthday, ${nickname}! 🎂`,
      templateName: 'birthday_wishes', // templates/birthday_wishes.html
      variables: {
        nickname,
        companyName,
      },
    });

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, messageId: result.id || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};

exports.sendPasswordResetEmail = async (req, res) => {
  try {
    const { to, employeeName, tempPassword, companyName } = req.body;

    if (!to || !employeeName || !tempPassword || !companyName) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: to, employeeName, tempPassword, companyName',
      });
    }

    const result = await sendEmail({
      to,
      subject: 'Your temporary password',
      templateName: 'password_reset', // templates/password_reset.html
      variables: {
        employeeName,
        tempPassword,
        companyName,
      },
      text: `Hello ${employeeName},\n\nYour temporary password is: ${tempPassword}\n\nPlease change it after login.\n\n— ${companyName} HR Team`,
    });

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, messageId: result.id || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};

exports.sendLeaveEmail = async ({ leaveId, kind, reason }) => {
  const { dbPromise } = require('../models/db');
  const { sendEmail } = require('../utils/mailer');

  const [rows] = await dbPromise.query(
    `SELECT 
       l.id, l.start_date, l.end_date, l.rejection_reason, l.reason AS leave_reason,
       e.name AS employeeName, e.email AS toEmail,
       c.name AS companyName,
       lt.leave_type_name AS leaveType
     FROM leave_applications l
       JOIN employees e  ON e.id = l.employee_id
       LEFT JOIN companies c ON c.id = e.company_id
       LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.id = ?`,
    [leaveId]
  );

  if (!rows.length) return { ok: false, error: 'Leave not found' };
  const r = rows[0];
  if (!r.toEmail) return { ok: false, error: 'Employee has no email' };

  const fmt = (d) => new Date(d).toISOString().slice(0, 10);

  const templateName =
    kind === 'approved' ? 'leave_approved'
  : kind === 'rejected' ? 'leave_rejected'
  :                      'leave_cancelled';

  const subject =
    kind === 'approved' ? 'Leave Request Approved'
  : kind === 'rejected' ? 'Leave Request Rejected'
  :                      'Leave Request Cancelled';

  const variables = {
    employeeName: r.employeeName,
    leaveType:    r.leaveType || 'Leave',
    startDate:    fmt(r.start_date),
    endDate:      fmt(r.end_date),
    companyName:  r.companyName || (process.env.GMAIL_FROM_NAME || 'HR Team'),
    portalUrl:    `${process.env.APP_BASE_URL || ''}/leaves/${leaveId}`,
    reason:       reason || r.rejection_reason || r.leave_reason || ''
  };

  try {
    return await sendEmail({ to: r.toEmail, subject, templateName, variables });
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};


// POST /api/notifications/test/leave-email
// Body: { leaveId: number, kind: 'approved'|'rejected'|'cancelled', reason?: string }
exports.sendLeaveTestEmail = async (req, res) => {
  try {
    const { leaveId, kind, reason, to } = req.body; // <-- add "to"
    if (!leaveId || !kind) {
      return res.status(400).json({ ok: false, error: 'leaveId and kind are required' });
    }
    if (!['approved','rejected','cancelled'].includes(kind)) {
      return res.status(400).json({ ok: false, error: 'kind must be approved|rejected|cancelled' });
    }

    const out = await exports.sendLeaveEmail({ leaveId, kind, reason, toOverride: to });
    if (!out.ok) return res.status(500).json(out);
    res.json({ ok: true, messageId: out.id || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};


/* ================= Birthday job (new) ================= */

const TZ = 'Asia/Kuala_Lumpur';

function nowInKL() {
  const s = new Date().toLocaleString('en-US', { timeZone: TZ });
  return new Date(s);
}
function isLeapYear(y) {
  return (y % 4 === 0) && (y % 100 !== 0 || y % 400 === 0);
}

/**
 * Find employees whose DOB is today and email them.
 * Company name is joined from companies via employees.company_id.
 * Falls back to employees.company if the join is null.
 */
async function runDailyBirthdayWishes(dateOverride /* 'YYYY-MM-DD' or undefined */) {
  const dt = dateOverride
    ? new Date(`${dateOverride}T00:00:00+08:00`)
    : nowInKL();

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const todayMD = `${mm}-${dd}`;

  const includeFeb29 = (!isLeapYear(yyyy) && todayMD === '02-28');

  // Build base SQL using employees.dob (present in your schema)
  let sql = `
    SELECT
      e.id,
      e.name,
      e.email,
      e.dob,
      e.company_id,
      c.name AS company_name,
      e.company AS employee_company
    FROM employees e
    LEFT JOIN companies c ON c.id = e.company_id
    WHERE e.email IS NOT NULL AND e.email <> ''
      AND e.dob IS NOT NULL
      AND DATE_FORMAT(e.dob, '%m-%d') = ?
  `;
  const params = [todayMD];

  if (includeFeb29) {
    sql = `
      SELECT
        e.id,
        e.name,
        e.email,
        e.dob,
        e.company_id,
        c.name AS company_name,
        e.company AS employee_company
      FROM employees e
      LEFT JOIN companies c ON c.id = e.company_id
      WHERE e.email IS NOT NULL AND e.email <> ''
        AND e.dob IS NOT NULL
        AND (
          DATE_FORMAT(e.dob, '%m-%d') = ?
          OR DATE_FORMAT(e.dob, '%m-%d') = '02-29'
        )
    `;
  }

  const [rows] = await dbPromise.query(sql, params);

  if (!rows || rows.length === 0) {
    console.log('[Birthday] No birthdays today.');
    return { total: 0, sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const emp of rows) {
    // Skip if already successfully sent a birthday email today
    try {
      const [dups] = await dbPromise.query(
        `
          SELECT id
          FROM email_logs
          WHERE recipient = ?
            AND status = 'success'
            AND DATE(sent_at) = CURDATE()
            AND subject LIKE '%Happy Birthday,%'
          LIMIT 1
        `,
        [emp.email]
      );
      if (dups && dups.length > 0) {
        skipped++;
        continue;
      }
    } catch (e) {
      console.warn('[Birthday] duplicate check warning:', e.message);
    }

    const firstName = (emp.name || '').split(' ')[0] || 'there';
    const companyName = emp.company_name || emp.employee_company || 'HRMS';

    try {
      const res = await sendEmail({
        to: emp.email,
        subject: `Happy Birthday, ${firstName}!`,
        templateName: 'birthday_wishes',
        variables: {
          nickname: firstName,
          companyName,
        },
      });

      if (res.ok) sent++;
      else skipped++;
    } catch (err) {
      console.error(`[Birthday] Failed to send to ${emp.email} (${emp.id}):`, err.message);
      skipped++;
    }
  }

  console.log(`[Birthday] Completed. total=${rows.length}, sent=${sent}, skipped=${skipped}`);
  return { total: rows.length, sent, skipped };
}

exports.runBirthdayJobNow = async (req, res) => {
  try {
    const { date } = req.query; // optional YYYY-MM-DD
    const result = await runDailyBirthdayWishes(date);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Birthday] Manual run failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Export worker for cron file
exports.__runDailyBirthdayWishes = runDailyBirthdayWishes;