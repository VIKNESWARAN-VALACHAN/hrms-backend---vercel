const { dbPromise } = require('../models/db');

// Employee Benefits
exports.getAllEmployeeBenefits = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        eb.*,
        e.name AS employee_name,
        e.department_id,
        d.name AS department_name,
        c.name AS company_name,
        bt.name AS benefit_type_name
      FROM employee_benefits eb
      JOIN employees e ON eb.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      JOIN benefit_types bt ON eb.benefit_type_id = bt.id
      ORDER BY e.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employee benefits:', err);
    res.status(500).json({ error: 'Failed to fetch employee benefits' });
  }
};

exports.getEmployeeBenefitById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        eb.*,
        e.name AS employee_name,
        e.department_id,
        d.name AS department_name,
        c.name AS company_name,
        bt.name AS benefit_type_name
      FROM employee_benefits eb
      JOIN employees e ON eb.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      JOIN benefit_types bt ON eb.benefit_type_id = bt.id
      WHERE eb.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee benefit not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee benefit:', err);
    res.status(500).json({ error: 'Failed to fetch employee benefit' });
  }
};

exports.updateEmployeeBenefit = async (req, res) => {
  const { amount, frequency, start_date, end_date, is_active } = req.body;
  
  try {
    // Get current claimed amount first
    const [current] = await dbPromise.query(
      'SELECT claimed FROM employee_benefits WHERE id = ?',
      [req.params.id]
    );
    
    if (current.length === 0) {
      return res.status(404).json({ error: 'Employee benefit not found' });
    }
    
    const claimed = current[0].claimed;
    const balance = amount - claimed;
    
    await dbPromise.query(
      `UPDATE employee_benefits 
      SET amount = ?, frequency = ?, effective_from = ?, effective_to = ?, is_active = ?
      WHERE id = ?`,
      [amount, frequency, start_date, end_date, is_active, req.params.id]
    );
    
    res.json({ 
      id: req.params.id, 
      ...req.body,
      claimed,
      balance 
    });
  } catch (err) {
    console.error('Error updating employee benefit:', err);
    res.status(500).json({ error: 'Failed to update employee benefit' });
  }
};

exports.deleteEmployeeBenefit = async (req, res) => {
  try {
    const [result] = await dbPromise.query('DELETE FROM employee_benefits WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee benefit not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting employee benefit:', err);
    res.status(500).json({ error: 'Failed to delete employee benefit' });
  }
};

// Benefit Types
exports.getAllBenefitTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM benefit_types ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching benefit types:', err);
    res.status(500).json({ error: 'Failed to fetch benefit types' });
  }
};

exports.getBenefitTypeById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM benefit_types WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Benefit type not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching benefit type:', err);
    res.status(500).json({ error: 'Failed to fetch benefit type' });
  }
};

exports.createBenefitType = async (req, res) => {
  const { name, description, is_active, is_recurring } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const [result] = await dbPromise.query(
      'INSERT INTO benefit_types (name, description, is_active, is_recurring) VALUES (?, ?, ?, ?)',
      [name, description, is_active || 1, is_recurring || 0]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    console.error('Error creating benefit type:', err);
    res.status(500).json({ error: 'Failed to create benefit type' });
  }
};

