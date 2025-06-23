// Test script for Admin System
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'depenses_management',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testAdminSystem() {
    try {
        console.log('🔍 Testing Admin System...\n');

        // Test 1: Check if admin user exists
        console.log('1. Checking if admin user exists...');
        const adminCheck = await pool.query(
            'SELECT username, role, full_name FROM users WHERE role = $1',
            ['admin']
        );
        
        if (adminCheck.rows.length > 0) {
            console.log('✅ Admin user found:', adminCheck.rows[0]);
        } else {
            console.log('❌ Admin user not found');
            return;
        }

        // Test 2: Check if backup table exists
        console.log('\n2. Checking if account_backups table exists...');
        const tableCheck = await pool.query(
            `SELECT table_name FROM information_schema.tables 
             WHERE table_name = 'account_backups'`
        );
        
        if (tableCheck.rows.length > 0) {
            console.log('✅ account_backups table exists');
        } else {
            console.log('❌ account_backups table not found');
        }

        // Test 3: Check if admin functions exist
        console.log('\n3. Checking if admin functions exist...');
        const functionsCheck = await pool.query(
            `SELECT routine_name FROM information_schema.routines 
             WHERE routine_name LIKE 'admin_%' OR routine_name = 'generate_account_audit'
             ORDER BY routine_name`
        );
        
        if (functionsCheck.rows.length > 0) {
            console.log('✅ Admin functions found:');
            functionsCheck.rows.forEach(row => {
                console.log(`   - ${row.routine_name}`);
            });
        } else {
            console.log('❌ Admin functions not found');
        }

        // Test 4: Check if view exists
        console.log('\n4. Checking if backup summary view exists...');
        const viewCheck = await pool.query(
            `SELECT table_name FROM information_schema.views 
             WHERE table_name = 'account_backup_summary'`
        );
        
        if (viewCheck.rows.length > 0) {
            console.log('✅ account_backup_summary view exists');
        } else {
            console.log('❌ account_backup_summary view not found');
        }

        // Test 5: Test audit function (if there are accounts)
        console.log('\n5. Testing audit function...');
        const accountsCheck = await pool.query(
            'SELECT id FROM accounts LIMIT 1'
        );
        
        if (accountsCheck.rows.length > 0) {
            const accountId = accountsCheck.rows[0].id;
            const auditTest = await pool.query(
                'SELECT generate_account_audit($1) as audit',
                [accountId]
            );
            
            if (auditTest.rows.length > 0) {
                console.log('✅ Audit function works correctly');
                console.log('   Sample audit keys:', Object.keys(auditTest.rows[0].audit));
            } else {
                console.log('❌ Audit function failed');
            }
        } else {
            console.log('⚠️  No accounts found to test audit function');
        }

        console.log('\n🎉 Admin System Test Complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Run the SQL script: add_admin_role_and_backup.sql');
        console.log('2. Login with admin/admin123');
        console.log('3. Change the admin password immediately!');
        
    } catch (error) {
        console.error('❌ Error testing admin system:', error.message);
        console.log('\n💡 If you see permission errors, make sure to run:');
        console.log('   add_admin_role_and_backup.sql');
    } finally {
        await pool.end();
    }
}

// Run the test
testAdminSystem(); 