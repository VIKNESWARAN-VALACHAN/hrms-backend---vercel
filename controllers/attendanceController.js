
const { dbPromise } = require('../models/db');
const { toSingaporeTime, formatDate } = require('../utils/timezoneUtils');
const { formatInTimeZone } = require('date-fns-tz');
const { DateTime } = require('luxon');

const EVENT = {
  IN: 'CheckIn',
  OUT: 'CheckOut',
};

const ATTENDANCE_STATUS = {
  PRESENT: 1,
  ABSENT: 2,
  LATE: 3,
  PARTIAL: 4,
  OFFDAY: 5
};

// ALTER TABLE attendance_days
//   ADD COLUMN flagged_ip TINYINT(1) DEFAULT 0,
//   ADD COLUMN flagged_ip_addr VARCHAR(45) NULL;


/* ----------------------- Settings & Helpers ----------------------- */

async function loadSettings(conn) {
  const map = {};
  const [rows] = await conn.query('SELECT setting_key, setting_value FROM attendance_settings');
  for (const r of rows) map[r.setting_key] = r.setting_value;

  const workStart = (map.WORK_START_TIME || map.work_start_time || '09:00').slice(0, 5);
  const workEnd = (map.WORK_END_TIME || map.work_end_time || '18:00').slice(0, 5);

  const lateGrace = parseInt(map.LATE_GRACE_PERIOD ?? map.grace_in_minutes ?? '0', 10);
  const earlyGrace = parseInt(map.EARLY_GRACE_PERIOD ?? map.grace_out_minutes ?? '0', 10);

  const fullDayMinMins = Math.round(60 * parseFloat(map.MIN_HOURS_FULL_DAY ?? '8'));
  const halfDayMinMins = Math.round(60 * parseFloat(map.MIN_HOURS_HALF_DAY ?? '4'));

  return {
    work_start_time: workStart,
    work_end_time: workEnd,
    grace_in_minutes: lateGrace,
    grace_out_minutes: earlyGrace,
    min_full_day_minutes: fullDayMinMins,
    min_half_day_minutes: halfDayMinMins,
    auto_calculate_status: (map.AUTO_CALCULATE_STATUS || '1') === '1',
    allow_offday_checkin: (map.ALLOW_OFFDAY_CHECKIN || '1') === '1',
    business_tz: map.BUSINESS_TZ || 'Asia/Kuala_Lumpur',
  };
}

async function getEmployeeTZ(runner, employeeId) {
  const [rows] = await runner.query('SELECT time_zone FROM employees WHERE id=? LIMIT 1', [employeeId]);
  return rows[0]?.time_zone || 'Asia/Kuala_Lumpur';
}

async function getSchedulesAround(conn, employeeId, localDateISO) {
  const dt = DateTime.fromISO(localDateISO);
  const prev = dt.minus({ days: 1 }).toISODate();
  const [rows] = await conn.query(
    `SELECT * FROM employee_schedule_days
     WHERE employee_id=? AND schedule_date IN (?, ?)`,
    [employeeId, prev, localDateISO]
  );
  const byDate = {};
  for (const r of rows) byDate[r.schedule_date] = r;
  return { today: byDate[localDateISO] || null, prev: byDate[prev] || null };
}

/** Decide which schedule applies at a local timestamp (handles previous overnight). */
function decideSchedule(schedToday, schedPrev, tsLocal) {
  if (schedPrev && Number(schedPrev.overnight) === 1 && schedPrev.end_time) {
    const [eh, em] = schedPrev.end_time.split(':').map(Number);
    const endLocal = DateTime.fromISO(schedPrev.schedule_date, { zone: tsLocal.zoneName })
      .set({ hour: eh, minute: em, second: 0, millisecond: 0 })
      .plus({ days: 1 }); // ends next day
    const midnight = tsLocal.startOf('day');
    if (tsLocal >= midnight && tsLocal <= endLocal) {
      return { schedule: schedPrev, dateForDay: schedPrev.schedule_date };
    }
  }
  if (schedToday) return { schedule: schedToday, dateForDay: schedToday.schedule_date };
  return { schedule: null, dateForDay: tsLocal.toISODate() };
}

/** Create or return the attendance_day row for a local date. */
async function ensureAttendanceDay(conn, employeeId, localDateISO, initialStatusId) {
  const [rows] = await conn.query(
    `SELECT attendance_day_id FROM attendance_days
     WHERE employee_id=? AND attendance_date=? LIMIT 1`,
    [employeeId, localDateISO]
  );
  if (rows[0]) return rows[0].attendance_day_id;

  const statusToUse = initialStatusId ?? ATTENDANCE_STATUS.PRESENT;
  const [r] = await conn.query(
    `INSERT INTO attendance_days (employee_id, attendance_date, status_id)
     VALUES (?, ?, ?)`,
    [employeeId, localDateISO, statusToUse]
  );
  return r.insertId;
}

/** Insert a UTC event row with full IP metadata. */
async function insertEvent(conn, attendanceDayId, type, tsUtc, deviceInfo, ip, extra = {}) {
  const tsUtcSql = tsUtc.toSQL({ includeOffset: false });

  const {
    matchStatus = null,     // 'IN_WHITELIST' | 'OUTSIDE_WHITELIST' | null
    officeId    = null,     // number|null
    whitelistId = null,     // number|null
    policyMode  = null,     // 'ENFORCE' | 'FLAG_ONLY' | null
    geo_country = null,     // string|null
    geo_city    = null,     // string|null
    geo_asn     = null      // string|null
  } = extra || {};

  await conn.query(
    `INSERT INTO attendance_events
       (attendance_day_id, event_type, event_time, device_info, ip_address,
        ip_match_status, ip_office_id, ip_whitelist_id, ip_policy_mode,
        ip_geo_country, ip_geo_city, ip_geo_asn)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      attendanceDayId,
      type,
      tsUtcSql,
      deviceInfo || null,
      ip || null,
      matchStatus,
      officeId,
      whitelistId,
      policyMode,
      geo_country,
      geo_city,
      geo_asn
    ]
  );
}



/** Recompute aggregates for a day from its events. */
async function syncDayAggregates1(conn, attendanceDayId, schedule, settings, tz) {
  const [ev] = await conn.query(
    `SELECT event_type, event_time
       FROM attendance_events
      WHERE attendance_day_id = ?
      ORDER BY event_time ASC`,
    [attendanceDayId]
  );

  let firstCheckInUtc = null;
  let lastCheckOutUtc = null;
  let netMinutes = 0;
  const inStack = [];
  
  for (const e of ev) {
    // Robust parse: support JS Date or string (assume stored as UTC wall time)
    let t;
    if (e.event_time instanceof Date) {
      t = DateTime.fromJSDate(e.event_time, { zone: 'utc' });
    } else {
      t = DateTime.fromISO(e.event_time, { zone: 'utc' });
      if (!t.isValid) t = DateTime.fromSQL(e.event_time, { zone: 'utc' });
    }
    if (!t.isValid) continue;

    if (e.event_type === EVENT.IN) {
      if (!firstCheckInUtc) firstCheckInUtc = t;
      inStack.push(t);
    } else if (e.event_type === EVENT.OUT) {
      lastCheckOutUtc = t;
      const lastIn = inStack.pop();
      if (lastIn) netMinutes += Math.max(0, Math.floor(t.diff(lastIn, 'minutes').minutes));
    }
  }

  // subtract break only for working schedules
  if (schedule?.status === 'working') {
    const breakMins = Number(schedule.break_mins || 0);
    netMinutes = Math.max(0, netMinutes - breakMins);
  }

  const firstLocal = firstCheckInUtc ? firstCheckInUtc.setZone(tz) : null;
  const lastLocal = lastCheckOutUtc ? lastCheckOutUtc.setZone(tz) : null;

  await conn.query(
    `UPDATE attendance_days
        SET total_worked_minutes = ?,
            first_check_in_time  = ?,
            last_check_out_time  = ?
      WHERE attendance_day_id = ?`,
    [
      netMinutes,
      firstLocal ? firstLocal.toSQL({ includeOffset: false }) : null,
      lastLocal ? lastLocal.toSQL({ includeOffset: false }) : null,
      attendanceDayId,
    ]
  );
}

async function syncDayAggregates(conn, attendanceDayId, schedule, settings, tz) {
  const [ev] = await conn.query(
    `SELECT event_type, event_time
       FROM attendance_events
      WHERE attendance_day_id = ?
      ORDER BY event_time ASC`,
    [attendanceDayId]
  );

  let firstCheckInUtc = null;
  let lastCheckOutUtc = null;
  let netMinutes = 0;
  const inStack = [];

  for (const e of ev) {
    // Robust parse: support JS Date or string (assume stored as UTC wall time)
    let t;
    if (e.event_time instanceof Date) {
      t = DateTime.fromJSDate(e.event_time, { zone: 'utc' });
    } else {
      t = DateTime.fromISO(e.event_time, { zone: 'utc' });
      if (!t.isValid) t = DateTime.fromSQL(e.event_time, { zone: 'utc' });
    }
    if (!t.isValid) continue;

    if (e.event_type === EVENT.IN) {
      if (!firstCheckInUtc) firstCheckInUtc = t;
      inStack.push(t);
    } else if (e.event_type === EVENT.OUT) {
      lastCheckOutUtc = t;
      const lastIn = inStack.pop();
      if (lastIn) netMinutes += Math.max(0, Math.floor(t.diff(lastIn, 'minutes').minutes));
    }
  }

  // subtract break only for working schedules
  if (schedule?.status === 'working') {
    const breakMins = Number(schedule.break_mins || 0);
    netMinutes = Math.max(0, netMinutes - breakMins);
  }

  const firstLocal = firstCheckInUtc ? firstCheckInUtc.setZone(tz) : null;
  const lastLocal = lastCheckOutUtc ? lastCheckOutUtc.setZone(tz) : null;

  await conn.query(
    `UPDATE attendance_days
        SET total_worked_minutes = ?,
            first_check_in_time  = ?,
            last_check_out_time  = ?
      WHERE attendance_day_id = ?`,
    [
      netMinutes,
      firstLocal ? firstLocal.toSQL({ includeOffset: false }) : null,
      lastLocal ? lastLocal.toSQL({ includeOffset: false }) : null,
      attendanceDayId,
    ]
  );
}

/**
 * Find the correct attendance_day for "now" in employee TZ (handles overnight).
 * Preference:
 *  - Open day (has check-in but no check-out) for today or yesterday (overnight)
 *  - Otherwise the latest of today/yesterday.
 */
async function findAttendanceDayForNow(conn, employeeId, tz) {
  const nowLocal = DateTime.now().setZone(tz);
  const today = nowLocal.toISODate();
  const yesterday = nowLocal.minus({ days: 1 }).toISODate();

  // Pull both days, prefer an open one
  const [rows] = await conn.query(
    `SELECT attendance_day_id, attendance_date, first_check_in_time, last_check_out_time
     FROM attendance_days
     WHERE employee_id=? AND attendance_date IN (?, ?)
     ORDER BY attendance_date DESC, attendance_day_id DESC`,
    [employeeId, today, yesterday]
  );

  // Prefer the most recent "open" record
  const open = rows.find(
    (r) => r.first_check_in_time && !r.last_check_out_time
  );
  if (open) return open;

  // Else return the most recent among the two (if any)
  return rows[0] || null;
}


// put these under: const { DateTime } = require('luxon');
const toLocalISO = (sqlNoTz, tz) =>
  sqlNoTz ? DateTime.fromSQL(sqlNoTz, { zone: tz }).toISO({ suppressMilliseconds: true }) : null;

// call this after every getConnection()
async function setSessionToUTC(conn) {
  await conn.query(`SET time_zone = '+00:00'`);
}



// Check in endpoint
const checkIn1 = async (req, res) => {
  try {
    // Get employee ID (should be the ID field from employees table, NOT employee_no)
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    // Log for debugging purposes
    console.log(`Attendance check-in for employee ID: ${employeeId}`);
    
    // Start a transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();
    
    try {

      // First check if employee exists to avoid undefined errors
      const [employeeCheck] = await connection.query(
        `SELECT e.* FROM employees e WHERE e.id = ?`,
        [employeeId]
      );
      if(employeeCheck.length === 0){
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }

      // Check if employee has a position assigned (prevents null position_id errors)
      if(employeeCheck[0].position_id === null){
        await connection.rollback();
        connection.release();
        return res.status(701).json({ success: false, message: 'Employee has no assigned position, Please contact the admin.' });
      }

      // Now get employee with position details
      const [employeeRows] = await connection.query(
        `SELECT e.*, p.start_work_time, p.end_work_time FROM employees e
        JOIN positions p ON e.position_id = p.id
        WHERE e.id = ?`,
        [employeeId]
      );

      if(employeeRows.length === 0){
        await connection.rollback();
        connection.release();
        return res.status(500).json({ error: 'Failed to retrieve employee position details' });
      }

      const employeeData = employeeRows[0]; // Use employeeRows[0]

      console.log(employeeData);

      // Check if there's an attendance day record for today
      // const [attendanceDayRows] = await connection.query(
      //   `SELECT attendance_day_id FROM attendance_days 
      //    WHERE employee_id = ? AND attendance_date = DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00'))`,
      //   [employeeId]
      // );

      let attendanceDayId;
      
      let initialStatus = ATTENDANCE_STATUS.PRESENT;
      // Check if late
      // const checkInDate = new Date();
      // //Fixed at 8 hours timezone for Singapore
      // checkInDate.setHours(checkInDate.getHours() + 8);
      // const checkInHour = checkInDate.getHours();
      // const checkInMinute = checkInDate.getMinutes();

      // Use formatInTimeZone to get current hour and minute in SGT for accurate lateness check
      const nowSGT = new Date(); // Represents the current moment
      const checkInHour = parseInt(formatInTimeZone(nowSGT, 'Asia/Singapore', 'HH'));
      const checkInMinute = parseInt(formatInTimeZone(nowSGT, 'Asia/Singapore', 'mm'));
      
      // Use employeeData.start_work_time and provide a default if null/undefined
      const [startHour, startMinute] = employeeData.start_work_time 
                                        ? employeeData.start_work_time.split(':').map(Number) 
                                        : [9, 0]; // Default to 9:00 AM

      if ((checkInHour > startHour || (checkInHour === startHour && checkInMinute > startMinute))){
        initialStatus = ATTENDANCE_STATUS.LATE;
      }

      const [result] = await connection.query(
        `INSERT INTO attendance_days 
         (employee_id, attendance_date, status_id, first_check_in_time) 
         VALUES (?, DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00')), ?, CONVERT_TZ(NOW(), 'UTC', '+08:00'))`,
        [employeeId, initialStatus]
      );

      attendanceDayId = result.insertId;
      
      // Record the check-in event
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';
      
      const [eventResult] = await connection.query(
        `INSERT INTO attendance_events 
         (attendance_day_id, event_type, event_time, device_info, ip_address) 
         VALUES (?, 'CheckIn', CONVERT_TZ(NOW(), 'UTC', '+08:00'), ?, ?)`,
        [attendanceDayId, deviceInfo, ipAddress]
      );
      
      // Create a record in the attendance table for backward compatibility
      const [attendanceResult] = await connection.query(
        `INSERT INTO attendance (employee_id, clock_in, attendance_date) 
         VALUES (?, CONVERT_TZ(NOW(), 'UTC', '+08:00'), DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00')))`, // Use DATE() for attendance_date
        [employeeId]
      );
      
      await connection.commit();
      
      // Get the created attendance record
      const [attendanceRecord] = await dbPromise.query(
        'SELECT * FROM attendance WHERE id = ?',
        [attendanceResult.insertId]
      );
      
      res.json({
        success: true,
        message: 'Checked in successfully. New attendance day record created for this attempt.', // Updated message
        attendance: attendanceRecord[0],
        event_id: eventResult.insertId,
        attendance_day_id: attendanceDayId
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in: ' + error.message });
  }
};



const checkInok = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });

    const connection = await dbPromise.getConnection();
    await setSessionToUTC(connection);   // <— add this line
    await connection.beginTransaction();
    try {
      const employeeTZ = await getEmployeeTZ(connection, employeeId);
      const settings = await loadSettings(connection);

      const nowUtc = DateTime.utc();
      const nowLocal = nowUtc.setZone(employeeTZ);
      const localDateISO = nowLocal.toISODate();

      // Determine schedule (today/prev if overnight)
      const { today, prev } = await getSchedulesAround(connection, employeeId, localDateISO);
      const pick = decideSchedule(today, prev, nowLocal);
      const schedule = pick.schedule;
      const scheduleDate = pick.dateForDay;

      if (schedule && schedule.status !== 'working' && !settings.allow_offday_checkin) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: `Check-in not allowed on ${schedule.status} day` });
      }

      // Initial status (late or present or offday)
      let initialStatus = ATTENDANCE_STATUS.PRESENT;
      if (schedule && schedule.status === 'working' && schedule.start_time) {
        const [sh, sm] = schedule.start_time.split(':').map(Number);
        const startLocal = DateTime.fromISO(scheduleDate, { zone: employeeTZ }).set({
          hour: sh,
          minute: sm,
          second: 0,
          millisecond: 0,
        });
        const lateBy = nowLocal.diff(startLocal, 'minutes').minutes - (settings.grace_in_minutes || 0);
        initialStatus = lateBy > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
      } else if (!schedule) {
        const [sh, sm] = settings.work_start_time.split(':').map(Number);
        const startLocal = DateTime.fromISO(scheduleDate, { zone: employeeTZ }).set({
          hour: sh,
          minute: sm,
          second: 0,
          millisecond: 0,
        });
        const lateBy = nowLocal.diff(startLocal, 'minutes').minutes - (settings.grace_in_minutes || 0);
        initialStatus = lateBy > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
      } else {
        initialStatus = ATTENDANCE_STATUS.OFFDAY;
      }

      // Ensure attendance day on the chosen schedule date
      const attendanceDayId = await ensureAttendanceDay(connection, employeeId, scheduleDate, initialStatus);

      // Add event (UTC)
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown IP';
      await insertEvent(connection, attendanceDayId, EVENT.IN, nowUtc, deviceInfo, ipAddress);

      // Set first_check_in_time if empty (local)
      await connection.query(
        `UPDATE attendance_days
           SET first_check_in_time = ?
         WHERE attendance_day_id = ? AND first_check_in_time IS NULL`,
        [nowLocal.toSQL({ includeOffset: false }), attendanceDayId]
      );

      // Recompute aggregates from events
      await syncDayAggregates(connection, attendanceDayId, schedule, settings, employeeTZ);

      // Ensure status set
      await connection.query(
        `UPDATE attendance_days
           SET status_id = COALESCE(status_id, ?)
         WHERE attendance_day_id=?`,
        [initialStatus, attendanceDayId]
      );

      // Legacy table insert (use the same schedule date)
      await connection.query(
        `INSERT INTO attendance (employee_id, clock_in, attendance_date)
         VALUES (?, ?, ?)`,
        [employeeId, nowLocal.toSQL({ includeOffset: false }), scheduleDate]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: 'Checked in successfully',
        attendance_day_id: attendanceDayId,
        schedule_date: scheduleDate,
        timezone: employeeTZ,
        status: initialStatus,
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in: ' + error.message });
  }
};

