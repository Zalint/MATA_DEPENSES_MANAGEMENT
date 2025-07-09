const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function testInsert() {
  try {
    // First, clear the table
    await pool.query('TRUNCATE TABLE remboursements RESTART IDENTITY');
    console.log('Table cleared');

    // Insert test data
    const result = await pool.query(`
      INSERT INTO remboursements (nom_client, numero_tel, date, action, commentaire, montant)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, ['Test Client', '123456789', '2024-03-17', 'dette', 'Test dette', 8000]);
    
    console.log('First operation inserted:', result.rows[0]);

    // Try to insert another operation for the same client
    const result2 = await pool.query(`
      INSERT INTO remboursements (nom_client, numero_tel, date, action, commentaire, montant)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, ['Test Client', '123456789', '2024-03-17', 'remboursement', 'Test remboursement', 3000]);
    
    console.log('Second operation inserted:', result2.rows[0]);

    // Check all records
    const allRecords = await pool.query('SELECT * FROM remboursements ORDER BY id');
    console.log('\nAll records in table:');
    console.table(allRecords.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testInsert(); 