// server.js
// Optional: load local .env when running outside managed hosts
try { require('dotenv').config(); } catch (_) {}

const app = require('./app');

const PORT = process.env.PORT || 5001;
// Bind to 0.0.0.0 for Docker/Render; localhost also works
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