const checkIn = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });

    // NEW: read IP evaluation results from ipGate (with safe fallbacks)
    const clientIp = res.locals?.ipInfo?.clientIp || req.ip || req.connection?.remoteAddress || 'Unknown IP';
    const ipFlag = !!res.locals?.ipFlag;
    const ipMessage = res.locals?.ipMessage;

    const connection = await dbPromise.getConnection();
    await setSessionToUTC(connection);
    await connection.beginTransaction();
    try {
      const employeeTZ = await getEmployeeTZ(connection, employeeId);
      const settings = await loadSettings(connection);

      const nowUtc = DateTime.utc();
      const nowLocal = nowUtc.setZone(employeeTZ);
      const localDateISO = nowLocal.toISODate();

      const { today, prev } = await getSchedulesAround(connection, employeeId, localDateISO);
      const pick = decideSchedule(today, prev, nowLocal);
      const schedule = pick.schedule;
      const scheduleDate = pick.dateForDay;

      if (schedule && schedule.status !== 'working' && !settings.allow_offday_checkin) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: `Check-in not allowed on ${schedule.status} day` });
      }

      let initialStatus = ATTENDANCE_STATUS.PRESENT;
      if (schedule && schedule.status === 'working' && schedule.start_time) {
        const [sh, sm] = schedule.start_time.split(':').map(Number);
        const startLocal = DateTime.fromISO(scheduleDate, { zone: employeeTZ }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        const lateBy = nowLocal.diff(startLocal, 'minutes').minutes - (settings.grace_in_minutes || 0);
        initialStatus = lateBy > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
      } else if (!schedule) {
        const [sh, sm] = settings.work_start_time.split(':').map(Number);
        const startLocal = DateTime.fromISO(scheduleDate, { zone: employeeTZ }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        const lateBy = nowLocal.diff(startLocal, 'minutes').minutes - (settings.grace_in_minutes || 0);
        initialStatus = lateBy > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
      } else {
        initialStatus = ATTENDANCE_STATUS.OFFDAY;
      }

      const attendanceDayId = await ensureAttendanceDay(connection, employeeId, scheduleDate, initialStatus);

      // CHANGED: use clientIp from ipGate
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipInfo = res.locals?.ipInfo || {};
      await insertEvent(
        connection,
        attendanceDayId,
        EVENT.IN,
        nowUtc,
        deviceInfo,
        ipInfo.clientIp || (req.ip || req.connection?.remoteAddress || 'Unknown IP'),
        {
          matchStatus: ipInfo.matchStatus || null,
          officeId:    ipInfo.officeId || null,
          whitelistId: ipInfo.whitelistId || null,
          policyMode:  ipInfo.mode || null,
          geo_country: ipInfo.geo?.country || null,
          geo_city:    ipInfo.geo?.city || null,
          geo_asn:     ipInfo.geo?.asn || null,
        }
      );


      await connection.query(
        `UPDATE attendance_days
           SET first_check_in_time = ?
         WHERE attendance_day_id = ? AND first_check_in_time IS NULL`,
        [nowLocal.toSQL({ includeOffset: false }), attendanceDayId]
      );

      await syncDayAggregates(connection, attendanceDayId, schedule, settings, employeeTZ);

      await connection.query(
        `UPDATE attendance_days
           SET status_id = COALESCE(status_id, ?)
         WHERE attendance_day_id=?`,
        [initialStatus, attendanceDayId]
      );

      // OPTIONAL: persist IP flag on the day (add columns first if you want this)
      // if (ipFlag) {
      //   await connection.query(
      //     `UPDATE attendance_days SET flagged_ip=1, flagged_ip_addr=? WHERE attendance_day_id=?`,
      //     [clientIp, attendanceDayId]
      //   );
      // }

      await connection.query(
        `INSERT INTO attendance (employee_id, clock_in, attendance_date)
         VALUES (?, ?, ?)`,
        [employeeId, nowLocal.toSQL({ includeOffset: false }), scheduleDate]
      );

      await connection.commit();
      connection.release();

      // NEW: bubble the flag + message back to the client
      res.json({
        success: true,
        message: 'Checked in successfully',
        attendance_day_id: attendanceDayId,
        schedule_date: scheduleDate,
        timezone: employeeTZ,
        status: initialStatus,
        ipFlag,
        ...(ipFlag ? { ipMessage } : {})
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in: ' + error.message });
  }
};


// Check out endpoint
const checkOut1 = async (req, res) => {
  try {
    // Get employee ID (should be the ID field from employees table, NOT employee_no)
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    // Log for debugging purposes
    console.log(`Attendance check-out for employee ID: ${employeeId}`);
    
    // Start a transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();
    
    try {

      // First check if employee exists
      const [employeeCheck] = await connection.query(
        `SELECT e.* FROM employees e WHERE e.id = ?`,
        [employeeId]
      );

      if(employeeCheck.length === 0){
        await connection.rollback();
        connection.release();
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Check if employee has a position assigned
      if(employeeCheck[0].position_id === null){
        await connection.rollback();
        connection.release();
        return res.status(701).json({ error: 'Employee has no position' });
      }

      // Now get employee with position details
      const [employee] = await connection.query(
        `SELECT e.*, p.start_work_time, p.end_work_time FROM employees e
        JOIN positions p ON e.position_id = p.id
        WHERE e.id = ?`,
        [employeeId]
      );

      if(employee.length === 0){
        await connection.rollback();
        connection.release();
        return res.status(500).json({ error: 'Failed to retrieve employee position details' });
      }

      const employeeData = employee[0];
      
      // Get today's attendance day record
      const [attendanceDayRows] = await connection.query(
        `SELECT attendance_day_id, first_check_in_time, total_worked_minutes 
         FROM attendance_days 
         WHERE employee_id = ? AND attendance_date = DATE(CONVERT_TZ( NOW(), 'UTC', '+08:00'))
         ORDER BY attendance_day_id DESC`,
        [employeeId]
      );
      
      if (attendanceDayRows.length === 0) {
        return res.status(400).json({ error: 'No check-in record found for today' });
      }
      
      const attendanceDayId = attendanceDayRows[0].attendance_day_id;
      const firstCheckInTime = attendanceDayRows[0].first_check_in_time;
      let totalWorkedMinutes = attendanceDayRows[0].total_worked_minutes || 0;
      
      // Record the check-out event
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';
      
      const [eventResult] = await connection.query(
        `INSERT INTO attendance_events 
         (attendance_day_id, event_type, event_time, device_info, ip_address) 
         VALUES (?, 'CheckOut', CONVERT_TZ(NOW(), 'UTC', '+08:00'), ?, ?)`,
        [attendanceDayId, deviceInfo, ipAddress]
      );
      
      // Calculate worked minutes since the first check-in
      const [timeResult] = await connection.query(
        `SELECT TIMESTAMPDIFF(MINUTE, ?, CONVERT_TZ(NOW(), 'UTC', '+08:00')) as minutes_worked`,
        [firstCheckInTime]
      );
      
      const minutesWorked = timeResult[0].minutes_worked;
      totalWorkedMinutes += minutesWorked;
      
      // Check out partial
      // Calculate date range
      const checkOutDate = new Date();
      //Fixed at 8 hours timezone for Singapore
      checkOutDate.setHours(checkOutDate.getHours() + 8);
      const checkOutHour = checkOutDate.getHours();
      const checkOutMinute = checkOutDate.getMinutes();

      const [endHour, endMinute] = employeeData.end_work_time?.split(':').map(Number) || [18, 0];

      let status = ATTENDANCE_STATUS.PRESENT;
      if ((checkOutHour < endHour || (checkOutHour === endHour && checkOutMinute < endMinute))){
        status = ATTENDANCE_STATUS.PARTIAL;
      }

      const [updateAttendanceDay] = await connection.query(
        `UPDATE attendance_days 
         SET last_check_out_time = CONVERT_TZ(NOW(), 'UTC', '+08:00'), 
             total_worked_minutes = ?, 
             status_id = ? 
         WHERE attendance_day_id = ?`,
        [totalWorkedMinutes, status, attendanceDayId]
      );

      if(updateAttendanceDay.length === 0 ){
        return res.status(400).json({ error: 'No check-in record found for today' });
      }

      // Update attendance record for backward compatibility
      const [activeSessions] = await connection.query(
        `SELECT id FROM attendance 
         WHERE employee_id = ? 
         AND DATE(clock_in) = DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00'))
         AND clock_out IS NULL
         ORDER BY clock_in DESC
         LIMIT 1`,
        [employeeId]
      );
    
      if (activeSessions.length > 0) {
        await connection.query(
          `UPDATE attendance 
           SET clock_out = CONVERT_TZ(NOW(), 'UTC', '+08:00'),
               total_worked_hours = TIMESTAMPDIFF(MINUTE, clock_in, CONVERT_TZ(NOW(), 'UTC', '+08:00')) / 60.0 
           WHERE id = ?`,
          [activeSessions[0].id]
        );
      }
      
      await connection.commit();
      
      // Get the updated attendance records
      const [attendanceDay] = await dbPromise.query(
        `SELECT ad.*, s.display_name as status_name 
         FROM attendance_days ad
         JOIN attendance_statuses s ON ad.status_id = s.status_id
         WHERE ad.attendance_day_id = ?`,
        [attendanceDayId]
      );
      
      const [events] = await dbPromise.query(
        `SELECT * FROM attendance_events 
         WHERE attendance_day_id = ? 
         ORDER BY event_time`,
        [attendanceDayId]
      );
      
      res.json({
        success: true,
        message: 'Checked out successfully',
        attendance_day: attendanceDay[0],
        events: events,
        minutes_worked: minutesWorked,
        total_worked_minutes: totalWorkedMinutes
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Failed to check out: ' + error.message });
  }
};


/* ----------------------- Check Out (TZ-aware, overnight-safe) ----------------------- */

const checkOutok = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });

    const connection = await dbPromise.getConnection();
    await setSessionToUTC(connection);   // <— add this line
    await connection.beginTransaction();
    try {
      const tz = await getEmployeeTZ(connection, employeeId);
      const settings = await loadSettings(connection);

      const nowUtc = DateTime.utc();
      const nowLocal = nowUtc.setZone(tz);
      const localDateISO = nowLocal.toISODate();

      // Find the correct attendance_day (today or yesterday if overnight/open)
      const dayRow = await findAttendanceDayForNow(connection, employeeId, tz);
      if (!dayRow) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: 'No check-in record found for today (including overnight)' });
      }
      const attendanceDayId = dayRow.attendance_day_id;

      // Get schedule for that attendance_date (not necessarily local today)
      const [schedRows] = await connection.query(
        `SELECT * FROM employee_schedule_days WHERE employee_id=? AND schedule_date=? LIMIT 1`,
        [employeeId, dayRow.attendance_date]
      );
      const schedule = schedRows[0] || null;

      // Insert event (UTC)
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown IP';
      await insertEvent(connection, attendanceDayId, EVENT.OUT, nowUtc, deviceInfo, ipAddress);

      // Recompute aggregates
      await syncDayAggregates(connection, attendanceDayId, schedule, settings, tz);

      // Early checkout -> PARTIAL if leaving before end_time (consider grace)
      if (schedule && schedule.status === 'working' && schedule.end_time) {
        const [eh, em] = schedule.end_time.split(':').map(Number);
        const endLocal = DateTime.fromISO(dayRow.attendance_date, { zone: tz }).set({
          hour: eh,
          minute: em,
          second: 0,
          millisecond: 0,
        });
        const cutoff = Number(schedule.overnight) === 1 ? endLocal.plus({ days: 1 }) : endLocal;

        const earlyBy = cutoff.diff(nowLocal, 'minutes').minutes - (settings.grace_out_minutes || 0);
        if (earlyBy > 0) {
          await connection.query(
            `UPDATE attendance_days SET status_id = ? WHERE attendance_day_id = ?`,
            [ATTENDANCE_STATUS.PARTIAL, attendanceDayId]
          );
        }
      }

      // Legacy update (use the day row’s attendance_date)
      const [activeSessions] = await connection.query(
        `SELECT id FROM attendance 
         WHERE employee_id = ? 
           AND attendance_date = ?
           AND clock_out IS NULL
         ORDER BY clock_in DESC
         LIMIT 1`,
        [employeeId, dayRow.attendance_date]
      );
      if (activeSessions.length > 0) {
        const localNowSql = nowLocal.toSQL({ includeOffset: false });
        await connection.query(
          `UPDATE attendance
             SET clock_out = ?,
                 total_worked_hours = TIMESTAMPDIFF(MINUTE, clock_in, ?) / 60.0
           WHERE id = ?`,
          [localNowSql, localNowSql, activeSessions[0].id]
        );
      }

      await connection.commit();
      connection.release();

      // Return updated row & events
      const [[attendanceDay]] = await dbPromise.query(
        `SELECT ad.*, s.display_name as status_name
           FROM attendance_days ad
           JOIN attendance_statuses s ON ad.status_id = s.status_id
          WHERE ad.attendance_day_id = ?`,
        [attendanceDayId]
      );
      const [events] = await dbPromise.query(
        `SELECT * FROM attendance_events
          WHERE attendance_day_id = ?
          ORDER BY event_time`,
        [attendanceDayId]
      );

      res.json({
        success: true,
        message: 'Checked out successfully',
        attendance_day: attendanceDay,
        events,
        timezone: tz,
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Failed to check out: ' + error.message });
  }
};

const checkOut = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });

    // NEW: read IP evaluation results
    const clientIp = res.locals?.ipInfo?.clientIp || req.ip || req.connection?.remoteAddress || 'Unknown IP';
    const ipFlag = !!res.locals?.ipFlag;
    const ipMessage = res.locals?.ipMessage;

    const connection = await dbPromise.getConnection();
    await setSessionToUTC(connection);
    await connection.beginTransaction();
    try {
      const tz = await getEmployeeTZ(connection, employeeId);
      const settings = await loadSettings(connection);

      const nowUtc = DateTime.utc();
      const nowLocal = nowUtc.setZone(tz);

      const dayRow = await findAttendanceDayForNow(connection, employeeId, tz);
      if (!dayRow) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: 'No check-in record found for today (including overnight)' });
      }
      const attendanceDayId = dayRow.attendance_day_id;

      const [schedRows] = await connection.query(
        `SELECT * FROM employee_schedule_days WHERE employee_id=? AND schedule_date=? LIMIT 1`,
        [employeeId, dayRow.attendance_date]
      );
      const schedule = schedRows[0] || null;

      // CHANGED: use clientIp from ipGate
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipInfo = res.locals?.ipInfo || {};
      await insertEvent(
        connection,
        attendanceDayId,
        EVENT.OUT,
        nowUtc,
        deviceInfo,
        ipInfo.clientIp || (req.ip || req.connection?.remoteAddress || 'Unknown IP'),
        {
          matchStatus: ipInfo.matchStatus || null,
          officeId:    ipInfo.officeId || null,
          whitelistId: ipInfo.whitelistId || null,
          policyMode:  ipInfo.mode || null,
          geo_country: ipInfo.geo?.country || null,
          geo_city:    ipInfo.geo?.city || null,
          geo_asn:     ipInfo.geo?.asn || null,
        }
      );

      await syncDayAggregates(connection, attendanceDayId, schedule, settings, tz);

      if (schedule && schedule.status === 'working' && schedule.end_time) {
        const [eh, em] = schedule.end_time.split(':').map(Number);
        const endLocal = DateTime.fromISO(dayRow.attendance_date, { zone: tz }).set({ hour: eh, minute: em, second: 0, millisecond: 0 });
        const cutoff = Number(schedule.overnight) === 1 ? endLocal.plus({ days: 1 }) : endLocal;

        const earlyBy = cutoff.diff(nowLocal, 'minutes').minutes - (settings.grace_out_minutes || 0);
        if (earlyBy > 0) {
          await connection.query(
            `UPDATE attendance_days SET status_id = ? WHERE attendance_day_id = ?`,
            [ATTENDANCE_STATUS.PARTIAL, attendanceDayId]
          );
        }
      }

      const [activeSessions] = await connection.query(
        `SELECT id FROM attendance 
         WHERE employee_id = ? 
           AND attendance_date = ?
           AND clock_out IS NULL
         ORDER BY clock_in DESC
         LIMIT 1`,
        [employeeId, dayRow.attendance_date]
      );
      if (activeSessions.length > 0) {
        const localNowSql = nowLocal.toSQL({ includeOffset: false });
        await connection.query(
          `UPDATE attendance
             SET clock_out = ?,
                 total_worked_hours = TIMESTAMPDIFF(MINUTE, clock_in, ?) / 60.0
           WHERE id = ?`,
          [localNowSql, localNowSql, activeSessions[0].id]
        );
      }

      // OPTIONAL: persist IP flag
      // if (ipFlag) {
      //   await connection.query(
      //     `UPDATE attendance_days SET flagged_ip=1, flagged_ip_addr=? WHERE attendance_day_id=?`,
      //     [clientIp, attendanceDayId]
      //   );
      // }

      await connection.commit();
      connection.release();

      const [[attendanceDay]] = await dbPromise.query(
        `SELECT ad.*, s.display_name as status_name
           FROM attendance_days ad
           JOIN attendance_statuses s ON ad.status_id = s.status_id
          WHERE ad.attendance_day_id = ?`,
        [attendanceDayId]
      );
      const [events] = await dbPromise.query(
        `SELECT * FROM attendance_events
          WHERE attendance_day_id = ?
          ORDER BY event_time`,
        [attendanceDayId]
      );

      // NEW: include ipFlag/message
      res.json({
        success: true,
        message: 'Checked out successfully',
        attendance_day: attendanceDay,
        events,
        timezone: tz,
        ipFlag,
        ...(ipFlag ? { ipMessage } : {})
      });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Failed to check out: ' + error.message });
  }
};


