const mysql = require('mysql2');

const db = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'hrms_2',
    ssl: {
        rejectUnauthorized: false // Allow self-signed certificates
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00'
});

const dbPromise = db.promise();


db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error connecting to MySQL:', err);
    } else {
        console.log('✅ MySQL Connected');
        connection.release(); // Release the connection back to the pool
    }
});

module.exports = { db, dbPromise };
