
//NEW

const { dbPromise } = require('../models/db');

/**
 * Get today's attendance count for dashboard
 * Returns simple count of present employees and total employees
 * Filters based on user role and manager ID
 */
const getTodayAttendanceCount = async (req, res) => {
    try {
      // Get user ID and role
      const userId = req.body.user_id || req.query.user_id || (req.user && req.user.id);
      const userRole = req.body.role || req.query.role;
      
      // Set up manager filter condition based on role
      let managerCondition = '';
      let params = [];
      
      // Only filter by manager if not admin
      if (userRole !== 'admin' && userId) {
        managerCondition = 'AND e.manager_id = ?';
        params.push(userId);
      }
      
      // Get all relevant employees
      const employeesQuery = `
        SELECT 
          e.id, e.name, e.position_id,
          p.start_work_time, p.end_work_time
        FROM employees e
        JOIN positions p ON e.position_id = p.id
        WHERE 1=1 ${managerCondition}
      `;
      
      const [employees] = await dbPromise.query(employeesQuery, params);
      
      if (employees.length === 0) {
        return res.json({
          todayAttendances: 0,
          totalEmployees: 0
        });
      }
      
      const employeeIds = employees.map(e => e.id);
      const totalEmployees = employeeIds.length;
  
      // Today's attendance statistics
      const todayQuery = `
        SELECT 
          e.id,
          p.start_work_time,
          ad.first_check_in_time
        FROM employees e
        JOIN positions p ON e.position_id = p.id
        LEFT JOIN (
          SELECT employee_id, MIN(first_check_in_time) AS first_check_in_time
          FROM attendance_days 
          WHERE attendance_date = DATE(CONVERT_TZ(NOW(), 'UTC', '+08:00')) 
          GROUP BY employee_id
        ) AS ad ON e.id = ad.employee_id
        WHERE e.id IN (${employeeIds.join(',')})
      `;
      
      const [todayAttendance] = await dbPromise.query(todayQuery);
      
      // Count present employees (including those who are late)
      let attendanceCount = 0;
      
      todayAttendance.forEach(employee => {
        if (employee.first_check_in_time) {
          attendanceCount++;
        }
      });
      
      res.json({
        todayAttendances: attendanceCount,
        totalEmployees: totalEmployees
      });
    } catch (error) {
      console.error('Get today attendance count error:', error);
      res.status(500).json({ error: 'Failed to fetch today\'s attendance count: ' + error.message });
    }
  };

const getPendingLeavesCount = async (req, res) => {
  try {
    // Get user ID and role
    const userId = req.body.user_id || req.query.user_id || (req.user && req.user.id);
    const userRole = req.body.role || req.query.role;
    
    let query = `
      SELECT 
        COUNT(l.id) as pendingLeavesCount
      FROM 
        leave_applications l
      LEFT JOIN 
        employees e ON l.employee_id = e.id
    `;
    
    // Add condition based on role
    if (userRole !== 'admin' && userId) {
      // For managers, show leaves from their direct reports AND their own leaves
      query += ` WHERE l.status IN ('PENDING', 'FIRST_APPROVED') AND (e.manager_id = ? OR l.employee_id = ?)`;
      
      const [result] = await dbPromise.query(query, [userId, userId]);
      
      res.json({
        pendingLeaves: result[0].pendingLeavesCount || 0
      });
    } else {
      // For admins, show all pending leaves
      query += ` WHERE l.status IN ('PENDING', 'FIRST_APPROVED')`;
      
      const [result] = await dbPromise.query(query);
      
      res.json({
        pendingLeaves: result[0].pendingLeavesCount || 0
      });
    }
  } catch (error) {
    console.error('Get pending leaves count error:', error);
    res.status(500).json({ error: 'Failed to fetch pending leaves count: ' + error.message });
  }
};

/**
 * Get pending appeals count for dashboard
 * Returns count of pending appeals based on user role
 */
const getPendingAppealsCount = async (req, res) => {
  try {
    // Get user ID and role
    const userId = req.body.user_id || req.query.user_id || (req.user && req.user.id);
    const userRole = req.body.role || req.query.role;
    
    let query = `
      SELECT 
        COUNT(aa.appeal_id) as pendingAppealsCount
      FROM 
        attendance_appeals aa
      JOIN 
        employees e ON aa.employee_id = e.id
      WHERE 
        aa.status = 'PENDING'
    `;
    
    // Add condition based on role
    if (userRole !== 'admin' && userId) {
      // For managers, only show appeals from their direct reports
      query += ` AND e.manager_id = ?`;
      
      const [result] = await dbPromise.query(query, [userId]);
      
      res.json({
        pendingAppeals: result[0].pendingAppealsCount || 0
      });
    } else {
      // For admins, show all pending appeals
      const [result] = await dbPromise.query(query);
      
      res.json({
        pendingAppeals: result[0].pendingAppealsCount || 0
      });
    }
  } catch (error) {
    console.error('Get pending appeals count error:', error);
    res.status(500).json({ error: 'Failed to fetch pending appeals count: ' + error.message });
  }
};


