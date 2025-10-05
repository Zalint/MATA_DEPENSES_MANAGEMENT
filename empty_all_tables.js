const { Client } = require('pg');

// Database configuration
const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'matavolaille_db',
    user: 'zalint',
    password: 'bonea2024',
    statement_timeout: 60000,
    query_timeout: 60000,
    connectionTimeoutMillis: 10000
};

async function emptyAllTables() {
    const client = new Client(dbConfig);
    
    try {
        console.log('🔌 Connecting to PostgreSQL database...');
        console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`   Database: ${dbConfig.database}`);
        console.log(`   User: ${dbConfig.user}`);
        
        await client.connect();
        console.log('✅ Connected to database successfully!');
        
        console.log('\n🧹 Starting to empty all tables (keeping structure)...');
        
        // Get all table names
        const tablesResult = await client.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);
        
        console.log(`\n📋 Found ${tablesResult.rows.length} tables to empty:`);
        tablesResult.rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ${row.tablename}`);
        });
        
        // Disable foreign key checks temporarily by truncating in correct order
        console.log('\n🗑️  Starting table truncation...');
        
        let truncatedCount = 0;
        let errorCount = 0;
        
        // First, try to truncate all tables with CASCADE (handles foreign keys)
        for (const row of tablesResult.rows) {
            const tableName = row.tablename;
            
            try {
                // Use TRUNCATE with CASCADE to handle foreign key constraints
                await client.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
                console.log(`   ✅ Emptied table: ${tableName}`);
                truncatedCount++;
                
            } catch (error) {
                // If CASCADE fails, try without CASCADE
                try {
                    await client.query(`DELETE FROM ${tableName}`);
                    console.log(`   ✅ Emptied table: ${tableName} (using DELETE)`);
                    truncatedCount++;
                } catch (deleteError) {
                    console.log(`   ❌ Failed to empty: ${tableName} - ${deleteError.message}`);
                    errorCount++;
                }
            }
        }
        
        // Reset sequences to start from 1
        console.log('\n🔄 Resetting sequences...');
        const sequencesResult = await client.query(`
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
        `);
        
        let sequencesReset = 0;
        for (const row of sequencesResult.rows) {
            try {
                await client.query(`ALTER SEQUENCE ${row.sequence_name} RESTART WITH 1`);
                console.log(`   ✅ Reset sequence: ${row.sequence_name}`);
                sequencesReset++;
            } catch (error) {
                console.log(`   ⚠️  Warning resetting sequence ${row.sequence_name}: ${error.message}`);
            }
        }
        
        // Verify tables are empty
        console.log('\n🔍 Verifying tables are empty...');
        let totalRows = 0;
        
        for (const row of tablesResult.rows) {
            try {
                const countResult = await client.query(`SELECT COUNT(*) as count FROM ${row.tablename}`);
                const count = parseInt(countResult.rows[0].count);
                totalRows += count;
                
                if (count > 0) {
                    console.log(`   ⚠️  ${row.tablename}: ${count} rows remaining`);
                }
            } catch (error) {
                console.log(`   ⚠️  Could not verify ${row.tablename}: ${error.message}`);
            }
        }
        
        console.log('\n🎉 =====================================================');
        console.log('🎉 TABLE EMPTYING COMPLETED!');
        console.log('🎉 =====================================================');
        console.log('📊 EMPTYING SUMMARY:');
        console.log(`   ✅ Tables emptied: ${truncatedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log(`   🔄 Sequences reset: ${sequencesReset}`);
        console.log(`   📋 Total tables: ${tablesResult.rows.length}`);
        console.log(`   🗑️  Total rows remaining: ${totalRows}`);
        console.log('🎉 =====================================================');
        
        if (totalRows === 0 && errorCount === 0) {
            console.log('\n✅ SUCCESS: All tables are completely empty!');
            console.log('🎯 Your database structure is intact and ready for fresh data.');
            console.log('🚀 You can now run your tests or add new data.');
        } else {
            console.log('\n⚠️  Some issues occurred during emptying process.');
            console.log(`   Rows remaining: ${totalRows}`);
            console.log(`   Errors: ${errorCount}`);
        }
        
    } catch (error) {
        console.error('❌ Fatal error during table emptying:', error.message);
        console.error('💡 Error details:', error.detail || 'No additional details');
        process.exit(1);
        
    } finally {
        try {
            await client.end();
            console.log('📪 Database connection closed.');
        } catch (closeError) {
            console.error('⚠️  Warning: Error closing connection:', closeError.message);
        }
    }
}

// Main execution
console.log('🗑️  MATA GROUP TABLE EMPTYING UTILITY');
console.log('🗑️  ===================================');
console.log('ℹ️   This will remove ALL DATA from tables but keep the structure');
console.log('⚠️   WARNING: This will DELETE ALL data but preserve table schemas!');
console.log('');

// Execute the emptying
emptyAllTables()
    .then(() => {
        console.log('\n🎉 Table emptying completed successfully!');
        console.log('💡 All tables are now empty and ready for fresh data.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Table emptying failed:', error.message);
        process.exit(1);
    });
