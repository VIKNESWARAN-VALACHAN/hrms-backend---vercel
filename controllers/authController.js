// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const {dbPromise} = require('../models/db');
// const jwtConfig = require('../config/jwt');

// /**
//  * Login user and generate access token
//  * @param {Object} req - Request object
//  * @param {Object} res - Response object
//  * @returns {Object} Response with token and user data
//  */
// const login = async (req, res) => {
//     const { email, password } = req.body;

//     try {
//         // Check if user exists
//         const getUserQuery = 'SELECT id, name, email, role, password, company_id, department_id, is_superadmin FROM employees WHERE email = ?';
//         const [result] = await dbPromise.query(getUserQuery, [email]);
        
//         if (result.length === 0) {
//             console.log('User not found');
//             return res.status(401).json({ success: false, message: 'Invalid email or password' });
//         }
        
//         const user = result[0];
        
//         try {
//             // Verify password
//             const isMatch = await bcrypt.compare(password, user.password);
//             if (!isMatch) {
//                 return res.status(401).json({ success: false, message: 'Invalid email or password' });
//             }
            
//             // Remove password from user object
//             const { password: _, ...userWithoutPassword } = user;
            
//             // Generate access token with jsonwebtoken
//             const token = jwt.sign(
//                 { 
//                     id: user.id,
//                     name: user.name,
//                     email: user.email,
//                     role: user.role,
//                     company_id: user.company_id,
//                     department_id: user.department_id
//                 },
//                 jwtConfig.secret,
//                 { 
//                     expiresIn: jwtConfig.tokenExpiration,
//                     algorithm: jwtConfig.options.algorithm,
//                     issuer: jwtConfig.issuer
//                 }
//             );
            
//             // Generate refresh token
//             const refreshToken = jwt.sign(
//                 { id: user.id },
//                 jwtConfig.secret,
//                 { 
//                     expiresIn: jwtConfig.refreshTokenExpiration,
//                     algorithm: jwtConfig.options.algorithm,
//                     issuer: jwtConfig.issuer
//                 }
//             );
            
//             // Return user data with tokens
//             return res.status(200).json({ 
//                 success: true, 
//                 message: 'Login successful',
//                 user: userWithoutPassword,
//                 role: user.role,
//                 token,
//                 refreshToken
//             });
//         } catch (error) {
//             console.error('Authentication error:', error);
//             return res.status(500).json({ 
//                 success: false, 
//                 message: 'Authentication error', 
//                 error: error.message 
//             }); 
//         }
//     } catch (error) {
//         console.error('Server error:', error.message);
//         return res.status(500).json({ 
//             success: false, 
//             message: 'Server error', 
//             error: error.message 
//         });
//     }
// };

// /**
//  * Refresh access token using refresh token
//  * @param {Object} req - Request object
//  * @param {Object} res - Response object
//  * @returns {Object} Response with new access token
//  */
// const refreshToken = async (req, res) => {
//     const { refreshToken } = req.body;
    
//     if (!refreshToken) {
//         return res.status(400).json({ 
//             success: false, 
//             message: 'Refresh token is required' 
//         });
//     }
    
//     try {
//         // Verify the refresh token
//         const decoded = jwt.verify(refreshToken, jwtConfig.secret);
        
//         // Get user data to generate a new token
//         const [users] = await dbPromise.query(
//             'SELECT id, name, email, role, company_id, department_id FROM employees WHERE id = ?',
//             [decoded.id]
//         );
        
//         if (users.length === 0) {
//             return res.status(404).json({ 
//                 success: false, 
//                 message: 'User not found' 
//             });
//         }
        
//         const user = users[0];
        
//         // Generate a new access token
//         const newToken = jwt.sign(
//             { 
//                 id: user.id,
//                 name: user.name,
//                 email: user.email,
//                 role: user.role,
//                 company_id: user.company_id,
//                 department_id: user.department_id
//             },
//             jwtConfig.secret,
//             { 
//                 expiresIn: jwtConfig.tokenExpiration,
//                 algorithm: jwtConfig.options.algorithm,
//                 issuer: jwtConfig.issuer
//             }
//         );
        