/**
 * Get document expiry summary for dashboard (visa & passport)
 */
const getDocumentStatusSummary = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT
        -- Expired Visas
        SUM(CASE 
            WHEN e.visa_expired_date IS NOT NULL 
              AND DATEDIFF(e.visa_expired_date, CURDATE()) < 0 
            THEN 1 ELSE 0 END) AS expiredVisas,

        -- Visa Expiring Soon (within 30 days)
        SUM(CASE 
            WHEN e.visa_expired_date IS NOT NULL 
              AND DATEDIFF(e.visa_expired_date, CURDATE()) BETWEEN 0 AND 30 
            THEN 1 ELSE 0 END) AS visaExpiringSoon,

        -- Expired Passports
        SUM(CASE 
            WHEN e.passport_expired_date IS NOT NULL 
              AND DATEDIFF(e.passport_expired_date, CURDATE()) < 0 
            THEN 1 ELSE 0 END) AS expiredPassports,

        -- Passport Expiring Soon (within 30 days)
        SUM(CASE 
            WHEN e.passport_expired_date IS NOT NULL 
              AND DATEDIFF(e.passport_expired_date, CURDATE()) BETWEEN 0 AND 30 
            THEN 1 ELSE 0 END) AS passportExpiringSoon

      FROM employees e
      WHERE
        (
          e.visa_expired_date IS NOT NULL 
          AND DATEDIFF(e.visa_expired_date, CURDATE()) <= 30
        )
        OR
        (
          e.passport_expired_date IS NOT NULL 
          AND DATEDIFF(e.passport_expired_date, CURDATE()) <= 30
        );
    `);

    res.json({
      expiredVisas: rows[0].expiredVisas || 0,
      visaExpiringSoon: rows[0].visaExpiringSoon || 0,
      expiredPassports: rows[0].expiredPassports || 0,
      passportExpiringSoon: rows[0].passportExpiringSoon || 0
    });
  } catch (error) {
    console.error('Get document status summary error:', error);
    res.status(500).json({ error: 'Failed to fetch document status summary: ' + error.message });
  }
};


/**
 * Get list of employees with document issues (expired or expiring soon)
 * Supports: visa / passport + type: expired / expiring
 */
const getEmployeesWithDocumentStatus = async (req, res) => {
  try {
    const { type, document } = req.query;
    const today = new Date();
    const visaThresholdDays = 30;
    const passportThresholdDays = 30;

    console.log('👉 Request query:', { document, type });

    let whereClause = '';
    const params = [];

    if (document === 'visa') {
      if (type === 'expired') {
        whereClause = 'DATE(visa_expired_date) < CURDATE()';
      } else if (type === 'expiring') {
        whereClause = 'DATE(visa_expired_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)';
        params.push(visaThresholdDays);
      }
    } else if (document === 'passport') {
      if (type === 'expired') {
        whereClause = 'DATE(passport_expired_date) < CURDATE()';
      } else if (type === 'expiring') {
        whereClause = 'DATE(passport_expired_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)';
        params.push(passportThresholdDays);
      }
    }

    if (!whereClause) {
       console.error('❌ Invalid document/type combination');
      return res.status(400).json({ error: 'Invalid document or type' });
    }

    const query = `
      SELECT
        e.id,
        e.name,
        e.email,
        e.nationality,
        e.visa_expired_date,
        e.passport_expired_date,
        e.position,
        e.department,
        e.employee_no,
        c.name AS company_name
      FROM employees e
      INNER JOIN companies c ON e.company_id = c.id
      WHERE ${whereClause} 
      ORDER BY ${document}_expired_date ASC
    `;
    //AND is_active = 1
    console.log('🧪 Final Query:', query);
    console.log('📦 Parameters:', params);

    const [results] = await dbPromise.query(query, params);

    console.log('✅ Query Results Count:', results.length);
    if (results.length === 0) {
      console.warn('⚠️ No matching employee records found.');
    }

    res.json(results);
  } catch (error) {
    console.error('Get employee document issue list error:', error);
    res.status(500).json({ error: 'Failed to fetch employee document list: ' + error.message });
  }
};


module.exports = {
    getTodayAttendanceCount,
    getPendingLeavesCount,
    getPendingAppealsCount,
    getDocumentStatusSummary,
    getEmployeesWithDocumentStatus
};