exports.updateBenefitType = async (req, res) => {
  const { name, description, is_active, is_recurring } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    await dbPromise.query(
      'UPDATE benefit_types SET name = ?, description = ?, is_active = ?, is_recurring = ? WHERE id = ?',
      [name, description, is_active, is_recurring, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('Error updating benefit type:', err);
    res.status(500).json({ error: 'Failed to update benefit type' });
  }
};

exports.deleteBenefitType = async (req, res) => {
  try {
    const [result] = await dbPromise.query('DELETE FROM benefit_types WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Benefit type not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting benefit type:', err);
    res.status(500).json({ error: 'Failed to delete benefit type' });
  }
};

exports.createBenefitGroup = async (req, res) => {
  const { name, description, is_active, is_recurring } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const [result] = await dbPromise.query(
      'INSERT INTO benefit_groups (name, description, is_active, is_recurring) VALUES (?, ?, ?, ?)',
      [name, description, is_active || 1, is_recurring || 0]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    console.error('Error creating benefit group:', err);
    res.status(500).json({ error: 'Failed to create benefit group' });
  }
};

exports.updateBenefitGroup = async (req, res) => {
  const { name, description, is_active, is_recurring } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    await dbPromise.query(
      'UPDATE benefit_groups SET name = ?, description = ?, is_active = ?, is_recurring = ? WHERE id = ?',
      [name, description, is_active, is_recurring, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('Error updating benefit group:', err);
    res.status(500).json({ error: 'Failed to update benefit group' });
  }
};

exports.deleteBenefitGroup = async (req, res) => {
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    
    // First delete all items in the group
    await conn.query('DELETE FROM benefit_group_items WHERE group_id = ?', [req.params.id]);
    
    // Delete all employee assignments
    await conn.query('DELETE FROM benefit_group_employees WHERE group_id = ?', [req.params.id]);
    
    // Then delete the group
    const [result] = await conn.query('DELETE FROM benefit_groups WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Benefit group not found' });
    }
    
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Error deleting benefit group:', err);
    res.status(500).json({ error: 'Failed to delete benefit group' });
  } finally {
    conn.release();
  }
};

// Benefit Group Items
exports.getAllBenefitGroupItems = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT bgi.*, bt.name AS benefit_type_name 
      FROM benefit_group_items bgi
      JOIN benefit_types bt ON bgi.benefit_type_id = bt.id
      ORDER BY bt.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching benefit group items:', err);
    res.status(500).json({ error: 'Failed to fetch benefit group items' });
  }
};

exports.getBenefitGroupItemById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT bgi.*, bt.name AS benefit_type_name 
      FROM benefit_group_items bgi
      JOIN benefit_types bt ON bgi.benefit_type_id = bt.id
      WHERE bgi.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Benefit group item not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching benefit group item:', err);
    res.status(500).json({ error: 'Failed to fetch benefit group item' });
  }
};