// Get today's attendance
const getTodayAttendance1 = async (req, res) => {
  try {
    // Get employee ID (should be the ID field from employees table, NOT employee_no)
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    
    if (!employeeId) {
      return res.json([]);
    }
    
    // Log for debugging purposes
    console.log(`Fetching today's attendance for employee ID: ${employeeId}`);
    
    // Get attendance day record
    const [attendanceDayRows] = await dbPromise.query(
      `SELECT 
         ad.*,
         s.display_name as status_name,
         e.name as employee_name,
         d.department_name,
         CASE 
           WHEN ad.total_worked_minutes IS NOT NULL THEN ROUND(ad.total_worked_minutes / 60.0, 2)
           ELSE NULL
         END as worked_hours
       FROM attendance_days ad
       JOIN attendance_statuses s ON ad.status_id = s.status_id
       JOIN employees e ON ad.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE ad.employee_id = ? AND ad.attendance_date = DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00'))
       ORDER BY attendance_day_id desc`,
      [employeeId]
    );
    
    if (attendanceDayRows.length === 0) {
      // For backward compatibility, check the attendance table
      const [attendanceRows] = await dbPromise.query(
        `SELECT 
           a.*, 
           e.name as employee_name,
           d.department_name,
           CASE 
             WHEN a.clock_out IS NOT NULL THEN 
               ROUND(TIMESTAMPDIFF(MINUTE, a.clock_in, a.clock_out) / 60.0, 2)
             ELSE NULL 
           END as worked_hours,
           CASE
             WHEN a.clock_out IS NOT NULL THEN 'Present'
             ELSE 'Checked In'
           END as status_name
         FROM attendance a
         LEFT JOIN employees e ON a.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE a.employee_id = ? 
         AND DATE(a.clock_in) = DATE(CONVERT_TZ( NOW(), 'UTC', '+08:00'))
         ORDER BY a.clock_in DESC`,
        [employeeId]
      );
      
      const resultRows = attendanceRows.map(day => ({
        ...day,
        isCheckedIn: day.last_check_out_time === null && 
                   day.first_check_in_time !== null
      }));

      return res.json([resultRows]);
    }
    
    //Get events for the day
    // const [events] = await dbPromise.query(
    //   `SELECT * FROM attendance_events 
    //    WHERE attendance_day_id IN (SELECT attendance_day_id FROM attendance_days WHERE employee_id = ? AND attendance_date = DATE(CONVERT_TZ( NOW(), 'UTC', '+08:00')))
    //    ORDER BY event_time`,
    //   [employeeId]
    // );
    
    //Combine data into a single response
    // const resultRows = events.map(day => ({
    //   ...attendanceDayRows[0],
    //   events: day,
    //   isCheckedIn: attendanceDayRows[0].last_check_out_time === null && 
    //              attendanceDayRows[0].first_check_in_time !== null
    // }));

    const result =  {
      attendanceDayRows: attendanceDayRows,
      //events: events,
      isCheckedIn: attendanceDayRows[0].last_check_out_time === null && 
                 attendanceDayRows[0].first_check_in_time !== null
    };

    // const result = attendanceDayRows.map(day => ({
    //   ...day,
    //   isCheckedIn: day.last_check_out_time === null && 
    //              day.first_check_in_time !== null
    // }));
    
    res.json([result]);  // Return as array for backward compatibility
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance: ' + error.message });
  }
};


/* ----------------------- Today (TZ-aware, overnight-safe) ----------------------- */

