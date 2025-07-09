const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function createRemboursementsTable() {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS remboursements (
        id SERIAL PRIMARY KEY,
        nom_client VARCHAR(255) NOT NULL,
        numero_tel VARCHAR(30) NOT NULL,
        date DATE NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('remboursement', 'dette')),
        commentaire TEXT,
        montant INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_remboursements_numero_tel ON remboursements(numero_tel);
      CREATE INDEX IF NOT EXISTS idx_remboursements_date ON remboursements(date);
    `;

    await pool.query(createTableQuery);
    console.log('Table remboursements created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await pool.end();
  }
}

createRemboursementsTable(); 