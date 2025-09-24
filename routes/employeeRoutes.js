const express = require('express');
const bcrypt = require('bcryptjs'); // ✅ Import bcryptjs for password hashing
const db = require('../models/db'); // ✅ Database connection
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ Create Employee (POST /employees)
router.post('/employees', authMiddleware, async (req, res) => {
    const { name, email, password, role, salary, currency, company_id, manager_id } = req.body;

    if (!name || !email || !password || !role || !salary || !currency || !company_id) {
        return res.status(400).json({ error: "All fields except manager_id are required" });
    }

    try {
        // ✅ Hash Password
        const hashedPassword = await bcrypt.hash(password, 12);

        // ✅ Insert Employee into Database
        const query = "INSERT INTO employees (name, email, password, role, salary, currency, company_id, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(query, [name, email, hashedPassword, role, salary, currency, company_id, manager_id], (err, result) => {
            if (err) {
                console.error("Database Insert Error:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
            res.status(201).json({ message: "Employee added successfully!" });
        });

    } catch (error) {
        console.error("Hashing Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Update Employee (PUT /employees/:id)
router.put('/employees/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role, salary, currency, company_id, manager_id } = req.body;

    try {
        let updateQuery = "UPDATE employees SET name=?, email=?, role=?, salary=?, currency=?, company_id=?, manager_id=? WHERE id=?";
        let updateValues = [name, email, role, salary, currency, company_id, manager_id, id];

        // ✅ If password is provided, hash it before updating
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 12);
            updateQuery = "UPDATE employees SET name=?, email=?, password=?, role=?, salary=?, currency=?, company_id=?, manager_id=? WHERE id=?";
            updateValues = [name, email, hashedPassword, role, salary, currency, company_id, manager_id, id];
        }

        db.query(updateQuery, updateValues, (err, result) => {
            if (err) {
                console.error("Update Error:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
            res.json({ message: "Employee updated successfully!" });
        });

    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Employee announcements
router.get('/announcements', authMiddleware, async (req, res) => {
  try {
    const { employee_id } = req.query;
    
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    // Get employee data to confirm it exists
    const [employeeRows] = await db.query('SELECT id FROM employees WHERE id = ?', [employee_id]);
    
    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Optimized query for fetching announcements with proper filtering and read status
    const query = `
      SELECT 
        a.id,
        a.title,
        a.content,
        a.created_at,
        COALESCE(ar.read_at, 'Unread') AS read_status
      FROM 
        announcements a
      /* Left join for read status */
      LEFT JOIN 
        announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
      /* Join once to get the employee details */
      JOIN 
        employees e ON e.id = ?
      /* Left joins for target filtering */
      LEFT JOIN 
        announcement_companies ac ON ac.announcement_id = a.id
      LEFT JOIN 
        announcement_departments ad ON ad.announcement_id = a.id
      LEFT JOIN 
        announcement_positions ap ON ap.announcement_id = a.id
      LEFT JOIN 
        announcement_employees ae ON ae.announcement_id = a.id
      WHERE
        /* Global announcements */
        a.target_all = 1
        /* Company-specific announcements */
        OR (ac.company_id = e.company_id)
        /* Department-specific announcements */
        OR (ad.department_id = e.department_id)
        /* Position-specific announcements */
        OR (ap.position_id = e.position_id)
        /* Employee-specific announcements */
        OR (ae.employee_id = e.id)
      GROUP BY 
        a.id
      ORDER BY 
        a.created_at DESC
    `;
    
    const [announcements] = await db.query(query, [employee_id, employee_id]);
    res.json(announcements);
  } catch (error) {
    console.error('Error fetching employee announcements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific announcement by ID
router.get('/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_id } = req.query;
    
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    // Get the specific announcement with optimized query
    const query = `
      SELECT 
        a.id,
        a.title,
        a.content,
        a.created_at,
        COALESCE(ar.read_at, 'Unread') AS read_status
      FROM 
        announcements a
      /* Left join for read status */
      LEFT JOIN 
        announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
      /* Join once to get the employee details */
      JOIN 
        employees e ON e.id = ?
      /* Left joins for target filtering */
      LEFT JOIN 
        announcement_companies ac ON ac.announcement_id = a.id
      LEFT JOIN 
        announcement_departments ad ON ad.announcement_id = a.id
      LEFT JOIN 
        announcement_positions ap ON ap.announcement_id = a.id
      LEFT JOIN 
        announcement_employees ae ON ae.announcement_id = a.id
      WHERE 
        a.id = ?
        AND (
          /* Global announcements */
          a.target_all = 1
          /* Company-specific announcements */
          OR (ac.company_id = e.company_id)
          /* Department-specific announcements */
          OR (ad.department_id = e.department_id)
          /* Position-specific announcements */
          OR (ap.position_id = e.position_id)
          /* Employee-specific announcements */
          OR (ae.employee_id = e.id)
        )
      LIMIT 1
    `;
    
    const [announcements] = await db.query(query, [employee_id, employee_id, id]);
    
    if (announcements.length === 0) {
      return res.status(404).json({ error: 'Announcement not found or not accessible' });
    }
    
    // Mark announcement as read if not already read
    if (announcements[0].read_status === 'Unread') {
      try {
        const readQuery = `
          INSERT INTO announcement_reads (announcement_id, employee_id, read_at)
          VALUES (?, ?, NOW())
          ON DUPLICATE KEY UPDATE read_at = NOW()
        `;
        await db.query(readQuery, [id, employee_id]);
      } catch (readError) {
        console.error('Error marking announcement as read:', readError);
        // Continue even if marking as read fails
      }
    }
    
    res.json(announcements[0]);
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
