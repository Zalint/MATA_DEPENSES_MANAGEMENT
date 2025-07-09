const { Client } = require('pg');

async function checkTable() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'depenses_management',
    user: 'zalint',
    password: 'bonea2024'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check table structure
    console.log('\nChecking table structure...');
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'remboursements'
      ORDER BY ordinal_position;
    `);
    console.log('\nTable structure:');
    for (const row of tableInfo.rows) {
      console.log(row);
    }

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
    for (const row of constraints.rows) {
      console.log(row);
    }

    // Check indexes
    console.log('\nChecking indexes...');
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'remboursements';
    `);
    console.log('\nIndexes:');
    for (const row of indexes.rows) {
      console.log(row);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkTable(); 