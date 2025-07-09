const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function checkAccountTypes() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT account_type, COUNT(*) as count, bool_or(is_active) as has_active
      FROM accounts 
      GROUP BY account_type
      ORDER BY account_type;
    `);
    
    console.log('Account types in database:');
    console.table(result.rows);
  } catch (error) {
    console.error('Error checking account types:', error);
  } finally {
    await pool.end();
  }
}

checkAccountTypes(); 