const getTodayAttendance2 = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.json([]);

    const conn = await dbPromise.getConnection();
    await setSessionToUTC(connection);   // <— add this line

    try {
      const tz = await getEmployeeTZ(conn, employeeId);
      const nowLocal = DateTime.now().setZone(tz);
      const todayLocal = nowLocal.toISODate();
      const yesterdayLocal = nowLocal.minus({ days: 1 }).toISODate();

      // 1) Try today's local date (keep old columns/aliases)
      let [attendanceDayRows] = await conn.query(
        `SELECT 
           ad.*,
           s.display_name                              AS status_name,
           e.name                                      AS employee_name,
           d.department_name,
           CASE 
             WHEN ad.total_worked_minutes IS NOT NULL 
             THEN ROUND(ad.total_worked_minutes / 60.0, 2)
             ELSE NULL
           END                                         AS worked_hours
         FROM attendance_days ad
         JOIN attendance_statuses s ON ad.status_id = s.status_id
         JOIN employees e           ON ad.employee_id = e.id
         LEFT JOIN departments d    ON e.department_id = d.id
         WHERE ad.employee_id = ? AND ad.attendance_date = ?
         ORDER BY ad.attendance_day_id DESC`,
        [employeeId, todayLocal]
      );

      // 2) Overnight safety: if none for today, but yesterday was overnight and still active, show yesterday
      if (!attendanceDayRows.length) {
        const { prev } = await getSchedulesAround(conn, employeeId, todayLocal);
        if (prev && Number(prev.overnight) === 1 && prev.end_time) {
          const [eh, em] = prev.end_time.split(':').map(Number);
          const prevEnd = DateTime.fromISO(prev.schedule_date, { zone: tz })
            .set({ hour: eh, minute: em, second: 0, millisecond: 0 })
            .plus({ days: 1 });
          if (nowLocal <= prevEnd) {
            [attendanceDayRows] = await conn.query(
              `SELECT 
                 ad.*,
                 s.display_name                           AS status_name,
                 e.name                                   AS employee_name,
                 d.department_name,
                 CASE 
                   WHEN ad.total_worked_minutes IS NOT NULL 
                   THEN ROUND(ad.total_worked_minutes / 60.0, 2)
                   ELSE NULL
                 END                                      AS worked_hours
               FROM attendance_days ad
               JOIN attendance_statuses s ON ad.status_id = s.status_id
               JOIN employees e           ON ad.employee_id = e.id
               LEFT JOIN departments d    ON e.department_id = d.id
               WHERE ad.employee_id = ? AND ad.attendance_date = ?
               ORDER BY ad.attendance_day_id DESC`,
              [employeeId, yesterdayLocal]
            );
          }
        }
      }

      if (attendanceDayRows.length) {
        // Keep *exact* old isCheckedIn logic (derived from the latest row fields)
        const first = attendanceDayRows[0];
        const isCheckedIn = first.last_check_out_time === null && first.first_check_in_time !== null;

        // === Backward-compatible payload ===
        return res.json([{
          attendanceDayRows,
          isCheckedIn
        }]);
      }

      // 3) No attendance_days row → build synthetic (still old shape)
      const { today, prev } = await getSchedulesAround(conn, employeeId, todayLocal);
      const pick = decideSchedule(today, prev, nowLocal);
      const schedule = pick.schedule;

      let syntheticRow = {
        attendance_day_id: null,
        employee_id: employeeId,
        attendance_date: todayLocal,
        first_check_in_time: null,
        last_check_out_time: null,
        total_worked_minutes: null,
        worked_hours: null,
        status_id: ATTENDANCE_STATUS.ABSENT,
        status_name: 'Absent',
        employee_name: null,
        department_name: null
      };

      if (schedule) {
        if (schedule.status === 'off' || schedule.status === 'leave') {
          syntheticRow.status_id = ATTENDANCE_STATUS.OFFDAY;
          syntheticRow.status_name = 'Offday';
        } else if (schedule.status === 'working') {
          const [sh, sm] = schedule.start_time.split(':').map(Number);
          const startLocal = DateTime.fromISO(pick.dateForDay, { zone: tz }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
          syntheticRow.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
        }
      } else {
        const settings = await loadSettings(conn);
        const [sh, sm] = (settings.work_start_time || '09:00').split(':').map(Number);
        const startLocal = DateTime.fromISO(todayLocal, { zone: tz }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        syntheticRow.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
      }

      return res.json([{
        attendanceDayRows: [syntheticRow],
        isCheckedIn: false
      }]);
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance: ' + error.message });
  }
};

const getTodayAttendance3 = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.json([]);

    const conn = await dbPromise.getConnection();
    await setSessionToUTC(conn); // force UTC session
    try {
      const tz = await getEmployeeTZ(conn, employeeId);
      const nowLocal = DateTime.now().setZone(tz);
      const todayLocal = nowLocal.toISODate();
      const yesterdayLocal = nowLocal.minus({ days: 1 }).toISODate();

      // try today
      let [attendanceDayRows = []] = await conn.query(
        `SELECT 
           ad.*,
           s.display_name AS status_name,
           e.name         AS employee_name,
           d.department_name,
           CASE WHEN ad.total_worked_minutes IS NOT NULL 
                THEN ROUND(ad.total_worked_minutes / 60.0, 2)
                ELSE NULL
           END AS worked_hours
         FROM attendance_days ad
         JOIN attendance_statuses s ON ad.status_id = s.status_id
         JOIN employees e           ON ad.employee_id = e.id
         LEFT JOIN departments d    ON e.department_id = d.id
         WHERE ad.employee_id = ? AND ad.attendance_date = ?
         ORDER BY ad.attendance_day_id DESC`,
        [employeeId, todayLocal]
      );

      // if none, check overnight from yesterday
      if (!attendanceDayRows.length) {
        const { prev } = await getSchedulesAround(conn, employeeId, todayLocal);
        if (prev && Number(prev.overnight) === 1 && prev.end_time) {
          const [eh, em] = prev.end_time.split(':').map(Number);
          const prevEnd = DateTime.fromISO(prev.schedule_date, { zone: tz })
            .set({ hour: eh, minute: em, second: 0, millisecond: 0 })
            .plus({ days: 1 });
          if (nowLocal <= prevEnd) {
            const [rowsY] = await conn.query(
              `SELECT 
                 ad.*,
                 s.display_name AS status_name,
                 e.name         AS employee_name,
                 d.department_name,
                 CASE WHEN ad.total_worked_minutes IS NOT NULL 
                      THEN ROUND(ad.total_worked_minutes / 60.0, 2)
                      ELSE NULL
                 END AS worked_hours
               FROM attendance_days ad
               JOIN attendance_statuses s ON ad.status_id = s.status_id
               JOIN employees e           ON ad.employee_id = e.id
               LEFT JOIN departments d    ON e.department_id = d.id
               WHERE ad.employee_id = ? AND ad.attendance_date = ?
               ORDER BY ad.attendance_day_id DESC`,
              [employeeId, yesterdayLocal]
            );
            attendanceDayRows = rowsY;
          }
        }
      }

      if (attendanceDayRows.length) {
        // Add explicit, timezone-safe fields (what the UI should display)
        attendanceDayRows = attendanceDayRows.map(r => ({
          ...r,
          first_check_in_time_local_iso: toLocalISO(r.first_check_in_time, tz),
          last_check_out_time_local_iso: toLocalISO(r.last_check_out_time, tz),
        }));

        const first = attendanceDayRows[0];
        const isCheckedIn = first.last_check_out_time === null && first.first_check_in_time !== null;

        // === keep old response shape ===
        return res.json([{ attendanceDayRows, isCheckedIn }]);
      }

      // No row today: build a synthetic one (old shape)
      const { today, prev } = await getSchedulesAround(conn, employeeId, todayLocal);
      const pick = decideSchedule(today, prev, nowLocal);
      const schedule = pick.schedule;

      const syntheticRow = {
        attendance_day_id: null,
        employee_id: employeeId,
        attendance_date: todayLocal,
        first_check_in_time: null,
        last_check_out_time: null,
        total_worked_minutes: null,
        worked_hours: null,
        status_id: ATTENDANCE_STATUS.ABSENT,
        status_name: 'Absent',
        employee_name: null,
        department_name: null,
        first_check_in_time_local_iso: null,
        last_check_out_time_local_iso: null,
      };

      if (schedule) {
        if (schedule.status === 'off' || schedule.status === 'leave') {
          syntheticRow.status_id = ATTENDANCE_STATUS.OFFDAY;
          syntheticRow.status_name = 'Offday';
        } else if (schedule.status === 'working') {
          const [sh, sm] = schedule.start_time.split(':').map(Number);
          const startLocal = DateTime.fromISO(pick.dateForDay, { zone: tz })
            .set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
          syntheticRow.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
        }
      } else {
        const settings = await loadSettings(conn);
        const [sh, sm] = (settings.work_start_time || '09:00').split(':').map(Number);
        const startLocal = DateTime.fromISO(todayLocal, { zone: tz })
          .set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        syntheticRow.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
      }

      return res.json([{ attendanceDayRows: [syntheticRow], isCheckedIn: false }]);
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance: ' + error.message });
  }
};

