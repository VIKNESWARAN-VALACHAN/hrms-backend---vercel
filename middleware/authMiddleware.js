const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

/**
 * Middleware to authenticate requests using JWT tokens
 * Extracts the token from Authorization header and verifies it
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const authMiddleware = (req, res, next) => {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            message: "Authentication required. Please provide a valid token." 
        });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        // Verify the token using jsonwebtoken
        const decoded = jwt.verify(token, jwtConfig.secret, {
            algorithms: [jwtConfig.options.algorithm],
            issuer: jwtConfig.issuer
        });
        
        // Add the user data to the request object
        req.user = decoded;
        
        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: "Token expired. Please login again.",
                expired: true
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid token. Please login again." 
            });
        } else {
            console.error('Auth middleware error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Authentication error."
            });
        }
    }
};

/**
 * Middleware to restrict access based on user roles
 * @param {string[]} roles - Array of roles allowed to access the route
 * @returns {Function} Middleware function
 */
const roleMiddleware = (roles) => {
    return (req, res, next) => {
        // Check if user exists (authMiddleware should be used before this)
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: "Authentication required" 
            });
        }
        
        // Check if user's role is in the allowed roles
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: "You don't have permission to access this resource" 
            });
        }
        
        // If role is allowed, continue
        next();
    };
};

module.exports = { authMiddleware, roleMiddleware };
