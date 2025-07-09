const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function testConnection() {
  try {
    // Test the connection
    const client = await pool.connect();
    console.log('Successfully connected to the database');

    // Test a simple query
    const result = await client.query('SELECT NOW()');
    console.log('Current database time:', result.rows[0].now);

    // Release the client
    client.release();
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await pool.end();
  }
}

testConnection(); 