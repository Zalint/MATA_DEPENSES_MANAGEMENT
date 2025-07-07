const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'depenses_management',
    user: 'zalint',
    password: 'bonea2024'
});

async function checkSchema() {
    try {
        // Vérifier la structure de la table expenses
        const expensesResult = await pool.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'expenses'
            ORDER BY ordinal_position;
        `);
        
        console.log('\nStructure de la table expenses:');
        console.log('--------------------------------');
        expensesResult.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''}`);
        });

        // Vérifier quelques valeurs distinctes de expense_type
        const typesResult = await pool.query(`
            SELECT DISTINCT expense_type
            FROM expenses
            WHERE expense_type IS NOT NULL;
        `);
        
        console.log('\nValeurs distinctes de expense_type:');
        console.log('----------------------------------');
        typesResult.rows.forEach(row => {
            console.log(row.expense_type);
        });

    } catch (error) {
        console.error('Erreur:', error);
    } finally {
        await pool.end();
    }
}

checkSchema(); 