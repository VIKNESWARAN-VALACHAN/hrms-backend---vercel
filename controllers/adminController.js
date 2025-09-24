const { dbPromise } = require('../models/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AWS = require('aws-sdk');
const crypto = require('crypto');

const TotalType = {
    ONCE_CONFIRMED: 'ONCE CONFIRMED',
    IMMEDIATE: 'IMMEDIATE'
}

// Company Management
const createCompany = async (req, res) => {
    const {
        name,
        register_number,
        address,
        email,
        phone,
        status,
        parent_id,
        income_tax_no,
        socso_account_no,
        epf_account_no,
        website,
        description,
        departments
    } = req.body;

    // Validate required fields
    //if (!name || !address || !email || !phone) {
    if (!name) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    // Get a connection from the pool
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction(); // Start a transaction

    try {
        // Prepare is_active based on status
        const is_active = status === 'active' ? 1 : 0;

        // Insert into Companies table
        const companyQuery = `
            INSERT INTO companies (
                name, 
                registration_number,
                address, 
                email, 
                phone_no, 
                is_active,
                parent_id,
                income_tax_no,
                socso_account_no,
                epf_account_no,
                website,
                description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // If parent_id is empty string, set it to null
        const parsedParentId = parent_id && parent_id !== '' ? parent_id : null;

        const regNumber = register_number?.trim() || null;

        
        const [companyResult] = await connection.query(companyQuery, [
            name,
            regNumber,//register_number,
            address || null,
            email || null,
            phone || null,
            is_active,
            parsedParentId,
            income_tax_no,
            socso_account_no,
            epf_account_no,
            website,
            description
        ]);

        const companyId = companyResult.insertId;

        // Process departments
        const createdDepartments = [];
        if (departments && Array.isArray(departments) && departments.length > 0) {       
            // Updated query to include is_active field
            const departmentQuery = 'INSERT INTO departments (company_id, department_name, is_active) VALUES (?, ?, ?)';

            // Insert each department
            for (const departmentItem of departments) {
                try {
                    // Set is_active to 1 (active) by default
                    const [deptResult] = await connection.query(departmentQuery, [
                        companyId,
                        departmentItem.department_name.trim(),
                        departmentItem.is_active // is_active = 1 means active
                    ]);

                    const departmentId = deptResult.insertId;

                    createdDepartments.push({
                        id: deptResult.insertId,
                        company_id: companyId,
                        department_name: departmentItem.department_name.trim(),
                        is_active: departmentItem.is_active // Include is_active in the response
                    });
                    const createdPositions = [];
                    if (departmentItem.positions && Array.isArray(departmentItem.positions) && departmentItem.positions.length > 0) {
                        // Updated query to include is_active field
                        const positionQuery = 'INSERT INTO positions (title, start_work_time, end_work_time, department_id, job_level, job_description) VALUES (?, ?, ?, ?, ?, ?)';   
            
                        // Insert each position
                        for (const positionItem of departmentItem.positions) {
                            try {
                                // Set is_active to 1 (active) by default
                                const [posResult] = await connection.query(positionQuery, [
                                    positionItem.title,
                                    positionItem.start_work_time,
                                    positionItem.end_work_time,
                                    departmentId,
                                    positionItem.job_level,
                                    positionItem.job_description
                                ]);
            
                                createdPositions.push({
                                    id: posResult.insertId,
                                    title: positionItem.title,
                                    start_work_time: positionItem.start_work_time,
                                    end_work_time: positionItem.end_work_time,
                                    department_id: departmentId,
                                    job_level: positionItem.job_level,
                                    job_description: positionItem.job_description
                                });                              
                            } catch (posError) {
                                // Log the error but continue with other positions
                                console.error(`Error adding position "${positionItem.position_name}":`, posError);
                            }
                        }
                    } 

                } catch (deptError) {
                    // Log the error but continue with other departments
                    console.error(`Error adding department "${departmentName}":`, deptError);
                }
            }
        }

        // Commit the transaction
        await connection.commit();
        connection.release(); // Release the connection back to the pool

        res.status(201).json({
            message: 'Company created successfully',
            company: {
                id: companyId,
                name,
                registration_number: register_number,
                address,
                email,
                phone_no: phone,
                is_active,
                parent_id: parsedParentId,
                income_tax_no,
                socso_account_no,
                epf_account_no,
                website,
                description
            },
            departments: createdDepartments
        });
    } catch (error) {
        // Rollback the transaction in case of error
        await connection.rollback();
        connection.release(); // Release the connection back to the pool
        console.error('Error creating company:', error);
        res.status(500).json({ error: error.message });
    }
};

const getTransferDepartmentPositions = async (req, res) => {
    const { departmentId } = req.params;

    try {
        const query = 'SELECT * FROM positions WHERE department_id = ?';
        const [results] = await dbPromise.query(query, [departmentId]);

        res.json(results);
    } catch (error) {
        console.error('Error fetching positions by department:', error);
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
};

const getEditAllCompanies = async (req, res) => {
    try {
        const query = `
            SELECT c.*, COUNT(d.id) AS department_count
            FROM companies c
            LEFT JOIN departments d ON c.id = d.company_id
            WHERE c.is_delete = 0
            GROUP BY c.id
        `;
        const [results] = await dbPromise.query(query);
        res.json(results);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: error.message });
    }
};

const getAllCompanies = async (req, res) => {
    const filters = req.query;
    try {
        let query = `
            SELECT
                c.id, c.name AS company_name, p.name AS parent_company_name, 
                c.registration_number AS register_number, c.address, c.created_at,
                c.parent_id, c.is_active, c.email AS email, c.phone_no AS phone,
                (SELECT COUNT(*) > 0 FROM companies sc WHERE sc.parent_id = c.id) AS has_subcompanies
            FROM 
                companies c
            LEFT JOIN
                companies p ON c.parent_id = p.id
            WHERE 1=1 AND c.is_delete = 0`;

        let params = [];

        // Add filters similar to getAllEmployees
        if (filters.nameEmail && filters.nameEmail.length >= 2) {
            query += ` AND (c.name LIKE ? OR c.email LIKE ?)`;
            params.push(`%${filters.nameEmail}%`, `%${filters.nameEmail}%`);
        }

        if (filters.status) {
            if (filters.status === 'active') {
                query += ` AND c.is_active = 1`;
            } else {
                query += ` AND c.is_active = 0`;
            }
        }

        if (filters.industry) {
            query += ` AND c.industry = ?`;
            params.push(filters.industry);
        }

        if (filters.parent_id) {
            if (filters.parent_id === 'null') {
                // Handle "Parent Companies Only" selection - companies with no parent
                query += ` AND c.parent_id IS NULL`;
            } else {
                // Handle specific parent company selection
                query += ` AND c.parent_id = ` + filters.parent_id;
                params.push(filters.parent_id);
            }
        }

        if (filters.hasSubcompanies) {
            query += ` AND (SELECT COUNT(*) FROM companies sc WHERE sc.parent_id = c.id) > 0`;
        }

        if (filters.foundedStart && filters.foundedEnd) {
            query += ` AND c.founded_date BETWEEN ? AND ?`;
            params.push(filters.foundedStart, filters.foundedEnd);
        }

        // Add sorting
        query += ` ORDER BY  c.is_active DESC, ${filters.sortBy || 'c.id'} ${filters.sortOrder || 'ASC'}`;

        const [results] = await dbPromise.query(query, params);
        res.json(results);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: error.message });
    }
};

const getCompany = async (req, res) => {
    const { id } = req.params; // Get ID from route parameters

    try {
        // Query to get comprehensive company details
        let query = `
            SELECT
                c.id, 
                c.name AS company_name, 
                p.name AS parent_company_name, 
                c.registration_number AS register_number, 
                c.address, 
                c.email, 
                c.phone_no AS phone,
                c.is_active,
                c.parent_id,
                c.website,
                c.description,
                c.created_at,
                c.income_tax_no,
                c.socso_account_no,
                c.epf_account_no,
                (SELECT COUNT(*) > 0 FROM companies sc WHERE sc.parent_id = c.id AND sc.is_delete = 0) AS has_subcompanies
            FROM 
                companies c
            LEFT JOIN
                companies p ON c.parent_id = p.id
            WHERE 
                c.id = ? AND c.is_delete = 0`;

        // Execute query with company ID
        const [results] = await dbPromise.query(query, [id]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Return the company details
        res.json(results[0]);
    } catch (error) {
        console.error('Error fetching company details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getCompanyDepartments = async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'SELECT * FROM departments WHERE company_id = ? AND is_delete = 0';
        const [results] = await dbPromise.query(query, [id]);
        res.json(results);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: error.message });
    }
};

const getCompanyAllDepartments = async (req, res) => {
    const { id } = req.params;

    try {
        // Validate that company exists first
        const companyCheckQuery = 'SELECT id FROM companies WHERE id = ? AND is_delete = 0';
        const [companyResults] = await dbPromise.query(companyCheckQuery, [id]);

        if (companyResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Company not found'
            });
        }

        // Get departments with detailed information
        const query = `
            SELECT 
                d.id, 
                d.department_name, 
                d.description, 
                d.is_active,
                d.created_at,
                d.updated_at,
                (SELECT COUNT(*) FROM employees e WHERE e.department = d.id) AS employee_count
            FROM 
                departments d 
            WHERE 
                d.company_id = ?
            ORDER BY 
                d.department_name ASC
        `;

        const [results] = await dbPromise.query(query, [id]);

        // Format response for frontend consistency
        const formattedResults = results.map(dept => ({
            id: dept.id.toString(),
            department_name: dept.department_name || '',
            description: dept.description || '',
            is_active: dept.is_active === 1 || dept.is_active === true,
            created_at: dept.created_at,
            updated_at: dept.updated_at,
            employee_count: dept.employee_count
        }));

        res.json({
            success: true,
            departments: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch departments',
            details: error.message
        });
    }
};

/**
 * Creates a new department for an existing company
 * @route POST /api/admin/departments
 */
const createDepartment = async (req, res) => {
    const {
        company_id,
        department_name,
        description = null,
        status = 'active'
    } = req.body;

    // Input validation
    if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    if (!department_name || department_name.trim() === '') {
        return res.status(400).json({ error: 'Department name is required' });
    }

    // Get a database connection and start a transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Verify the company exists
        const companyCheckQuery = 'SELECT id FROM companies WHERE id = ? AND is_delete = 0';
        const [companyResults] = await connection.query(companyCheckQuery, [company_id]);

        if (companyResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Company not found' });
        }

        // Check if department with the same name already exists for this company
        const duplicateCheckQuery = 'SELECT id FROM departments WHERE company_id = ? AND department_name = ?';
        const [duplicateResults] = await connection.query(duplicateCheckQuery, [company_id, department_name.trim()]);

        if (duplicateResults.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ error: 'Department with this name already exists for this company' });
        }

        // Set is_active value based on status
        const is_active = status === 'active' ? 1 : 0;

        // Insert the department
        const insertQuery = `
            INSERT INTO departments (
                company_id, 
                department_name, 
                description,
                is_active
            ) VALUES (?, ?, ?, ?)
        `;

        const [result] = await connection.query(insertQuery, [
            company_id,
            department_name.trim(),
            description,
            is_active
        ]);

        // Commit transaction
        await connection.commit();
        connection.release();

        // Return success with department details
        res.status(201).json({
            message: 'Department created successfully',
            department: {
                id: result.insertId,
                company_id,
                department_name: department_name.trim(),
                description,
                is_active
            }
        });
    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        connection.release();

        console.error('Error creating department:', error);
        res.status(500).json({ error: 'An error occurred while creating the department' });
    }
};

const getDepartments = async (req, res) => {
    const { id } = req.params;

    //console.log('Fetching departments json:', id);
    // Validate that company_id is provided
    var company_id = id;
    if (!company_id) {
        return res.status(400).json({
            success: false,
            error: 'Department ID is required in request body'
        });
    }

    try {
        // Verify that company exists first
        const departmentCheckQuery = 'SELECT id FROM departments WHERE company_id = ? AND is_delete = 0';
        const [departmentResults] = await dbPromise.query(departmentCheckQuery, [company_id]);

        if (departmentResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        // Get departments with detailed information
        const query = `
            SELECT 
                d.id, 
                d.department_name, 
                d.description, 
                d.is_active,
                d.created_at,
                d.updated_at,
                (SELECT COUNT(*) FROM employees e WHERE e.department = d.id) AS employee_count
            FROM 
                departments d 
            WHERE 
                d.company_id = ? AND d.is_delete = 0
            ORDER BY 
                d.department_name ASC
        `;

        const [results] = await dbPromise.query(query, [company_id]);

        // Format response for frontend consistency
        const formattedResults = results.map(dept => ({
            id: dept.id.toString(),
            department_name: dept.department_name || '',
            description: dept.description || '',
            is_active: dept.is_active === 1 || dept.is_active === true,
            created_at: dept.created_at,
            updated_at: dept.updated_at,
            employee_count: dept.employee_count
        }));

        res.json({
            success: true,
            departments: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch departments',
            details: error.message
        });
    }
};

const getDepartment = async (req, res) => {
    const { id } = req.params;

    // Validate that company_id is provided
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'Department ID is required in request body'
        });
    }

    try {
        // Verify that company exists first
        const departmentCheckQuery = 'SELECT id FROM departments WHERE id = ? AND is_delete = 0';
        const [departmentResults] = await dbPromise.query(departmentCheckQuery, [id]);

        if (departmentResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        // Get departments with detailed information
        const query = `
            SELECT 
                d.id, 
                d.department_name, 
                d.description, 
                d.is_active,
                d.created_at,
                d.updated_at,
                d.company_id,
                c.name AS company_name,
                (SELECT COUNT(*) FROM employees e WHERE e.department = d.id) AS employee_count
            FROM 
                departments d 
            JOIN companies c ON d.company_id = c.id
            WHERE 
                d.id = ? AND d.is_delete = 0
            ORDER BY 
                d.department_name ASC
        `;

        const [results] = await dbPromise.query(query, [id]);

        // Format response for frontend consistency
        const formattedResults = results.map(dept => ({
            id: dept.id.toString(),
            department_name: dept.department_name || '',
            description: dept.description || '',
            is_active: dept.is_active === 1 || dept.is_active === true,
            created_at: dept.created_at,
            updated_at: dept.updated_at,
            employee_count: dept.employee_count,
            company_id: dept.company_id,
            company_name: dept.company_name
        }));

        res.json({
            success: true,
            departments: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch departments',
            details: error.message
        });
    }
};

const getPositions = async (req, res) => {
    const { id } = req.params;

    // Validate that company_id is provided
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'Department ID is required in request body'
        });
    }

    try {
        // Verify that company exists first
        const departmentCheckQuery = 'SELECT id FROM departments WHERE id = ?';
        const [departmentResults] = await dbPromise.query(departmentCheckQuery, [id]);

        if (departmentResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Department not found'
            });
        }

        // Get departments with detailed information
        const query = `
            SELECT 
                d.id, 
                d.department_name, 
                d.description, 
                d.is_active,
                d.created_at,
                d.updated_at,
                d.company_id,
                (SELECT COUNT(*) FROM employees e WHERE e.department = d.id) AS employee_count
            FROM 
                departments d 
            WHERE 
                d.id = ?
            ORDER BY 
                d.department_name ASC
        `;

        const [results] = await dbPromise.query(query, [id]);

        // Format response for frontend consistency
        const formattedResults = results.map(dept => ({
            id: dept.id.toString(),
            department_name: dept.department_name || '',
            description: dept.description || '',
            is_active: dept.is_active === 1 || dept.is_active === true,
            created_at: dept.created_at,
            updated_at: dept.updated_at,
            employee_count: dept.employee_count,
            company_id: dept.company_id
        }));

        res.json({
            success: true,
            departments: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch departments',
            details: error.message
        });
    }
};

const updateDepartment = async (req, res) => {
    const { id } = req.params;
    const {
        department_name,
        description,
        is_active
    } = req.body;

    // Input validation
    if (!department_name || department_name.trim() === '') {
        return res.status(400).json({ error: 'Department name is required' });
    }

    // Start a database transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Verify department exists
        const checkQuery = 'SELECT id, company_id FROM departments WHERE id = ?';
        const [departmentResults] = await connection.query(checkQuery, [id]);

        if (departmentResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Department not found' });
        }

        const company_id = departmentResults[0].company_id;

        // Check if another department with the same name exists in the same company
        const duplicateQuery = 'SELECT id FROM departments WHERE company_id = ? AND department_name = ? AND id != ?';
        const [duplicateResults] = await connection.query(duplicateQuery, [company_id, department_name.trim(), id]);

        if (duplicateResults.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ error: 'Another department with this name already exists in this company' });
        }

        // Update department details
        const updateQuery = `
            UPDATE departments 
            SET 
                department_name = ?, 
                description = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        const [result] = await connection.query(updateQuery, [
            department_name.trim(),
            description,
            is_active === true || is_active === 1 ? 1 : 0,
            id
        ]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Department not found' });
        }

        // Get updated department details
        const getUpdatedQuery = `
            SELECT 
                id, 
                department_name, 
                description, 
                company_id,
                is_active,
                created_at,
                updated_at
            FROM departments 
            WHERE id = ?
        `;

        const [updatedDepartment] = await connection.query(getUpdatedQuery, [id]);

        // Commit transaction
        await connection.commit();
        connection.release();

        // Return success with updated department details
        res.json({
            message: 'Department updated successfully',
            department: updatedDepartment[0]
        });
    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        connection.release();

        console.error('Error updating department:', error);
        res.status(500).json({ error: 'An error occurred while updating the department' });
    }
};

const updatePosition = async (req, res) => {
    const { id } = req.params;
    const { title, start_work_time, end_work_time, job_description, job_level } = req.body;


    //Input Validation
    if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Title is required' });
    }

    // Start a database transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        //Verify that position exists
        const positionCheckQuery = 'SELECT id FROM positions WHERE id = ?';
        const [positionResults] = await connection.query(positionCheckQuery, [id]);

        if (positionResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Position not found' });
        }

        //Update position details
        const updateQuery = `
            UPDATE positions
            SET
                title = ?,
                start_work_time = ?,
                end_work_time = ?,
                job_description = ?,
                job_level = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        const [result] = await connection.query(updateQuery, [
            title,
            start_work_time,
            end_work_time,
            job_description,
            job_level,
            id
        ]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Position not found' });
        }

        //Get updated position details
        const getUpdatedQuery = `
            SELECT
                id,
                title,
                start_work_time,
                end_work_time,
                job_description,
                job_level,
                created_at,
                updated_at
            FROM positions
            WHERE id = ?
        `;

        const [updatedPosition] = await connection.query(getUpdatedQuery, [id]);

        //Commit transaction
        await connection.commit();
        connection.release();

        //Return success with updated position details  
        res.json({
            message: 'Position updated successfully',
            position: updatedPosition[0]
        });
    } catch (error) {
        //Rollback transaction on error
        await connection.rollback();
        connection.release();

        console.error('Error updating position:', error);
        res.status(500).json({ error: 'An error occurred while updating the position' });
    }
};

//Update Edit Company
const updateCompany = async (req, res) => {
    const { id } = req.params;
    const { name, registration_number, address, departments, epf_account_no, socso_account_no,
        income_tax_no, website, description, status } = req.body;

    // Debug: Log the received payload
    console.log('Received payload:', { name, registration_number, address, departments, epf_account_no, socso_account_no, income_tax_no, website, description, status });

    // Start a database transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        const is_active = status === 'active' ? 1 : 0;

        // Step 1: Update the company
        const updateCompanyQuery = 'UPDATE companies SET name = ?, registration_number = ?, address = ?, epf_account_no = ?, socso_account_no = ?, income_tax_no = ?, website = ?, description = ?, is_active = ? WHERE id = ?';
        const [companyResult] = await connection.query(updateCompanyQuery, [name, registration_number, address, epf_account_no, socso_account_no, income_tax_no, website, description, is_active, id]);

        if (companyResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Company not found' });
        }

        // Validate departments if provided
        if (departments && departments.length > 0) {
            // Step 2: Fetch existing departments for the company
            const fetchDepartmentsQuery = 'SELECT * FROM departments WHERE company_id = ?';
            const [existingDepartments] = await connection.query(fetchDepartmentsQuery, [id]);

            // Step 3: Identify departments to delete, update, or add
            const existingDepartmentNames = existingDepartments.map(d => d.department_name);
            const updatedDepartmentNames = departments || []; // Ensure departments is an array

            // Departments to delete (present in DB but not in the updated list)
            const departmentsToDelete = existingDepartmentNames.filter(name => !updatedDepartmentNames.includes(name));
            if (departmentsToDelete.length > 0) {
                const deleteDepartmentsQuery = 'DELETE FROM departments WHERE company_id = ? AND department_name = ?';
                for (const department of departmentsToDelete) {
                    await connection.query(deleteDepartmentsQuery, [id, department]);
                }
            }

            // Departments to add (present in the updated list but not in DB)
            const departmentsToAdd = updatedDepartmentNames.filter(name => !existingDepartmentNames.includes(name));
            if (departmentsToAdd.length > 0) {
                const insertDepartmentQuery = 'INSERT INTO departments (company_id, department_name) VALUES (?, ?)';
                for (const department of departmentsToAdd) {
                    await connection.query(insertDepartmentQuery, [id, department]);
                }
            }
        } else {
            // If departments is empty, skip department processing and just update the company
            await connection.commit();
            connection.release();
            return res.json({ message: 'Company updated successfully' });
        }


        // Step 4: Commit the transaction
        await connection.commit();
        connection.release(); // Release the connection back to the pool
        res.json({ message: 'Company and departments updated successfully' });
    } catch (error) {
        // Rollback the transaction in case of error
        await connection.rollback();
        connection.release(); // Release the connection back to the pool
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};
const deleteCompany = async (req, res) => {
    const { id } = req.params;

    // Start a database transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Instead of deleting, update the is_delete flag to 1 (soft delete)
        const updateCompanyQuery = 'UPDATE companies SET is_delete = 1 WHERE id = ?';
        const [result] = await connection.query(updateCompanyQuery, [id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Company not found' });
        }
        // Update all leave types for the company to set is_active to 0
        const updateLeaveTypeQuery = 'UPDATE leave_types SET is_active = 0 WHERE company_id = ?';
        const [leaveTypeResult] = await connection.query(updateLeaveTypeQuery, [id]);

        // Commit the transaction
        await connection.commit();
        connection.release();

        return res.json({ message: 'Company deleted successfully' });
    } catch (error) {
        // Rollback in case of error
        await connection.rollback();
        connection.release();
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteDepartment = async (req, res) => {
    const { id } = req.params;
    const connection = await dbPromise.getConnection();
    // Start transaction
    await connection.beginTransaction();
    try {

        // Update department to set is_delete = 1 instead of removing it
        const updateQuery = 'UPDATE departments SET is_delete = 1 WHERE id = ?';
        const [result] = await connection.query(updateQuery, [id]);

        console.log("Delete Department: ", result);
        if (result.affectedRows === 0) {

            await connection.rollback();
            return res.status(404).json({ error: 'Department not found' });
        }

        // Commit the transaction
        await connection.commit();
        connection.release();

        return res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        // Rollback in case of error
        await connection.rollback();
        connection.release();
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const deletePosition = async (req, res) => {
    const { id } = req.params;
    const connection = await dbPromise.getConnection();

    try {
        // Start transaction
        await connection.beginTransaction();

        // First, check if any employees are using this position
        const checkEmployeesQuery = 'SELECT COUNT(*) as count FROM employees WHERE position_id = ?';
        const [employeeCount] = await connection.query(checkEmployeesQuery, [id]);

        // Only update employees if there are any associated with this position
        if (employeeCount[0].count > 0) {
            console.log(`Found ${employeeCount[0].count} employees with position_id ${id}. Updating them...`);
            const updateEmployeesQuery = 'UPDATE employees SET position_id = 0 WHERE position_id = ?';
            await connection.query(updateEmployeesQuery, [id]);
        }

        // Then delete the position permanently
        const deleteQuery = 'DELETE FROM positions WHERE id = ?';
        const [result] = await connection.query(deleteQuery, [id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Position not found' });
        }

        // Commit the transaction
        await connection.commit();
        connection.release();

        return res.json({ message: 'Position deleted successfully' });
    } catch (error) {
        // Rollback in case of error
        await connection.rollback();
        connection.release();
        console.error('Error deleting position:', error);
        res.status(500).json({ error: error.message });
    }
};
/**
 * Get positions for a department
 * @route GET /api/admin/departments/:id/positions
 */
const getDepartmentPositions = async (req, res) => {
    const { id } = req.params; // department_id
    console.log("Department ID", id);
    try {
        // Verify department exists
        const departmentCheckQuery = 'SELECT id FROM departments WHERE id = ?';
        const [departmentResults] = await dbPromise.query(departmentCheckQuery, [id]);

        if (departmentResults.length === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }

        // Get positions
        const positionsQuery = `
            SELECT 
                id,
                title,
                start_work_time,
                end_work_time,
                department_id,
                job_description,
                job_level,
                created_at,
                updated_at,
                (SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id) AS employee_count
            FROM 
                positions p
            WHERE 
                department_id = ?
            ORDER BY 
                title ASC
        `;

        const [positions] = await dbPromise.query(positionsQuery, [id]);

        // Format response for frontend consistency
        const formattedPositions = positions.map(position => ({
            id: position.id.toString(),
            title: position.title || '',
            start_work_time: position.start_work_time || '',
            end_work_time: position.end_work_time || '',
            department_id: position.department_id || '',
            job_description: position.job_description || '',
            job_level: position.job_level || '',
            created_at: position.created_at,
            updated_at: position.updated_at,
            employee_count: position.employee_count || 0
        }));

        res.json({
            success: true,
            positions: formattedPositions,
            count: formattedPositions.length
        });
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
};

// Fetch employee by companies
const getEmployeesByCompany = async (req, res) => {
    const { companyId } = req.params;

    try {
        const query = `SELECT id, name FROM Employees WHERE company_id = ?`;
        const [employees] = await dbPromise.query(query, [companyId]);

        res.json(employees);
    } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Helper function to handle document uploads from multiple modules
// Note: This function assumes the employee_documents table has a 'module_name' column
// If the column doesn't exist, add it with: ALTER TABLE employee_documents ADD COLUMN module_name VARCHAR(255) DEFAULT 'employee-data';
const handleDocumentUploads = async (req, employeeId, connection, trainingIdList = [], disciplinaryIdList = []) => {
    const uploadedDocuments = [];
    
    console.log("🔹 Files:", req.files);
    console.log("🔹 Training ID List:", trainingIdList);
    console.log("🔹 Disciplinary ID List:", disciplinaryIdList);
    if (!req.files || !employeeId) {
        return uploadedDocuments;
    }

    // Configure AWS S3
    const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        signatureVersion: 'v4',
        endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
    });

    // Handle regular document uploads (non-indexed)
    for (const [fieldName, fileOrFiles] of Object.entries(req.files)) {
        const [ moduleName, documentType, indexStr, isEditMode ] = fieldName.split('|');
        console.log("🔹 Module Name:", moduleName);
        console.log("🔹 Document Type:", documentType);
        console.log("🔹 Index Str:", indexStr);
        console.log("🔹 Is Edit Mode:", isEditMode);
        const recordIndex = parseInt(indexStr, 10);
        if (isNaN(recordIndex)) continue; 

        const files = Array.isArray(req.files[fieldName]) 
        ? fileOrFiles 
        : [fileOrFiles];

        for (const file of files) {
            console.log("🔹 File:", file);
            try {
                // Generate a unique key for S3 object
                const timestamp = Date.now();
                const trainingId = trainingIdList[recordIndex] ? trainingIdList[recordIndex].toString() : null;
                const disciplinaryId = disciplinaryIdList[recordIndex] ? disciplinaryIdList[recordIndex].toString() : null;
                const moduleId = isEditMode === '1' ? `/${indexStr}` : trainingId && documentType === 'Training_Records' ? `/${trainingId}` : disciplinaryId && documentType === 'Disciplinary_Records' ? `/${disciplinaryId}` : '';
                const s3Key = `employees/${employeeId}/${moduleName}/${documentType}${moduleId}/${timestamp}_${file.name}`;

                console.log("s3Key", s3Key);
                // Prepare file data for S3
                const fileData = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: s3Key,
                    Body: file.data,
                    ContentType: file.mimetype
                };
                
                // Upload to S3
                const uploadedData = await s3.upload(fileData).promise();

                // Save document reference in database
                const insertDocQuery = `INSERT INTO employee_documents (
                    employee_id, document_type, s3_key, original_filename, 
                    file_size, content_type,related_id
                ) VALUES (?, ?, ?, ?, ?, ?,?)`;

                const [docResult] = await connection.query(insertDocQuery, [
                    employeeId,
                    documentType,
                    s3Key,
                    file.name,
                    file.size,
                    file.mimetype,
                    isEditMode === '1' ? indexStr : documentType === 'Training_Records' ? trainingId : documentType === 'Disciplinary_Records' ? disciplinaryId : null
                ]);

                uploadedDocuments.push({
                    id: docResult.insertId,
                    filename: file.name,
                    url: uploadedData.Location,
                    module: moduleName,
                    documentType: documentType
                });
            } catch (error) {
                console.error(`❌ Error uploading ${documentType} file ${file.name} for module ${moduleName}:`, error);
                // Continue with other files even if one fails
            }
        }
    }

    // Process files from different modules
    // for (const [moduleName, supportedTypes] of Object.entries(moduleConfig)) {
    //     for (const documentType of supportedTypes) {
    //         const fieldName = `${moduleName}_${documentType}`;
            
    //         if (req.files[fieldName]) {
    //             const files = Array.isArray(req.files[fieldName]) 
    //                 ? req.files[fieldName] 
    //                 : [req.files[fieldName]];

    //             for (const file of files) {
    //                 try {
    //                     // Generate a unique key for S3 object
    //                     const timestamp = Date.now();
    //                     const s3Key = `employees/${employeeId}/${moduleName}/${documentType}/${timestamp}_${file.name}`;
                        
    //                     // Prepare file data for S3
    //                     const fileData = {
    //                         Bucket: process.env.AWS_BUCKET_NAME,
    //                         Key: s3Key,
    //                         Body: file.data,
    //                         ContentType: file.mimetype
    //                     };
                        
    //                     // Upload to S3
    //                     const uploadedData = await s3.upload(fileData).promise();
                        
    //                     // Save document reference in database
    //                     const insertDocQuery = `INSERT INTO employee_documents (
    //                         employee_id, document_type, s3_key, original_filename, 
    //                         file_size, content_type
    //                     ) VALUES (?, ?, ?, ?, ?, ?)`;
                        
    //                     const [docResult] = await connection.query(insertDocQuery, [
    //                         employeeId,
    //                         documentType,
    //                         s3Key,
    //                         file.name,
    //                         file.size,
    //                         file.mimetype
    //                     ]);
                        
    //                     uploadedDocuments.push({
    //                         id: docResult.insertId,
    //                         filename: file.name,
    //                         url: uploadedData.Location,
    //                         module: moduleName,
    //                         documentType: documentType
    //                     });
                        
    //                     console.log(`🔹 Uploaded ${documentType} document: ${file.name} for module: ${moduleName}`);
    //                 } catch (error) {
    //                     console.error(`❌ Error uploading ${documentType} file ${file.name} for module ${moduleName}:`, error);
    //                     // Continue with other files even if one fails
    //                 }
    //             }
    //         }
    //     }
    // }

    return uploadedDocuments;
};

function formatDateToMySQL(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MM:SS'
}


// Employee Management
const createEmployee = async (req, res) => {

    let employeeData;
    if (req.body.data) {
        // Parse data from FormData
        employeeData = JSON.parse(req.body.data);
    } else {
        // Use raw JSON body
        employeeData = req.body;
    }
    const { 
        name, email, password, salary, currency, company_id, manager_id, role, joined_date, gender, 
        employee_no, employment_type, job_level, department, position, superior, office, nationality, 
        visa_expired_date, passport_expired_date, ic_passport, marital_status, dob, age, mobile_number, 
        country_code, payment_company, pay_interval, payment_method, bank_name, bank_currency, 
        bank_account_name, bank_account_no, income_tax_no, socso_account_no, epf_account_no, race, religion, 
        position_id, department_id, education_level, qualification, disciplinary_remarks,
        address, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email, is_superadmin,
        training_records, disciplinary_records
    } = employeeData;

    // ✅ Ensure `superior` is not undefined
    if (typeof superior === "undefined") {
        console.error("❌ Error: Superior is missing from request body!");
        return res.status(400).json({ error: "Superior is required but not provided." });
    }

    try {
        console.log("🔹 Manager ID Received from Frontend:", manager_id);
        console.log("🔹 Superior Received from Frontend:", superior); // ✅ Debugging

        // Set role based on job_level
        let employeeRole = role;
        if (job_level === 'Manager') {
            employeeRole = 'manager';
            console.log("🔹 Setting role to 'manager' based on job_level");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Begin transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // 🔹 Insert new employee with correct `superior`
            const query = `
                INSERT INTO employees (
                    name, email, password, salary, currency, company_id, manager_id, role, joined_date, gender, 
                    employee_no, employment_type, job_level, department, position, superior, office, nationality, 
                    visa_expired_date, passport_expired_date, ic_passport, marital_status, dob, age, mobile_number, 
                    country_code, payment_company, pay_interval, payment_method, bank_name, bank_currency, 
                    bank_account_name, bank_account_no, income_tax_no, socso_account_no, epf_account_no, race, religion, 
                    position_id, department_id, education_level, qualification, address, emergency_contact_name, 
                    emergency_contact_relationship, emergency_contact_phone, emergency_contact_email,is_superadmin
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const employeeValues = [
                name, email, hashedPassword, salary, currency, company_id, manager_id, employeeRole, joined_date, gender, 
                employee_no, employment_type, job_level, department || null, position, superior, office, nationality, 
                visa_expired_date || null, passport_expired_date || null, ic_passport || null, marital_status, dob, age, 
                mobile_number, country_code || null, payment_company, pay_interval, payment_method, bank_name, 
                bank_currency, bank_account_name, bank_account_no, income_tax_no || null, socso_account_no || null, epf_account_no || null,            
                race || null, religion || null, position_id || null, department_id || null, education_level || null, qualification || null,
                address || null, emergency_contact_name || null, emergency_contact_relationship || null, emergency_contact_phone || null, emergency_contact_email || null,
                is_superadmin ? 1 : 0
            ];

            console.log("🔹 Final Employee Data Inserted:", employeeValues);
            const [result] = await connection.query(query, employeeValues);
            const employee_id = result.insertId.toString();


            // ── Insert into employee_past_positions (once) ───────────────────────────────
const ensurePastPositionRow = async () => {
  // 1) Figure out the position_id we should use
  let finalPositionId = position_id;

  // Fallback: if no position_id but we have a position name + department_id, resolve it
  if (!finalPositionId && position && department_id) {
    const [posRows] = await connection.query(
      `SELECT id FROM positions WHERE title = ? AND department_id = ? LIMIT 1`,
      [position, department_id]
    );
    if (Array.isArray(posRows) && posRows.length) {
      finalPositionId = posRows[0].id;
    }
  }

  // If we still don't have a valid position_id or joined_date, we can't create a past position
  if (!finalPositionId || !joined_date) {
    console.warn("⚠️ Skipping employee_past_positions insert (missing position_id or joined_date)");
    return;
  }

  // 2) Avoid duplicates for the *same* (employee_id, position_id, start_date)
  const [exists] = await connection.query(
    `SELECT id
       FROM employee_past_positions
      WHERE employee_id = ? AND position_id = ? AND start_date = ?
      LIMIT 1`,
    [employee_id, finalPositionId, joined_date]
  );

  if (Array.isArray(exists) && exists.length) {
    console.log("ℹ️ employee_past_positions row already exists, skipping insert.");
    return;
  }

  // 3) Insert a fresh past-position record (created_at from NOW())
  await connection.query(
    `INSERT INTO employee_past_positions (employee_id, position_id, start_date, created_at)
     VALUES (?, ?, ?, NOW())`,
    [employee_id, finalPositionId, joined_date]
  );

  console.log(`✅ Inserted employee_past_positions for employee ${employee_id} (position_id=${finalPositionId}, start_date=${joined_date})`);
};

await ensurePastPositionRow();

            
            // 🔹 Insert employee document remarks
            const remarksQuery = `
                INSERT INTO employee_document_remarks (employee_id, disciplinary_remarks)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE
                disciplinary_remarks = VALUES(disciplinary_remarks)
            `;
            
            await connection.query(remarksQuery, [
                employee_id,
                disciplinary_remarks || null
            ]);
            
            console.log(`🔹 Created employee document remarks for employee ${employee_id}`);

            // 🔹 Insert training records if provided
            let parsedTrainingRecords = [];
            let training_id_list = [];
            if (training_records) {
                try {
                    // Parse training_records if it's a string (from FormData)
                    parsedTrainingRecords = typeof training_records === 'string' 
                        ? JSON.parse(training_records) 
                        : training_records;
                } catch (error) {
                    console.error('Error parsing training_records:', error);
                }
            }
            
            // if (parsedTrainingRecords && Array.isArray(parsedTrainingRecords) && parsedTrainingRecords.length > 0) {
            //     const insertTrainingQuery = `
            //         INSERT INTO training (
            //             employee_id, training_course, start_datetime, end_datetime, venue, status
            //         ) VALUES (?, ?, ?, ?, ?, ?)
            //     `;
                
            //     for (const training of parsedTrainingRecords) {
            //         // Convert datetime to date format for database
            //         const startDate = training.start_datetime ? new Date(training.start_datetime) : null;
            //         const endDate = training.end_datetime ? new Date(training.end_datetime) : null;
            //         if (training.training_course && startDate && endDate) {
            //             const [result_training] = await connection.query(insertTrainingQuery, [
            //                 employee_id,
            //                 training.training_course,
            //                 startDate,
            //                 endDate,
            //                 training.venue || null, 
            //                 training.status || 'Pending'
            //             ]);
            //             training_id_list.push(result_training.insertId);                               
            //             console.log(`🔹 Created training record: ${training.training_course} for employee ${employee_id}`);
            //         }
            //     }   
            // }

            if (parsedTrainingRecords && Array.isArray(parsedTrainingRecords) && parsedTrainingRecords.length > 0) {
                const insertTrainingQuery = `
                    INSERT INTO training (
                        employee_id, training_course, start_datetime, end_datetime, venue, status,
                        has_bond, bond_period_months, bond_start_date, bond_end_date, bond_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                for (const training of parsedTrainingRecords) {
                    // Convert datetime to date format for database
                    const startDate = training.start_datetime ? new Date(training.start_datetime) : null;
                    const endDate = training.end_datetime ? new Date(training.end_datetime) : null;
                    const bondStart = training.bond_start_date ? new Date(training.bond_start_date) : null;
                    const bondEnd = training.bond_end_date ? new Date(training.bond_end_date) : null;

                    if (training.training_course && startDate && endDate) {
                        const [result_training] = await connection.query(insertTrainingQuery, [
                            employee_id,
                            training.training_course,
                            startDate,
                            endDate,
                            training.venue || null,
                            training.status || 'Pending',
                            training.has_bond ? 1 : 0,
                            training.bond_period_months || null,
                            bondStart,
                            bondEnd,
                            training.bond_status || null
                        ]);

                        training_id_list.push(result_training.insertId);
                        console.log(`🔹 Created training record: ${training.training_course} for employee ${employee_id}`);
                    }
                }
            }


            console.log('✅ training_id_list:', training_id_list);

            // 🔹 Insert disciplinary records if provided
            let parsedDisciplinaryRecords = [];
            let disciplinary_id_list = [];
            if (disciplinary_records) {
                try {
                    // Parse disciplinary_records if it's a string (from FormData)
                    parsedDisciplinaryRecords = typeof disciplinary_records === 'string' 
                        ? JSON.parse(disciplinary_records) 
                        : disciplinary_records;
                } catch (error) {
                    console.error('Error parsing disciplinary_records:', error);
                }
            }
            
            if (parsedDisciplinaryRecords && Array.isArray(parsedDisciplinaryRecords) && parsedDisciplinaryRecords.length > 0) {
                const insertDisciplinaryQuery = `
                    INSERT INTO employee_disciplinary (
                        employee_id, issue_date, letter_type, reason
                    ) VALUES (?, ?, ?, ?)
                `;
                
                for (const disciplinary of parsedDisciplinaryRecords) {
                    // Convert issue_date to date format for database
                    const issueDate = disciplinary.issue_date ? new Date(disciplinary.issue_date).toISOString().split('T')[0] : null;
                    
                    if (disciplinary.type_of_letter && disciplinary.reason && issueDate) {
                        const [result_disciplinary] = await connection.query(insertDisciplinaryQuery, [
                            employee_id,
                            issueDate,
                            disciplinary.type_of_letter,
                            disciplinary.reason
                        ]);
                        disciplinary_id_list.push(result_disciplinary.insertId);   
                        console.log(`🔹 Created disciplinary record: ${disciplinary.type_of_letter} for employee ${employee_id}`);
                    }
                }
            }
            
            // Update the superior's role to 'supervisor' if not already a manager
            if (superior) {
                // First check if the superior is already a manager
                const [superiorData] = await connection.query('SELECT role FROM employees WHERE id = ?', [superior]);
                
                if (superiorData.length > 0 && superiorData[0].role !== 'manager') {
                    const updateSuperiorQuery = `UPDATE employees SET role = 'supervisor' WHERE id = ?`;
                    await connection.query(updateSuperiorQuery, [superior]);
                    console.log(`🔹 Updated employee ID ${superior} role to 'supervisor'`);
                } else if (superiorData.length > 0) {
                    console.log(`🔹 Superior ID ${superior} already has role '${superiorData[0].role}', not changing to 'supervisor'`);
                }
            }
            
            // Get all active leave types for the company
            const [leaveTypes] = await connection.query(
                'SELECT * FROM leave_types WHERE company_id = ? AND is_active = 1', 
                [company_id]
            );
            
            console.log(`🔹 Found ${leaveTypes.length} active leave types for company ${company_id}`);
            
            // Create leave balance records for the employee
            const currentYear = new Date().getFullYear();
            
            for (const leaveType of leaveTypes) {
                const insertLeaveBalanceQuery = `
                    INSERT INTO leave_balances (
                        employee_id, leave_type_id, year, total_days, used_days, remaining_days,is_total,total_type,is_divident
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                let remaining_days;
                if (leaveType.is_total === 1 && leaveType.total_type === TotalType.ONCE_CONFIRMED && leaveType.is_divident === 0) {
                    remaining_days = 0;                                  
                } else if (leaveType.is_total === 1 && leaveType.total_type === TotalType.IMMEDIATE && leaveType.is_divident === 0) {
                    remaining_days = leaveType.max_days;
                } else if (leaveType.is_total === 0 && leaveType.is_divident === 1) {
                    remaining_days = 0;
                } else {
                    remaining_days = 0; // Default fallback
                }
                
                await connection.query(insertLeaveBalanceQuery, [
                    employee_id, 
                    leaveType.id.toString(),
                    currentYear,
                    leaveType.max_days,
                    0,
                    remaining_days,
                    leaveType.is_total,
                    leaveType.total_type,
                    leaveType.is_divident
                ]);
                
                console.log(`🔹 Created leave balance for employee ${employee_id}, leave type ${leaveType.id}`);
            }
            
            // 🔹 Handle document uploads from multiple modules
            const uploadedDocuments = await handleDocumentUploads(req, employee_id, connection,training_id_list,disciplinary_id_list);
            
            console.log(`🔹 Uploaded ${uploadedDocuments.length} documents for employee ${employee_id}`);
            
            // Commit the transaction
            await connection.commit();
            
            res.status(201).json({ 
                message: "Employee added successfully with leave balances", 
                employee_id: employee_id,
                leave_balances_created: leaveTypes.length,
                training_records_created: parsedTrainingRecords ? parsedTrainingRecords.length : 0,
                disciplinary_records_created: parsedDisciplinaryRecords ? parsedDisciplinaryRecords.length : 0,
                documents_uploaded: uploadedDocuments.length,
                uploaded_documents: uploadedDocuments
            });
        } catch (error) {
            // Rollback the transaction in case of error
            await connection.rollback();
            
            // Handle specific database errors
            if (error.code === 'ER_DUP_ENTRY') {
                if (error.message.includes('email')) {
                    throw new Error('Email address already exists');
                }
                if (error.message.includes('employee_no')) {
                    throw new Error('Employee number already exists');
                }
                throw new Error('Duplicate entry detected');
            }
            
            // Handle foreign key constraint errors
            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                if (error.message.includes('company_id')) {
                    throw new Error('Invalid company selected');
                }
                if (error.message.includes('department_id')) {
                    throw new Error('Invalid department selected');
                }
                if (error.message.includes('position_id')) {
                    throw new Error('Invalid position selected');
                }
                if (error.message.includes('manager_id')) {
                    throw new Error('Invalid manager selected');
                }
                throw new Error('Invalid reference data provided');
            }
            
            // Re-throw with original message for other errors
            throw error;
        } finally {
            // Release the connection
            connection.release();
        }
    } catch (error) {
        console.error("❌ Error adding employee:", error);
        
        // Return appropriate status code based on error type
        if (error.message.includes('already exists') || 
            error.message.includes('Duplicate entry') ||
            error.message.includes('Invalid')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    }
};


// Fetch all employees with filters
const getAllEmployees = async (req, res) => {
    const filters = req.query;
    //console.log("Filters received:", filters);

    try {
        // Build SELECT clause - exclude password when manager_id filter is present
        const selectFields = filters.manager_id ? 
            `e.id, e.name, e.email, e.salary, e.currency, e.leave_balance, e.company_id, 
             e.manager_id, e.role, e.joined_date, e.resigned_date, e.gender, e.employee_no, 
             e.employment_type, e.job_level, e.department, e.position, e.superior, e.office, 
             e.nationality, e.visa_expired_date, e.passport_expired_date, e.status, e.activation, 
             e.ic_passport, e.confirmation_date, e.marital_status, e.dob, e.age, e.mobile_number, 
             e.country_code, e.payment_company, e.pay_interval, e.payment_method, e.bank_name, 
             e.bank_currency, e.bank_account_name, e.bank_account_no, e.income_tax_no, 
             e.socso_account_no, e.epf_account_no, e.company, e.race, e.religion, e.attachment, 
             e.is_active, e.position_id, e.department_id, e.address, e.qualification, 
             e.education_level, e.emergency_contact_name, e.emergency_contact_relationship, 
             e.emergency_contact_phone, e.emergency_contact_email, e.is_superadmin, 
             e.current_position_start_date` 
            : `e.*`;

        let query = `
            SELECT 
                ${selectFields},
                c.name AS company_name,
                d.department_name,
                p.title AS position_title,
                p.job_level,
                c.name AS company_name,
                d.department_name
            FROM 
                employees e
            LEFT JOIN 
                companies c ON e.company_id = c.id
            LEFT JOIN
                departments d ON e.department_id = d.id
            LEFT JOIN
                positions p ON e.position_id = p.id
            WHERE 1=1`;

        let params = [];

        // Require at least 2 characters for name/email search
        if (filters.nameEmail && filters.nameEmail.length >= 2) {
            query += ` AND (e.name LIKE ? OR e.email LIKE ?)`;
            params.push(`%${filters.nameEmail}%`, `%${filters.nameEmail}%`);
        }

        if (filters.status) {
            query += ` AND e.status = ?`;
            params.push(filters.status);
        }

        if (filters.passportStart && filters.passportEnd) {
            query += ` AND e.passport_expired_date BETWEEN ? AND ?`;
            params.push(filters.passportStart, filters.passportEnd);
        }

        if (filters.department_id) {
            query += ` AND e.department_id = ?`;
            params.push(filters.department_id);
        }

        if (filters.nationality) {
            query += ` AND e.nationality = ?`;
            params.push(filters.nationality);
        }

        if (filters.visaStart && filters.visaEnd) {
            query += ` AND e.visa_expired_date BETWEEN ? AND ?`;
            params.push(filters.visaStart, filters.visaEnd);
        }

        if (filters.joinedDate) {
            query += ` AND e.joined_date = ?`;
            params.push(filters.joinedDate);
        }

        if (filters.resignedDate) {
            query += ` AND e.resigned_date = ?`;
            params.push(filters.resignedDate);
        }

        if (filters.position) {
            query += ` AND e.position = ?`;
            params.push(filters.position);
        }

        if (filters.jobLevel) {
            query += ` AND e.job_level = ?`;
            params.push(filters.jobLevel);
        }

        if (filters.company_id) {
            query += ` AND e.company_id = ?`;
            params.push(filters.company_id);
        }

        if (filters.type) {
            query += ` AND e.employment_type = ?`;
            params.push(filters.type);
        }

        if (filters.position_id) {
            query += ` AND e.position_id = ?`;
            params.push(filters.position_id);
        }

        if (filters.department_id) {
            query += ` AND e.department_id = ?`;
            params.push(filters.department_id);
        }

        if (filters.manager_id) {
            query += ` AND e.manager_id = ?`;
            params.push(filters.manager_id);
        }

        if(filters.role){
            query += ` AND e.role = ?`;
            params.push(filters.role);
        }

        // Add sorting
        query += ` ORDER BY e.name ASC`;
       console.log('Final query:', query);
        console.log('Query params:', params);
        const [results] = await dbPromise.query(query, params);
        res.json(results);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


const getEmployeeById = async (req, res) => {
  const { id } = req.params;

  const sql = `
SELECT
    e.*,
    d.department_name,
    edr.training_remarks,
    edr.disciplinary_remarks,

    /* ===== Schedule for today ===== */
    esd.schedule_date,
    esd.status        AS work_status,
    esd.start_time    AS start_work_time,
    esd.end_time      AS end_work_time,
    esd.break_mins    AS work_break,
    esd.overnight,
    esd.notes         AS work_notes,

    /* IDs to help the UI if needed */
    esd.template_id,
    st.name           AS template_name,
    st.label          AS template_label,

    esd.pattern_id,
    sp.name           AS pattern_name,

    /* ===== Public Holidays (event_type = 'holiday') ===== */
    EXISTS (
        SELECT 1
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type = 'holiday'
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS is_public_holiday_today,

    (
        SELECT COUNT(*)
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type = 'holiday'
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS public_holiday_count,

    (
        SELECT GROUP_CONCAT(DISTINCT ph.title ORDER BY ph.title SEPARATOR ', ')
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type = 'holiday'
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS public_holiday_titles,

    (
        SELECT GROUP_CONCAT(DISTINCT ph.description ORDER BY ph.title SEPARATOR ' | ')
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type = 'holiday'
          AND ph.description IS NOT NULL
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS public_holiday_descriptions,

    (
        SELECT JSON_ARRAYAGG(js) FROM (
            SELECT DISTINCT JSON_OBJECT(
                'id', ph.id,
                'title', ph.title,
                'description', ph.description,
                'event_type', ph.event_type,
                'is_global', ph.is_global
            ) AS js
            FROM public_holidays ph
            WHERE ph.holiday_date = CURDATE()
              AND ph.event_type = 'holiday'
              AND (
                    ph.is_global = 1
                 OR EXISTS (
                       SELECT 1
                       FROM public_holiday_companies phc
                       WHERE phc.holiday_id = ph.id
                         AND phc.company_id = e.company_id
                    )
              )
        ) t
    ) AS public_holidays_today_json,

    /* ===== Other Events (event_type <> 'holiday') ===== */
    (
        SELECT COUNT(*)
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type <> 'holiday'
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS event_count_today,

    (
        SELECT GROUP_CONCAT(DISTINCT ph.title ORDER BY ph.title SEPARATOR ', ')
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type <> 'holiday'
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS event_titles_today,

    (
        SELECT GROUP_CONCAT(DISTINCT ph.description ORDER BY ph.title SEPARATOR ' | ')
        FROM public_holidays ph
        WHERE ph.holiday_date = CURDATE()
          AND ph.event_type <> 'holiday'
          AND ph.description IS NOT NULL
          AND (
                ph.is_global = 1
             OR EXISTS (
                   SELECT 1
                   FROM public_holiday_companies phc
                   WHERE phc.holiday_id = ph.id
                     AND phc.company_id = e.company_id
                )
          )
    ) AS event_descriptions_today,

    (
        SELECT JSON_ARRAYAGG(js) FROM (
            SELECT DISTINCT JSON_OBJECT(
                'id', ph.id,
                'title', ph.title,
                'description', ph.description,
                'event_type', ph.event_type,
                'is_global', ph.is_global
            ) AS js
            FROM public_holidays ph
            WHERE ph.holiday_date = CURDATE()
              AND ph.event_type <> 'holiday'
              AND (
                    ph.is_global = 1
                 OR EXISTS (
                       SELECT 1
                       FROM public_holiday_companies phc
                       WHERE phc.holiday_id = ph.id
                         AND phc.company_id = e.company_id
                    )
              )
        ) t
    ) AS events_today_json,

    /* ===== Leave (latest; APPROVED > PENDING > REJECTED) ===== */
    (
        SELECT la.id
        FROM hrms_2.leave_applications la
        WHERE la.employee_id = e.id
          AND la.start_date <= CURDATE()
          AND la.end_date   >= CURDATE()
          AND la.status IN ('APPROVED','PENDING','REJECTED')
        ORDER BY FIELD(la.status,'APPROVED','PENDING','REJECTED'), la.id DESC
        LIMIT 1
    ) AS leave_id_today,

    (
        SELECT la.status
        FROM hrms_2.leave_applications la
        WHERE la.employee_id = e.id
          AND la.start_date <= CURDATE()
          AND la.end_date   >= CURDATE()
          AND la.status IN ('APPROVED','PENDING','REJECTED')
        ORDER BY FIELD(la.status,'APPROVED','PENDING','REJECTED'), la.id DESC
        LIMIT 1
    ) AS leave_status_today,

    (
        SELECT la.leave_type_id
        FROM hrms_2.leave_applications la
        WHERE la.employee_id = e.id
          AND la.start_date <= CURDATE()
          AND la.end_date   >= CURDATE()
          AND la.status IN ('APPROVED','PENDING','REJECTED')
        ORDER BY FIELD(la.status,'APPROVED','PENDING','REJECTED'), la.id DESC
        LIMIT 1
    ) AS leave_type_id_today,

    (
        SELECT la.duration
        FROM hrms_2.leave_applications la
        WHERE la.employee_id = e.id
          AND la.start_date <= CURDATE()
          AND la.end_date   >= CURDATE()
          AND la.status IN ('APPROVED','PENDING','REJECTED')
        ORDER BY FIELD(la.status,'APPROVED','PENDING','REJECTED'), la.id DESC
        LIMIT 1
    ) AS leave_duration_today,

    (
        SELECT la.reason
        FROM hrms_2.leave_applications la
        WHERE la.employee_id = e.id
          AND la.start_date <= CURDATE()
          AND la.end_date   >= CURDATE()
          AND la.status IN ('APPROVED','PENDING','REJECTED')
        ORDER BY FIELD(la.status,'APPROVED','PENDING','REJECTED'), la.id DESC
        LIMIT 1
    ) AS leave_reason_today

FROM employees e
LEFT JOIN departments d
       ON d.id = e.department_id
LEFT JOIN employee_document_remarks edr
       ON edr.employee_id = e.id

/* Today's schedule row */
LEFT JOIN employee_schedule_days esd
       ON esd.employee_id = e.id
      AND esd.schedule_date = CURDATE()

/* Names for template/pattern */
LEFT JOIN schedule_templates st
       ON st.id = esd.template_id
LEFT JOIN schedule_patterns sp
       ON sp.id = esd.pattern_id

WHERE e.id = ?`;

  try {
    const [rows] = await dbPromise.query(sql, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee:', err);
    res.status(500).json({ error: err.message });
  }
};


const updateEmployee1 = async (req, res) => {
    const { id } = req.params;
    
    // Handle both FormData and JSON body
    let updateData;
    let trainingRecordsData;
    let disciplinaryRecordsData;
    
    if (req.body.data) {
        // FormData from frontend
        updateData = JSON.parse(req.body.data);
        try {
            trainingRecordsData = JSON.parse(req.body.trainingRecordsData);
        } catch (error) {
            console.error('Error parsing trainingRecordsData:', error);
            trainingRecordsData = { trainingRecords: [], deletedTrainingRecords: [] };
        }
        try {
            disciplinaryRecordsData = JSON.parse(req.body.disciplinaryRecordsData);
        } catch (error) {
            console.error('Error parsing disciplinaryRecordsData:', error);
            disciplinaryRecordsData = { disciplinaryRecords: [], deletedDisciplinaryRecords: [] };
        }
    } else {
        // Regular JSON body (fallback)
        updateData = req.body;
        trainingRecordsData = { trainingRecords: [], deletedTrainingRecords: [] };
        disciplinaryRecordsData = { disciplinaryRecords: [], deletedDisciplinaryRecords: [] };
    }
    
    const { 
        name, email, salary, currency, leave_balance, company_id, role, 
        gender, employee_no, employment_type, job_level, position,
        superior, office, nationality, joined_date, resigned_date, visa_expired_date, 
        passport_expired_date, ic_passport, confirmation_date, marital_status, dob, 
        age, mobile_number, country_code, payment_company, pay_interval, payment_method, 
        bank_name, bank_currency, bank_account_name, bank_account_no, income_tax_no, 
        socso_account_no, epf_account_no, status, activation, race, religion, education_level, qualification,
        training_remarks, disciplinary_remarks, password, address, emergency_contact_name, 
        emergency_contact_relationship, emergency_contact_phone, emergency_contact_email, trainingRecords, deletedTrainingRecords
    } = updateData;

    // Handle manager_id separately to allow reassignment
    let manager_id = updateData.manager_id;
    let department_id = updateData.department_id;
    let position_id = updateData.position_id;
    try {
        // Get a connection for transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // Fetch the current employee data to get the previous superior
            const [currentEmployeeData] = await connection.query('SELECT * FROM employees WHERE id = ?', [id]);
            
            if (currentEmployeeData.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Employee not found' });
            }
            
            const previousSuperior = currentEmployeeData[0].superior;

            // Set role based on job_level
            let employeeRole = role;
            if (job_level === 'Manager') {
                employeeRole = 'manager';
                console.log(`🔹 Setting role to 'manager' for employee ID ${id} based on job_level`);
            }

            // Hash password if it's being updated
            let hashedPassword = password;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 12);
            }

            console.log("manager_id: ", manager_id);
            console.log("department_id: ", department_id);
            console.log("position_id: ", position_id);
            // Convert empty string values to null for database consistency
            manager_id = manager_id === '' ? null : manager_id;
            department_id = department_id === '' ? null : department_id;
            position_id = position_id === '' ? null : position_id;

            // Update the employee with new data
            const query = `
                UPDATE employees 
                SET name = ?, email = ?, salary = ?, currency = ?, leave_balance = ?, 
                    company_id = ?, manager_id = ?, role = ?, gender = ?, 
                    employee_no = ?, employment_type = ?, job_level = ?, department_id = ?, 
                    position = ?, position_id = ?, superior = ?, office = ?, nationality = ?, 
                    joined_date = ?, resigned_date = ?, visa_expired_date = ?, 
                    passport_expired_date = ?, ic_passport = ?, confirmation_date = ?, 
                    marital_status = ?, dob = ?, age = ?, mobile_number = ?, 
                    country_code = ?, payment_company = ?, pay_interval = ?, 
                    payment_method = ?, bank_name = ?, bank_currency = ?, 
                    bank_account_name = ?, bank_account_no = ?, income_tax_no = ?, 
                    socso_account_no = ?, epf_account_no = ?, status = ?, activation = ?,
                    race = ?, religion = ?, education_level = ?, qualification = ?,
                    address = ?, emergency_contact_name = ?, emergency_contact_relationship = ?, 
                    emergency_contact_phone = ?, emergency_contact_email = ?, password = ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [
                name, email, salary, currency, leave_balance, company_id, manager_id, employeeRole, 
                gender, employee_no, employment_type, job_level, department_id, position, position_id,
                superior, office, nationality, formatDateToMySQL(joined_date), resigned_date, visa_expired_date, 
                passport_expired_date, ic_passport, confirmation_date, marital_status, dob, 
                age, mobile_number, country_code, payment_company, pay_interval, payment_method, 
                bank_name, bank_currency, bank_account_name, bank_account_no, income_tax_no, 
                socso_account_no, epf_account_no, status, activation, race, religion, education_level, qualification, 
                address || null, emergency_contact_name || null, emergency_contact_relationship || null, 
                emergency_contact_phone || null, emergency_contact_email || null, hashedPassword, id
            ]);

            if (result.affectedRows === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Employee not found' });
            }

            const previous_confirmation_date = currentEmployeeData[0].confirmation_date;
            if(previous_confirmation_date == null && confirmation_date != null){
                const [selectLeaveBalance] = await connection.query('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?', [
                    id,
                    new Date().getFullYear()
                ]);

                if(selectLeaveBalance.length > 0){
                    for(const leaveBalance of selectLeaveBalance){
                        if(leaveBalance.is_total === 1 && leaveBalance.total_type == TotalType.ONCE_CONFIRMED && leaveBalance.remaining_days == 0){
                            await connection.query('UPDATE leave_balances SET remaining_days = ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?', [
                                leaveBalance.total_days,
                                id,
                                leaveBalance.leave_type_id,
                                new Date().getFullYear()
                            ]);
                        }
                    }
                }
            }


            // 🔹 Update employee document remarks
            const remarksQuery = `
                INSERT INTO employee_document_remarks (employee_id, training_remarks, disciplinary_remarks)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                training_remarks = VALUES(training_remarks),
                disciplinary_remarks = VALUES(disciplinary_remarks)
            `;
            
            await connection.query(remarksQuery, [
                id,
                training_remarks || null,
                disciplinary_remarks || null
            ]);

            // 🔹 Process training records updates
            console.log('🔹 Processing training records:', trainingRecordsData);
            
            // Delete training records marked for deletion
            if (trainingRecordsData.deletedTrainingRecords && trainingRecordsData.deletedTrainingRecords.length > 0) {
                for (const deletedId of trainingRecordsData.deletedTrainingRecords) {
                    // Delete associated documents first
                    await connection.query(
                        'DELETE FROM employee_documents WHERE related_type = ? AND related_id = ?',
                        ['employee', deletedId]
                    );
                    
                    // Delete training record
                    await connection.query('DELETE FROM training WHERE id = ?', [deletedId]);
                    console.log(`🔹 Deleted training record ID: ${deletedId}`);
                }
            }
            
            // Process training records (updates and new records)
            let trainingIdNewList = [];
            if (trainingRecordsData.trainingRecords && trainingRecordsData.trainingRecords.length > 0) {
                for (const [index, trainingRecord] of trainingRecordsData.trainingRecords.entries()) {
                    if (trainingRecord.isNew) {
                        // // Insert new training record
                        // const insertTrainingQuery = `
                        //     INSERT INTO training (
                        //         employee_id, training_course, start_datetime, end_datetime, venue, status
                        //     ) VALUES (?, ?, ?, ?, ?, ?)
                        // `;
                        
                        // const [result] = await connection.query(insertTrainingQuery, [
                        //     id,
                        //     trainingRecord.training_course,
                        //     new Date(trainingRecord.start_datetime),
                        //     new Date(trainingRecord.end_datetime),
                        //     trainingRecord.venue || null,
                        //     trainingRecord.status || 'pending'
                        // ]);

const insertTrainingQuery = `
    INSERT INTO training (
        employee_id, training_course, start_datetime, end_datetime, venue, status,
        has_bond, bond_period_months, bond_start_date, bond_end_date, bond_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const [result] = await connection.query(insertTrainingQuery, [
    id,
    trainingRecord.training_course,
    new Date(trainingRecord.start_datetime),
    new Date(trainingRecord.end_datetime),
    trainingRecord.venue || null,
    trainingRecord.status || 'pending',
    trainingRecord.has_bond || 0,
    trainingRecord.bond_period_months || null,
    trainingRecord.bond_start_date || null,
    trainingRecord.bond_end_date || null,
    trainingRecord.bond_status || null
]);

                        trainingIdNewList.push(result.insertId);
                        console.log(`🔹 Created new training record: ${trainingRecord.training_course} with ID: ${result.insertId}`);
                    } else {
                        // Update existing training record
                        // const updateTrainingQuery = `
                        //     UPDATE training 
                        //     SET training_course = ?, start_datetime = ?, end_datetime = ?, venue = ?, status = ?
                        //     WHERE id = ? AND employee_id = ?
                        // `;
                        
                        // await connection.query(updateTrainingQuery, [
                        //     trainingRecord.training_course,
                        //     new Date(trainingRecord.start_datetime),
                        //     new Date(trainingRecord.end_datetime),
                        //     trainingRecord.venue || null,
                        //     trainingRecord.status || 'Pending',
                        //     trainingRecord.id,
                        //     id
                        // ]);

const updateTrainingQuery = `
    UPDATE training 
    SET training_course = ?, start_datetime = ?, end_datetime = ?, venue = ?, status = ?,
        has_bond = ?, bond_period_months = ?, bond_start_date = ?, bond_end_date = ?, bond_status = ?
    WHERE id = ? AND employee_id = ?
`;


await connection.query(updateTrainingQuery, [
    trainingRecord.training_course,
    new Date(trainingRecord.start_datetime),
    new Date(trainingRecord.end_datetime),
    trainingRecord.venue || null,
    trainingRecord.status || 'Pending',
    trainingRecord.has_bond ? 1 : 0,
    trainingRecord.bond_period_months || null,
    trainingRecord.bond_start_date ? new Date(trainingRecord.bond_start_date) : null,
    trainingRecord.bond_end_date ? new Date(trainingRecord.bond_end_date) : null,
    trainingRecord.bond_status || null,
    trainingRecord.id,
    id
]);

                        
                        console.log(`🔹 Updated training record: ${trainingRecord.training_course} with ID: ${trainingRecord.id}`);
                    }
                }
            }
            
            // 🔹 Process disciplinary records updates
            console.log('🔹 Processing disciplinary records:', disciplinaryRecordsData);
            
            // Delete disciplinary records marked for deletion
            if (disciplinaryRecordsData.deletedDisciplinaryRecords && disciplinaryRecordsData.deletedDisciplinaryRecords.length > 0) {
                for (const deletedId of disciplinaryRecordsData.deletedDisciplinaryRecords) {
                    // Delete associated documents first
                    await connection.query(
                        'DELETE FROM employee_documents WHERE related_type = ? AND related_id = ?',
                        ['disciplinary', deletedId]
                    );
                    
                    // Delete disciplinary record
                    await connection.query('DELETE FROM employee_disciplinary WHERE id = ?', [deletedId]);
                    console.log(`🔹 Deleted disciplinary record ID: ${deletedId}`);
                }
            }
            
            // Process disciplinary records (updates and new records)
            let disciplinaryIdNewList = [];
            if (disciplinaryRecordsData.disciplinaryRecords && disciplinaryRecordsData.disciplinaryRecords.length > 0) {
                for (const [index, disciplinaryRecord] of disciplinaryRecordsData.disciplinaryRecords.entries()) {
                    if (disciplinaryRecord.isNew) {
                        // Insert new disciplinary record
                        const insertDisciplinaryQuery = `
                            INSERT INTO employee_disciplinary (
                                employee_id, issue_date, letter_type, reason
                            ) VALUES (?, ?, ?, ?)
                        `;
                        
                        const [result] = await connection.query(insertDisciplinaryQuery, [
                            id,
                            disciplinaryRecord.issue_date ? new Date(disciplinaryRecord.issue_date) : null,
                            disciplinaryRecord.type_of_letter,
                            disciplinaryRecord.reason
                        ]);
                        disciplinaryIdNewList.push(result.insertId);
                        console.log(`🔹 Created new disciplinary record: ${disciplinaryRecord.type_of_letter} with ID: ${result.insertId}`);
                    } else {
                        // Update existing disciplinary record
                        const updateDisciplinaryQuery = `
                            UPDATE employee_disciplinary 
                            SET issue_date = ?, letter_type = ?, reason = ?
                            WHERE id = ? AND employee_id = ?
                        `;
                        
                        await connection.query(updateDisciplinaryQuery, [
                            new Date(disciplinaryRecord.issue_date),
                            disciplinaryRecord.type_of_letter,
                            disciplinaryRecord.reason,
                            disciplinaryRecord.id,
                            id
                        ]);
                        
                        console.log(`🔹 Updated disciplinary record: ${disciplinaryRecord.type_of_letter} with ID: ${disciplinaryRecord.id}`);
                    }
                }
            }

            // Handle document uploads if there are files
            let uploadedDocuments = [];
            if (req.files && Object.keys(req.files).length > 0) {
                console.log(`🔹 Processing document uploads for new training record ${trainingIdNewList} and disciplinary record ${disciplinaryIdNewList}`);
                
                // Pass both training and disciplinary IDs for document upload handling
                uploadedDocuments = await handleDocumentUploads(req, id, connection, trainingIdNewList, disciplinaryIdNewList);
                
                console.log(`🔹 Uploaded ${uploadedDocuments.length} documents for training and disciplinary records`);
            }

            // Update the new superior's role to 'supervisor' if different from previous and not a manager
            if (superior && superior !== previousSuperior) {
                // First check if the superior is already a manager
                const [superiorData] = await connection.query('SELECT role FROM employees WHERE id = ?', [superior]);
                
                if (superiorData.length > 0 && superiorData[0].role !== 'manager') {
                    const updateSuperiorQuery = `UPDATE employees SET role = 'supervisor' WHERE id = ?`;
                    await connection.query(updateSuperiorQuery, [superior]);
                    console.log(`🔹 Updated employee ID ${superior} role to 'supervisor'`);
                } else if (superiorData.length > 0) {
                    console.log(`🔹 Superior ID ${superior} already has role '${superiorData[0].role}', not changing to 'supervisor'`);
                }
            }

            // Check if previous superior still has any employees reporting to them
            if (previousSuperior && previousSuperior !== superior) {
                const checkPreviousSuperiorQuery = `SELECT COUNT(*) as subordinate_count FROM employees WHERE superior = ? AND id != ?`;
                const [subordinatesResult] = await connection.query(checkPreviousSuperiorQuery, [previousSuperior, id]);
                
                // If no other employees report to previous superior, change role back to 'employee'
                if (subordinatesResult[0].subordinate_count === 0) {
                    // Check previous superior's job_level to ensure we don't demote a manager
                    const [previousSuperiorData] = await connection.query('SELECT role, job_level FROM employees WHERE id = ?', [previousSuperior]);
                    
                    if (previousSuperiorData.length > 0 && previousSuperiorData[0].role !== 'manager') {
                        const updatePreviousSuperiorQuery = `UPDATE employees SET role = 'employee' WHERE id = ?`;
                        await connection.query(updatePreviousSuperiorQuery, [previousSuperior]);
                        console.log(`🔹 Changed previous superior (ID: ${previousSuperior}) role back to 'employee' as they no longer have subordinates`);
                    } else if (previousSuperiorData.length > 0) {
                        console.log(`🔹 Previous superior (ID: ${previousSuperior}) has role '${previousSuperiorData[0].role}', keeping this role instead of demoting`);
                    }
                }
            }

            await connection.commit();
            connection.release();
            res.json({ message: 'Employee updated successfully' });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateEmployee = async (req, res) => {
    console.log('🚀 === UPDATE EMPLOYEE TRANSACTION STARTED ===');
    console.log('📥 Request Params:', req.params);
    console.log('📥 Request Body Keys:', Object.keys(req.body));
    console.log('📥 Request Files:', req.files ? Object.keys(req.files) : 'No files');
    
    const { id } = req.params;
    console.log('🔍 Employee ID to update:', id);
    
    // Handle both FormData and JSON body
    let updateData;
    let trainingRecordsData;
    let disciplinaryRecordsData;
    
    if (req.body.data) {
        console.log('📦 FormData detected - parsing JSON data');
        // FormData from frontend
        updateData = JSON.parse(req.body.data);
        console.log('✅ Parsed updateData keys:', Object.keys(updateData));
        
        try {
            trainingRecordsData = JSON.parse(req.body.trainingRecordsData);
            console.log('✅ Parsed trainingRecordsData:', {
                trainingRecords: trainingRecordsData.trainingRecords?.length || 0,
                deletedTrainingRecords: trainingRecordsData.deletedTrainingRecords?.length || 0
            });
        } catch (error) {
            console.error('❌ Error parsing trainingRecordsData:', error);
            trainingRecordsData = { trainingRecords: [], deletedTrainingRecords: [] };
        }
        
        try {
            disciplinaryRecordsData = JSON.parse(req.body.disciplinaryRecordsData);
            console.log('✅ Parsed disciplinaryRecordsData:', {
                disciplinaryRecords: disciplinaryRecordsData.disciplinaryRecords?.length || 0,
                deletedDisciplinaryRecords: disciplinaryRecordsData.deletedDisciplinaryRecords?.length || 0
            });
        } catch (error) {
            console.error('❌ Error parsing disciplinaryRecordsData:', error);
            disciplinaryRecordsData = { disciplinaryRecords: [], deletedDisciplinaryRecords: [] };
        }
    } else {
        console.log('📦 Regular JSON body detected');
        // Regular JSON body (fallback)
        updateData = req.body;
        trainingRecordsData = { trainingRecords: [], deletedTrainingRecords: [] };
        disciplinaryRecordsData = { disciplinaryRecords: [], deletedDisciplinaryRecords: [] };
        console.log('✅ UpdateData keys:', Object.keys(updateData));
    }
    
    const { 
        name, email, salary, currency, leave_balance, company_id, role, 
        gender, employee_no, employment_type, job_level, position,
        superior, office, nationality, joined_date, resigned_date, resignation_reason, visa_expired_date, 
        passport_expired_date, ic_passport, confirmation_date, marital_status, dob, 
        age, mobile_number, country_code, payment_company, pay_interval, payment_method, 
        bank_name, bank_currency, bank_account_name, bank_account_no, income_tax_no, 
        socso_account_no, epf_account_no, status, activation, race, religion, education_level, qualification,
        training_remarks, disciplinary_remarks, password, address, emergency_contact_name, 
        emergency_contact_relationship, emergency_contact_phone, emergency_contact_email, trainingRecords, deletedTrainingRecords
    } = updateData;

    console.log('📋 Extracted Employee Data:', {
        name, email, salary, currency, leave_balance, company_id, role,
        gender, employee_no, employment_type, job_level, position,
        superior, office, nationality, joined_date, resigned_date,
        confirmation_date, marital_status, dob, age, mobile_number,
        status, activation, hasPassword: !!password
    });

    // Handle manager_id separately to allow reassignment
    let manager_id = updateData.manager_id;
    let department_id = updateData.department_id;
    let position_id = updateData.position_id;
    
    console.log('🏢 ID Assignments Before Processing:', {
        manager_id: manager_id,
        department_id: department_id,
        position_id: position_id
    });
    
    try {
        console.log('🔗 Getting database connection...');
        // Get a connection for transaction
        const connection = await dbPromise.getConnection();
        console.log('✅ Database connection acquired');
        
        console.log('🔄 Starting transaction...');
        await connection.beginTransaction();
        console.log('✅ Transaction started successfully');

        try {
            console.log('📊 Fetching current employee data...');
            // Fetch the current employee data to get the previous superior
            const [currentEmployeeData] = await connection.query('SELECT * FROM employees WHERE id = ?', [id]);
            
            if (currentEmployeeData.length === 0) {
                console.log('❌ Employee not found with ID:', id);
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Employee not found' });
            }
            
            console.log('✅ Current employee data retrieved:', {
                currentName: currentEmployeeData[0].name,
                currentSuperior: currentEmployeeData[0].superior,
                currentRole: currentEmployeeData[0].role,
                currentJobLevel: currentEmployeeData[0].job_level,
                currentConfirmationDate: currentEmployeeData[0].confirmation_date
            });
            
            const previousSuperior = currentEmployeeData[0].superior;
            console.log('👥 Previous superior ID:', previousSuperior);

            // Set role based on job_level
            let employeeRole = role;
            if (job_level === 'Manager') {
                employeeRole = 'manager';
                console.log(`🔹 Setting role to 'manager' for employee ID ${id} based on job_level`);
            }
            console.log('👤 Final employee role:', employeeRole);

            // Hash password if it's being updated
            let hashedPassword = password;
            if (password) {
                console.log('🔐 Hashing new password...');
                hashedPassword = await bcrypt.hash(password, 12);
                console.log('✅ Password hashed successfully');
            }

            console.log("🏢 ID values before null conversion:");
            console.log("manager_id: ", manager_id);
            console.log("department_id: ", department_id);
            console.log("position_id: ", position_id);
            
            // Convert empty string values to null for database consistency
            manager_id = manager_id === '' ? null : manager_id;
            department_id = department_id === '' ? null : department_id;
            position_id = position_id === '' ? null : position_id;
            
            console.log("🏢 ID values after null conversion:");
            console.log("manager_id: ", manager_id);
            console.log("department_id: ", department_id);
            console.log("position_id: ", position_id);

            console.log('📝 Preparing to update employee with query parameters...');
            // Update the employee with new data
            const query = `
                UPDATE employees 
                SET name = ?, email = ?, salary = ?, currency = ?, leave_balance = ?, 
                    company_id = ?, manager_id = ?, role = ?, gender = ?, 
                    employee_no = ?, employment_type = ?, job_level = ?, department_id = ?, 
                    position = ?, position_id = ?, superior = ?, office = ?, nationality = ?, 
                    joined_date = ?, resigned_date = ?,  resignation_reason = ?, visa_expired_date = ?, 
                    passport_expired_date = ?, ic_passport = ?, confirmation_date = ?, 
                    marital_status = ?, dob = ?, age = ?, mobile_number = ?, 
                    country_code = ?, payment_company = ?, pay_interval = ?, 
                    payment_method = ?, bank_name = ?, bank_currency = ?, 
                    bank_account_name = ?, bank_account_no = ?, income_tax_no = ?, 
                    socso_account_no = ?, epf_account_no = ?, status = ?, activation = ?,
                    race = ?, religion = ?, education_level = ?, qualification = ?,
                    address = ?, emergency_contact_name = ?, emergency_contact_relationship = ?, 
                    emergency_contact_phone = ?, emergency_contact_email = ?, password = ?
                WHERE id = ?
            `;
            
    const queryParams = [
    name,
    email,
    salary,
    currency,
    leave_balance,
    company_id,
    manager_id,
    employeeRole,
    gender,
    employee_no,
    employment_type,
    job_level,
    department_id,
    position,
    position_id,
    superior,
    office,
    nationality,
    formatDateToMySQL(joined_date),
    formatDateToMySQL(resigned_date),
    resignation_reason,   
    formatDateToMySQL(visa_expired_date),
    formatDateToMySQL(passport_expired_date),
    ic_passport,
    formatDateToMySQL(confirmation_date),
    marital_status,
    formatDateToMySQL(dob),
    age,
    mobile_number,
    country_code,
    payment_company,
    pay_interval,
    payment_method,
    bank_name,
    bank_currency,
    bank_account_name,
    bank_account_no,
    income_tax_no,
    socso_account_no,
    epf_account_no,
    status,
    activation,
    race,
    religion,
    education_level,
    qualification,
    address || null,
    emergency_contact_name || null,
    emergency_contact_relationship || null,
    emergency_contact_phone || null,
    emergency_contact_email || null,
    hashedPassword,
    id
];

            
            console.log('📊 Query parameters for employee update:', {
                paramCount: queryParams.length,
                employeeId: id,
                hasPassword: !!hashedPassword,
                managerId: manager_id,
                departmentId: department_id,
                positionId: position_id,
                superior: superior
            });

            console.log('🔄 Executing employee update query...');
            const [result] = await connection.query(query, queryParams);
            
            console.log('✅ Employee update result:', {
                affectedRows: result.affectedRows,
                changedRows: result.changedRows,
                warningCount: result.warningCount
            });

            if (result.affectedRows === 0) {
                console.log('❌ No rows affected - Employee not found');
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Employee not found' });
            }

            // Check confirmation date logic
            const previous_confirmation_date = currentEmployeeData[0].confirmation_date;
            console.log('📅 Confirmation date check:', {
                previousConfirmationDate: previous_confirmation_date,
                newConfirmationDate: confirmation_date,
                shouldProcessLeaveBalance: previous_confirmation_date == null && confirmation_date != null
            });
            
            if(previous_confirmation_date == null && confirmation_date != null){
                console.log('🏖️ Processing leave balance for newly confirmed employee...');
                const [selectLeaveBalance] = await connection.query('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?', [
                    id,
                    new Date().getFullYear()
                ]);

                console.log('📊 Leave balance records found:', selectLeaveBalance.length);

                if(selectLeaveBalance.length > 0){
                    for(const leaveBalance of selectLeaveBalance){
                        console.log('🔍 Processing leave balance record:', {
                            leaveTypeId: leaveBalance.leave_type_id,
                            isTotal: leaveBalance.is_total,
                            totalType: leaveBalance.total_type,
                            remainingDays: leaveBalance.remaining_days,
                            totalDays: leaveBalance.total_days
                        });
                        
                        if(leaveBalance.is_total === 1 && leaveBalance.total_type == TotalType.ONCE_CONFIRMED && leaveBalance.remaining_days == 0){
                            console.log('🔄 Updating leave balance for confirmed employee...');
                            await connection.query('UPDATE leave_balances SET remaining_days = ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?', [
                                leaveBalance.total_days,
                                id,
                                leaveBalance.leave_type_id,
                                new Date().getFullYear()
                            ]);
                            console.log('✅ Leave balance updated for leave type:', leaveBalance.leave_type_id);
                        }
                    }
                }
            }

            // 🔹 Update employee document remarks
            console.log('📝 Updating document remarks...');
            const remarksQuery = `
                INSERT INTO employee_document_remarks (employee_id, training_remarks, disciplinary_remarks)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                training_remarks = VALUES(training_remarks),
                disciplinary_remarks = VALUES(disciplinary_remarks)
            `;
            
            console.log('📊 Remarks data:', {
                employeeId: id,
                trainingRemarks: training_remarks || 'null',
                disciplinaryRemarks: disciplinary_remarks || 'null'
            });
            
            await connection.query(remarksQuery, [
                id,
                training_remarks || null,
                disciplinary_remarks || null
            ]);
            console.log('✅ Document remarks updated successfully');

            // 🔹 Process training records updates
            console.log('🎓 === PROCESSING TRAINING RECORDS ===');
            console.log('📊 Training records data:', trainingRecordsData);
            
            // Delete training records marked for deletion
            if (trainingRecordsData.deletedTrainingRecords && trainingRecordsData.deletedTrainingRecords.length > 0) {
                console.log('🗑️ Deleting training records:', trainingRecordsData.deletedTrainingRecords);
                for (const deletedId of trainingRecordsData.deletedTrainingRecords) {
                    console.log(`🔄 Deleting documents for training record ID: ${deletedId}`);
                    // Delete associated documents first
                    await connection.query(
                        'DELETE FROM employee_documents WHERE related_type = ? AND related_id = ?',
                        ['employee', deletedId]
                    );
                    
                    console.log(`🔄 Deleting training record ID: ${deletedId}`);
                    // Delete training record
                    await connection.query('DELETE FROM training WHERE id = ?', [deletedId]);
                    console.log(`✅ Deleted training record ID: ${deletedId}`);
                }
            }
            
            // Process training records (updates and new records)
            let trainingIdNewList = [];
            if (trainingRecordsData.trainingRecords && trainingRecordsData.trainingRecords.length > 0) {
                console.log(`📝 Processing ${trainingRecordsData.trainingRecords.length} training records...`);
                
                for (const [index, trainingRecord] of trainingRecordsData.trainingRecords.entries()) {
                    console.log(`🔄 Processing training record ${index + 1}:`, {
                        isNew: trainingRecord.isNew,
                        course: trainingRecord.training_course,
                        startDate: trainingRecord.start_datetime,
                        endDate: trainingRecord.end_datetime,
                        venue: trainingRecord.venue,
                        status: trainingRecord.status,
                        hasBond: trainingRecord.has_bond,
                        bondPeriod: trainingRecord.bond_period_months
                    });
                    
                    if (trainingRecord.isNew) {
                        console.log(`➕ Creating new training record for course: ${trainingRecord.training_course}`);
                        
                        const insertTrainingQuery = `
                            INSERT INTO training (
                                employee_id, training_course, start_datetime, end_datetime, venue, status,
                                has_bond, bond_period_months, bond_start_date, bond_end_date, bond_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        const insertParams = [
                            id,
                            trainingRecord.training_course,
                            new Date(trainingRecord.start_datetime),
                            new Date(trainingRecord.end_datetime),
                            trainingRecord.venue || null,
                            trainingRecord.status || 'pending',
                            trainingRecord.has_bond || 0,
                            trainingRecord.bond_period_months || null,
                            trainingRecord.bond_start_date || null,
                            trainingRecord.bond_end_date || null,
                            trainingRecord.bond_status || null
                        ];
                        
                        console.log('📊 Insert training parameters:', insertParams);
                        const [result] = await connection.query(insertTrainingQuery, insertParams);

                        trainingIdNewList.push(result.insertId);
                        console.log(`✅ Created new training record: ${trainingRecord.training_course} with ID: ${result.insertId}`);
                    } else {
                        console.log(`🔄 Updating existing training record ID: ${trainingRecord.id}`);
                        
                        const updateTrainingQuery = `
                            UPDATE training 
                            SET training_course = ?, start_datetime = ?, end_datetime = ?, venue = ?, status = ?,
                                has_bond = ?, bond_period_months = ?, bond_start_date = ?, bond_end_date = ?, bond_status = ?
                            WHERE id = ? AND employee_id = ?
                        `;

                        const updateParams = [
                            trainingRecord.training_course,
                            new Date(trainingRecord.start_datetime),
                            new Date(trainingRecord.end_datetime),
                            trainingRecord.venue || null,
                            trainingRecord.status || 'Pending',
                            trainingRecord.has_bond ? 1 : 0,
                            trainingRecord.bond_period_months || null,
                            trainingRecord.bond_start_date ? new Date(trainingRecord.bond_start_date) : null,
                            trainingRecord.bond_end_date ? new Date(trainingRecord.bond_end_date) : null,
                            trainingRecord.bond_status || null,
                            trainingRecord.id,
                            id
                        ];
                        
                        console.log('📊 Update training parameters:', updateParams);
                        await connection.query(updateTrainingQuery, updateParams);
                        
                        console.log(`✅ Updated training record: ${trainingRecord.training_course} with ID: ${trainingRecord.id}`);
                    }
                }
            }
            
            console.log('✅ Training records processing completed. New training IDs:', trainingIdNewList);
            
            // 🔹 Process disciplinary records updates
            console.log('⚖️ === PROCESSING DISCIPLINARY RECORDS ===');
            console.log('📊 Disciplinary records data:', disciplinaryRecordsData);
            
            // Delete disciplinary records marked for deletion
            if (disciplinaryRecordsData.deletedDisciplinaryRecords && disciplinaryRecordsData.deletedDisciplinaryRecords.length > 0) {
                console.log('🗑️ Deleting disciplinary records:', disciplinaryRecordsData.deletedDisciplinaryRecords);
                for (const deletedId of disciplinaryRecordsData.deletedDisciplinaryRecords) {
                    console.log(`🔄 Deleting documents for disciplinary record ID: ${deletedId}`);
                    // Delete associated documents first
                    await connection.query(
                        'DELETE FROM employee_documents WHERE related_type = ? AND related_id = ?',
                        ['disciplinary', deletedId]
                    );
                    
                    console.log(`🔄 Deleting disciplinary record ID: ${deletedId}`);
                    // Delete disciplinary record
                    await connection.query('DELETE FROM employee_disciplinary WHERE id = ?', [deletedId]);
                    console.log(`✅ Deleted disciplinary record ID: ${deletedId}`);
                }
            }
            
            // Process disciplinary records (updates and new records)
            let disciplinaryIdNewList = [];
            if (disciplinaryRecordsData.disciplinaryRecords && disciplinaryRecordsData.disciplinaryRecords.length > 0) {
                console.log(`📝 Processing ${disciplinaryRecordsData.disciplinaryRecords.length} disciplinary records...`);
                
                for (const [index, disciplinaryRecord] of disciplinaryRecordsData.disciplinaryRecords.entries()) {
                    console.log(`🔄 Processing disciplinary record ${index + 1}:`, {
                        isNew: disciplinaryRecord.isNew,
                        issueDate: disciplinaryRecord.issue_date,
                        letterType: disciplinaryRecord.type_of_letter,
                        reason: disciplinaryRecord.reason
                    });
                    
                    if (disciplinaryRecord.isNew) {
                        console.log(`➕ Creating new disciplinary record: ${disciplinaryRecord.type_of_letter}`);
                        
                        // Insert new disciplinary record
                        const insertDisciplinaryQuery = `
                            INSERT INTO employee_disciplinary (
                                employee_id, issue_date, letter_type, reason
                            ) VALUES (?, ?, ?, ?)
                        `;
                        
                        const insertParams = [
                            id,
                            disciplinaryRecord.issue_date ? new Date(disciplinaryRecord.issue_date) : null,
                            disciplinaryRecord.type_of_letter,
                            disciplinaryRecord.reason
                        ];
                        
                        console.log('📊 Insert disciplinary parameters:', insertParams);
                        const [result] = await connection.query(insertDisciplinaryQuery, insertParams);
                        
                        disciplinaryIdNewList.push(result.insertId);
                        console.log(`✅ Created new disciplinary record: ${disciplinaryRecord.type_of_letter} with ID: ${result.insertId}`);
                    } else {
                        console.log(`🔄 Updating existing disciplinary record ID: ${disciplinaryRecord.id}`);
                        
                        // Update existing disciplinary record
                        const updateDisciplinaryQuery = `
                            UPDATE employee_disciplinary 
                            SET issue_date = ?, letter_type = ?, reason = ?
                            WHERE id = ? AND employee_id = ?
                        `;
                        
                        const updateParams = [
                            new Date(disciplinaryRecord.issue_date),
                            disciplinaryRecord.type_of_letter,
                            disciplinaryRecord.reason,
                            disciplinaryRecord.id,
                            id
                        ];
                        
                        console.log('📊 Update disciplinary parameters:', updateParams);
                        await connection.query(updateDisciplinaryQuery, updateParams);
                        
                        console.log(`✅ Updated disciplinary record: ${disciplinaryRecord.type_of_letter} with ID: ${disciplinaryRecord.id}`);
                    }
                }
            }
            
            console.log('✅ Disciplinary records processing completed. New disciplinary IDs:', disciplinaryIdNewList);

            // Handle document uploads if there are files
            let uploadedDocuments = [];
            if (req.files && Object.keys(req.files).length > 0) {
                console.log('📁 === PROCESSING DOCUMENT UPLOADS ===');
                console.log(`📊 Files to upload: ${Object.keys(req.files).length}`);
                console.log(`🎓 New training IDs for documents: ${trainingIdNewList}`);
                console.log(`⚖️ New disciplinary IDs for documents: ${disciplinaryIdNewList}`);
                
                // Pass both training and disciplinary IDs for document upload handling
                uploadedDocuments = await handleDocumentUploads(req, id, connection, trainingIdNewList, disciplinaryIdNewList);
                
                console.log(`✅ Uploaded ${uploadedDocuments.length} documents for training and disciplinary records`);
                console.log('📋 Uploaded documents:', uploadedDocuments);
            } else {
                console.log('📁 No files to upload');
            }

            // Update the new superior's role to 'supervisor' if different from previous and not a manager
            console.log('👥 === PROCESSING SUPERIOR ROLE UPDATES ===');
            console.log(`📊 Superior comparison: previous=${previousSuperior}, new=${superior}`);
            
            if (superior && superior !== previousSuperior) {
                console.log(`🔄 Processing new superior ID: ${superior}`);
                // First check if the superior is already a manager
                const [superiorData] = await connection.query('SELECT role FROM employees WHERE id = ?', [superior]);
                
                console.log('📊 Superior data retrieved:', superiorData);
                
                if (superiorData.length > 0 && superiorData[0].role !== 'manager') {
                    console.log(`🔄 Updating superior role from '${superiorData[0].role}' to 'supervisor'`);
                    const updateSuperiorQuery = `UPDATE employees SET role = 'supervisor' WHERE id = ?`;
                    await connection.query(updateSuperiorQuery, [superior]);
                    console.log(`✅ Updated employee ID ${superior} role to 'supervisor'`);
                } else if (superiorData.length > 0) {
                    console.log(`🔹 Superior ID ${superior} already has role '${superiorData[0].role}', not changing to 'supervisor'`);
                } else {
                    console.log(`❌ Superior ID ${superior} not found in database`);
                }
            }

            // Check if previous superior still has any employees reporting to them
            if (previousSuperior && previousSuperior !== superior) {
                console.log(`🔍 Checking subordinates for previous superior ID: ${previousSuperior}`);
                const checkPreviousSuperiorQuery = `SELECT COUNT(*) as subordinate_count FROM employees WHERE superior = ? AND id != ?`;
                const [subordinatesResult] = await connection.query(checkPreviousSuperiorQuery, [previousSuperior, id]);
                
                console.log('📊 Previous superior subordinate count:', subordinatesResult[0].subordinate_count);
                
                // If no other employees report to previous superior, change role back to 'employee'
                if (subordinatesResult[0].subordinate_count === 0) {
                    console.log(`🔄 Previous superior has no subordinates, checking role...`);
                    // Check previous superior's job_level to ensure we don't demote a manager
                    const [previousSuperiorData] = await connection.query('SELECT role, job_level FROM employees WHERE id = ?', [previousSuperior]);
                    
                    console.log('📊 Previous superior data:', previousSuperiorData[0]);
                    
                    if (previousSuperiorData.length > 0 && previousSuperiorData[0].role !== 'manager') {
                        console.log(`🔄 Demoting previous superior from '${previousSuperiorData[0].role}' to 'employee'`);
                        const updatePreviousSuperiorQuery = `UPDATE employees SET role = 'employee' WHERE id = ?`;
                        await connection.query(updatePreviousSuperiorQuery, [previousSuperior]);
                        console.log(`✅ Changed previous superior (ID: ${previousSuperior}) role back to 'employee' as they no longer have subordinates`);
                    } else if (previousSuperiorData.length > 0) {
                        console.log(`🔹 Previous superior (ID: ${previousSuperior}) has role '${previousSuperiorData[0].role}', keeping this role instead of demoting`);
                    }
                } else {
                    console.log(`🔹 Previous superior still has ${subordinatesResult[0].subordinate_count} subordinates, keeping current role`);
                }
            }

            console.log('🔄 Committing transaction...');
            await connection.commit();
            console.log('✅ Transaction committed successfully');
            
            connection.release();
            console.log('🔗 Database connection released');
            
            console.log('🎉 === UPDATE EMPLOYEE TRANSACTION COMPLETED SUCCESSFULLY ===');
            res.json({ message: 'Employee updated successfully' });
            
        } catch (error) {
            console.error('❌ Error during transaction, rolling back...');
            console.error('💥 Transaction error details:', error);
            await connection.rollback();
            console.log('🔄 Transaction rolled back');
            connection.release();
            console.log('🔗 Database connection released after rollback');
            throw error;
        }
    } catch (error) {
        console.error('💥 === UPDATE EMPLOYEE TRANSACTION FAILED ===');
        console.error('❌ Error updating employee:', error);
        console.error('📊 Error stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
};

const deleteEmployee = (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM employees WHERE id = ?';
    dbPromise.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Employee deleted successfully' });
    });
};

// controllers/adminController.js

const resignEmployee = async (req, res) => {
  const { id } = req.params;
  const { resigned_date, resignation_reason } = req.body;

  try {
    // Step 1: Check active bonding records
    const bondQuery = `
      SELECT * FROM training 
      WHERE employee_id = ? 
        AND has_bond = 1 
        AND bond_end_date IS NOT NULL 
        AND bond_status = 'active' 
        AND ? < bond_end_date
    `;

    const [bondResults] = await dbPromise.query(bondQuery, [id, resigned_date]);

    if (bondResults.length > 0) {
      return res.status(400).json({
        error: 'Employee has active bonding period that extends beyond the resignation date.',
        bonds: bondResults.map(bond => ({
          training_course: bond.training_course,
          bond_end_date: bond.bond_end_date,
          bond_status: bond.bond_status
        }))
      });
    }

    // Step 2: Update employee status, resigned date, and reason
    const updateQuery = `
      UPDATE employees 
      SET status = 'Resigned', resigned_date = ?, resignation_reason = ?
      WHERE id = ?
    `;

    const [updateResult] = await dbPromise.query(updateQuery, [resigned_date, resignation_reason, id]);

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee resigned successfully' });

  } catch (err) {
    console.error('Error resigning employee:', err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Assign a Manager (Link an Employee to a Department as Manager)
const addManager = async (req, res) => {
    const { employee_id, department_id } = req.body;

    if (!employee_id || !department_id) {
        return res.status(400).json({ error: "Both employee and department are required." });
    }

    try {
        // Check if the employee is already assigned as a manager
        const checkQuery = `SELECT * FROM Managers WHERE employee_id = ?`;
        const [existing] = await dbPromise.query(checkQuery, [employee_id]);

        if (existing.length > 0) {
            return res.status(400).json({ error: "This employee is already a manager." });
        }

        // Insert into Managers table
        const query = `INSERT INTO Managers (employee_id, department_id) VALUES (?, ?)`;
        const [result] = await dbPromise.query(query, [employee_id, department_id]);

        res.status(201).json({ message: "Manager assigned successfully", managerId: result.insertId });
    } catch (error) {
        console.error("Error adding manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Get All Managers (with Employee & Department Details)
const getAllManagers = async (req, res) => {
    try {
        const query = `
            SELECT m.id AS manager_id, e.name AS manager_name, e.email AS manager_email, d.department_name
            FROM managers m
            JOIN employees e ON m.employee_id = e.id
            JOIN departments d ON m.department_id = d.id
        `;
        const [managers] = await dbPromise.query(query);
        res.json(managers);
    } catch (error) {
        console.error("Error fetching managers:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Remove a Manager
const deleteManager = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `DELETE FROM Managers WHERE id = ?`;
        const [result] = await dbPromise.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Manager not found" });
        }

        res.json({ message: "Manager removed successfully" });
    } catch (error) {
        console.error("Error deleting manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Delete Manager by Department
const deleteManagerByDepartment = async (req, res) => {
    const { departmentId } = req.params;

    try {
        const query = `DELETE FROM Managers WHERE department_id = ?`; // Use department_id
        const [result] = await dbPromise.query(query, [departmentId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No manager found for this department." });
        }

        res.json({ message: "Manager removed successfully" });
    } catch (error) {
        console.error("Error deleting manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Fetch manager
const getDepartmentManager = async (req, res) => {
    const { department_id } = req.params;
    try {
        const query = `
            SELECT m.id AS manager_id, e.name 
            FROM Managers m
            JOIN Employees e ON m.employee_id = e.id
            WHERE m.department_id = ? LIMIT 1
        `;
        const [manager] = await dbPromise.query(query, [department_id]);

        if (manager.length === 0) {
            return res.json({ manager_id: null, name: "No Manager Assigned" });
        }

        console.log("✅ Returning Only `manager_id`:", manager[0].manager_id); // ✅ Debugging
        res.json({ manager_id: manager[0].manager_id, name: manager[0].name }); // ✅ Send ONLY manager_id & name
    } catch (error) {
        console.error("Error fetching manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
// ✅ Update Manager
const updateManager = async (req, res) => {
    const { department_id } = req.params;
    const { employee_id } = req.body;

    if (!employee_id || !department_id) {
        return res.status(400).json({ error: "Both employee and department are required." });
    }

    try {
        // Check if a manager exists
        const checkQuery = `SELECT * FROM Managers WHERE department_id = ?`;
        const [existingManager] = await dbPromise.query(checkQuery, [department_id]);

        if (existingManager.length === 0) {
            return res.status(404).json({ error: "No manager assigned to this department." });
        }

        // Update the manager
        const query = `UPDATE Managers SET employee_id = ? WHERE department_id = ?`;
        const [result] = await dbPromise.query(query, [employee_id, department_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Failed to update manager." });
        }

        res.json({ message: "Manager updated successfully" });
    } catch (error) {
        console.error("Error updating manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


const getAllDepartments = async (req, res) => {
    try {
        const query = `SELECT id, department_name FROM departments`;
        const [departments] = await dbPromise.query(query);

        res.json(departments);
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const getCompaniesWithDepartments = async (req, res) => {
    try {
        const query = `
            SELECT 
                companies.id AS company_id, companies.name AS company_name,
                departments.id AS department_id, departments.department_name
            FROM companies
            LEFT JOIN departments ON companies.id = departments.company_id
            ORDER BY companies.name, departments.department_name;
        `;
        const [results] = await dbPromise.query(query);

        const companies = {};
        results.forEach(row => {
            if (!companies[row.company_id]) {
                companies[row.company_id] = {
                    id: row.company_id,
                    name: row.company_name,
                    departments: [],
                };
            }
            if (row.department_id) {
                companies[row.company_id].departments.push({
                    id: row.department_id,
                    name: row.department_name,
                });
            }
        });

        res.json(Object.values(companies)); // Convert object to array
    } catch (error) {
        console.error("Error fetching companies with departments:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const getManagerByDepartment = async (req, res) => {
    const { departmentId } = req.params;
    try {
        const query = `
            SELECT m.id AS manager_id, e.name 
            FROM Managers m
            JOIN Employees e ON m.employee_id = e.id
            WHERE m.department_id = ? LIMIT 1
        `;
        const [manager] = await dbPromise.query(query, [departmentId]);

        if (manager.length === 0) {
            return res.json({ manager_id: null, name: "No Manager Assigned" });
        }

        res.json(manager[0]);
    } catch (error) {
        console.error("Error fetching manager:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const getCompaniesWithManagers = async (req, res) => {
    try {
        console.log("📢 Fetching companies, departments, and managers...");

        const query = `
            SELECT 
                c.id AS company_id, c.name AS company_name,
                d.id AS department_id, d.department_name,
                m.id AS manager_id, e.name AS manager_name
            FROM companies c
            LEFT JOIN departments d ON c.id = d.company_id
            LEFT JOIN managers m ON d.id = m.department_id
            LEFT JOIN employees e ON m.employee_id = e.id
            ORDER BY c.name, d.department_name;
        `;

        const [results] = await dbPromise.query(query);

        console.log("✅ Query Executed. Raw Results:", results);

        const companies = {};
        results.forEach(row => {
            if (!companies[row.company_id]) {
                companies[row.company_id] = {
                    id: row.company_id,
                    name: row.company_name,
                    departments: [],
                };
            }
            if (row.department_id) {
                companies[row.company_id].departments.push({
                    id: row.department_id,
                    name: row.department_name,
                    manager: row.manager_name || "No Manager Assigned",
                    manager_id: row.manager_id || null
                });
            }
        });

        console.log("✅ Processed Companies Data:", Object.values(companies));
        res.json(Object.values(companies)); // Convert object to array
    } catch (error) {
        console.error("❌ Error fetching companies with departments:", error);
        res.status(500).json({ error: "Failed to fetch companies with departments" });
    }
};

const getEmployeesByDepartment = async (req, res) => {
    const { departmentId } = req.params;

    try {
        const query = 'SELECT * FROM employees WHERE department_id = ?';
        const [results] = await dbPromise.query(query, [departmentId]);

        res.json(results);
    } catch (error) {
        console.error('Error fetching employees by department:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
};

// Fetch Dashboard Statistics
const getDashboardStats = async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Employees) AS totalEmployees,
                (SELECT COUNT(*) FROM Employees WHERE role = 'admin') AS totalAdmins,
                (SELECT COUNT(*) FROM Employees WHERE role = 'employee') AS totalEmployeesOnly,
                (SELECT COUNT(*) FROM Leaves WHERE status = 'pending') AS pendingLeaves
        `;

        const [result] = await dbPromise.query(statsQuery); // Use dbPromise.query
        res.json(result[0]); // Return statistics as JSON

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

const getUserDetails = async (req, res) => {
    try {
        // Get token from headers
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        // Verify Token
        const decoded = jwt.verify(token, 'your-secret-key'); // Replace 'your-secret-key' with your actual secret key

        // Fetch User Details from Database
        const query = "SELECT id, name, email, role FROM employees WHERE id = ?";
        const [result] = await dbPromise.query(query, [decoded.id]); // Use dbPromise.query

        if (result.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(result[0]); // Send user details as JSON

    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
};

/**
 * Creates a new position for a department
 * @route POST /api/admin/departments/:id/positions
 */
const createPosition = async (req, res) => {
    const { id } = req.params; // department_id from URL
    const {
        title,
        start_work_time,
        end_work_time,
        job_description = null,
        job_level = 'junior',
    } = req.body;

    // Input validation
    if (!title || !start_work_time || !end_work_time) {
        return res.status(400).json({ error: 'Title, start time, and end time are required' });
    }

    // Get a database connection and start a transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Verify the department exists
        const departmentCheckQuery = 'SELECT id, company_id FROM departments WHERE id = ?';
        const [departmentResults] = await connection.query(departmentCheckQuery, [id]);

        if (departmentResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Department not found' });
        }

        // Use the department_id from the URL
        const departmentId = departmentResults[0].id;

        // Check if position with the same title already exists in this department
        const duplicateCheckQuery = 'SELECT id FROM positions WHERE department_id = ? AND title = ? AND job_level = ?';
        const [duplicateResults] = await connection.query(duplicateCheckQuery, [departmentId, title.trim(), job_level]);

        if (duplicateResults.length > 0) {
            await connection.rollback();
            connection.release();
            console.log("Duplicate Position: ", duplicateResults);
            return res.status(409).json({ error: 'Position with this title already exists in this department' });
        }

        // Insert the position
        const insertQuery = `
            INSERT INTO positions (
                title, 
                start_work_time, 
                end_work_time,
                department_id,
                job_description,
                job_level
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.query(insertQuery, [
            title.trim(),
            start_work_time,
            end_work_time,
            departmentId,
            job_description,
            job_level
        ]);

        // Commit transaction
        await connection.commit();
        connection.release();

        // Return success with position details
        res.status(201).json({
            message: 'Position created successfully',
            position: {
                id: result.insertId,
                title: title.trim(),
                start_work_time,
                end_work_time,
                department_id: departmentId,
                job_description,
                job_level,
                created_at: new Date(),
                updated_at: new Date()
            }
        });
    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        connection.release();

        console.error('Error creating position:', error);
        res.status(500).json({ error: 'An error occurred while creating the position' });
    }
};


// Add a past position for an employee
const addPastPosition = async (req, res) => {
    const { employee_id, position_id, start_date } = req.body;

    try {
        // 1. Validate inputs
        if (!employee_id || !position_id || !start_date) {
            return res.status(400).json({ error: 'employee_id, position_id, and start_date are required' });
        }

        // 2. Validate if the employee exists
        const checkEmployeeQuery = 'SELECT id FROM employees WHERE id = ?';
        const [employee] = await dbPromise.query(checkEmployeeQuery, [employee_id]);

        if (employee.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // 3. Insert into employee_past_positions
        const insertQuery = `
            INSERT INTO employee_past_positions (employee_id, position_id, start_date)
            VALUES (?, ?, ?)
        `;
        const [result] = await dbPromise.query(insertQuery, [employee_id, position_id, start_date]);

        if (result.affectedRows === 0) {
            return res.status(500).json({ error: 'Failed to add past position' });
        }

        res.json({ 
            success: true, 
            message: 'Past position added successfully', 
            past_position_id: result.insertId 
        });
    } catch (error) {
        console.error('Error adding past position:', error);
        res.status(500).json({ error: error.message });
    }
};

// Handle partial updates to employee data
const patchEmployee1 = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
        // Validate if the employee exists
        const checkQuery = 'SELECT * FROM employees WHERE id = ?';
        const [employee] = await dbPromise.query(checkQuery, [id]);

        if (employee.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const currentEmployee = employee[0];

        // Check if position_id is being updated (indicating a transfer)
        const isPositionTransfer = updates.position_id && updates.position_id !== currentEmployee.position_id;

        // If it's a position transfer, save the current position as past position and update current_position_start_date
        if (isPositionTransfer && currentEmployee.position_id) {
            try {
                // Use current_position_start_date or joined_date as start_date for the past position
                const startDate = currentEmployee.current_position_start_date || currentEmployee.joined_date || new Date().toISOString().split('T')[0];
                
                const pastPositionQuery = `
                    INSERT INTO employee_past_positions (employee_id, position_id, start_date)
                    VALUES (?, ?, ?)
                `;
                
                await dbPromise.query(pastPositionQuery, [
                    id,
                    currentEmployee.position_id,
                    startDate
                ]);
                
                console.log(`Added past position for employee ${id}: position_id ${currentEmployee.position_id}`);
            } catch (pastPositionError) {
                console.error('Error adding past position:', pastPositionError);
                // Continue with the update even if past position insertion fails
                // This ensures the transfer still completes
            }

            // Set current_position_start_date to today for the new position
            updates.current_position_start_date = new Date().toISOString().split('T')[0];
        }

        // Hash password if it's being updated
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 12);
        }

        // Build the dynamic update query based on the fields that are provided
        const updateFields = Object.keys(updates);
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const setClause = updateFields.map(field => `${field} = ?`).join(', ');
        const values = updateFields.map(field => updates[field]);
        values.push(id); // Add id for the WHERE clause

        const query = `UPDATE employees SET ${setClause} WHERE id = ?`;

        const [result] = await dbPromise.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(500).json({ error: 'Failed to update employee' });
        }

        res.json({ message: 'Employee updated successfully' });
    } catch (error) {
        console.error('Error patching employee:', error);
        res.status(500).json({ error: error.message });
    }
};

const patchEmployee = async (req, res) => {
  const { id } = req.params;
  // clone so we can normalize safely
  const updates = { ...req.body };

  // optional helper; if you already have formatDateToMySQL, this uses it.
  const normalizeDate = (d) => {
    if (d === undefined) return undefined;
    if (d === '' || d === null) return null;
    return typeof formatDateToMySQL === 'function' ? formatDateToMySQL(d) : d;
  };

  try {
    // Validate if the employee exists
    const checkQuery = 'SELECT * FROM employees WHERE id = ?';
    const [rows] = await dbPromise.query(checkQuery, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const currentEmployee = rows[0];

    // Position transfer logic (unchanged)
    const isPositionTransfer =
      updates.position_id && updates.position_id !== currentEmployee.position_id;

    if (isPositionTransfer && currentEmployee.position_id) {
      try {
        const startDate =
          currentEmployee.current_position_start_date ||
          currentEmployee.joined_date ||
          new Date().toISOString().split('T')[0];

        const pastPositionQuery = `
          INSERT INTO employee_past_positions (employee_id, position_id, start_date)
          VALUES (?, ?, ?)
        `;
        await dbPromise.query(pastPositionQuery, [id, currentEmployee.position_id, startDate]);
      } catch (err) {
        console.error('Error adding past position:', err);
      }
      updates.current_position_start_date = new Date().toISOString().split('T')[0];
    }

    // Hash password if it's being updated
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }

    // --- Resignation reason rules + normalization ---

    // Normalize incoming resigned_date / resignation_reason if present
    const hasResignedInPayload = Object.prototype.hasOwnProperty.call(updates, 'resigned_date');
    const hasReasonInPayload = Object.prototype.hasOwnProperty.call(updates, 'resignation_reason');

    if (hasResignedInPayload) {
      updates.resigned_date = normalizeDate(updates.resigned_date);
    }
    if (hasReasonInPayload) {
      const t = String(updates.resignation_reason ?? '').trim();
      updates.resignation_reason = t.length ? t : null;
    }

    // Determine effective values after this PATCH
    const effectiveResignedDate = hasResignedInPayload
      ? updates.resigned_date
      : currentEmployee.resigned_date;

    const effectiveReason = hasReasonInPayload
      ? updates.resignation_reason
      : currentEmployee.resignation_reason;

    // Rule 1: If we have an effective resigned_date, we must have a reason
    if (effectiveResignedDate && !effectiveReason) {
      return res
        .status(400)
        .json({ error: 'resignation_reason is required when resigned_date is set' });
    }

    // Rule 2: If resigned_date is being cleared in this PATCH, also clear reason
    if (hasResignedInPayload && !effectiveResignedDate) {
      updates.resignation_reason = null; // ensure field is included in SET clause
    }

    // Rule 3: You cannot set a non-null reason when there is no effective resigned_date
    if (hasReasonInPayload && updates.resignation_reason && !effectiveResignedDate) {
      return res
        .status(400)
        .json({ error: 'Cannot set resignation_reason without resigned_date' });
    }

    // --- Build dynamic UPDATE as before ---

    const updateFields = Object.keys(updates);
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = updateFields.map((field) => `${field} = ?`).join(', ');
    const values = updateFields.map((field) => updates[field]);
    values.push(id);

    const query = `UPDATE employees SET ${setClause} WHERE id = ?`;
    const [result] = await dbPromise.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Failed to update employee' });
    }

    res.json({ message: 'Employee updated successfully' });
  } catch (error) {
    console.error('Error patching employee:', error);
    res.status(500).json({ error: error.message });
  }
};


// Get employee past positions
const getEmployeePastPositions = async (req, res) => {
    const { id } = req.params;

    try {
        // First verify the employee exists
        const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
        const [employeeExists] = await dbPromise.query(employeeCheckQuery, [id]);

        if (employeeExists.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Query to get past positions with company, department, and position details
        const query = `
                        WITH ordered AS (
                        SELECT
                            epp.employee_id,
                            c.name AS company_name,
                            d.department_name,
                            p.title AS position_title,
                            p.job_level,
                            epp.start_date,
                            LEAD(epp.start_date) OVER (
                                PARTITION BY epp.employee_id
                                ORDER BY epp.start_date, epp.id
                            ) AS next_start
                        FROM employee_past_positions epp
                        JOIN positions   p ON epp.position_id = p.id
                        JOIN departments d ON p.department_id = d.id
                        JOIN companies   c ON d.company_id = c.id
                        WHERE epp.employee_id = ?
                        ),
                        position_history AS (
                        SELECT
                            employee_id,
                            company_name,
                            department_name,
                            position_title,
                            job_level,
                            start_date,
                            CASE
                                WHEN next_start IS NULL THEN NULL
                                ELSE DATE_SUB(next_start, INTERVAL 1 DAY)
                            END AS end_date,
                            next_start
                        FROM ordered
                        )
                        SELECT
                            company_name,
                            department_name,
                            position_title,
                            job_level,
                            start_date,
                            end_date,
                            CASE
                            -- Current if today is inside the range
                            WHEN CURDATE() BETWEEN start_date AND COALESCE(end_date, CURDATE()) THEN 1
                            -- If today is BEFORE the first start_date, mark the first row as current
                            WHEN start_date = (
                                SELECT MIN(start_date) FROM position_history
                            ) AND CURDATE() < start_date THEN 1
                            ELSE 0
                            END AS is_current
                        FROM position_history
                        ORDER BY start_date;
        `;

        const [pastPositions] = await dbPromise.query(query, [id]);

        res.json(pastPositions);
    } catch (error) {
        console.error('Error fetching employee past positions:', error);
        res.status(500).json({ error: error.message });
    }
};

// Fetch employees by department for manager selection
const getEligibleManagersByDepartment = async (req, res) => {
    const { departmentId } = req.params;
    const { employeeId } = req.query; // Get the current employee ID to exclude

    try {
        // First try to fetch managers for this department
        const managerQuery = `
            SELECT e.id, e.name, e.employee_no, e.position, e.email 
            FROM managers m
            JOIN employees e ON m.employee_id = e.id
            WHERE m.department_id = ? AND e.status = 'Active'
            ${employeeId ? 'AND e.id != ?' : ''}
            ORDER BY e.name
        `;
        const managerQueryParams = employeeId ? [departmentId, employeeId] : [departmentId];
        const [managers] = await dbPromise.query(managerQuery, managerQueryParams);

        // If managers are found, return them
        if (managers.length > 0) {
            return res.json(managers);
        }

        // If no managers found, return employees from this department as potential managers
        const employeeQuery = `
            SELECT id, name, employee_no, position, email 
            FROM employees 
            WHERE department_id = ? AND status = 'Active'
            ${employeeId ? 'AND id != ?' : ''}
            ORDER BY name
        `;
        const employeeQueryParams = employeeId ? [departmentId, employeeId] : [departmentId];
        const [employees] = await dbPromise.query(employeeQuery, employeeQueryParams);

        res.json(employees);
    } catch (error) {
        console.error('Error fetching eligible managers by department:', error);
        res.status(500).json({ error: 'Failed to fetch eligible managers' });
    }
};

// Get managers by company ID
const getManagersByCompany = async (req, res) => {
    const { companyId } = req.params;

    try {
        // Verify that company exists
        const companyCheckQuery = 'SELECT id FROM companies WHERE id = ?';
        const [companyResults] = await dbPromise.query(companyCheckQuery, [companyId]);

        if (companyResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Company not found'
            });
        }

        // Get employees with manager role
        const query = `
            SELECT 
                id, 
                name, 
                employee_no, 
                email, 
                department_id,
                position
            FROM 
                employees
            WHERE 
                company_id = ? 
                AND role = 'manager'
                AND status = 'Active'
            ORDER BY 
                name ASC
        `;

        const [managers] = await dbPromise.query(query, [companyId]);

        // Format response
        res.json({
            success: true,
            managers: managers,
            count: managers.length
        });
    } catch (error) {
        console.error('Error fetching managers by company:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch managers',
            details: error.message
        });
    }
};

// Validate employee number uniqueness
const validateEmployeeNumber = async (req, res) => {
    const { employee_no, excludeEmployeeId } = req.query;

    // Validate input
    if (!employee_no) {
        return res.status(400).json({ 
            success: false, 
            error: 'Employee number is required' 
        });
    }

    try {
        // Check if employee number exists (case-insensitive, across all companies)
        // Exclude current employee if excludeEmployeeId is provided
        let query = 'SELECT id FROM employees WHERE LOWER(employee_no) = LOWER(?)';
        const params = [employee_no.trim()];
        
        if (excludeEmployeeId) {
            query += ' AND id != ?';
            params.push(excludeEmployeeId);
        }
        
        const [existingEmployees] = await dbPromise.query(query, params);

        if (existingEmployees.length > 0) {
            return res.json({
                success: false,
                available: false,
                message: 'Employee number already exists'
            });
        }

        res.json({
            success: true,
            available: true,
            message: 'Employee number is available'
        });
    } catch (error) {
        console.error('Error validating employee number:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to validate employee number',
            details: error.message 
        });
    }
};



// Get employee training records
const getEmployeeTrainingRecords1 = async (req, res) => {
    const { employeeId } = req.params;

    try {
        // Verify employee exists
        const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
        const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

        if (employeeResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Get training records for the employee
        const query = `
            SELECT 
                id,
                training_course,
                venue,
                start_datetime,
                end_datetime,
                status,
                created_at,
                updated_at
            FROM 
                training 
            WHERE 
                employee_id = ?
            ORDER BY 
                start_datetime DESC
        `;

        const [results] = await dbPromise.query(query, [employeeId]);

        // Get attachments for all training records
        const trainingIds = results.map(r => r.id);
        const attachmentsMap = trainingIds.length > 0 
            ? await getTrainingAttachments(employeeId, trainingIds) 
            : {};

        // Format the results to match frontend expectations
        const formattedResults = results.map(record => ({
            id: record.id.toString(),
            training_course: record.training_course || '',
            venue: record.venue || '',
            start_datetime: record.start_datetime || '',
            end_datetime: record.end_datetime || '',
            status: record.status ? record.status.toLowerCase() : 'pending',
            attachments: attachmentsMap[record.id] || []
        }));

        res.json({
            success: true,
            training_records: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching employee training records:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch training records',
            details: error.message
        });
    }
};

// Get employee training records with bonding info
const getEmployeeTrainingRecords = async (req, res) => {
  const { employeeId } = req.params;

  try {
    // Verify employee exists
    const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
    const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

    if (employeeResults.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Get training records for the employee, including bonding fields
    const query = `
      SELECT 
        id,
        training_course,
        venue,
        start_datetime,
        end_datetime,
        status,
        created_at,
        updated_at,
        has_bond,
        bond_period_months,
        bond_start_date,
        bond_end_date,
        bond_status
      FROM 
        training 
      WHERE 
        employee_id = ?
      ORDER BY 
        start_datetime DESC
    `;

    const [results] = await dbPromise.query(query, [employeeId]);

    // Get attachments for all training records
    const trainingIds = results.map(r => r.id);
    const attachmentsMap = trainingIds.length > 0 
      ? await getTrainingAttachments(employeeId, trainingIds) 
      : {};

    // Format the results to match frontend expectations
    const formattedResults = results.map(record => ({
      id: record.id.toString(),
      training_course: record.training_course || '',
      venue: record.venue || '',
      start_datetime: record.start_datetime || '',
      end_datetime: record.end_datetime || '',
      status: record.status ? record.status.toLowerCase() : 'pending',
      has_bond: !!record.has_bond,
      bond_period_months: record.bond_period_months || null,
      bond_start_date: record.bond_start_date || null,
      bond_end_date: record.bond_end_date || null,
      bond_status: record.bond_status || null,
      attachments: attachmentsMap[record.id] || []
    }));

    res.json({
      success: true,
      training_records: formattedResults,
      count: formattedResults.length
    });
  } catch (error) {
    console.error('Error fetching employee training records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch training records',
      details: error.message
    });
  }
};


/**
 * Helper function to retrieve training attachments
 * Uses both new schema (related_type/related_id) and fallback method (s3_key parsing)
 */
const getTrainingAttachments = async (employeeId, trainingIds) => {
    try {
        const attachmentsMap = {};

        // Return empty map if no training IDs provided
        if (!trainingIds || trainingIds.length === 0) {
            return attachmentsMap;
        }

        // Initialize empty arrays for all training IDs
        trainingIds.forEach(trainingId => {
            attachmentsMap[trainingId] = [];
        });

        // Method 1: Query using new schema (related_type and related_id)
        const newSchemaQuery = `
            SELECT 
                id,
                document_type,
                s3_key,
                original_filename,
                file_size,
                content_type,
                uploaded_at,
                related_id
            FROM 
                employee_documents 
            WHERE 
                employee_id = ? 
                AND related_id IN (${trainingIds.map(() => '?').join(',')})
            ORDER BY 
                uploaded_at DESC
        `;

        const [newSchemaResults] = await dbPromise.query(newSchemaQuery, [employeeId, ...trainingIds]);

        // Process new schema results
        newSchemaResults.forEach(doc => {
            const trainingId = doc.related_id;
            if (attachmentsMap[trainingId]) {
                attachmentsMap[trainingId].push(formatAttachment(doc));
            }
        });

        // Method 2: Fallback - Query documents with Training_Records type and parse s3_key
        const fallbackQuery = `
            SELECT 
                id,
                document_type,
                s3_key,
                original_filename,
                file_size,
                content_type,
                uploaded_at
            FROM 
                employee_documents 
            WHERE 
                employee_id = ? 
                AND document_type = 'Training_Records'
                AND (related_type IS NULL OR related_type = 'employee')
            ORDER BY 
                uploaded_at DESC
        `;

        const [fallbackResults] = await dbPromise.query(fallbackQuery, [employeeId]);

        // Process fallback results by extracting training ID from s3_key
        fallbackResults.forEach(doc => {
            const trainingId = extractTrainingIdFromS3Key(doc.s3_key);
            if (trainingId && attachmentsMap[trainingId]) {
                // Check if this attachment is already added from new schema
                const existingAttachment = attachmentsMap[trainingId].find(att => att.key === doc.s3_key);
                if (!existingAttachment) {
                    attachmentsMap[trainingId].push(formatAttachment(doc));
                }
            }
        });

        return attachmentsMap;
    } catch (error) {
        console.error('Error fetching training attachments:', error);
        return {};
    }
};

/**
 * Helper function to extract training ID from s3_key
 * Format: employees/226/employee-data/Training_Records/19/1751826111532_bananacat.jpg
 */
const extractTrainingIdFromS3Key = (s3Key) => {
    try {
        if (!s3Key) return null;
        
        const parts = s3Key.split('/');
        const trainingRecordsIndex = parts.findIndex(part => part === 'Training_Records');
        
        if (trainingRecordsIndex !== -1 && parts.length > trainingRecordsIndex + 1) {
            const trainingId = parts[trainingRecordsIndex + 1];
            // Validate that it's a number
            return /^\d+$/.test(trainingId) ? parseInt(trainingId, 10) : null;
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting training ID from s3_key:', error);
        return null;
    }
};

/**
 * Helper function to format attachment object for frontend
 */
const formatAttachment = (doc) => {
    const AWS_REGION = process.env.AWS_REGION;
    const S3_BUCKET = process.env.AWS_BUCKET_NAME;
    
    return {
        id: doc.id,
        name: doc.original_filename || doc.s3_key.split('/').pop(),
        url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${doc.s3_key}`,
        key: doc.s3_key,
        uploadDate: doc.uploaded_at,
        documentType: doc.document_type,
        size: doc.file_size,
        contentType: doc.content_type
    };
};

const updateEmployeeTrainingRecord = async (req, res) => {
    const { employeeId, trainingId } = req.params;
    const { training_course, venue, start_datetime, end_datetime, status } = req.body;

    // Validate required fields
    if (!training_course || !start_datetime || !end_datetime) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: training_course, start_datetime, end_datetime'
        });
    }

    // Validate employee exists
    const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
    const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

    if (employeeResults.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Employee not found'
        });
    }

    // Verify training record exists and belongs to the employee
    const trainingCheckQuery = 'SELECT id FROM training WHERE id = ? AND employee_id = ?';
    const [trainingResults] = await dbPromise.query(trainingCheckQuery, [trainingId, employeeId]);

    if (trainingResults.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Training record not found or does not belong to this employee'
        });
    }

    // Start transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Update the training record
        const updateQuery = `
            UPDATE training 
            SET 
                training_course = ?,
                venue = ?,
                start_datetime = ?,
                end_datetime = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE 
                id = ? AND employee_id = ?
        `;

        const [updateResult] = await connection.query(updateQuery, [
            training_course,
            venue || null,
            new Date(start_datetime),
            new Date(end_datetime),
            status || 'Pending',
            trainingId,
            employeeId
        ]);

        if (updateResult.affectedRows === 0) {
            throw new Error('Failed to update training record');
        }

        // Handle document uploads if there are files
        let uploadedDocuments = [];
        if (req.files && Object.keys(req.files).length > 0) {
            console.log(`🔹 Processing document uploads for training record ${trainingId}`);
            
            // Pass the training ID as an array for document upload handling
            uploadedDocuments = await handleDocumentUploads(req, employeeId, connection, [trainingId]);
            
            console.log(`🔹 Uploaded ${uploadedDocuments.length} documents for training record ${trainingId}`);
        }

        // Commit the transaction
        await connection.commit();

        // Fetch the updated training record with attachments
        const updatedRecord = await getUpdatedTrainingRecord(employeeId, trainingId);

        res.json({
            success: true,
            message: 'Training record updated successfully',
            training_record: updatedRecord,
            documents_uploaded: uploadedDocuments.length
        });

    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        console.error('Error updating training record:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update training record'
        });
    } finally {
        connection.release();
    }
};