//         return res.status(200).json({
//             success: true,
//             message: 'Token refreshed successfully',
//             token: newToken
//         });
//     } catch (error) {
//         console.error('Token refresh error:', error);
//         return res.status(401).json({ 
//             success: false, 
//             message: 'Invalid or expired refresh token' 
//         });
//     }
// };

// /**
//  * Update employee password
//  * @param {Object} req - Request object
//  * @param {Object} res - Response object
//  * @returns {Object} Response with success status
//  */
// const updateEmployeePassword = async (req, res) => {
//     const { oldPassword, newPassword, userId } = req.body;
  
//     // Input validation
//     if (!oldPassword || !newPassword) {
//         return res.status(701).json({ error: 'Both old and new passwords are required' });
//     }
  
//     // Password strength validation
//     if (newPassword.length < 8) {
//         return res.status(701).json({ error: 'New password must be at least 8 characters long' });
//     }
  
//     try {
//         // Get current password hash from database
//         const query = 'SELECT password FROM employees WHERE id = ?';
//         const [results] = await dbPromise.query(query, [userId]);
  
//         if (results.length === 0) {
//             return res.status(701).json({ error: 'Employee not found' });
//         }
  
//         const currentPasswordHash = results[0].password;
  
//         // Verify old password
//         const isOldPasswordValid = await bcrypt.compare(oldPassword, currentPasswordHash);
//         if (!isOldPasswordValid) {
//             return res.status(701).json({ error: 'Current password is incorrect' });
//         }
  
//         // Hash the new password
//         const newPasswordHash = await bcrypt.hash(newPassword, 12);
  
//         // Check if new password is same as old password
//         const isNewPasswordSameAsOldPassword = await bcrypt.compare(newPassword, currentPasswordHash);
//         if (isNewPasswordSameAsOldPassword) {
//             return res.status(701).json({ error: 'New password cannot be the same as the old password' });
//         }
  
//         // Update the password in the database
//         const updateQuery = 'UPDATE employees SET password = ? WHERE id = ?';
//         const [updateResult] = await dbPromise.query(updateQuery, [newPasswordHash, userId]);
  
//         if (updateResult.affectedRows === 0) {
//             return res.status(701).json({ error: 'Failed to update password' });
//         }
  
//         return res.status(200).json({ 
//             success: true, 
//             message: 'Password updated successfully' 
//         });
//     } catch (error) {
//         console.error('Error updating password:', error);
//         return res.status(500).json({ error: 'Internal server error' });
//     }
// };

// /**
//  * Verify a token is valid
//  * @param {Object} req - Request object
//  * @param {Object} res - Response object
//  * @returns {Object} Response with token information
//  */
// const verifyToken = (req, res) => {
//     // The token is already verified by the authMiddleware
//     // Just return the decoded user information
//     return res.status(200).json({
//         success: true,
//         message: 'Token is valid',
//         user: req.user
//     });
// };

// module.exports = { 
//     login, 
//     refreshToken, 
//     updateEmployeePassword,
//     verifyToken
// };


//NEW

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {dbPromise} = require('../models/db');
const jwtConfig = require('../config/jwt');

