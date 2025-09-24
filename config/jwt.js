/**
 * JWT Configuration File
 * Centralizes JWT settings for the entire application
 */

// Load environment variables if necessary
require('dotenv').config();

module.exports = {
  // Secret key for signing tokens - use environment variable in production
  secret: process.env.JWT_SECRET,
  
  // Token expiration times
  tokenExpiration: '1y',  // Access token expiration
  //tokenExpiration: '24h', 
  refreshTokenExpiration: '7d',  // Refresh token expiration
  
  // Token issuer
  issuer: 'hrms-api',
  
  // Other JWT options
  options: {
    algorithm: 'HS256',  // HMAC with SHA-256
  }
}; 