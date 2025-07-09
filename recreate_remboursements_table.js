const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function recreateRemboursementsTable() {
  try {
    // Drop the existing table
    await pool.query('DROP TABLE IF EXISTS remboursements CASCADE');
    console.log('Dropped existing table');

    // Create the table without the unique constraint
    await pool.query(`
      CREATE TABLE remboursements (
        id SERIAL PRIMARY KEY,
        nom_client VARCHAR(255) NOT NULL,
        numero_tel VARCHAR(30) NOT NULL,
        date DATE NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('remboursement', 'dette')),
        commentaire TEXT,
        montant INTEGER NOT NULL
      );

      CREATE INDEX idx_remboursements_numero_tel ON remboursements(numero_tel);
      CREATE INDEX idx_remboursements_date ON remboursements(date);
    `);
    console.log('Table recreated successfully');

  } catch (error) {
    console.error('Error recreating table:', error);
  } finally {
    await pool.end();
  }
}

recreateRemboursementsTable(); 