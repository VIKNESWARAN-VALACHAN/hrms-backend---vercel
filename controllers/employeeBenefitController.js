//controllers\employeeBenefitController.js

const { dbPromise } = require('../models/db');

exports.getAllMappings1 = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
SELECT 
    eb.id, 
    eb.employee_id, 
    e.name AS employee_name,
    d.department_name ,
    c.name as company_name ,
    bt.name AS benefit_name, 
    eb.is_active,
    eb.benefit_type_id, 
    eb.claimed, 
    eb.entitled, 
    (COALESCE(eb.entitled, 0) - COALESCE(eb.claimed, 0)) AS balance,
    eb.frequency, 
    eb.effective_from, 
    eb.effective_to
FROM employee_benefits eb
JOIN employees e ON eb.employee_id = e.id
JOIN benefit_types bt ON eb.benefit_type_id = bt.id
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN companies c ON e.company_id = c.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching mappings:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
};

exports.getAllMappings = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Filter parameters
    const { 
      employee_id, 
      employee_name, 
      department_name, 
      company_name, 
      benefit_name, 
      is_active 
    } = req.query;

    // Base query
    let query = `
      SELECT 
        eb.id, 
        eb.employee_id, 
        e.name AS employee_name,
        d.department_name,
        c.name as company_name,
        bt.name AS benefit_name, 
        eb.is_active,
        eb.benefit_type_id, 
        eb.claimed, 
        eb.entitled, 
        (COALESCE(eb.entitled, 0) - COALESCE(eb.claimed, 0)) AS balance,
        eb.frequency, 
        eb.effective_from, 
        eb.effective_to
      FROM employee_benefits eb
      JOIN employees e ON eb.employee_id = e.id
      JOIN benefit_types bt ON eb.benefit_type_id = bt.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      WHERE 1=1
    `;

    // Count query for total records
    let countQuery = `
      SELECT COUNT(*) as total
      FROM employee_benefits eb
      JOIN employees e ON eb.employee_id = e.id
      JOIN benefit_types bt ON eb.benefit_type_id = bt.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      WHERE 1=1
    `;

    const params = [];
    const countParams = [];

    // Add filters
    if (employee_id) {
      query += ` AND eb.employee_id = ?`;
      countQuery += ` AND eb.employee_id = ?`;
      params.push(employee_id);
      countParams.push(employee_id);
    }

    if (employee_name) {
      query += ` AND e.name LIKE ?`;
      countQuery += ` AND e.name LIKE ?`;
      params.push(`%${employee_name}%`);
      countParams.push(`%${employee_name}%`);
    }

    if (department_name) {
      query += ` AND d.department_name LIKE ?`;
      countQuery += ` AND d.department_name LIKE ?`;
      params.push(`%${department_name}%`);
      countParams.push(`%${department_name}%`);
    }

    if (company_name) {
      query += ` AND c.name LIKE ?`;
      countQuery += ` AND c.name LIKE ?`;
      params.push(`%${company_name}%`);
      countParams.push(`%${company_name}%`);
    }

    if (benefit_name) {
      query += ` AND bt.name LIKE ?`;
      countQuery += ` AND bt.name LIKE ?`;
      params.push(`%${benefit_name}%`);
      countParams.push(`%${benefit_name}%`);
    }

    if (is_active !== undefined) {
      query += ` AND eb.is_active = ?`;
      countQuery += ` AND eb.is_active = ?`;
      params.push(is_active);
      countParams.push(is_active);
    }

    // Add sorting (optional)
    const sortBy = req.query.sortBy || 'eb.effective_from';
    const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute both queries
    const [rows] = await dbPromise.query(query, params);
    const [countResult] = await dbPromise.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Error fetching mappings:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
};