exports.createBenefitGroupItem = async (req, res) => {
  const { group_id, benefit_type_id, amount, frequency, start_date, end_date, is_active } = req.body;
  
  if (!group_id || !benefit_type_id || amount === undefined) {
    return res.status(400).json({ error: 'Group ID, Benefit Type ID, and Amount are required' });
  }

  try {
    const [result] = await dbPromise.query(
      `INSERT INTO benefit_group_items 
      (group_id, benefit_type_id, amount, frequency, start_date, end_date, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [group_id, benefit_type_id, amount, frequency || 'Yearly', start_date, end_date, is_active || 1]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      ...req.body 
    });
  } catch (err) {
    console.error('Error creating benefit group item:', err);
    res.status(500).json({ error: 'Failed to create benefit group item' });
  }
};

exports.updateBenefitGroupItem = async (req, res) => {
  const { amount, frequency, start_date, end_date, is_active } = req.body;
  
  try {
    await dbPromise.query(
      `UPDATE benefit_group_items 
      SET amount = ?, frequency = ?, start_date = ?, end_date = ?, is_active = ?
      WHERE id = ?`,
      [amount, frequency, start_date, end_date, is_active, req.params.id]
    );
    
    res.json({ 
      id: req.params.id, 
      ...req.body 
    });
  } catch (err) {
    console.error('Error updating benefit group item:', err);
    res.status(500).json({ error: 'Failed to update benefit group item' });
  }
};

exports.deleteBenefitGroupItem = async (req, res) => {
  try {
    const [result] = await dbPromise.query('DELETE FROM benefit_group_items WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Benefit group item not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting benefit group item:', err);
    res.status(500).json({ error: 'Failed to delete benefit group item' });
  }
};

// controllers/benefitController.js

exports.assignEmployeesToGroup = async (req, res) => {
  const { id } = req.params; // route param is :id
  const group_id = id;
  const { employee_ids } = req.body;

  if (!employee_ids || !Array.isArray(employee_ids)) {
    return res.status(400).json({ error: 'Employee IDs array is required' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // Verify group exists
    const [group] = await conn.query('SELECT id FROM benefit_groups WHERE id = ?', [group_id]);
    if (group.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Benefit group not found' });
    }

    // Get group items to create benefits for
    const [items] = await conn.query('SELECT * FROM benefit_group_items WHERE group_id = ?', [group_id]);

    let assigned = 0;

    for (const employee_id of employee_ids) {
      const [employee] = await conn.query('SELECT id, company_id FROM employees WHERE id = ?', [employee_id]);
      if (employee.length === 0) continue;

      try {
        // Add to group if not already assigned
        await conn.query(
          'INSERT INTO benefit_group_employees (group_id, employee_id) VALUES (?, ?)',
          [group_id, employee_id]
        );
        assigned++;

        // Create/update employee benefits for each group item
        for (const item of items) {
          await conn.query(
            `INSERT INTO employee_benefits
              (employee_id, benefit_type_id, company_id, amount, entitled, claimed, frequency, start_date, end_date, is_active)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               amount = VALUES(amount),
               entitled = VALUES(entitled),
               frequency = VALUES(frequency),
               effective_from = VALUES(start_date),
               effective_to = VALUES(end_date),
               is_active = VALUES(is_active)`,
            [
              employee_id,
              item.benefit_type_id,
              employee[0].company_id,
              item.amount,          // amount
              item.amount,          // entitled (set entitlement = item.amount)
              item.frequency,
              item.start_date,
              item.end_date,
              item.is_active
            ]
          );
        }
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          // already in group; still ensure benefits synced
          for (const item of items) {
            await conn.query(
              `INSERT INTO employee_benefits
                (employee_id, benefit_type_id, company_id, amount, entitled, claimed, frequency, start_date, end_date, is_active)
               VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 amount = VALUES(amount),
                 entitled = VALUES(entitled),
                 frequency = VALUES(frequency),
                 start_date = VALUES(start_date),
                 end_date = VALUES(end_date),
                 is_active = VALUES(is_active)`,
              [
                employee_id,
                item.benefit_type_id,
                employee[0].company_id,
                item.amount,          // amount
                item.amount,          // entitled
                item.frequency,
                item.start_date,
                item.end_date,
                item.is_active
              ]
            );
          }
          continue;
        }
        throw err;
      }
    }

    await conn.commit();
    res.json({ success: true, count: assigned });
  } catch (err) {
    await conn.rollback();
    console.error('Error assigning employees to group:', err);
    res.status(500).json({ error: 'Failed to assign employees to group' });
  } finally {
    conn.release();
  }
};

// controllers/benefitController.js

exports.createEmployeeBenefit = async (req, res) => {
  const { employee_id, benefit_type_id, company_id, amount, frequency, start_date, end_date, is_active } = req.body;

  if (!employee_id || !benefit_type_id || !company_id || amount === undefined) {
    return res.status(400).json({ error: 'Employee ID, Benefit Type ID, Company ID, and Amount are required' });
  }

  try {
    const [result] = await dbPromise.query(
      `INSERT INTO employee_benefits
      (employee_id, benefit_type_id, company_id, amount, entitled, claimed, frequency, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        employee_id,
        benefit_type_id,
        company_id,
        amount,            // amount
        amount,            // entitled = amount
        frequency || 'Yearly',
        start_date || null,
        end_date || null,
        is_active ?? 1
      ]
    );

    res.status(201).json({
      id: result.insertId,
      ...req.body,
      claimed: 0,
      balance: Number(amount) - 0
    });
  } catch (err) {
    console.error('Error creating employee benefit:', err);
    res.status(500).json({ error: 'Failed to create employee benefit' });
  }
};



exports.removeEmployeeFromGroup = async (req, res) => {
  const { id, employeeId } = req.params; // route params: :id and :employeeId
  const group_id = id;
  const employee_id = employeeId;

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'DELETE FROM benefit_group_employees WHERE group_id = ? AND employee_id = ?',
      [group_id, employee_id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee not found in group' });
    }

    const [items] = await conn.query(
      'SELECT benefit_type_id FROM benefit_group_items WHERE group_id = ?',
      [group_id]
    );

    for (const item of items) {
      await conn.query(
        'DELETE FROM employee_benefits WHERE employee_id = ? AND benefit_type_id = ?',
        [employee_id, item.benefit_type_id]
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Error removing employee from group:', err);
    res.status(500).json({ error: 'Failed to remove employee from group' });
  } finally {
    conn.release();
  }
};


// controllers/benefitController.js
exports.getAllBenefitGroups = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        bg.*,
        (SELECT COUNT(*) FROM benefit_group_items bgi WHERE bgi.group_id = bg.id) AS benefit_count,
        (SELECT COUNT(*) FROM benefit_group_employees bge WHERE bge.group_id = bg.id) AS assigned_count
      FROM benefit_groups bg
      ORDER BY bg.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching benefit groups:', err);
    res.status(500).json({ error: 'Failed to fetch benefit groups' });
  }
};


