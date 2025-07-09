const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function fixRemboursementsTable() {
  try {
    // Drop the unique constraint on numero_tel
    await pool.query(`
      ALTER TABLE remboursements 
      DROP CONSTRAINT IF EXISTS remboursements_numero_tel_key;
    `);
    console.log('Unique constraint removed from numero_tel column');

    // Create an index on numero_tel for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_remboursements_numero_tel 
      ON remboursements(numero_tel);
    `);
    console.log('Index created on numero_tel column');

  } catch (error) {
    console.error('Error fixing table:', error);
  } finally {
    await pool.end();
  }
}

fixRemboursementsTable(); 