// Helper function to get updated training record with attachments
const getUpdatedTrainingRecord = async (employeeId, trainingId) => {
    try {
        // Get the updated training record
        const query = `
            SELECT 
                id,
                training_course,
                venue,
                start_datetime,
                end_datetime,
                status,
                created_at,
                updated_at
            FROM 
                training 
            WHERE 
                id = ? AND employee_id = ?
        `;

        const [results] = await dbPromise.query(query, [trainingId, employeeId]);

        if (results.length === 0) {
            throw new Error('Training record not found');
        }

        const record = results[0];

        // Get attachments for this training record
        const attachmentsMap = await getTrainingAttachments(employeeId, [trainingId]);

        // Format the result
        return {
            id: record.id.toString(),
            training_course: record.training_course || '',
            venue: record.venue || '',
            start_datetime: record.start_datetime || '',
            end_datetime: record.end_datetime || '',
            status: record.status ? record.status.toLowerCase() : 'pending',
            attachments: attachmentsMap[record.id] || []
        };

    } catch (error) {
        console.error('Error fetching updated training record:', error);
        throw error;
    }
};

const createEmployeeTrainingRecord = async (req, res) => {
    const { employeeId } = req.params;
    const { training_course, venue, start_datetime, end_datetime, status } = req.body;

    // Validate required fields
    if (!training_course || !start_datetime || !end_datetime) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: training_course, start_datetime, end_datetime'
        });
    }

    // Validate employee exists
    const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
    const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

    if (employeeResults.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Employee not found'
        });
    }

    // Start transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Insert the new training record
        const insertQuery = `
            INSERT INTO training 
            (employee_id, training_course, venue, start_datetime, end_datetime, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        const [insertResult] = await connection.query(insertQuery, [
            employeeId,
            training_course,
            venue || null,
            start_datetime,
            end_datetime,
            status || 'Pending'
        ]);

        const trainingId = insertResult.insertId;

        if (!trainingId) {
            throw new Error('Failed to create training record');
        }

        // Handle document uploads if there are files
        let uploadedDocuments = [];
        if (req.files && Object.keys(req.files).length > 0) {
            console.log(`🔹 Processing document uploads for new training record ${trainingId}`);
            
            // Pass the training ID as an array for document upload handling
            uploadedDocuments = await handleDocumentUploads(req, employeeId, connection, [trainingId]);
            
            console.log(`🔹 Uploaded ${uploadedDocuments.length} documents for training record ${trainingId}`);
        }

        // Commit the transaction
        await connection.commit();

        // Fetch the created training record with attachments
        const createdRecord = await getUpdatedTrainingRecord(employeeId, trainingId);

        res.status(201).json({
            success: true,
            message: 'Training record created successfully',
            training_record: createdRecord,
            documents_uploaded: uploadedDocuments.length
        });

    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        console.error('Error creating training record:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create training record'
        });
    } finally {
        connection.release();
    }
};

// Get employee disciplinary records
const getEmployeeDisciplinaryRecords = async (req, res) => {
    const { employeeId } = req.params;

    try {
        // Verify employee exists
        const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
        const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

        if (employeeResults.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Get disciplinary records for the employee
        const query = `
            SELECT 
                id,
                issue_date,
                letter_type,
                reason,
                created_at,
                updated_at
            FROM 
                employee_disciplinary 
            WHERE 
                employee_id = ?
            ORDER BY 
                issue_date DESC
        `;

        const [results] = await dbPromise.query(query, [employeeId]);

        // Get attachments for all disciplinary records
        const disciplinaryIds = results.map(r => r.id);
        const attachmentsMap = disciplinaryIds.length > 0 
            ? await getDisciplinaryAttachments(employeeId, disciplinaryIds) 
            : {};

        // Format the results to match frontend expectations
        const formattedResults = results.map(record => ({
            id: record.id.toString(),
            issue_date: record.issue_date || '',
            type_of_letter: record.letter_type || '',
            reason: record.reason || '',
            attachments: attachmentsMap[record.id] || []
        }));

        res.json({
            success: true,
            disciplinary_records: formattedResults,
            count: formattedResults.length
        });
    } catch (error) {
        console.error('Error fetching employee disciplinary records:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch disciplinary records',
            details: error.message
        });
    }
};

/**
 * Helper function to retrieve disciplinary attachments
 * Uses both new schema (related_type/related_id) and fallback method (s3_key parsing)
 */
const getDisciplinaryAttachments = async (employeeId, disciplinaryIds) => {
    try {
        const attachmentsMap = {};

        // Return empty map if no disciplinary IDs provided
        if (!disciplinaryIds || disciplinaryIds.length === 0) {
            return attachmentsMap;
        }

        // Initialize empty arrays for all disciplinary IDs
        disciplinaryIds.forEach(disciplinaryId => {
            attachmentsMap[disciplinaryId] = [];
        });

        // Method 1: Query using new schema (related_type and related_id)
        const newSchemaQuery = `
            SELECT 
                id,
                document_type,
                s3_key,
                original_filename,
                file_size,
                content_type,
                uploaded_at,
                related_id
            FROM 
                employee_documents 
            WHERE 
                employee_id = ? 
                AND related_id IN (${disciplinaryIds.map(() => '?').join(',')})
            ORDER BY 
                uploaded_at DESC
        `;

        const [newSchemaResults] = await dbPromise.query(newSchemaQuery, [employeeId, ...disciplinaryIds]);

        // Process new schema results
        newSchemaResults.forEach(doc => {
            const disciplinaryId = doc.related_id;
            if (attachmentsMap[disciplinaryId]) {
                attachmentsMap[disciplinaryId].push(formatAttachment(doc));
            }
        });

        // Method 2: Fallback - Query documents with Disciplinary_Records type and parse s3_key
        const fallbackQuery = `
            SELECT 
                id,
                document_type,
                s3_key,
                original_filename,
                file_size,
                content_type,
                uploaded_at
            FROM 
                employee_documents 
            WHERE 
                employee_id = ? 
                AND document_type = 'Disciplinary_Records'
                AND (related_type IS NULL OR related_type = 'employee')
            ORDER BY 
                uploaded_at DESC
        `;

        const [fallbackResults] = await dbPromise.query(fallbackQuery, [employeeId]);

        // Process fallback results by extracting disciplinary ID from s3_key
        fallbackResults.forEach(doc => {
            const disciplinaryId = extractDisciplinaryIdFromS3Key(doc.s3_key);
            if (disciplinaryId && attachmentsMap[disciplinaryId]) {
                // Check if this attachment is already added from new schema
                const existingAttachment = attachmentsMap[disciplinaryId].find(att => att.key === doc.s3_key);
                if (!existingAttachment) {
                    attachmentsMap[disciplinaryId].push(formatAttachment(doc));
                }
            }
        });

        return attachmentsMap;
    } catch (error) {
        console.error('Error fetching disciplinary attachments:', error);
        return {};
    }
};

/**
 * Helper function to extract disciplinary ID from s3_key
 * Format: employees/226/employee-data/Disciplinary_Records/19/1751826111532_document.pdf
 */
const extractDisciplinaryIdFromS3Key = (s3Key) => {
    try {
        if (!s3Key) return null;
        
        const parts = s3Key.split('/');
        const disciplinaryRecordsIndex = parts.findIndex(part => part === 'Disciplinary_Records');
        
        if (disciplinaryRecordsIndex !== -1 && parts.length > disciplinaryRecordsIndex + 1) {
            const disciplinaryId = parts[disciplinaryRecordsIndex + 1];
            // Validate that it's a number
            return /^\d+$/.test(disciplinaryId) ? parseInt(disciplinaryId, 10) : null;
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting disciplinary ID from s3_key:', error);
        return null;
    }
};

// Helper function to get updated disciplinary record with attachments
const getUpdatedDisciplinaryRecord = async (employeeId, disciplinaryId) => {
    try {
        // Get the updated disciplinary record
        const query = `
            SELECT 
                id,
                issue_date,
                letter_type,
                reason,
                created_at,
                updated_at
            FROM 
                employee_disciplinary 
            WHERE 
                id = ? AND employee_id = ?
        `;

        const [results] = await dbPromise.query(query, [disciplinaryId, employeeId]);

        if (results.length === 0) {
            throw new Error('Disciplinary record not found');
        }

        const record = results[0];

        // Get attachments for this disciplinary record
        const attachmentsMap = await getDisciplinaryAttachments(employeeId, [disciplinaryId]);

        // Format the result
        return {
            id: record.id.toString(),
            issue_date: record.issue_date || '',
            type_of_letter: record.letter_type || '',
            reason: record.reason || '',
            attachments: attachmentsMap[record.id] || []
        };

    } catch (error) {
        console.error('Error fetching updated disciplinary record:', error);
        throw error;
    }
};

const createEmployeeDisciplinaryRecord = async (req, res) => {
    const { employeeId } = req.params;
    const { issue_date, type_of_letter, reason } = req.body;

    // Validate required fields
    if (!issue_date || !type_of_letter || !reason) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: issue_date, type_of_letter, reason'
        });
    }

    // Validate employee exists
    const employeeCheckQuery = 'SELECT id FROM employees WHERE id = ?';
    const [employeeResults] = await dbPromise.query(employeeCheckQuery, [employeeId]);

    if (employeeResults.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Employee not found'
        });
    }

    // Start transaction
    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();

    try {
        // Insert the new disciplinary record
        const insertQuery = `
            INSERT INTO employee_disciplinary 
            (employee_id, issue_date, letter_type, reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        const [insertResult] = await connection.query(insertQuery, [
            employeeId,
            issue_date,
            type_of_letter,
            reason
        ]);

        const disciplinaryId = insertResult.insertId;

        if (!disciplinaryId) {
            throw new Error('Failed to create disciplinary record');
        }

        // Handle document uploads if there are files
        let uploadedDocuments = [];
        if (req.files && Object.keys(req.files).length > 0) {
            console.log(`🔹 Processing document uploads for new disciplinary record ${disciplinaryId}`);
            
            // Pass the disciplinary ID as an array for document upload handling
            uploadedDocuments = await handleDocumentUploads(req, employeeId, connection, [], [disciplinaryId]);
            
            console.log(`🔹 Uploaded ${uploadedDocuments.length} documents for disciplinary record ${disciplinaryId}`);
        }

        // Commit the transaction
        await connection.commit();

        // Fetch the created disciplinary record with attachments
        const createdRecord = await getUpdatedDisciplinaryRecord(employeeId, disciplinaryId);

        res.status(201).json({
            success: true,
            message: 'Disciplinary record created successfully',
            disciplinary_record: createdRecord,
            documents_uploaded: uploadedDocuments.length
        });

    } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        console.error('Error creating disciplinary record:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create disciplinary record'
        });
    } finally {
        connection.release();
    }
};



