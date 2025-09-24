// middleware/ipValidation.js
const { body, validationResult } = require('express-validator');

const ipValidation = {
  getIPDeviceInfo: [
    // Add any validation rules needed
    // Example: rate limiting, specific headers, etc.
  ]
};

module.exports = ipValidation;