const getTodayAttendance = async (req, res) => {
  try {
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    if (!employeeId) return res.json([]);

    const conn = await dbPromise.getConnection();
    await setSessionToUTC(conn);
    try {
      const tz = await getEmployeeTZ(conn, employeeId);
      const nowLocal = DateTime.now().setZone(tz);
      const todayLocal = nowLocal.toISODate();
      const yesterdayLocal = nowLocal.minus({ days: 1 }).toISODate();

      // Helper to fetch one day with event-aware fields
      async function fetchDayRows(dayISO) {
        const [rows] = await conn.query(
          `SELECT 
             ad.*,
             s.display_name AS status_name,
             e.name         AS employee_name,
             d.department_name,
             CASE 
               WHEN ad.total_worked_minutes IS NOT NULL 
               THEN ROUND(ad.total_worked_minutes / 60.0, 2)
               ELSE NULL
             END AS worked_hours,
             /* last_event_type via correlated subselect (fast for 1 row/day) */
             (
               SELECT ev.event_type
               FROM attendance_events ev
               WHERE ev.attendance_day_id = ad.attendance_day_id
               ORDER BY ev.event_time DESC
               LIMIT 1
             ) AS last_event_type,
             /* is_open = 1 if last event is CheckIn, else 0 */
             (
               CASE
                 WHEN (
                   SELECT ev2.event_type
                   FROM attendance_events ev2
                   WHERE ev2.attendance_day_id = ad.attendance_day_id
                   ORDER BY ev2.event_time DESC
                   LIMIT 1
                 ) = 'CheckIn' THEN 1
                 ELSE 0
               END
             ) AS is_open
           FROM attendance_days ad
           JOIN attendance_statuses s ON ad.status_id = s.status_id
           JOIN employees e           ON ad.employee_id = e.id
           LEFT JOIN departments d    ON e.department_id = d.id
           WHERE ad.employee_id = ? AND ad.attendance_date = ?
           ORDER BY ad.attendance_day_id DESC`,
          [employeeId, dayISO]
        );
        return rows;
      }

      // 1) Try local "today"
      let attendanceDayRows = await fetchDayRows(todayLocal);

      // 2) If none, check yesterday for an overnight window still in effect
      if (!attendanceDayRows.length) {
        const { prev } = await getSchedulesAround(conn, employeeId, todayLocal);
        if (prev && Number(prev.overnight) === 1 && prev.end_time) {
          const [eh, em] = prev.end_time.split(':').map(Number);
          const prevEnd = DateTime.fromISO(prev.schedule_date, { zone: tz })
            .set({ hour: eh, minute: em, second: 0, millisecond: 0 })
            .plus({ days: 1 });
          if (nowLocal <= prevEnd) {
            attendanceDayRows = await fetchDayRows(yesterdayLocal);
          }
        }
      }

      if (attendanceDayRows.length) {
        // Normalize explicit local ISO times for the UI
        attendanceDayRows = attendanceDayRows.map(r => ({
          ...r,
          first_check_in_time_local_iso: toLocalISO(r.first_check_in_time, tz),
          last_check_out_time_local_iso: toLocalISO(r.last_check_out_time, tz),
          is_open: Number(r.is_open) === 1
        }));

        const first = attendanceDayRows[0];
        const isCheckedIn = !!first.is_open;

        return res.json([{ attendanceDayRows, isCheckedIn }]);
      }

      // 3) No row at all → synthetic row (keep your old shape)
      const { today, prev } = await getSchedulesAround(conn, employeeId, todayLocal);
      const pick = decideSchedule(today, prev, nowLocal);
      const schedule = pick.schedule;

      const settings = await loadSettings(conn);
      const synthetic = {
        attendance_day_id: null,
        employee_id: employeeId,
        attendance_date: todayLocal,
        first_check_in_time: null,
        last_check_out_time: null,
        total_worked_minutes: null,
        worked_hours: null,
        status_id: ATTENDANCE_STATUS.ABSENT,
        status_name: 'Absent',
        employee_name: null,
        department_name: null,
        first_check_in_time_local_iso: null,
        last_check_out_time_local_iso: null,
        last_event_type: null,
        is_open: false
      };

      if (schedule) {
        if (schedule.status === 'off' || schedule.status === 'leave') {
          synthetic.status_id = ATTENDANCE_STATUS.OFFDAY;
          synthetic.status_name = 'Offday';
        } else if (schedule.status === 'working') {
          const [sh, sm] = schedule.start_time.split(':').map(Number);
          const startLocal = DateTime.fromISO(pick.dateForDay, { zone: tz })
            .set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
          synthetic.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
        }
      } else {
        const [sh, sm] = (settings.work_start_time || '09:00').split(':').map(Number);
        const startLocal = DateTime.fromISO(todayLocal, { zone: tz })
          .set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        synthetic.status_name = nowLocal < startLocal ? 'Not checked in yet' : 'Absent';
      }

      return res.json([{ attendanceDayRows: [synthetic], isCheckedIn: false }]);
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance: ' + error.message });
  }
};



// Get attendance history
const getAttendanceHistory = async (req, res) => {
  try {
    // Get employee ID (should be the ID field from employees table, NOT employee_no)
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    const { start_date, end_date } = req.query;
    
    if (!employeeId) {
      return res.json([]);
    }
    
    // Log for debugging purposes
    console.log(`Fetching attendance history for employee ID: ${employeeId}, date range: ${start_date} to ${end_date}`);
    
    // Build query for attendance_days
    let query = `
      SELECT 
        ad.*,
        s.status_code as status_name,
        e.name as employee_name,
        d.department_name,
        CASE 
          WHEN ad.total_worked_minutes IS NOT NULL THEN ROUND(ad.total_worked_minutes / 60.0, 2)
          ELSE NULL
        END as worked_hours,
        (SELECT MIN(first_check_in_time) 
         FROM attendance_days 
         WHERE employee_id = ad.employee_id AND attendance_date = ad.attendance_date) AS first_check_in_day,
        (SELECT MAX(last_check_out_time) 
         FROM attendance_days 
         WHERE employee_id = ad.employee_id AND attendance_date = ad.attendance_date) AS last_check_out_day,
        COALESCE(aa.status, '') as appeal_status
      FROM attendance_days ad
      JOIN attendance_statuses s ON ad.status_id = s.status_id
      JOIN employees e ON ad.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance_appeals aa ON ad.attendance_day_id = aa.attendance_day_id
      WHERE ad.employee_id = ?
    `;
    
    const params = [employeeId];
    
    console.log("start_date", start_date);
    console.log("end_date", end_date);
    if (start_date && end_date) {
      query += ` AND ad.attendance_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days if no date range provided
      query += ` AND ad.attendance_date >= DATE_SUB(DATE(CONVERT_TZ( NOW(), 'UTC', '+08:00')), INTERVAL 30 DAY)`;
    }
    
    query += ` ORDER BY ad.attendance_date DESC, ad.attendance_day_id DESC`;
    
    const [historyRows] = await dbPromise.query(query, params);
    
    // Get events for each day
    const history = await Promise.all(historyRows.map(async (day) => {
      const [events] = await dbPromise.query(
        `SELECT * FROM attendance_events 
         WHERE attendance_day_id = ? 
         ORDER BY event_time`,
        [day.attendance_day_id]
      );
      
      return {
        ...day,
        events: events,
        isCheckedIn: day.last_check_out_time === null && day.first_check_in_time !== null
      };
    }));
    
    // If no records in attendance_days, fall back to the attendance table
    if (history.length === 0) {
      let fallbackQuery = `
        SELECT 
          a.*, 
          e.name as employee_name,
          d.department_name,
          CASE 
            WHEN a.clock_out IS NOT NULL THEN 
              ROUND(TIMESTAMPDIFF(MINUTE, a.clock_in, a.clock_out) / 60.0, 2)
            ELSE NULL 
          END as worked_hours,
          CASE
            WHEN a.clock_out IS NOT NULL THEN 'Present'
            ELSE 'Checked In'
          END as status_name
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE a.employee_id = ?
      `;
      
      const fallbackParams = [employeeId];
      
      if (start_date && end_date) {
        fallbackQuery += ` AND DATE(a.clock_in) BETWEEN ? AND ?`;
        fallbackParams.push(start_date, end_date);
      } else {
        fallbackQuery += ` AND DATE(a.clock_in) >= DATE_SUB(DATE(CONVERT_TZ( NOW(), 'UTC', '+08:00')), INTERVAL 30 DAY)`;
      }
      
      fallbackQuery += ` ORDER BY a.clock_in DESC`;
      
      const [fallbackHistory] = await dbPromise.query(fallbackQuery, fallbackParams);
      return res.json(fallbackHistory);
    }
    
    res.json(history);
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history: ' + error.message });
  }
};

// Get attendance statistics
const getAttendanceStats = async (req, res) => {
  try {
    // Get parameters
    const { period, department_id } = req.query;
    
    // Add employee_id retrieval for consistency
    const employeeId = req.body.employee_id || req.query.employee_id || (req.user && req.user.id);
    const isAdmin = req.body.isAdmin || req.query.isAdmin;
    // Manager filter - get all employees under this manager
    let managerCondition = '';
    let params = [];
    
    if (employeeId && !isAdmin) {
      managerCondition = 'AND e.manager_id = ?';
      params.push(employeeId);
    }
    
    const employeesQuery = `
      SELECT 
        e.id, e.name, e.position_id,
        p.start_work_time, p.end_work_time
      FROM employees e
      JOIN positions p ON e.position_id = p.id
      WHERE 1=1 ${managerCondition}
    `;
    
    const [employees] = await dbPromise.query(employeesQuery, [...params]);
    
    if (employees.length === 0) {
      return res.json({
        message: "No employees found with the given criteria",
        today: { present_rate: 0, absent_rate: 0, late_rate: 0 },
        daily_stats: [],
        top_performers: {
          period: { first_day: '', last_day: '' },
          employees: []
        }
      });
    }
    
    const employeeIds = employees.map(e => e.id);
    const totalEmployees = employeeIds.length;

    // Today's attendance statistics
    const todayQuery = `
      SELECT 
        e.id,
        e.name,
        p.start_work_time,
        p.end_work_time,
        ad.status_id,
        s.status_code,
        ad.first_check_in_time,
        ad.last_check_out_time
      FROM employees e
      JOIN positions p ON e.position_id = p.id
      LEFT JOIN (
        SELECT 
          employee_id, 
          status_id,
          MIN(first_check_in_time) AS first_check_in_time, 
          MAX(last_check_out_time) AS last_check_out_time 
        FROM attendance_days 
        WHERE attendance_date = DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00'))
        GROUP BY employee_id, status_id
      ) as ad ON e.id = ad.employee_id
      LEFT JOIN attendance_statuses s ON ad.status_id = s.status_id
      WHERE e.id IN (${employeeIds.join(',')})
    `;
    
    const [todayAttendance] = await dbPromise.query(todayQuery);
    
    // Calculate today's rates
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let partialCount = 0;
    let offdayCount = 0;

    // Track which employees have been counted
    const countedEmployees = new Set();

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    todayAttendance.forEach(employee => {
      // Skip if this employee has already been counted
      if (countedEmployees.has(employee.id)) return;

      // Parse work times
      const [startHour, startMinute] = employee.start_work_time?.split(':').map(Number) || [9, 0];
      const [endHour, endMinute] = employee.end_work_time?.split(':').map(Number) || [18, 0];
      
      // Calculate if current time is past end work time
      const isPastEndTime = currentHour > endHour || (currentHour === endHour && currentMinute > endMinute);
      
      // First check status_code if available
      if (employee.status_code) {
        switch(employee.status_code.toUpperCase()) {
          case 'PRESENT':
            presentCount++;
            countedEmployees.add(employee.id);
            return;
          case 'LATE':
            lateCount++;
            countedEmployees.add(employee.id);
            return;
          case 'ABSENT':
            absentCount++;
            countedEmployees.add(employee.id);
            return;
          case 'PARTIAL':
            partialCount++;
            countedEmployees.add(employee.id);
            return;
          case 'OFFDAY':
            offdayCount++;
            countedEmployees.add(employee.id);
            return;
        }
      }
      
      // Fallback to check_in time logic if status_code is not available or not conclusive
      if (employee.first_check_in_time) {
        // Check if late
        const checkInDate = new Date(employee.first_check_in_time);
        const checkInHour = checkInDate.getHours();
        const checkInMinute = checkInDate.getMinutes();
        
        if (checkInHour > startHour || (checkInHour === startHour && checkInMinute > startMinute)) {
          lateCount++;
        } else {
          presentCount++;
        }
        countedEmployees.add(employee.id);
      } else if (isPastEndTime) {
        // Employee didn't check in and it's past their end time
        absentCount++;
        countedEmployees.add(employee.id);
      }
      // If neither present nor past end time, they still have time to check in
    });

    // Calculate rates
    const presentRate = totalEmployees > 0 ? (presentCount / totalEmployees) * 100 : 0;
    const absentRate = totalEmployees > 0 ? ((absentCount + offdayCount) / totalEmployees) * 100 : 0;
    const lateRate = totalEmployees > 0 ? (lateCount / totalEmployees) * 100 : 0;
    const partialRate = totalEmployees > 0 ? (partialCount / totalEmployees) * 100 : 0;
    
    // NEW SECTION: Get daily attendance stats for the past 8 days
    // Calculate date range (today and 7 days before)
    const today = new Date();
    //Fixed at 8 hours timezone for Singapore
    today.setHours(today.getHours() + 8);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    console.log("today", today);
    console.log("sevenDaysAgo", sevenDaysAgo);

    const formattedToday = today.toISOString().split('T')[0];
    const formattedSevenDaysAgo = sevenDaysAgo.toISOString().split('T')[0];

    console.log("formattedToday", formattedToday);
    console.log("formattedSevenDaysAgo", formattedSevenDaysAgo);
    // Query for daily attendance data
    const dailyStatsQuery = `
      SELECT 
        ad.attendance_date,
        s.status_code,
        COUNT(DISTINCT ad.employee_id) as count
      FROM 
        attendance_days ad
      JOIN 
        attendance_statuses s ON ad.status_id = s.status_id
      WHERE 
        ad.employee_id IN (${employeeIds.join(',')})
        AND ad.attendance_date BETWEEN ? AND ?
      GROUP BY 
        ad.attendance_date, s.status_code
      ORDER BY 
        ad.attendance_date DESC
    `;
  
    const [dailyStats] = await dbPromise.query(dailyStatsQuery, [formattedSevenDaysAgo,formattedToday]);
    
    // Process daily stats into a structured format
    const dailyStatsMap = new Map();
    
    // Initialize the map with all 8 days and zero counts
    for (let i = 0; i < 8; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i); 
      const formattedDate = date.toISOString().split('T')[0];
      
      dailyStatsMap.set(formattedDate, {
        date: formattedDate,
        present: 0,
        late: 0,
        absent: 0,
        partial: 0,
        offday: 0,
        total_employees: totalEmployees
      });
    }
    
    // Fill in actual counts from query results
    dailyStats.forEach(stat => {
      const date = toSingaporeTime(stat.attendance_date, 'date');
      if (dailyStatsMap.has(date)) {
        const dayStats = dailyStatsMap.get(date);
        
        switch(stat.status_code.toUpperCase()) {
          case 'PRESENT':
            dayStats.present = stat.count;
            break;
          case 'LATE':
            dayStats.late = stat.count;
            break;
          case 'ABSENT':
            dayStats.absent = stat.count;
            break;
          case 'PARTIAL':
            dayStats.partial = stat.count;
            break;
          case 'OFFDAY':
            dayStats.offday = stat.count;
            break;
        }
        
        dailyStatsMap.set(date, dayStats);
      }
    });
    
    // Convert map to array and calculate missing employees as absent
    const dailyStatsResult = Array.from(dailyStatsMap.values()).map(day => {
      // Count employees with any status
      const accounted = day.present + day.late + day.partial + day.offday;
      
      // If some employees don't have a status, count them as absent
      if (accounted < totalEmployees) {
        day.absent += (totalEmployees - accounted);
      }
      
      // Calculate rates
      day.present_rate = totalEmployees > 0 ? (day.present / totalEmployees) * 100 : 0;
      day.late_rate = totalEmployees > 0 ? (day.late / totalEmployees) * 100 : 0;
      day.absent_rate = totalEmployees > 0 ? ((day.absent + day.offday) / totalEmployees) * 100 : 0;
      day.partial_rate = totalEmployees > 0 ? (day.partial / totalEmployees) * 100 : 0;
      
      return day;
    });
    
    // Get last month top 5 employees based on attendance rate
    // Calculate first and last day of previous month
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const lastDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
    
    const firstDay = firstDayLastMonth.toISOString().split('T')[0];
    const lastDay = lastDayLastMonth.toISOString().split('T')[0];
    
    // Calculate actual working days in the previous month (Monday to Friday only)
    let lastMonthWorkingDays = 0;
    const currentDate = new Date(firstDayLastMonth);
    while (currentDate <= lastDayLastMonth) {
      const dayOfWeek = currentDate.getDay();
      // Count only Monday (1) to Friday (5), exclude Saturday (6) and Sunday (0)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        lastMonthWorkingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`Last month working days (Mon-Fri only): ${lastMonthWorkingDays}`);
    
    // Determine if user is admin or manager
    // Admin: isAdmin=true OR no employeeId provided
    // Manager: isAdmin=false AND employeeId provided
    const userIsAdmin = isAdmin || !employeeId;
    
    let topPerformersQuery;
    let topPerformersParams;
    
    if (userIsAdmin) {
      // Admin query - show all active employees (exclude admin account)
      topPerformersQuery = `
        SELECT 
          e.id,
          e.name,
          e.employee_no,
          d.department_name,
          -- Count days where employee was present, late, or partial
          COUNT(DISTINCT CASE 
            WHEN s.status_code IN ('PRESENT', 'LATE', 'PARTIAL') 
            THEN ad.attendance_date 
          END) as days_present,
          -- Count total attendance records
          COUNT(DISTINCT ad.attendance_date) as total_days_recorded,
          -- Calculate total worked minutes and hours
          COALESCE(SUM(ad.total_worked_minutes), 0) as total_minutes,
          COALESCE(ROUND(SUM(ad.total_worked_minutes) / 60, 2), 0) as total_hours,
          -- Calculate attendance percentage based on working days
          COALESCE(ROUND(
            COUNT(DISTINCT CASE 
              WHEN s.status_code IN ('PRESENT', 'LATE', 'PARTIAL') 
              THEN ad.attendance_date 
            END) / ${lastMonthWorkingDays} * 100, 2
          ), 0) as attendance_percentage,
          -- Calculate days equivalent
          COALESCE(ROUND(SUM(ad.total_worked_minutes) / (8 * 60), 2), 0) as days_equivalent
        FROM employees e
        LEFT JOIN attendance_days ad ON e.id = ad.employee_id 
          AND ad.attendance_date BETWEEN ? AND ?
        LEFT JOIN attendance_statuses s ON ad.status_id = s.status_id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.status = 'active' AND e.id != 1
        GROUP BY e.id, e.name, e.employee_no, d.department_name
        HAVING days_present > 0
        ORDER BY attendance_percentage DESC, total_minutes DESC
        LIMIT 5`;
      
      topPerformersParams = [firstDay, lastDay];
      
    } else {
      // Manager query - show only employees under this manager
      topPerformersQuery = `
        SELECT 
          e.id,
          e.name,
          e.employee_no,
          d.department_name,
          -- Count days where employee was present, late, or partial
          COUNT(DISTINCT CASE 
            WHEN s.status_code IN ('PRESENT', 'LATE', 'PARTIAL') 
            THEN ad.attendance_date 
          END) as days_present,
          -- Count total attendance records
          COUNT(DISTINCT ad.attendance_date) as total_days_recorded,
          -- Calculate total worked minutes and hours
          COALESCE(SUM(ad.total_worked_minutes), 0) as total_minutes,
          COALESCE(ROUND(SUM(ad.total_worked_minutes) / 60, 2), 0) as total_hours,
          -- Calculate attendance percentage based on working days
          COALESCE(ROUND(
            COUNT(DISTINCT CASE 
              WHEN s.status_code IN ('PRESENT', 'LATE', 'PARTIAL') 
              THEN ad.attendance_date 
            END) / ${lastMonthWorkingDays} * 100, 2
          ), 0) as attendance_percentage,
          -- Calculate days equivalent
          COALESCE(ROUND(SUM(ad.total_worked_minutes) / (8 * 60), 2), 0) as days_equivalent
        FROM employees e
        LEFT JOIN attendance_days ad ON e.id = ad.employee_id 
          AND ad.attendance_date BETWEEN ? AND ?
        LEFT JOIN attendance_statuses s ON ad.status_id = s.status_id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.manager_id = ? AND e.status = 'active'
        GROUP BY e.id, e.name, e.employee_no, d.department_name
        HAVING days_present > 0
        ORDER BY attendance_percentage DESC, total_minutes DESC
        LIMIT 5`;
      
      topPerformersParams = [firstDay, lastDay, employeeId];
    }
    
    console.log("Top performers query for:", userIsAdmin ? "Admin (all employees)" : `Manager ID: ${employeeId}`);
    console.log("Query parameters:", topPerformersParams);
    
    const [topPerformers] = await dbPromise.query(topPerformersQuery, topPerformersParams);
    
    console.log("Query results:", topPerformers.length, "top performers found");
    console.log("Period:", firstDay, "to", lastDay);

    res.json({
      today: {
        present_rate: presentRate.toFixed(2),
        absent_rate: absentRate.toFixed(2),
        late_rate: lateRate.toFixed(2),
        partial_rate: partialRate.toFixed(2),
        total_employees: totalEmployees,
        present_count: presentCount,
        absent_count: absentCount,
        late_count: lateCount,
        partial_count: partialCount,
        offday_count: offdayCount
      },
      daily_stats: dailyStatsResult,
      top_performers: {
        period: {
          first_day: firstDay,
          last_day: lastDay,
        },
        working_days: lastMonthWorkingDays,
        employees: topPerformers.map(emp => ({
          id: emp.id,
          name: emp.name,
          employee_no: emp.employee_no,
          department: emp.department_name || 'No Department',
          days_present: emp.days_present || 0,
          total_days_recorded: emp.total_days_recorded || 0,
          total_hours: emp.total_hours || 0,
          attendance_percentage: emp.attendance_percentage || 0,
          days_equivalent: emp.days_equivalent || 0
        }))
      }
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance statistics: ' + error.message });
  }
};

// Get attendance data with filters
const getAttendances = async (req, res) => {
  try {
    console.log("getAttendances");

    // Get filter parameters from query
    const { 
      start_date, 
      end_date, 
      employee_name,
      employee_no, 
      company_id, 
      department_id, 
      status
    } = req.query;
    
    // Build base query with all required fields
    let query = `
      SELECT
        e.id AS employee_id,
        e.name AS employee_name,
        e.employee_no,
        c.name AS company_name,
        d.department_name,
        p.title AS position_name,
        ad.attendance_date,
        ad.first_check_in_time,
        ad.last_check_out_time,
        ad.attendance_day_id,
        CASE 
          WHEN ad.total_worked_minutes IS NOT NULL THEN ROUND(ad.total_worked_minutes / 60.0, 2)
          ELSE 0
        END as worked_hours,
        s.status_code as status_name,
        (SELECT name FROM employees WHERE id = ad.amended_by) as amend_by,
        ad.updated_at as amend_date

      FROM
        attendance_days ad
        JOIN employees e ON ad.employee_id = e.id
        JOIN positions p ON e.position_id = p.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN companies c ON e.company_id = c.id
        JOIN attendance_statuses s ON ad.status_id = s.status_id
      WHERE 1=1
    `;
    
    // Add parameters for prepared statement
    const params = [];
    
    // Add filters based on provided parameters
    if (start_date && end_date) {
      query += ` AND ad.attendance_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    
    if (employee_name) {
      query += ` AND e.name LIKE ?`;
      params.push(`%${employee_name}%`);
    }
    
    if (employee_no) {
      query += ` AND e.employee_no LIKE ?`;
      params.push(`%${employee_no}%`);
    }
    
    if (company_id) {
      query += ` AND e.company_id = ?`;
      params.push(company_id);
    }
    
    if (department_id) {
      query += ` AND e.department_id = ?`;
      params.push(department_id);
    }
    
    if (status) {
      query += ` AND s.status_code = ?`;
      params.push(status.toUpperCase());
    }
    
    // Add sorting
    query += ` ORDER BY ad.attendance_date DESC, e.name ASC`;
    
    // Execute query
    const [attendanceData] = await dbPromise.query(query, params);

    // Format response
    const formattedData = attendanceData.map(record => ({
      employee_name: record.employee_name,
      employee_no: record.employee_no,
      company_name: record.company_name,
      department: record.department_name,
      position: record.position_name,
      attendance_date: record.attendance_date,
      check_in_time: record.first_check_in_time,
      check_out_time: record.last_check_out_time,
      worked_hours: record.worked_hours ? parseFloat(record.worked_hours).toFixed(2) : '0.00',
      status: record.status_name,
      attendance_day_id: record.attendance_day_id,
      employee_id: record.employee_id,
      amend_date: record.amend_date,
      amend_by: record.amend_by
    }));
    
    res.json(formattedData);
    
  } catch (error) {
    console.error('Get attendance data error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data: ' + error.message });
  }
};

const departmentAttendance = async (req, res) => {
  try {
    const { company_id, start_date, end_date, page = 1, limit = 5 } = req.query;

    // Default to current month if no date range is provided
    let startDateParam = start_date;
    let endDateParam = end_date;
    
    if (!startDateParam || !endDateParam) {
      const today = new Date();
      today.setHours(today.getHours() + 8);
      const firstDayOfMonth = formatInTimeZone(new Date(today.getFullYear(), today.getMonth(), 1), 'Asia/Singapore', 'yyyy-MM-dd');
      const lastDayOfMonth = formatInTimeZone(today, 'Asia/Singapore', 'yyyy-MM-dd');
      
      // startDateParam = firstDayOfMonth.toISOString().split('T')[0];
      // endDateParam = lastDayOfMonth.toISOString().split('T')[0];
      startDateParam = firstDayOfMonth;
      endDateParam = lastDayOfMonth;
    }
    
    console.log(`Fetching attendance data from ${startDateParam} to ${endDateParam}`);

    // First, get all departments with employee counts (for accurate pagination)
    const allDeptsQuery = `
      SELECT
        d.id AS department_id,
        d.department_name,
        COUNT(DISTINCT e.id) AS total_employees
      FROM
        departments d
        LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      ${company_id && company_id !== '0' ? 'WHERE d.company_id = ?' : ''}
      GROUP BY d.id, d.department_name
    `;

    const baseParams = company_id && company_id !== '0' && !isNaN(company_id) ? [parseInt(company_id)] : [];
    const [allDepartments] = await dbPromise.query(allDeptsQuery, baseParams);
    
    // Filter to only departments with employees
    const departmentsWithEmployees = allDepartments.filter(dept => dept.total_employees > 0);
    
    // Calculate working days in the date range (excluding weekends) directly in JavaScript
    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);
    let workingDaysCount = 0;
    
    // Loop through each day in the range and count weekdays (Monday-Friday)
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // getDay() returns 0 for Sunday, 1-5 for Monday-Friday, 6 for Saturday
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysCount++;
      }
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Process each department to get attendance stats
    const departmentResults = await Promise.all(departmentsWithEmployees.map(async (dept) => {
      // Get active employees in this department
      const [employees] = await dbPromise.query(
        `SELECT id FROM employees WHERE department_id = ? AND status = 'active'`,
        [dept.department_id]
      );

      const employeeIds = employees.map(e => e.id);
      
      // Get attendance data including PRESENT, LATE, and PARTIAL statuses
      const attendanceQuery = `
        SELECT
          COUNT(DISTINCT CASE WHEN s.status_code = 'PRESENT' THEN CONCAT(ad.employee_id, '_', ad.attendance_date) END) AS present_days,
          COUNT(DISTINCT CASE WHEN s.status_code = 'LATE' THEN CONCAT(ad.employee_id, '_', ad.attendance_date) END) AS late_days,
          COUNT(DISTINCT CASE WHEN s.status_code = 'PARTIAL' THEN CONCAT(ad.employee_id, '_', ad.attendance_date) END) AS partial_days,
          COUNT(DISTINCT CASE WHEN s.status_code IN ('PRESENT', 'LATE', 'PARTIAL') THEN CONCAT(ad.employee_id, '_', ad.attendance_date) END) AS total_days_present
        FROM 
          attendance_days ad
          JOIN attendance_statuses s ON ad.status_id = s.status_id
        WHERE
          ad.employee_id IN (${employeeIds.join(',')})
          AND ad.attendance_date BETWEEN ? AND ?
      `;
      
      const [attendanceData] = await dbPromise.query(attendanceQuery, [startDateParam, endDateParam]);
      
      // Calculate total potential workdays (employees × working days)
      const totalPotentialDays = employeeIds.length * workingDaysCount;

      // Calculate attendance percentage
      const totalDaysPresent = totalPotentialDays === 0 ? 0 : attendanceData[0].total_days_present || 0;
      const attendancePercentage = totalPotentialDays > 0
        ? Math.round((totalDaysPresent / totalPotentialDays) * 10000) / 100
        : 0;
    

      return {
        department_id: dept.department_id,
        department_name: dept.department_name,
        total_employees: dept.total_employees || 0,
        present_days: totalPotentialDays === 0 ? 0 : attendanceData[0].present_days || 0,
        late_days: totalPotentialDays === 0 ? 0 : attendanceData[0].late_days || 0,
        partial_days: totalPotentialDays === 0 ? 0 : attendanceData[0].partial_days || 0,
        total_days_present: totalDaysPresent || 0,
        total_potential_days: totalPotentialDays,
        working_days: workingDaysCount,
        attendance_percentage: attendancePercentage
      };
    }));

    // Sort results by attendance_percentage (highest first), then by total_potential_days (highest first), 
    // then by total_days_present (highest first)
    departmentResults.sort((a, b) => {
      // First sort by attendance percentage (highest first)
      if (b.attendance_percentage !== a.attendance_percentage) {
        return b.attendance_percentage - a.attendance_percentage;
      }
      
      // If attendance percentages are equal, sort by total potential days (highest first)
      if (b.total_potential_days !== a.total_potential_days) {
        return b.total_potential_days - a.total_potential_days;
      }
      
      // If both attendance percentage and total potential days are equal, sort by total days present (highest first)
      return b.total_days_present - a.total_days_present;
    });
    
    // Calculate pagination based on filtered and sorted departments
    const totalDepartments = departmentResults.length;
    const totalPages = Math.ceil(totalDepartments / limit);
    
    // Adjust page if it's out of bounds
    const adjustedPage = page > totalPages && totalPages > 0 ? totalPages : page;
    
    // Calculate pagination offsets
    const offset = (adjustedPage - 1) * limit;
    
    // Apply pagination to filtered departments
    const formattedResults = departmentResults.slice(offset, offset + parseInt(limit));
    
    console.log(`Total departments with employees: ${totalDepartments}, page: ${adjustedPage}, limit: ${limit}`);

    res.json({
      departments: formattedResults,
      period: {
        start_date: startDateParam,
        end_date: endDateParam,
        working_days: workingDaysCount
      },
      pagination: {
        total: totalDepartments,
        per_page: parseInt(limit),
        current_page: parseInt(adjustedPage),
        total_pages: totalPages
      }
    });
  } catch (error) {
    console.error('Department attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch department attendance data: ' + error.message });
  }
};