exports.getBenefitGroupById = async (req, res) => {
  try {
    const [group] = await dbPromise.query('SELECT * FROM benefit_groups WHERE id = ?', [req.params.id]);
    if (group.length === 0) {
      return res.status(404).json({ error: 'Benefit group not found' });
    }

    const [items] = await dbPromise.query(`
      SELECT bgi.*, bt.name AS benefit_type_name 
      FROM benefit_group_items bgi
      JOIN benefit_types bt ON bgi.benefit_type_id = bt.id
      WHERE bgi.group_id = ?
      ORDER BY bt.name
    `, [req.params.id]);
    const [employees] = await dbPromise.query(`
      SELECT 
        e.id, 
        e.name, 
        e.company_id, 
        c.name AS company_name, 
        e.department_id, 
        d.department_name,
        bge.created_at AS assigned_at
      FROM benefit_group_employees bge
      JOIN employees e ON bge.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      WHERE bge.group_id = ?
      ORDER BY e.name
    `, [req.params.id]);

    res.json({
      ...group[0],
      items,
      employees,
      benefit_count: items.length,
      assigned_count: employees.length
    });
  } catch (err) {
    console.error('Error fetching benefit group:', err);
    res.status(500).json({ error: 'Failed to fetch benefit group' });
  }
};

