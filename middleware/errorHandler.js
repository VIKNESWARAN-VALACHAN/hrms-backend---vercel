// middleware/errorHandler.js

module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  // Standardized error message
  const message = statusCode === 500
    ? 'Internal server error'
    : err.message || 'An error occurred';

  // Log server-side for audit/debug
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n${err.stack || err}`);

  // Respond to client
  res.status(statusCode).json({
    error: message,
    details: !isProd ? err.message : undefined, // Hide details in production
    // Add requestId if you use any, e.g., req.id
  });
};