const updateAmendment = async (req, res) => {
  try {
    const { employee_id, status_id, attendance_day_id,amended_by } = req.body;

    const [results] = await dbPromise.query(
      `UPDATE attendance_days SET status_id = ?, amended_by = ?, updated_at = CONVERT_TZ(NOW(), 'UTC', '+08:00') WHERE employee_id = ? AND attendance_day_id = ?`,
      [status_id, amended_by, employee_id, attendance_day_id]
    );

    if(results.affectedRows > 0){
      const [attendanceData] = await dbPromise.query(
        `SELECT e.name as amend_by, updated_at as amend_date FROM attendance_days JOIN employees e ON e.id = attendance_days.amended_by WHERE employee_id = ? AND attendance_day_id = ?`,
        [employee_id, attendance_day_id]
      );

      if(attendanceData.length === 0){
        throw new Error('Attendance not found');
      }
      return res.json({ success: true, message: 'Attendance status updated successfully', data: attendanceData[0] });
    }

    console.log("results", results);

    res.json({ success: true, message: 'Attendance status updated successfully' });

    
  } catch (error) {
    console.error('Update amendment error:', error);
  }
}

const submitAppeal = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    await connection.beginTransaction();
    
    const { employee_id, attendance_day_id, appeal_reason, original_check_in, original_check_out, request_check_in, request_check_out } = req.body;

    const [existingAppeal] = await connection.query(
      `SELECT * FROM attendance_appeals WHERE employee_id = ? AND attendance_day_id = ?`,
      [employee_id, attendance_day_id]
    );

    if (existingAppeal.length > 0) {
      throw new Error('Appeal already exists');
    }

    // Get employee's position and work hours
    const [employeeData] = await connection.query(
      `SELECT e.id, p.start_work_time, p.end_work_time
       FROM employees e
       JOIN positions p ON e.position_id = p.id
       WHERE e.id = ?`,
      [employee_id]
    );
    
    if (employeeData.length === 0) {
      throw new Error('Employee not found');
    }
    
    // Get MinWorkingMinutes from settings
    const [settingsData] = await connection.query(
      `SELECT setting_value FROM attendance_settings WHERE setting_key = 'MinWorkingMinutes'`
    );
    
    const minWorkingMinutes = settingsData.length > 0 ? 
      parseInt(settingsData[0].setting_value, 10) : 240; // Default to 4 hours if not found
    
    const startWorkTime = employeeData[0].start_work_time;

    if (!startWorkTime) {
      throw new Error('Start work time is not configured for this employee\'s position.');
    }

    // Parse work start time
    const [startHour, startMinute] = employeeData[0].start_work_time.split(':').map(Number);
    
    // Calculate total work minutes if both check-in and check-out are provided
    let totalWorkedMinutes = 0;
    let requestedStatus = 1; // Default to PRESENT
    
    if (request_check_in && request_check_out) {
      // Calculate time difference in minutes
      const requestCheckInDate = toSingaporeTime(request_check_in, 'date-object');
      const requestCheckOutDate = toSingaporeTime(request_check_out, 'date-object');
      totalWorkedMinutes = Math.floor((requestCheckOutDate - requestCheckInDate) / (1000 * 60));

      // Parse check-in time for comparison
      const checkInDate = requestCheckInDate;
      const checkInHour = checkInDate.getHours();
      const checkInMinute = checkInDate.getMinutes();
      
      // Determine status based on check-in time and total work time
      if (checkInHour > startHour || (checkInHour === startHour && checkInMinute > startMinute)) {
        requestedStatus = 3; // LATE
      } else {
        requestedStatus = 1; // PRESENT
      }
      
      // Check if total worked time is less than minimum required
      if (totalWorkedMinutes < minWorkingMinutes) {
        requestedStatus = 4; // PARTIAL
      }
    } else if (!original_check_in && request_check_in) {
      // Employee was absent (no original check-in) but now requesting check-in
      const checkInDate = toSingaporeTime(request_check_in, 'date-object');
      const checkInHour = checkInDate.getHours();
      const checkInMinute = checkInDate.getMinutes();
      
      if (checkInHour > startHour || (checkInHour === startHour && checkInMinute > startMinute)) {
        requestedStatus = 3; // LATE
      } else {
        requestedStatus = 1; // PRESENT
      }
    }

    const insert_request_check_in = toSingaporeTime(request_check_in, 'sql');
    const insert_request_check_out = toSingaporeTime(request_check_out, 'sql');

    // Insert appeal with calculated status
    const [results] = await connection.query(
      `INSERT INTO attendance_appeals (
         employee_id, 
         attendance_day_id, 
         appeal_reason, 
         requested_status_id, 
         requested_check_in, 
         requested_check_out
       ) VALUES (?, ?, ?, ?, CONVERT_TZ(?, 'UTC', '+08:00'), CONVERT_TZ(?, 'UTC', '+08:00'))`,
      [employee_id, attendance_day_id, appeal_reason, requestedStatus, insert_request_check_in, insert_request_check_out]
    );
    
    await connection.commit();
    
    if (results.affectedRows > 0) {
      res.json({ success: true, message: 'Appeal submitted successfully' });  
    } else {
      res.json({ success: false, message: 'Failed to submit appeal' });
    }

  } catch (error) {
    await connection.rollback();
    console.error('Submit appeal error:', error);
    res.status(500).json({ error: 'Failed to submit appeal: ' + error.message });
  } finally {
    connection.release();
  }
};