const resetEmployeePassword = async (req, res) => {
  const { id } = req.params;

  // Step 1: Generate a random password (e.g., 8 chars)
  const tempPassword = crypto.randomBytes(4).toString('hex'); // 8-char temp password

  // Step 2: Hash it before saving
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  try {
    // Step 3: Update the employee password in DB
    await dbPromise.query('UPDATE employees SET password = ? WHERE id = ?', [hashedPassword, id]);

    // Step 4: Return the plain temp password for showing/sending
    res.json({ tempPassword });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};




module.exports = { 
    createCompany, getAllCompanies, getCompany, updateCompany, deleteCompany, getDepartments,
    createEmployee, getAllEmployees, getEmployeeById, updateEmployee, deleteEmployee, resignEmployee,
    getCompanyDepartments, getCompanyAllDepartments, addManager, getAllManagers, deleteManager, getDepartmentManager,
    deleteManagerByDepartment, updateManager, getAllDepartments, getCompaniesWithDepartments,
    getEmployeesByCompany, getManagerByDepartment, getCompaniesWithManagers, getEmployeesByDepartment,
    getDashboardStats, getUserDetails, patchEmployee, createDepartment, createPosition, getDepartmentPositions,
    getDepartment, updateDepartment, updatePosition, deleteDepartment, deletePosition, getEditAllCompanies, getTransferDepartmentPositions,
    getEligibleManagersByDepartment, getManagersByCompany, validateEmployeeNumber, getEmployeePastPositions, getEmployeeTrainingRecords, updateEmployeeTrainingRecord,
    createEmployeeTrainingRecord, getEmployeeDisciplinaryRecords, createEmployeeDisciplinaryRecord, resetEmployeePassword, addPastPosition
};