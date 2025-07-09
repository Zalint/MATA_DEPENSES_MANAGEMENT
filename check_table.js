const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function checkTable() {
  const client = await pool.connect();
  try {
    // Check table structure
    console.log('Checking table structure...');
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'remboursements'
      ORDER BY ordinal_position;
    `);
    console.log('\nTable structure:');
    console.table(tableInfo.rows);

    // Check constraints
    console.log('\nChecking constraints...');
    const constraints = await client.query(`
      SELECT con.conname as constraint_name,
             con.contype as constraint_type,
             pg_get_constraintdef(con.oid) as definition
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'remboursements';
    `);
    console.log('\nConstraints:');
    console.table(constraints.rows);

    // Check indexes
    console.log('\nChecking indexes...');
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'remboursements';
    `);
    console.log('\nIndexes:');
    console.table(indexes.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTable(); 