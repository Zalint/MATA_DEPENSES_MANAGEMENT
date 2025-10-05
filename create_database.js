const { Client } = require('pg');

async function createDatabase() {
    // Connect to postgres database using zalint user
    const masterClient = new Client({
        host: 'localhost',
        port: 5432,
        database: 'postgres', // Connect to default postgres database
        user: 'zalint',       // Use zalint user (we know this works)
        password: 'bonea2024', // We know this password works
    });
    
    try {
        console.log('🔌 Connecting to PostgreSQL as superuser...');
        await masterClient.connect();
        console.log('✅ Connected to PostgreSQL successfully!');
        
        console.log('\n🗑️ Dropping database if it exists...');
        try {
            await masterClient.query('DROP DATABASE IF EXISTS matavolaille_db');
            console.log('✅ Database dropped (if it existed)');
        } catch (error) {
            console.log('⚠️ Warning dropping database:', error.message);
        }
        
        console.log('\n🏗️ Creating new database...');
        await masterClient.query('CREATE DATABASE matavolaille_db');
        console.log('✅ Database matavolaille_db created successfully!');
        
        console.log('\n🔐 Granting permissions to zalint user...');
        try {
            // Create zalint user if it doesn't exist
            await masterClient.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalint') THEN
                        CREATE ROLE zalint WITH LOGIN PASSWORD 'bonea2024';
                    END IF;
                END $$;
            `);
            console.log('✅ User zalint created/verified');
            
            await masterClient.query('GRANT ALL PRIVILEGES ON DATABASE matavolaille_db TO zalint');
            console.log('✅ Permissions granted to zalint');
        } catch (error) {
            console.log('⚠️ Warning setting permissions:', error.message);
        }
        
        console.log('\n🎉 SUCCESS: Database matavolaille_db is ready!');
        console.log('🚀 You can now run: node run_database_schema.js');
        
    } catch (error) {
        console.error('❌ Fatal error during database creation:', error.message);
        console.error('💡 Error details:', error.detail || 'No additional details');
        console.error('📍 Error hint:', error.hint || 'No hints available');
        
        if (error.message.includes('authentication failed')) {
            console.error('\n🔐 Authentication Issue:');
            console.error('   The postgres superuser may require a password.');
            console.error('   Please check your PostgreSQL installation setup.');
        }
        
        process.exit(1);
        
    } finally {
        try {
            await masterClient.end();
            console.log('📪 Connection closed.');
        } catch (closeError) {
            console.error('⚠️ Warning: Error closing connection:', closeError.message);
        }
    }
}

// Main execution
console.log('🏗️ MATA GROUP DATABASE CREATOR');
console.log('🏗️ =============================');
console.log('');

createDatabase()
    .then(() => {
        console.log('\n🎉 Database creation completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Database creation failed:', error.message);
        process.exit(1);
    });
