const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function updateAccounts() {
  try {
    await pool.query('BEGIN');
    
    const result = await pool.query(`
      UPDATE accounts 
      SET is_active = false 
      WHERE account_type IN ('creance', 'fournisseur', 'remboursement')
    `);
    
    console.log(`Updated ${result.rowCount} accounts`);
    
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating accounts:', error);
  } finally {
    await pool.end();
  }
}

updateAccounts(); 