/**
 * Login user and generate access token
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Response with token and user data
 */
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if user exists
        const getUserQuery = 'SELECT id, name, email, role, password,gender, company_id, department_id, is_superadmin FROM employees WHERE email = ?';
        const [result] = await dbPromise.query(getUserQuery, [email]);
        
        if (result.length === 0) {
            console.log('User not found');
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        
        const user = result[0];
        
        try {
            // Verify password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            const getInActiveUserQuery = 'SELECT COUNT(*) as inactiveCount FROM employees WHERE email = ? AND status = ?';
            const [inactiveResult] = await dbPromise.query(getInActiveUserQuery, [email, 'Inactive']);
    
            if (inactiveResult[0].inactiveCount > 0) {
                return res.status(401).json({ success: false, message: 'Inactive account. Please contact your administrator.' });
            }
            
            // Remove password from user object
            const { password: _, ...userWithoutPassword } = user;
            
            // Generate access token with jsonwebtoken
            const token = jwt.sign(
                { 
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    company_id: user.company_id,
                    department_id: user.department_id
                },
                jwtConfig.secret,
                { 
                    expiresIn: jwtConfig.tokenExpiration,
                    algorithm: jwtConfig.options.algorithm,
                    issuer: jwtConfig.issuer
                }
            );
            
            // Generate refresh token
            const refreshToken = jwt.sign(
                { id: user.id },
                jwtConfig.secret,
                { 
                    expiresIn: jwtConfig.refreshTokenExpiration,
                    algorithm: jwtConfig.options.algorithm,
                    issuer: jwtConfig.issuer
                }
            );
            
            // Return user data with tokens
            return res.status(200).json({ 
                success: true, 
                message: 'Login successful',
                user: userWithoutPassword,
                role: user.role,
                token,
                refreshToken
            });
        } catch (error) {
            //console.error('Authentication error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Authentication error', 
                error: error.message 
            }); 
        }
    } catch (error) {
        console.error('Server error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

/**
 * Refresh access token using refresh token
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Response with new access token
 */
const refreshToken = async (req, res) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
        return res.status(400).json({ 
            success: false, 
            message: 'Refresh token is required' 
        });
    }
    
    try {
        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, jwtConfig.secret);
        
        // Get user data to generate a new token
        const [users] = await dbPromise.query(
            'SELECT id, name, email, role, company_id, department_id FROM employees WHERE id = ?',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const user = users[0];
        
        // Generate a new access token
        const newToken = jwt.sign(
            { 
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                company_id: user.company_id,
                department_id: user.department_id
            },
            jwtConfig.secret,
            { 
                expiresIn: jwtConfig.tokenExpiration,
                algorithm: jwtConfig.options.algorithm,
                issuer: jwtConfig.issuer
            }
        );
        
        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired refresh token' 
        });
    }
};

/**
 * Update employee password
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Response with success status
 */
const updateEmployeePassword = async (req, res) => {
    const { oldPassword, newPassword, userId } = req.body;
  
    // Input validation
    if (!oldPassword || !newPassword) {
        return res.status(701).json({ error: 'Both old and new passwords are required' });
    }
  
    // Password strength validation
    if (newPassword.length < 8) {
        return res.status(701).json({ error: 'New password must be at least 8 characters long' });
    }
  
    try {
        // Get current password hash from database
        const query = 'SELECT password FROM employees WHERE id = ?';
        const [results] = await dbPromise.query(query, [userId]);
  
        if (results.length === 0) {
            return res.status(701).json({ error: 'Employee not found' });
        }
  
        const currentPasswordHash = results[0].password;
  
        // Verify old password
        const isOldPasswordValid = await bcrypt.compare(oldPassword, currentPasswordHash);
        if (!isOldPasswordValid) {
            return res.status(701).json({ error: 'Current password is incorrect' });
        }
  
        // Hash the new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
  
        // Check if new password is same as old password
        const isNewPasswordSameAsOldPassword = await bcrypt.compare(newPassword, currentPasswordHash);
        if (isNewPasswordSameAsOldPassword) {
            return res.status(701).json({ error: 'New password cannot be the same as the old password' });
        }
  
        // Update the password in the database
        const updateQuery = 'UPDATE employees SET password = ? WHERE id = ?';
        const [updateResult] = await dbPromise.query(updateQuery, [newPasswordHash, userId]);
  
        if (updateResult.affectedRows === 0) {
            return res.status(701).json({ error: 'Failed to update password' });
        }
  
        return res.status(200).json({ 
            success: true, 
            message: 'Password updated successfully' 
        });
    } catch (error) {
        console.error('Error updating password:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Verify a token is valid
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Response with token information
 */
const verifyToken = (req, res) => {
    // The token is already verified by the authMiddleware
    // Just return the decoded user information
    return res.status(200).json({
        success: true,
        message: 'Token is valid',
        user: req.user
    });
};

module.exports = { 
    login, 
    refreshToken, 
    updateEmployeePassword,
    verifyToken
};