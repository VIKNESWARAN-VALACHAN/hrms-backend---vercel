const express = require('express');
const adminController = require('../controllers/adminController');
const { dbPromise } = require('../models/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const employeeController = require('../controllers/employeeController');
const { generateEmployeeNumber, validateEmployeeNumber } = require('../services/employeeNumberService');

const {
    createCompany,
    updateCompany,
    deleteCompany,
    getCompanyDepartments,
    getEmployeesByCompany,
    getDepartments,
    createPosition,
    getDepartmentPositions,
    getDepartment,
    updateDepartment,
    getCompaniesWithManagers,
    updatePosition,
    deleteDepartment,
    deletePosition,
    getEditAllCompanies,
    getTransferDepartmentPositions,
    getDepartmentManager // ✅ Add this import
} = require('../controllers/adminController');
const router = express.Router();

// Company Management
router.post('/companies', authMiddleware, createCompany);
router.get('/companies', authMiddleware, getEditAllCompanies);
router.put('/companies/:id', authMiddleware, updateCompany);
router.delete('/companies/:id', authMiddleware, deleteCompany);
router.get('/companies/:id/departments', authMiddleware, getDepartments);
router.get('/employees/companies/:id/departments', authMiddleware, getCompanyDepartments);
router.get('/companies-with-departments', authMiddleware, getCompaniesWithManagers);
router.post('/departments/:id/positions', authMiddleware, createPosition);
router.get('/departments/:id/positions', authMiddleware, getDepartmentPositions);
router.get('/employees/departments/:departmentId/positions', authMiddleware, getTransferDepartmentPositions);
router.get('/departments/:id', authMiddleware, getDepartment);
router.put('/departments/:id', authMiddleware, updateDepartment);
router.delete('/departments/:id', authMiddleware, deleteDepartment);
router.put('/positions/:id', authMiddleware, updatePosition);
router.delete('/positions/:id', authMiddleware, deletePosition);
// ✅ Add the route for fetching employees by company ID
router.get('/companies/:companyId/employees', authMiddleware, adminController.getEmployeesByCompany);

// ✅ Add the route for fetching a manager by department ID
router.get('/departments/:department_id/manager', authMiddleware, adminController.getDepartmentManager);
	

// Add a company with departments
router.post('/companies', authMiddleware, async (req, res) => {
    const { name, registration_number, address, departments } = req.body;

    try {
        // Insert into companies table
        const [companyResult] = await dbPromise.query(
            'INSERT INTO companies (name, registration_number, address) VALUES (?, ?, ?)',
            [name, registration_number, address]
        );
        const companyId = companyResult.insertId;

        // Insert departments into departments table
        if (departments && departments.length > 0) {
            for (const department of departments) {
                await dbPromise.query(
                    'INSERT INTO departments (company_id, department_name) VALUES (?, ?)',
                    [companyId, department]
                );
            }
        }

        res.status(201).json({ message: 'Company and departments added successfully', companyId });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to add company and departments' });
    }
});

// Get a company with its departments
router.get('/companies/:id', authMiddleware, async (req, res) => {
    const companyId = req.params.id;

    try {
        // Get company details
        const [company] = await dbPromise.query('SELECT * FROM companies WHERE id = ?', [companyId]);
        if (!company.length) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // Get departments for the company
        const [departments] = await dbPromise.query('SELECT * FROM departments WHERE company_id = ?', [companyId]);

        res.status(200).json({ ...company[0], departments });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to fetch company details' });
    }
});

// Employee Management
router.post('/employees', authMiddleware, adminController.createEmployee);
router.get('/employees', authMiddleware, adminController.getAllEmployees);

router.post('/employees/past-positions', adminController.addPastPosition);
// Get employee past positions
router.get('/employees/:id/past-positions', authMiddleware, adminController.getEmployeePastPositions);
router.put('/employees/:id', authMiddleware, adminController.updateEmployee);
router.patch('/employees/:id', authMiddleware, adminController.patchEmployee);
router.delete('/employees/:id', authMiddleware, adminController.deleteEmployee);
// resign 
router.post('/employees/:id/resign', authMiddleware, adminController.resignEmployee);
// resetPassword
router.post('/employees/:id/reset-password', adminController.resetEmployeePassword);


// Get a single employee by ID
router.get('/employees/:id', authMiddleware, adminController.getEmployeeById);

// Get employee training records
router.get('/employees/:employeeId/training-records', authMiddleware, adminController.getEmployeeTrainingRecords);
// Create new training record
router.post('/employees/:employeeId/training-records', authMiddleware, adminController.createEmployeeTrainingRecord);
// Update specific training record
router.put('/employees/:employeeId/training-records/:trainingId', authMiddleware, adminController.updateEmployeeTrainingRecord);
// Get employee disciplinary records
router.get('/employees/:employeeId/disciplinary-records', authMiddleware, adminController.getEmployeeDisciplinaryRecords);
// Create new disciplinary record
router.post('/employees/:employeeId/disciplinary-records', authMiddleware, adminController.createEmployeeDisciplinaryRecord);
// Validate employee number uniqueness
//router.get('/employees/validate/employee-number',authMiddleware, adminController.validateEmployeeNumber);
// Validate employee number
router.get('/employees/validate/employee-number', async (req, res) => {
  try {
    const { employee_no } = req.query;
    
    if (!employee_no) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required'
      });
    }
    
    const result = await validateEmployeeNumber(employee_no);
    
    res.json({
      success: true,
      available: result.available,
      message: result.message
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate employee number'
    });
  }
});

