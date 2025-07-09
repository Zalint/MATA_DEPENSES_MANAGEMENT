const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024'
});

async function checkDatabase() {
  try {
    // Check if the table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'remboursements'
      );
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Check table structure
      const tableInfo = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'remboursements'
        ORDER BY ordinal_position;
      `);
      console.log('\nTable structure:');
      console.table(tableInfo.rows);

      // Check constraints
      const constraints = await pool.query(`
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
      const indexes = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'remboursements';
      `);
      console.log('\nIndexes:');
      console.table(indexes.rows);

      // Check table content
      const content = await pool.query('SELECT * FROM remboursements');
      console.log('\nTable content:');
      console.table(content.rows);
    }
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await pool.end();
  }
}

checkDatabase(); 