// NEW: only assigned employees (with details)
exports.getAssignedEmployeesForGroup = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        e.id, 
        e.name, 
        e.company_id, 
        c.name AS company_name, 
        e.department_id, 
        d.department_name,
        bge.created_at AS assigned_at
      FROM benefit_group_employees bge
      JOIN employees e ON bge.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      WHERE bge.group_id = ?
      ORDER BY e.name
    `, [req.params.id]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching assigned employees:', err);
    res.status(500).json({ error: 'Failed to fetch assigned employees' });
  }
};

// NEW: all employees with "assigned" flag for this group (and details)
// Useful for the Assign modal to show current status
exports.getEmployeesWithAssignmentForGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const [rows] = await dbPromise.query(`
      SELECT 
        e.id,
        e.name,
        e.company_id,
        c.name AS company_name,
        e.department_id,
        d.department_name,
        CASE WHEN bge.employee_id IS NULL THEN 0 ELSE 1 END AS assigned,
        bge.created_at AS assigned_at
      FROM employees e
      LEFT JOIN benefit_group_employees bge
        ON bge.group_id = ? AND bge.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON e.company_id = c.id
      ORDER BY assigned DESC, e.name
    `, [groupId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching employees with assignment:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

exports.getEmployeeBenefitGroup = async (req, res) => {
  const employeeId = req.params.id;

  try {
    const [rows] = await dbPromise.query(
      `
      SELECT 
        bg.id AS group_id,
        bg.name AS group_name,
        bg.description,
        bg.is_active,
        bg.is_recurring,
        bge.created_at AS assigned_at,
        (SELECT COUNT(*) FROM benefit_group_items bgi WHERE bgi.group_id = bg.id) AS benefit_count,
        (SELECT COUNT(*) FROM benefit_group_employees bge2 WHERE bge2.group_id = bg.id) AS assigned_count
      FROM benefit_group_employees bge
      JOIN benefit_groups bg ON bg.id = bge.group_id
      WHERE bge.employee_id = ?
      ORDER BY bge.created_at DESC
      LIMIT 1
      `,
      [employeeId]
    );

    if (rows.length === 0) {
      return res.json(null); // not assigned
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee benefit group:', err);
    res.status(500).json({ error: 'Failed to fetch employee benefit group' });
  }
};

/**
 * PUT /employees/:id/benefit-group
 * Body: { group_id: number | null }
 * - If null -> remove assignment (and remove benefits from the old group)
 * - If set  -> reassign transactionally: remove old mapping/benefits, add new mapping, upsert benefits from items
 */
exports.updateEmployeeBenefitGroup = async (req, res) => {
  const employeeId = req.params.id;
  const { group_id } = req.body;

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // Get current assignment (if any)
    const [currentRows] = await conn.query(
      'SELECT group_id FROM benefit_group_employees WHERE employee_id = ? LIMIT 1',
      [employeeId]
    );
    const currentGroupId = currentRows[0]?.group_id || null;

    // If no change requested
    if ((currentGroupId || null) === (group_id || null)) {
      await conn.commit();
      return res.json({ success: true, message: 'No changes', group_id: currentGroupId });
    }

    // Helper to remove benefits produced by a group
    const removeBenefitsByGroup = async (grpId) => {
      if (!grpId) return;
      const [types] = await conn.query(
        'SELECT benefit_type_id FROM benefit_group_items WHERE group_id = ?',
        [grpId]
      );
      if (types.length) {
        const typeIds = types.map(t => t.benefit_type_id);
        // delete only benefits generated by that group types for this employee
        await conn.query(
          `DELETE FROM employee_benefits 
           WHERE employee_id = ? AND benefit_type_id IN (${typeIds.map(() => '?').join(',')})`,
          [employeeId, ...typeIds]
        );
      }
      // Remove mapping
      await conn.query(
        'DELETE FROM benefit_group_employees WHERE employee_id = ? AND group_id = ?',
        [employeeId, grpId]
      );
    };

    // 1) Remove existing assignment/benefits if any
    if (currentGroupId) {
      await removeBenefitsByGroup(currentGroupId);
    }

    // 2) If new group_id is null -> just unassign and finish
    if (!group_id) {
      await conn.commit();
      return res.json({ success: true, group_id: null });
    }

    // 3) Verify new group exists
    const [grp] = await conn.query('SELECT id FROM benefit_groups WHERE id = ?', [group_id]);
    if (grp.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Benefit group not found' });
    }

    // 4) Insert new mapping
    await conn.query(
      'INSERT INTO benefit_group_employees (group_id, employee_id) VALUES (?, ?)',
      [group_id, employeeId]
    );

    // 5) Upsert employee_benefits from the new group's items
    // Need employee company_id
    const [emp] = await conn.query('SELECT id, company_id FROM employees WHERE id = ?', [employeeId]);
    if (emp.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    const [items] = await conn.query(
      'SELECT * FROM benefit_group_items WHERE group_id = ?',
      [group_id]
    );

    for (const item of items) {
      await conn.query(
        `INSERT INTO employee_benefits
          (employee_id, benefit_type_id, company_id, amount, entitled, claimed, frequency, start_date, end_date, is_active)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           amount = VALUES(amount),
           entitled = VALUES(entitled),
           frequency = VALUES(frequency),
           start_date = VALUES(start_date),
           end_date = VALUES(end_date),
           is_active = VALUES(is_active)`,
        [
          employeeId,
          item.benefit_type_id,
          emp[0].company_id,
          item.amount,
          item.amount,
          item.frequency || 'Yearly',
          item.start_date || null,
          item.end_date || null,
          item.is_active ?? 1
        ]
      );
    }

    await conn.commit();

    // For convenience, return the enriched group info as in GET
    const [info] = await dbPromise.query(
      `
      SELECT 
        bg.id AS group_id,
        bg.name AS group_name,
        bg.description,
        bg.is_active,
        bg.is_recurring,
        bge.created_at AS assigned_at,
        (SELECT COUNT(*) FROM benefit_group_items bgi WHERE bgi.group_id = bg.id) AS benefit_count,
        (SELECT COUNT(*) FROM benefit_group_employees bge2 WHERE bge2.group_id = bg.id) AS assigned_count
      FROM benefit_group_employees bge
      JOIN benefit_groups bg ON bg.id = bge.group_id
      WHERE bge.employee_id = ?
      ORDER BY bge.created_at DESC
      LIMIT 1
      `,
      [employeeId]
    );

    res.json({ success: true, group: info[0] || null });
  } catch (err) {
    await conn.rollback();
    console.error('Error updating employee benefit group:', err);
    res.status(500).json({ error: 'Failed to update employee benefit group' });
  } finally {
    conn.release();
  }
};