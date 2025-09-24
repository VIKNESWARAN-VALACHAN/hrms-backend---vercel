//NEW

const { dbPromise } = require('../models/db');

// Clock-In
const clockIn = async (req, res) => {
    try {
        const { employee_id } = req.body;
        const query = 'INSERT INTO Attendance (employee_id, clock_in) VALUES (?, NOW())';
        const [result] = await dbPromise.query(query, [employee_id]);
        res.json({ message: 'Clocked in successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Clock-Out
const clockOut = async (req, res) => {
    try {
        const { employee_id } = req.body;
        const query = 'UPDATE Attendance SET clock_out = NOW() WHERE employee_id = ? AND clock_out IS NULL';
        const [result] = await dbPromise.query(query, [employee_id]);
        res.json({ message: 'Clocked out successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Apply for Leave
const applyLeave = async (req, res) => {
    try {
        const { employee_id, start_date, end_date } = req.body;
        const query = 'INSERT INTO Leaves (employee_id, start_date, end_date) VALUES (?, ?, ?)';
        const [result] = await dbPromise.query(query, [employee_id, start_date, end_date]);
        res.json({ message: 'Leave application submitted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get Leave Applications
const fetchLeaves = async (req, res) => {
    try {
        const { employeeId } = req.query;

        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }

        const query = 'SELECT * FROM Leaves WHERE employee_id = ?';
        const [leaves] = await dbPromise.query(query, [employeeId]);

        res.status(200).json(leaves);
    } catch (error) {
        console.error('Error fetching leave records:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

//increment 

// Get all salary increments for a specific employee
const getEmployeeIncrements = async (req, res) => {
    try {
        const { employee_id } = req.params;
        
        // Get employee details
        const [employee] = await dbPromise.query('SELECT * FROM Employees WHERE id = ?', [employee_id]);
        if (!employee.length) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        // Get all increments for the employee
        const [increments] = await dbPromise.query(
            'SELECT * FROM employee_salary_increments WHERE employee_id = ? ORDER BY increment_date DESC',
            [employee_id]
        );
        
        res.json({
            employee: employee[0],
            increments
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Create a new salary increment for an employee
const createEmployeeIncrement = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const {
            increment_type,
            increment_value,
            increment_date,
            effective_date,
            reason,
            new_position_id
        } = req.body;
        
        // Validate required fields
        if (!increment_type || !increment_value || !increment_date || !effective_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Get current employee salary
        const [employee] = await dbPromise.query('SELECT salary FROM employees WHERE id = ?', [employee_id]);
        if (!employee.length) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const current_salary = employee[0].salary || 0;
        let new_salary;
        
        // Calculate new salary based on increment type
        if (increment_type === 'percentage') {
            new_salary = current_salary * (1 + increment_value / 100);
        } else if (increment_type === 'fixed_amount') {
            new_salary = current_salary + increment_value;
        } else if (increment_type === 'promotion') {
            new_salary = increment_value; // For promotion, increment_value is the new salary
        } else {
            return res.status(400).json({ 
                error: 'Invalid increment_type. Must be: percentage, fixed_amount, or promotion' 
            });
        }
        
        // Create increment record
        const [result] = await dbPromise.query(
            `INSERT INTO employee_salary_increments 
             (employee_id, increment_type, increment_value, previous_salary, new_salary, 
              increment_date, effective_date, reason, new_position_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                employee_id, 
                increment_type, 
                increment_value, 
                current_salary, 
                new_salary, 
                increment_date, 
                effective_date, 
                reason || '', 
                new_position_id || null
            ]
        );
        
        // Update employee's current salary
        await dbPromise.query('UPDATE Employees SET salary = ? WHERE id = ?', [new_salary, employee_id]);
        
        // Update position if it's a promotion
        if (increment_type === 'promotion' && new_position_id) {
            await dbPromise.query(
                'UPDATE Employees SET position_id = ?, current_position_start_date = ? WHERE id = ?',
                [new_position_id, effective_date, employee_id]
            );
        }
        
        // Get the created increment
        const [increment] = await dbPromise.query(
            'SELECT * FROM employee_salary_increments WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json({
            message: 'Increment created successfully',
            increment: increment[0],
            updated_employee: { id: employee_id, salary: new_salary }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all salary increments with employee information
const getAllIncrements = async (req, res) => {
    try {
        const { 
            employee_id, 
            increment_type, 
            start_date, 
            end_date,
            page = 1,
            per_page = 10
        } = req.query;
        
        // Calculate offset for pagination
        const offset = (page - 1) * per_page;
        
        // Base query with join to get employee information
        let query = `
            SELECT i.*, e.name as employee_name, e.employee_no, e.department, e.position
            FROM employee_salary_increments i
            JOIN Employees e ON i.employee_id = e.id
        `;
        
        const conditions = [];
        const params = [];
        
        if (employee_id) {
            conditions.push('i.employee_id = ?');
            params.push(employee_id);
        }
        
        if (increment_type) {
            conditions.push('i.increment_type = ?');
            params.push(increment_type);
        }
        
        if (start_date) {
            conditions.push('i.increment_date >= ?');
            params.push(start_date);
        }
        
        if (end_date) {
            conditions.push('i.increment_date <= ?');
            params.push(end_date);
        }
        
        if (conditions.length) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        // Add ordering and pagination
        query += ' ORDER BY i.increment_date DESC LIMIT ? OFFSET ?';
        params.push(parseInt(per_page), parseInt(offset));
        
        // Execute query
        const [increments] = await dbPromise.query(query, params);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM employee_salary_increments i';
        if (conditions.length) {
            countQuery += ' WHERE ' + conditions.join(' AND ');
        }
        
        const [totalResult] = await dbPromise.query(countQuery, params.slice(0, -2));
        const total = totalResult[0].total;
        const pages = Math.ceil(total / per_page);
        
        res.json({
            increments,
            total,
            pages,
            current_page: parseInt(page),
            per_page: parseInt(per_page)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a specific increment by ID
const getIncrement = async (req, res) => {
    try {
        const { increment_id } = req.params;
        
        const [increment] = await dbPromise.query(
            'SELECT * FROM employee_salary_increments WHERE id = ?',
            [increment_id]
        );
        
        if (!increment.length) {
            return res.status(404).json({ error: 'Increment not found' });
        }
        
        res.json(increment[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update an existing increment (limited fields for audit purposes)
const updateIncrement = async (req, res) => {
    try {
        const { increment_id } = req.params;
        const { reason, effective_date } = req.body;
        
        // Only allow updating certain fields to maintain audit integrity
        const updates = {};
        if (reason !== undefined) updates.reason = reason;
        if (effective_date !== undefined) updates.effective_date = effective_date;
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        updates.updated_at = new Date();
        
        await dbPromise.query(
            'UPDATE employee_salary_increments SET ? WHERE id = ?',
            [updates, increment_id]
        );
        
        // Get the updated increment
        const [increment] = await dbPromise.query(
            'SELECT * FROM employee_salary_increments WHERE id = ?',
            [increment_id]
        );
        
        res.json({
            message: 'Increment updated successfully',
            increment: increment[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Delete an increment (use with caution for audit purposes)
const deleteIncrement = async (req, res) => {
    try {
        const { increment_id } = req.params;
        
        // Get the increment details
        const [increment] = await dbPromise.query(
            'SELECT * FROM employee_salary_increments WHERE id = ?',
            [increment_id]
        );
        
        if (!increment.length) {
            return res.status(404).json({ error: 'Increment not found' });
        }
        
        // Check if this is the latest increment for the employee
        const [latestIncrement] = await dbPromise.query(
            'SELECT id FROM employee_salary_increments WHERE employee_id = ? ORDER BY increment_date DESC LIMIT 1',
            [increment[0].employee_id]
        );
        
        // If this is the latest increment, revert the employee's salary
        if (latestIncrement.length && latestIncrement[0].id == increment_id) {
            await dbPromise.query(
                'UPDATE Employees SET salary = ? WHERE id = ?',
                [increment[0].previous_salary, increment[0].employee_id]
            );
        }
        
        // Delete the increment
        await dbPromise.query(
            'DELETE FROM employee_salary_increments WHERE id = ?',
            [increment_id]
        );
        
        res.json({ message: 'Increment deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get statistics about salary increments
const getIncrementStats = async (req, res) => {
    try {
        // Total increments
        const [totalResult] = await dbPromise.query('SELECT COUNT(*) as total FROM employee_salary_increments');
        const total_increments = totalResult[0].total;
        
        // Increments by type
        const [incrementTypes] = await dbPromise.query(
            'SELECT increment_type, COUNT(id) as count FROM employee_salary_increments GROUP BY increment_type'
        );
        
        // Recent increments (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const [recentResult] = await dbPromise.query(
            'SELECT COUNT(*) as count FROM employee_salary_increments WHERE increment_date >= ?',
            [thirtyDaysAgo]
        );
        const recent_increments = recentResult[0].count;
        
        // Average increment value by type
        const [avgIncrements] = await dbPromise.query(
            'SELECT increment_type, AVG(increment_value) as avg_value FROM employee_salary_increments GROUP BY increment_type'
        );
        
        // Total salary budget impact
        const [budgetResult] = await dbPromise.query(
            'SELECT SUM(new_salary - previous_salary) as total FROM employee_salary_increments'
        );
        const total_budget_impact = budgetResult[0].total || 0;
        
        const stats = {
            total_increments,
            recent_increments,
            total_budget_impact,
            increment_types: incrementTypes,
            average_increments: avgIncrements.map(item => ({
                type: item.increment_type,
                avg_value: parseFloat(item.avg_value) || 0
            }))
        };
        
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


const updateTimeZone = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { time_zone } = req.body;

        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ error: 'Valid employee id is required' });
        }
        if (!time_zone) {
            return res.status(400).json({ error: 'time_zone is required' });
        }

        const [result] = await dbPromise.query(
            'UPDATE employees SET time_zone = ? WHERE id = ?',
            [time_zone, id]
        );

        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ ok: true, id, time_zone });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


module.exports = { clockIn, clockOut, applyLeave, fetchLeaves ,
        getEmployeeIncrements,
    createEmployeeIncrement,
    getAllIncrements,
    getIncrement,
    updateIncrement,
    deleteIncrement,
    getIncrementStats,
    updateTimeZone
};