exports.createMapping = async (req, res) => {
  try {
    const {
      employee_id,
      benefit_type_id,
      amount = 0.00,
      frequency = 'Yearly',
      effective_from,
      effective_to,
      is_active = 1
    } = req.body;

    if (!employee_id || !benefit_type_id || amount == null) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // Get company_id from employee
    const [[emp]] = await dbPromise.query('SELECT company_id FROM employees WHERE id = ?', [employee_id]);
    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const company_id = emp.company_id;

    // Insert into employee_benefits
    await dbPromise.query(`
      INSERT INTO employee_benefits (
        employee_id, benefit_type_id, company_id, entitled, claimed,
        frequency, effective_from, effective_to, is_active,
        amount
      )
      VALUES (?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?)
    `, [
      employee_id,
      benefit_type_id,
      company_id,
      amount, // use amount as entitled
      frequency,
      effective_from || null,
      effective_to || null,
      is_active,
      amount
    ]);

    res.json({ success: true, message: 'Mapping created successfully' });

  } catch (err) {
    console.error('Error creating mapping:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};


exports.updateMapping = async (req, res) => {
  try {
    const {
      employee_id,
      benefit_type_id,
      amount,
      frequency = 'Yearly',
      effective_from,
      effective_to,
      is_active = 1
    } = req.body;

    if (!employee_id || !benefit_type_id || amount == null) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // Get company_id from employee
    const [[emp]] = await dbPromise.query('SELECT company_id FROM employees WHERE id = ?', [employee_id]);
    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const company_id = emp.company_id;

    // Update record
    await dbPromise.query(`
      UPDATE employee_benefits
      SET employee_id = ?, benefit_type_id = ?, company_id = ?, entitled = ?, amount = ?,
          frequency = ?, effective_from = ?, effective_to = ?, is_active = ?
      WHERE id = ?
    `, [
      employee_id,
      benefit_type_id,
      company_id,
      amount, // use amount as entitled
      amount,
      frequency,
      effective_from || null,
      effective_to || null,
      is_active,
      req.params.id
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating mapping:', err);
    res.status(500).json({ success: false, message: 'Failed to update mapping' });
  }
};


exports.deleteMapping = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM employee_benefits WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting mapping:', err);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
};

exports.bulkCreateMapping = async (req, res) => {
  try {
    const { employee_ids, benefit_type_id, amount, start_date, end_date } = req.body;
    const insertData = employee_ids.map((id) => [id, benefit_type_id, amount, start_date, end_date]);

    const [result] = await dbPromise.query(`
      INSERT INTO employee_benefits (employee_id, benefit_type_id, amount, start_date, end_date)
      VALUES ?
    `, [insertData]);

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error in bulk create mapping:', err);
    res.status(500).json({ error: 'Failed to bulk create mappings' });
  }
};

exports.bulkCreateMappingByCompany = async (req, res) => {
  try {
    const {
      company_id,
      benefit_type_id,
      amount = 0.00,
      frequency = 'Yearly',
      effective_from,
      effective_to,
      is_active = 1
    } = req.body;

    if (!company_id || !benefit_type_id) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Get all employees in that company
    const [employees] = await dbPromise.query('SELECT id FROM employees WHERE company_id = ?', [company_id]);

    if (!employees.length) {
      return res.status(404).json({ success: false, message: 'No employees found for this company' });
    }

    const data = employees.map(emp => [
      emp.id,
      benefit_type_id,
      company_id,
      amount,
      0.00, // claimed
      frequency,
      effective_from || null,
      effective_to || null,
      is_active,
      amount
    ]);

    await dbPromise.query(`
      INSERT INTO employee_benefits (
        employee_id, benefit_type_id, company_id, entitled, claimed,
        frequency, effective_from, effective_to, is_active, amount
      ) VALUES ?
    `, [data]);

    res.json({ success: true, message: 'Group mapping completed.' });
  } catch (err) {
    console.error('Error in bulkCreateMappingByCompany:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


exports.getBenefitSummary2 = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        bt.name AS benefit_type,
        COUNT(eb.id) AS total_employees,
        SUM(eb.entitled) AS total_entitled,
        SUM(eb.claimed) AS total_claimed,
        SUM(eb.entitled - eb.claimed) AS total_balance
      FROM employee_benefits eb
      JOIN benefit_types bt ON bt.id = eb.benefit_type_id
      WHERE eb.is_active = 1
      GROUP BY eb.benefit_type_id
      ORDER BY bt.name;
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error getting benefit summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getBenefitSummary = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT
        bt.name AS benefit_type,
        COUNT(eb.id) AS total_employees,
        SUM(eb.entitled) AS total_entitled,
        SUM(eb.claimed) AS total_claimed,
        SUM(eb.entitled - eb.claimed) AS total_balance,
        bt.description,
        ANY_VALUE(eb.frequency) AS frequency,
        ANY_VALUE(eb.effective_from) AS effective_from,
        ANY_VALUE(eb.effective_to) AS effective_to,
        CASE
          WHEN NOW() BETWEEN ANY_VALUE(eb.effective_from) AND ANY_VALUE(eb.effective_to) THEN 'Active'
          WHEN NOW() < ANY_VALUE(eb.effective_from) THEN 'Upcoming'
          WHEN NOW() > ANY_VALUE(eb.effective_to) THEN 'Expired'
          ELSE 'Unknown'
        END AS status
      FROM employee_benefits eb
      JOIN benefit_types bt ON bt.id = eb.benefit_type_id
      WHERE eb.is_active = 1
      GROUP BY eb.benefit_type_id
      ORDER BY bt.name;
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error getting benefit summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getEmployeeBenefitSummaryById = async (req, res) => {
  const employeeId = req.params.employee_id;

  try {
    const [rows] = await dbPromise.query(`
   
   SELECT
    bt.id,
    eb.employee_id,
    bt.name AS benefit_type,
    bt.description,
    eb.frequency,
    eb.entitled,
    eb.claimed,
    (eb.entitled - eb.claimed) AS balance,
    eb.effective_from,
    eb.effective_to,
    CASE
        WHEN NOW() BETWEEN eb.effective_from AND eb.effective_to THEN 'Active'
        WHEN NOW() < eb.effective_from THEN 'Upcoming'
        WHEN NOW() > eb.effective_to THEN 'Expired'
        ELSE 'Unknown'
    END AS status
FROM employee_benefits eb
JOIN benefit_types bt ON bt.id = eb.benefit_type_id
WHERE eb.is_active = 1
  AND eb.employee_id = ?
ORDER BY eb.effective_from DESC;
    `, [employeeId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching benefit summary for employee:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
