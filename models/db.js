// const mysql = require('mysql2');

// const db = mysql.createPool({
//     host: 'localhost',
//     port: 3306,
//     user: 'root',
//     password: 'root',
//     database: 'hrms_2',
//     ssl: {
//         rejectUnauthorized: false // Allow self-signed certificates
//     },
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     timezone: '+08:00'
// });

// const dbPromise = db.promise();


// db.getConnection((err, connection) => {
//     if (err) {
//         console.error('❌ Error connecting to MySQL:', err);
//     } else {
//         console.log('✅ MySQL Connected');
//         connection.release(); // Release the connection back to the pool
//     }
// });

// module.exports = { db, dbPromise };

// models/db.js
const mysql = require('mysql2');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[DB] Missing env ${name}`);
  return v;
}

// Are we on a managed host (Render/Vercel)? If yes, require env vars.
// If local dev, fall back to localhost defaults.
const isManaged = !!(process.env.RENDER || process.env.VERCEL);

const cfg = {
  host: process.env.DB_HOST || (isManaged ? required('DB_HOST') : 'localhost'),
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || (isManaged ? required('DB_USER') : 'root'),
  password: process.env.DB_PASSWORD || (isManaged ? required('DB_PASSWORD') : 'root'),
  database: process.env.DB_NAME || (isManaged ? required('DB_NAME') : 'hrms_2'),

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,

  // Keep the connection hot for server platforms
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,

  // Time zone handling (optional)
  timezone: process.env.DB_TZ || '+08:00',
};

// SSL toggle: set DB_SSL=true if your RDS requires SSL
const DB_SSL = (process.env.DB_SSL || '').toLowerCase();
if (DB_SSL === 'true' || DB_SSL === '1' || DB_SSL === 'required') {
  // For public RDS, Node's default trust store usually works.
  // If your RDS requires a specific CA bundle, set `ssl: { ca: ... }` instead.
  cfg.ssl = { rejectUnauthorized: true };
}

console.log('[DB] Using config:', {
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  database: cfg.database,
  ssl: cfg.ssl ? 'enabled' : 'disabled',
  pool: cfg.connectionLimit,
});

const db = mysql.createPool(cfg);
const dbPromise = db.promise();

// One-shot connectivity check on boot (helpful in logs)
dbPromise
  .query('SELECT 1')
  .then(() => console.log('[DB] Connectivity OK'))
  .catch((err) => {
    console.error('[DB] Connectivity FAILED:', err);
  });

// Optional: immediate connection test using callback API
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error connecting to MySQL:', err);
  } else {
    console.log('✅ MySQL Connected (pool test)');
    connection.release();
  }
});

module.exports = { db, dbPromise };