const updateAppeal = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    await connection.beginTransaction();
    
    const { appeal_id, status, admin_comment, admin_employee_id, original_check_in, original_check_out, original_status } = req.body;

    // Convert original times to proper format
    const original_check_in_date = toSingaporeTime(original_check_in, 'sql');
    const original_check_out_date = toSingaporeTime(original_check_out, 'sql');
    
    // Map status to status_id
    const statusMap = {
      'present': 1,
      'late': 3,
      'absent': 2,
      'offday': 5,
      'partial': 4
    };
    const original_status_id = statusMap[original_status.toLowerCase()];

    // Update the appeal status, add comment and reviewer details
    const [appealUpdateResult] = await connection.query(
      `UPDATE attendance_appeals 
       SET status = ?, 
           admin_comment = ?, 
           reviewed_at = CONVERT_TZ(NOW(), 'UTC', '+08:00'), 
           reviewed_by = ?,
           original_check_in = ?,
           original_check_out = ?,
           original_status_id = ? 
       WHERE appeal_id = ?`,
      [status.toUpperCase(), admin_comment || null, admin_employee_id, original_check_in_date, original_check_out_date, original_status_id, appeal_id]
    );

    if (appealUpdateResult.affectedRows === 0) {
      throw new Error('Appeal not found');
    }

    // If approved, update the specific attendance record and delete the rest
    if (status.toUpperCase() === 'APPROVED') {
      // Get the appeal data and employee information
      const [appealData] = await connection.query(
        `SELECT 
           a.employee_id,
           a.attendance_day_id,
           a.requested_check_in,
           a.requested_check_out,
           a.requested_status_id,
           ad.attendance_date
         FROM attendance_appeals a
         JOIN attendance_days ad ON a.attendance_day_id = ad.attendance_day_id
         WHERE a.appeal_id = ?`,
        [appeal_id]
      );
      
      if (appealData.length === 0) {
        throw new Error('Appeal data not found');
      }
      
      const appeal = appealData[0];
      
      // Calculate total worked minutes if both times are provided
      let totalWorkedMinutes = 0;
      if (appeal.requested_check_in && appeal.requested_check_out) {
        const [timeResult] = await connection.query(
          `SELECT TIMESTAMPDIFF(MINUTE, ?, ?) as minutes_worked`,
          [appeal.requested_check_in, appeal.requested_check_out]
        );
        totalWorkedMinutes = timeResult[0].minutes_worked || 0;
      }
      
      // Update the specific attendance record with approved appeal data
      const [attendanceUpdateResult] = await connection.query(
        `UPDATE attendance_days 
         SET status_id = ?,
             first_check_in_time = ?,
             last_check_out_time = ?,
             total_worked_minutes = ?,
             amended_by = ?,
             is_manually_updated = 1,
             updated_at = CONVERT_TZ(NOW(), 'UTC', '+08:00')
         WHERE attendance_day_id = ?`,
        [
          appeal.requested_status_id,
          appeal.requested_check_in,
          appeal.requested_check_out,
          totalWorkedMinutes,
          admin_employee_id,
          appeal.attendance_day_id
        ]
      );

      if (attendanceUpdateResult.affectedRows === 0) {
        throw new Error('Attendance record not found');
      }
      
      // Delete all OTHER attendance_days records for this employee on this date
      // Keep only the updated record (exclude the one we just updated)
      await connection.query(
        `DELETE FROM attendance_days 
         WHERE employee_id = ? 
         AND attendance_date = ? 
         AND attendance_day_id != ?`,
        [appeal.employee_id, appeal.attendance_date, appeal.attendance_day_id]
      );
    }
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Appeal ${status.toLowerCase()} successfully`,
      appeal_id: appeal_id,
      status: status
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Update appeal error:', error);
    res.status(500).json({ error: `Failed to ${req.body.status.toLowerCase()} appeal: ${error.message}` });
  } finally {
    connection.release();
  }
};

const getAppeals = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    // Get filter parameters from query
    const { 
      start_date, 
      end_date, 
      employee_name,
      employee_no, 
      company_id, 
      department_id, 
      status
    } = req.query;
    
    // Build base query with all required joins
    let query = `
      SELECT 
        appeal_id,
        aa.employee_id,
        e.name AS employee_name,
        e.employee_no,
        d.id AS department_id,
        d.department_name,
        c.name AS company_name,
        aa.status AS appeal_status,
        aa.created_at AS submitted_date,
        aa.appeal_reason,
        aa.requested_status_id,
        aa.attendance_day_id,
        rs.status_code AS requested_status_name,
        aa.requested_check_in,
        aa.requested_check_out,
        aa.reviewed_at,
        aa.reviewed_by,
        aa.admin_comment,
        CASE WHEN aa.original_status_id IS NOT NULL THEN aa.original_status_id ELSE ad.status_id END AS original_status_id,
        CASE WHEN aa.original_status_id IS NOT NULL 
        THEN 
        (SELECT status_code FROM attendance_statuses WHERE status_id = aa.original_status_id) 
        ELSE
        os.status_code
        END AS original_status_name,
        CASE WHEN aa.original_check_in IS NOT NULL THEN aa.original_check_in ELSE ad.first_check_in_time END AS original_check_in,
        CASE WHEN aa.original_check_out IS NOT NULL THEN aa.original_check_out ELSE ad.last_check_out_time END AS original_check_out,
        ad.attendance_date
      FROM 
        attendance_appeals aa
        JOIN attendance_days ad ON aa.attendance_day_id = ad.attendance_day_id
        JOIN employees e ON aa.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN companies c ON e.company_id = c.id
        JOIN attendance_statuses rs ON aa.requested_status_id = rs.status_id
        JOIN attendance_statuses os ON ad.status_id = os.status_id
      WHERE 1=1
    `;
    
    // Add parameters for prepared statement
    const params = [];
    console.log("start_date", new Date(start_date));
    console.log("end_date", end_date);
    // Add filters based on provided parameters
    if (start_date && end_date) {
      query += ` AND aa.created_at BETWEEN ? AND ?`;
      params.push(new Date(start_date), new Date(end_date));
    }
    
    if (employee_name) {
      query += ` AND e.name LIKE ?`;
      params.push(`%${employee_name}%`);
    }
    
    if (employee_no) {
      query += ` AND e.employee_no LIKE ?`;
      params.push(`%${employee_no}%`);
    }
    
    if (company_id) {
      query += ` AND e.company_id = ?`;
      params.push(company_id);
    }
    
    if (department_id) {
      query += ` AND e.department_id = ?`;
      params.push(department_id);
    }
    
    if (status) {
      query += ` AND aa.status = ?`;
      params.push(status.toUpperCase());
    }
    
    // Add sorting
    query += ` ORDER BY aa.created_at DESC, e.name ASC`;
    
    // Execute query
    const [appeals] = await connection.query(query, params);
    
    // Format the response
    const formattedAppeals = appeals.map(appeal => ({
      id: appeal.appeal_id,
      employee_id: appeal.employee_id,
      employee_name: appeal.employee_name,
      employee_no: appeal.employee_no,
      department_id: appeal.department_id,
      department_name: appeal.department_name,
      company_name: appeal.company_name,
      appeal_status: appeal.appeal_status,
      appeal_reason: appeal.appeal_reason,
      submitted_date: appeal.submitted_date,
      requested_status: appeal.requested_status_name,
      attendance_status: appeal.original_status_name,
      requested_check_in: appeal.requested_check_in,
      requested_check_out: appeal.requested_check_out,
      attendance_check_in: appeal.original_check_in,
      attendance_check_out: appeal.original_check_out,
      attendance_date: appeal.attendance_date,
      appeal_date: appeal.requested_check_in,
      admin_comment: appeal.admin_comment,
      attendance_day_id: appeal.attendance_day_id
    }));

    res.json(formattedAppeals);
    
  } catch (error) {
    console.error('Fetch appeals error:', error);
    res.status(500).json({ error: 'Failed to fetch appeals: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Mark employees as absent if they haven't checked in for the day and their work end time has passed
 * This should be scheduled to run after all work shifts have ended
 */
const markAbsentEmployees = async () => {
  const connection = await dbPromise.getConnection();
  
  try {
    console.log('Running absent marking job at:', new Date().toISOString());
    await connection.beginTransaction();
    
    // Get all active employees with their position work hours
    const [employees] = await connection.query(`
      SELECT 
        e.id as employee_id, 
        e.name,
        e.role,
        p.end_work_time
      FROM 
        employees e
      JOIN 
        positions p ON e.position_id = p.id
      WHERE 
        e.status = 'active'
    `);
    
    // Current date and time in Singapore timezone
    const today = toSingaporeTime(new Date(), 'date');
    const now = toSingaporeTime(new Date(), 'date-object');
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    console.log(`Checking for absent employees for date: ${today}, time: ${currentHour}:${currentMinute}`);
    
    // Process each employee
    for (const employee of employees) {
      // Ignore admin users
      if (employee.role === 'admin') {
        continue;
      }

      // Parse employee's end work time
      const [endHour, endMinute] = employee.end_work_time?.split(':').map(Number) || [18, 0];
      
      // Check if current time is after employee's end work time
      const isPastEndTime = currentHour > endHour || 
                          (currentHour === endHour && currentMinute > endMinute);
      
      // Only proceed if we're past the employee's end work time
      if (!isPastEndTime) {
        continue;
      }

      // Check if employee already has an attendance record for today
      const [existingAttendance] = await connection.query(`
        SELECT attendance_day_id 
        FROM attendance_days 
        WHERE employee_id = ? AND attendance_date = ?
      `, [employee.employee_id, today]);
      
      // If no attendance record exists, mark as absent
      if (existingAttendance.length === 0) {
        console.log(`Marking employee ${employee.name} (ID: ${employee.employee_id}) as absent for ${today} (past end time: ${endHour}:${endMinute})`);
        
        // Insert into attendance_days
        const [attendanceDayResult] = await connection.query(`
          INSERT INTO attendance_days (
            employee_id, 
            attendance_date, 
            status_id, 
            is_manually_updated
          ) VALUES (
            ?, ?, 2, 0
          )
        `, [employee.employee_id, today]);

        if (attendanceDayResult.affectedRows === 0) {
          throw new Error(`Failed to mark employee ${employee.employee_id} as absent`);
        }
      }
    }
    
    await connection.commit();
    console.log('Absent marking job completed successfully');
  } catch (error) {
    await connection.rollback();
    console.error('Error marking absent employees:', error);
  } finally {
    connection.release();
  }
};

const cancelAppeal = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    await connection.beginTransaction();
    
    const { appeal_id } = req.body;
    
    // First check if appeal exists and is in PENDING status
    const [appealCheck] = await connection.query(
      `SELECT status, employee_id FROM attendance_appeals WHERE appeal_id = ?`,
      [appeal_id]
    );
    
    if (appealCheck.length === 0) {
      return res.status(404).json({ error: 'Appeal not found' });
    }
    
    if (appealCheck[0].status !== 'PENDING') {
      return res.status(400).json({
        error: 'Only pending appeals can be cancelled',
        current_status: appealCheck[0].status
      });
    }
    
    // Update appeal status to CANCELLED
    const [updateResult] = await connection.query(
      `UPDATE attendance_appeals
        SET status = 'CANCEL',
            updated_at = CONVERT_TZ(NOW(), 'UTC', '+08:00')
        WHERE appeal_id = ?`,
      [appeal_id]
    );
    
    if (updateResult.affectedRows === 0) {
      throw new Error('Failed to cancel appeal');
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Appeal cancelled successfully',
      appeal_id
    });
  } catch (error) {
    await connection.rollback();
    console.error('Cancel appeal error:', error);
    res.status(500).json({ error: 'Failed to cancel appeal: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Mark employees with approved leave as OFFDAY in the attendance_days table
 * This should be scheduled to run after midnight to properly mark attendance for employees on leave
 */
const markLeaveEmployees = async () => {
  const connection = await dbPromise.getConnection();
  
  try {
    console.log('Running leave attendance marking job at:', new Date().toISOString());
    await connection.beginTransaction();
    
    // Current date in Singapore timezone (YYYY-MM-DD) - for DATE column
    const today = toSingaporeTime(new Date(), 'date');
    console.log(`Checking for employees on leave for date: ${today}`);
    
    // Get all employees with approved leave for today
    // This query finds all employees with APPROVED leave applications where today's date falls between start_date and end_date
    const [employeesOnLeave] = await connection.query(`
      SELECT 
        l.employee_id,
        e.name,
        e.role,
        l.start_date,
        l.end_date
      FROM 
        leave_applications l
      JOIN 
        employees e ON l.employee_id = e.id
      LEFT JOIN
        leave_types lt ON l.leave_type_id = lt.id
      WHERE 
        l.status = 'APPROVED'
        AND ? BETWEEN l.start_date AND l.end_date
        AND e.id != 1  -- Skip admin account
    `, [today]);
    
    console.log(`Found ${employeesOnLeave.length} employees on approved leave today`);
    
    // Process each employee on leave
    for (const employee of employeesOnLeave) {
      // Check if employee already has an attendance record for today
      const [existingAttendance] = await connection.query(`
        SELECT attendance_day_id, status_id
        FROM attendance_days 
        WHERE employee_id = ? AND attendance_date = ?
      `, [employee.employee_id, today]);
      
      if (existingAttendance.length === 0) {
        // If no attendance record exists, insert a new one with OFFDAY status
        console.log(`Marking employee ${employee.name} (ID: ${employee.employee_id}) as on leave (OFFDAY) for ${today}`);
        
        const [attendanceDayResult] = await connection.query(`
          INSERT INTO attendance_days (
            employee_id, 
            attendance_date, 
            status_id, 
            is_manually_updated
          ) VALUES (
            ?, ?, ?, 1
          )
        `, [employee.employee_id, today, ATTENDANCE_STATUS.OFFDAY]);

        if (attendanceDayResult.affectedRows === 0) {
          throw new Error(`Failed to mark employee ${employee.employee_id} as on leave`);
        }
      } else if (existingAttendance[0].status_id !== ATTENDANCE_STATUS.OFFDAY) {
        // If attendance record exists but isn't marked as OFFDAY, update it
        console.log(`Updating existing attendance record for employee ${employee.name} (ID: ${employee.employee_id}) to OFFDAY`);
        
        const [updateResult] = await connection.query(`
          UPDATE attendance_days
          SET status_id = ?, is_manually_updated = 1
          WHERE attendance_day_id = ?
        `, [ATTENDANCE_STATUS.OFFDAY, existingAttendance[0].attendance_day_id]);
        
        if (updateResult.affectedRows === 0) {
          throw new Error(`Failed to update attendance status to OFFDAY for employee ${employee.employee_id}`);
        }
      }
    }
    
    await connection.commit();
    console.log('Leave attendance marking job completed successfully');
  } catch (error) {
    await connection.rollback();
    console.error('Error marking employees on leave:', error);
  } finally {
    connection.release();
  }
};

const editAppeal = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    await connection.beginTransaction();
    
    const { appeal_id, request_check_in, request_check_out, appeal_reason } = req.body;
    
    // Check if appeal exists and is in PENDING status
    const [appealCheck] = await connection.query(
      `SELECT a.status, a.attendance_day_id, ad.attendance_date, p.start_work_time 
       FROM attendance_appeals a
       JOIN attendance_days ad ON a.attendance_day_id = ad.attendance_day_id
       JOIN employees e ON a.employee_id = e.id
       JOIN positions p ON e.position_id = p.id
       WHERE a.appeal_id = ?`,
      [appeal_id]
    );
    
    if (appealCheck.length === 0) {
      return res.status(404).json({ error: 'Appeal not found' });
    }
    
    if (appealCheck[0].status !== 'PENDING') {
      return res.status(400).json({
        error: 'Only pending appeals can be edited',
        current_status: appealCheck[0].status
      });
    }

    // Get minimum working minutes from settings for status determination
    const [settingsData] = await connection.query(
      `SELECT setting_value FROM attendance_settings WHERE setting_key = 'MinWorkingMinutes'`
    );
    
    const minWorkingMinutes = settingsData.length > 0 ? 
      parseInt(settingsData[0].setting_value, 10) : 480; // Default to 8 hours (480 minutes) if not found
    
    // Prepare the update fields
    const updateFields = [];
    const updateValues = [];
    
    // Get current requested times if we're only updating one of them
    let requestedCheckInTime = request_check_in;
    let requestedCheckOutTime = request_check_out;
    
    if (!request_check_in || !request_check_out) {
      const [currentAppealData] = await connection.query(
        `SELECT requested_check_in, requested_check_out FROM attendance_appeals WHERE appeal_id = ?`,
        [appeal_id]
      );
      
      if (currentAppealData.length > 0) {
        if (!request_check_in) {
          requestedCheckInTime = currentAppealData[0].requested_check_in;
        }
        if (!request_check_out) {
          requestedCheckOutTime = currentAppealData[0].requested_check_out;
        }
      }
    }
    
    // Determine the requested status based on the check-in and check-out times
    let requestedStatus = null;
    
    if (requestedCheckInTime && requestedCheckOutTime) {
      // Convert to Date objects if they're not already
      const checkInDate = new Date(requestedCheckInTime);
      const checkOutDate = new Date(requestedCheckOutTime);
      
      // Calculate working minutes
      const workingMinutes = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60));
      
      // Parse check-in time to compare with work start time
      const checkInHour = checkInDate.getHours();
      const checkInMinute = checkInDate.getMinutes();
      
      // Parse work start time
      const [startHour, startMinute] = appealCheck[0].start_work_time.split(':').map(Number);
      
      // Determine status based on check-in time and working minutes
      if (checkInHour > startHour || (checkInHour === startHour && checkInMinute > startMinute + 15)) {
        // Late arrival (> 15 min after start time)
        requestedStatus = 3; // Late
      } else if (workingMinutes < minWorkingMinutes) {
        // Insufficient work time
        requestedStatus = 4; // Partial
      } else {
        // On time and sufficient work time
        requestedStatus = 1; // Present
      }
      
      updateFields.push('requested_status_id = ?');
      updateValues.push(requestedStatus);
    }
    
    if (request_check_in) {
      updateFields.push(`requested_check_in = CONVERT_TZ(?, 'UTC', '+08:00')`);
      updateValues.push(toSingaporeTime(request_check_in, 'sql'));
    }
    
    if (request_check_out) {
      updateFields.push(`requested_check_out = CONVERT_TZ(?, 'UTC', '+08:00')`);
      updateValues.push(toSingaporeTime(request_check_out, 'sql'));
    }
    
    if (appeal_reason) {
      updateFields.push('appeal_reason = ?');
      updateValues.push(appeal_reason);
    }
    
    // Add the updated_at field
    updateFields.push(`updated_at = CONVERT_TZ(NOW(), 'UTC', '+08:00')`);
    
    // If no fields to update, return early
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // Add appeal_id to query parameters
    updateValues.push(appeal_id);
    
    // Update the appeal
    const [updateResult] = await connection.query(
      `UPDATE attendance_appeals
        SET ${updateFields.join(', ')}
        WHERE appeal_id = ?`,
      updateValues
    );
    
    if (updateResult.affectedRows === 0) {
      throw new Error('Failed to update appeal');
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Appeal updated successfully',
      appeal_id,
      requested_status: requestedStatus
    });
  } catch (error) {
    await connection.rollback();
    console.error('Edit appeal error:', error);
    res.status(500).json({ error: 'Failed to update appeal: ' + error.message });
  } finally {
    connection.release();
  }
};

const bulkUpdateAppeals = async (req, res) => {
  const connection = await dbPromise.getConnection();
  try {
    await connection.beginTransaction();
    
    const { appeal_ids, status, admin_comment, admin_employee_id } = req.body;

    console.log(req.body);
    // Validate input
    if (!appeal_ids || !Array.isArray(appeal_ids) || appeal_ids.length === 0) {
      return res.status(400).json({ error: 'appeal_ids must be a non-empty array' });
    }

    if (!status || !['APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
    }

    if (!admin_employee_id) {
      return res.status(400).json({ error: 'admin_employee_id is required' });
    }

    const results = [];
    const errors = [];

    // Process each appeal
    for (const appeal_id of appeal_ids) {
      try {
        // Get the appeal data with original attendance information
        const [appealInfo] = await connection.query(
          `SELECT 
             a.appeal_id,
             a.employee_id,
             a.attendance_day_id,
             a.requested_check_in,
             a.requested_check_out,
             a.requested_status_id,
             a.status as current_status,
             ad.attendance_date,
             ad.status_id as original_status_id,
             ad.first_check_in_time as original_check_in,
             ad.last_check_out_time as original_check_out,
             ast.status_code as original_status
           FROM attendance_appeals a
           JOIN attendance_days ad ON a.attendance_day_id = ad.attendance_day_id
           JOIN attendance_statuses ast ON ad.status_id = ast.status_id
           WHERE a.appeal_id = ? AND a.status = 'PENDING'`,
          [appeal_id]
        );
        
        if (appealInfo.length === 0) {
          errors.push({ appeal_id, error: 'Appeal not found or not pending' });
          continue;
        }
        
        const appeal = appealInfo[0];

        // Convert original times to proper format
        const original_check_in_date = appeal.original_check_in ? toSingaporeTime(appeal.original_check_in, 'sql') : null;
        const original_check_out_date = appeal.original_check_out ? toSingaporeTime(appeal.original_check_out, 'sql') : null;

        // Update the appeal status, add comment and reviewer details
        const [appealUpdateResult] = await connection.query(
          `UPDATE attendance_appeals 
           SET status = ?, 
               admin_comment = ?, 
               reviewed_at = CONVERT_TZ(NOW(), 'UTC', '+08:00'), 
               reviewed_by = ?,
               original_check_in = ?,
               original_check_out = ?,
               original_status_id = ? 
           WHERE appeal_id = ?`,
          [
            status.toUpperCase(), 
            admin_comment || `Bulk ${status.toLowerCase()} by admin`, 
            admin_employee_id, 
            original_check_in_date, 
            original_check_out_date, 
            appeal.original_status_id, 
            appeal_id
          ]
        );

        if (appealUpdateResult.affectedRows === 0) {
          errors.push({ appeal_id, error: 'Failed to update appeal status' });
          continue;
        }

        // If approved, update the specific attendance record and delete duplicates
        if (status.toUpperCase() === 'APPROVED') {
          // Calculate total worked minutes if both times are provided
          let totalWorkedMinutes = 0;
          if (appeal.requested_check_in && appeal.requested_check_out) {
            const [timeResult] = await connection.query(
              `SELECT TIMESTAMPDIFF(MINUTE, ?, ?) as minutes_worked`,
              [appeal.requested_check_in, appeal.requested_check_out]
            );
            totalWorkedMinutes = timeResult[0].minutes_worked || 0;
          }
          
          // Update the specific attendance record with approved appeal data
          const [attendanceUpdateResult] = await connection.query(
            `UPDATE attendance_days 
             SET status_id = ?,
                 first_check_in_time = ?,
                 last_check_out_time = ?,
                 total_worked_minutes = ?,
                 amended_by = ?,
                 is_manually_updated = 1,
                 updated_at = CONVERT_TZ(NOW(), 'UTC', '+08:00')
             WHERE attendance_day_id = ?`,
            [
              appeal.requested_status_id,
              appeal.requested_check_in,
              appeal.requested_check_out,
              totalWorkedMinutes,
              admin_employee_id,
              appeal.attendance_day_id
            ]
          );

          if (attendanceUpdateResult.affectedRows === 0) {
            errors.push({ appeal_id, error: 'Failed to update attendance record' });
            continue;
          }
          
          // Delete all OTHER attendance_days records for this employee on this date
          // Keep only the updated record (exclude the one we just updated)
          await connection.query(
            `DELETE FROM attendance_days 
             WHERE employee_id = ? 
             AND attendance_date = ? 
             AND attendance_day_id != ?`,
            [appeal.employee_id, appeal.attendance_date, appeal.attendance_day_id]
          );
        }

        results.push({ 
          appeal_id, 
          status: 'success',
          action: status.toLowerCase()
        });

      } catch (error) {
        console.error(`Error processing appeal ${appeal_id}:`, error);
        errors.push({ 
          appeal_id, 
          error: error.message || 'Unknown error occurred' 
        });
      }
    }
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Bulk ${status.toLowerCase()} operation completed`,
      results: {
        processed: results.length,
        failed: errors.length,
        total: appeal_ids.length,
        successful_appeals: results,
        failed_appeals: errors
      },
      status: status
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Bulk update appeals error:', error);
    res.status(500).json({ 
      error: `Failed to bulk update appeals: ${error.message}`,
      details: 'Database transaction rolled back'
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getAttendanceStats,
  getAttendances,
  departmentAttendance,
  updateAmendment,
  submitAppeal,
  updateAppeal,
  getAppeals,
  markAbsentEmployees,
  markLeaveEmployees,
  cancelAppeal,
  editAppeal,
  bulkUpdateAppeals
};
