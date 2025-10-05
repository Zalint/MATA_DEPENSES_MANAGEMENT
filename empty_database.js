const { Client } = require('pg');

// Database configuration
const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'matavolaille_db',
    user: 'zalint',
    password: 'bonea2024',
    statement_timeout: 60000, // 1 minute
    query_timeout: 60000,
    connectionTimeoutMillis: 10000
};

async function emptyDatabase() {
    const client = new Client(dbConfig);
    
    try {
        console.log('🔌 Connecting to PostgreSQL database...');
        console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`   Database: ${dbConfig.database}`);
        console.log(`   User: ${dbConfig.user}`);
        
        await client.connect();
        console.log('✅ Connected to database successfully!');
        
        console.log('\n🧹 Starting database cleanup...');
        
        // Step 1: Drop all views first (they depend on tables)
        console.log('\n1️⃣ Dropping all views...');
        const viewsResult = await client.query(`
            SELECT viewname 
            FROM pg_views 
            WHERE schemaname = 'public'
        `);
        
        for (const row of viewsResult.rows) {
            try {
                await client.query(`DROP VIEW IF EXISTS ${row.viewname} CASCADE`);
                console.log(`   ✅ Dropped view: ${row.viewname}`);
            } catch (error) {
                console.log(`   ⚠️  Warning dropping view ${row.viewname}: ${error.message}`);
            }
        }
        
        // Step 2: Drop all triggers
        console.log('\n2️⃣ Dropping all triggers...');
        const triggersResult = await client.query(`
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public'
        `);
        
        for (const row of triggersResult.rows) {
            try {
                await client.query(`DROP TRIGGER IF EXISTS ${row.trigger_name} ON ${row.event_object_table} CASCADE`);
                console.log(`   ✅ Dropped trigger: ${row.trigger_name} on ${row.event_object_table}`);
            } catch (error) {
                console.log(`   ⚠️  Warning dropping trigger ${row.trigger_name}: ${error.message}`);
            }
        }
        
        // Step 3: Drop all functions
        console.log('\n3️⃣ Dropping all functions...');
        const functionsResult = await client.query(`
            SELECT 
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p 
            INNER JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public'
        `);
        
        for (const row of functionsResult.rows) {
            try {
                await client.query(`DROP FUNCTION IF EXISTS ${row.function_name}(${row.args}) CASCADE`);
                console.log(`   ✅ Dropped function: ${row.function_name}`);
            } catch (error) {
                console.log(`   ⚠️  Warning dropping function ${row.function_name}: ${error.message}`);
            }
        }
        
        // Step 4: Drop all tables (CASCADE will handle foreign keys)
        console.log('\n4️⃣ Dropping all tables...');
        const tablesResult = await client.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
        `);
        
        let droppedTables = 0;
        for (const row of tablesResult.rows) {
            try {
                await client.query(`DROP TABLE IF EXISTS ${row.tablename} CASCADE`);
                console.log(`   ✅ Dropped table: ${row.tablename}`);
                droppedTables++;
            } catch (error) {
                console.log(`   ❌ Error dropping table ${row.tablename}: ${error.message}`);
            }
        }
        
        // Step 5: Drop all sequences
        console.log('\n5️⃣ Dropping all sequences...');
        const sequencesResult = await client.query(`
            SELECT sequencename 
            FROM pg_sequences 
            WHERE schemaname = 'public'
        `);
        
        for (const row of sequencesResult.rows) {
            try {
                await client.query(`DROP SEQUENCE IF EXISTS ${row.sequencename} CASCADE`);
                console.log(`   ✅ Dropped sequence: ${row.sequencename}`);
            } catch (error) {
                console.log(`   ⚠️  Warning dropping sequence ${row.sequencename}: ${error.message}`);
            }
        }
        
        // Step 6: Drop all types (if any custom types exist)
        console.log('\n6️⃣ Dropping all custom types...');
        const typesResult = await client.query(`
            SELECT typname 
            FROM pg_type t 
            INNER JOIN pg_namespace n ON t.typnamespace = n.oid 
            WHERE n.nspname = 'public' AND t.typtype = 'e'
        `);
        
        for (const row of typesResult.rows) {
            try {
                await client.query(`DROP TYPE IF EXISTS ${row.typname} CASCADE`);
                console.log(`   ✅ Dropped type: ${row.typname}`);
            } catch (error) {
                console.log(`   ⚠️  Warning dropping type ${row.typname}: ${error.message}`);
            }
        }
        
        // Step 7: Verify the database is empty
        console.log('\n🔍 Verifying database is empty...');
        
        const verifyTables = await client.query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        
        const verifyViews = await client.query(`
            SELECT COUNT(*) as view_count 
            FROM information_schema.views 
            WHERE table_schema = 'public'
        `);
        
        const verifyFunctions = await client.query(`
            SELECT COUNT(*) as function_count 
            FROM information_schema.routines 
            WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
        `);
        
        const tableCount = parseInt(verifyTables.rows[0].table_count);
        const viewCount = parseInt(verifyViews.rows[0].view_count);
        const functionCount = parseInt(verifyFunctions.rows[0].function_count);
        
        console.log('\n🎉 =====================================================');
        console.log('🎉 DATABASE CLEANUP COMPLETED!');
        console.log('🎉 =====================================================');
        console.log('📊 CLEANUP SUMMARY:');
        console.log(`   🗑️  Tables dropped: ${droppedTables}`);
        console.log(`   🗑️  Views dropped: ${viewsResult.rows.length}`);
        console.log(`   🗑️  Functions dropped: ${functionsResult.rows.length}`);
        console.log(`   🗑️  Triggers dropped: ${triggersResult.rows.length}`);
        console.log(`   🗑️  Sequences dropped: ${sequencesResult.rows.length}`);
        console.log('🎉 =====================================================');
        console.log('\n📋 VERIFICATION:');
        console.log(`   📋 Remaining tables: ${tableCount}`);
        console.log(`   👁️  Remaining views: ${viewCount}`);
        console.log(`   ⚙️  Remaining functions: ${functionCount}`);
        
        if (tableCount === 0 && viewCount === 0 && functionCount === 0) {
            console.log('\n✅ SUCCESS: Database is completely empty and ready for fresh schema installation!');
            console.log('🚀 You can now run your SQL schema script again.');
        } else {
            console.log('\n⚠️  WARNING: Some objects may still remain in the database.');
        }
        
    } catch (error) {
        console.error('❌ Fatal error during database cleanup:', error.message);
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
console.log('🧹 MATA GROUP DATABASE CLEANUP UTILITY');
console.log('🧹 ====================================');
console.log('⚠️  WARNING: This will DELETE ALL data and objects in matavolaille_db!');
console.log('');

// Execute the cleanup
emptyDatabase()
    .then(() => {
        console.log('\n🎉 Database cleanup completed successfully!');
        console.log('💡 You can now run: node run_database_schema.js');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Cleanup failed:', error.message);
        process.exit(1);
    });