// Generate employee number
// routes/employees.js - Updated generate endpoint
router.post('/employees/generate-employee-number', async (req, res) => {
  try {
    const { joined_date, current_employee_no } = req.body;
    
    if (!joined_date) {
      return res.status(400).json({
        success: false,
        message: 'Joined date is required'
      });
    }

    const joinedDate = new Date(joined_date);
    if (isNaN(joinedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const employeeNo = await generateEmployeeNumber(joined_date, current_employee_no, false);
    
    res.json({
      success: true,
      employee_no: employeeNo,
      is_new: employeeNo !== current_employee_no
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate employee number'
    });
  }
});

// Get sequence information
router.get('/employees/sequence-info', authMiddleware, async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();
    
    const sequenceInfo = await getSequenceInfo(currentYear);
    
    res.json({
      success: true,
      year: currentYear,
      sequence_info: sequenceInfo,
      next_number: sequenceInfo 
        ? `EMP-${currentYear}-${(sequenceInfo.last_seq + 1).toString().padStart(4, '0')}`
        : `EMP-${currentYear}-0001`
    });
  } catch (error) {
    console.error('Sequence info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sequence information'
    });
  }
});

// Preview employee number
router.get('/employees/preview-employee-number', async (req, res) => {
  try {
    const { joined_date } = req.query;
    
    if (!joined_date) {
      return res.status(400).json({
        success: false,
        message: 'Joined date is required'
      });
    }
    
    const joinedDate = new Date(joined_date);
    if (isNaN(joinedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    const employeeNo = await generateEmployeeNumber(joined_date, true);
    
    res.json({
      success: true,
      employee_no: employeeNo,
      is_preview: true
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview employee number'
    });
  }
});

router.get('/dashboard-stats', authMiddleware, adminController.getDashboardStats);

router.get('/user', authMiddleware, adminController.getUserDetails);



router.get('/departments/:departmentId/employees', authMiddleware, adminController.getEmployeesByDepartment);
router.get('/departments/:departmentId/eligible-managers', authMiddleware, adminController.getEligibleManagersByDepartment);

router.get('/companies/:companyId/managers', authMiddleware, adminController.getManagersByCompany);

router.put('/employees/:id/transfer', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.body;

        // Validate the new company ID
        if (!company_id) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Update the employee's company in the database
        const query = 'UPDATE employees SET company_id = ? WHERE id = ?';
        await dbPromise.query(query, [company_id, id]);

        res.status(200).json({ message: 'Employee transferred successfully' });
    } catch (error) {
        console.error('Error transferring employee:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dropdown data routes for announcements
router.get('/departments', authMiddleware, async (req, res) => {
  try {
    const { company_id } = req.query;
    
    let query = 'SELECT d.id, d.department_name, d.company_id, c.name AS company_name FROM departments d JOIN companies c ON d.company_id = c.id WHERE d.is_delete = 0';
    const params = [];
    
    if (company_id) {
      query += ' AND d.company_id = ?';
      params.push(company_id);
    }
    
    query += ' ORDER BY d.department_name';
    
    const [departments] = await dbPromise.query(query, params);
    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/positions', authMiddleware, async (req, res) => {
  try {
    const { department_id } = req.query;
    
    let query = 'SELECT p.id, p.title, p.department_id, d.department_name, c.name AS company_name FROM positions p JOIN departments d ON p.department_id = d.id JOIN companies c ON d.company_id = c.id';
    const params = [];
    
    if (department_id) {
      query += ' WHERE department_id = ?';
      params.push(department_id);
    }
    
    query += ' ORDER BY title';
    
    const [positions] = await dbPromise.query(query, params);
    res.json(positions);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- Employee Salary Increment Routes ---
router.get('/employees/:employee_id/increments', employeeController.getEmployeeIncrements);
router.post('/employees/:employee_id/increments', employeeController.createEmployeeIncrement);
router.get('/increments', employeeController.getAllIncrements);
router.get('/increments/:increment_id', employeeController.getIncrement);
router.put('/increments/:increment_id', employeeController.updateIncrement);
router.delete('/increments/:increment_id', employeeController.deleteIncrement);
router.get('/increments/stats', employeeController.getIncrementStats);

//--attendance time zone update
router.patch('/:id/timezone', employeeController.updateTimeZone);

module.exports = router;