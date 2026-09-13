const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 2500,
    }
  : {
      user: process.env.PGUSER || process.env.POSTGRES_USER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'songswipe',
      password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
      port: parseInt(process.env.PGPORT || '5432', 10),
      connectionTimeoutMillis: 2500,
    };

const pool = new Pool(poolConfig);

// Catch background client errors so they don't terminate the process
pool.on('error', (err) => {
  console.warn('⚠️  PostgreSQL pool background error:', err.message);
});

let isConnected = false;

// Test DB connection and run schema initialization if connected
async function testConnection() {
  try {
    const client = await pool.connect();
    isConnected = true;
    console.log('✅ Connected to PostgreSQL database successfully.');
    client.release();
    return true;
  } catch (error) {
    isConnected = false;
    console.warn('⚠️  PostgreSQL is not connected or not yet running:', error.message);
    console.warn('ℹ️  SongSwipe backend will run with in-memory persistence fallback until PostgreSQL is started.');
    return false;
  }
}

function getIsConnected() {
  return isConnected;
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
  getIsConnected,
};
