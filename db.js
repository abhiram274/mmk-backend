const mysql = require('mysql2/promise');
require('dotenv').config();

let db;

async function initializeDB() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Test connection
    await db.query('SELECT 1');
    console.log('✅ MySQL Connected');
  } catch (err) {
    console.error(' MySQL Connection Error:', err.message);
    process.exit(1);
  }
}

initializeDB();

module.exports = {
  query: (...args) => db.query(...args),
  pool: () => db
};




