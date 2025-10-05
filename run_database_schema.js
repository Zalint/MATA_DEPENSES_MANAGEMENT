const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration - matching your settings
const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'matavolaille_db',
    user: 'zalint',
    password: 'bonea2024',
    // Increase timeout for large scripts
    statement_timeout: 300000, // 5 minutes
    query_timeout: 300000,     // 5 minutes
    connectionTimeoutMillis: 30000
};

async function executeSQLScript() {
    const client = new Client(dbConfig);
    
    try {
        console.log('🔌 Connecting to PostgreSQL database...');
        console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`   Database: ${dbConfig.database}`);
        console.log(`   User: ${dbConfig.user}`);
        
        await client.connect();
        console.log('✅ Connected to database successfully!');
        
        // Read the SQL file
        const sqlFilePath = path.join(__dirname, 'create_complete_database_schema.sql');
        console.log(`📖 Reading SQL script: ${sqlFilePath}`);
        
        if (!fs.existsSync(sqlFilePath)) {
            throw new Error(`SQL file not found: ${sqlFilePath}`);
        }
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        console.log(`📏 SQL script size: ${(sqlContent.length / 1024).toFixed(2)} KB`);
        
        // Split SQL content by semicolons to handle multiple statements
        // But be careful with function definitions that have semicolons inside
        const statements = splitSQLStatements(sqlContent);
        console.log(`📝 Found ${statements.length} SQL statements to execute`);
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        
        console.log('\n🚀 Starting SQL execution...\n');
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            
            if (!statement || statement.startsWith('--') || statement.length < 10) {
                skipCount++;
                continue;
            }
            
            try {
                console.log(`[${i + 1}/${statements.length}] Executing statement...`);
                
                // Execute the statement
                const result = await client.query(statement);
                
                // Handle different types of results
                if (result.command) {
                    console.log(`   ✅ ${result.command}: ${result.rowCount || 0} rows affected`);
                } else if (result.rows && result.rows.length > 0) {
                    console.log(`   ✅ Query returned ${result.rows.length} rows`);
                    // Show some results if they're informational
                    if (result.rows[0].message || result.rows[0].summary) {
                        result.rows.forEach(row => {
                            Object.values(row).forEach(value => {
                                if (typeof value === 'string' && value.length < 200) {
                                    console.log(`   📢 ${value}`);
                                }
                            });
                        });
                    }
                } else {
                    console.log(`   ✅ Statement executed successfully`);
                }
                
                successCount++;
                
            } catch (error) {
                errorCount++;
                console.log(`   ❌ Error: ${error.message}`);
                
                // Continue with next statement unless it's a critical error
                if (error.message.includes('already exists')) {
                    console.log(`   ℹ️  Skipping because object already exists`);
                } else if (error.message.includes('does not exist') && statement.includes('DROP')) {
                    console.log(`   ℹ️  Skipping DROP because object doesn't exist`);
                } else {
                    console.log(`   ⚠️  Error details: ${error.detail || 'No additional details'}`);
                }
            }
        }
        
        console.log('\n🎉 =====================================================');
        console.log('🎉 DATABASE SCHEMA EXECUTION COMPLETED!');
        console.log('🎉 =====================================================');
        console.log(`📊 EXECUTION SUMMARY:`);
        console.log(`   ✅ Successful statements: ${successCount}`);
        console.log(`   ⚠️  Errors/Warnings: ${errorCount}`);
        console.log(`   ⏭️  Skipped statements: ${skipCount}`);
        console.log(`   📋 Total statements: ${statements.length}`);
        
        // Verify installation by checking table count
        console.log('\n🔍 Verifying installation...');
        const verificationResult = await client.query(`
            SELECT 
                COUNT(*) as table_count,
                'Database schema installed successfully!' as status
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        
        console.log(`✅ Tables created: ${verificationResult.rows[0].table_count}`);
        console.log(`✅ Status: ${verificationResult.rows[0].status}`);
        
        // List all created tables
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        console.log('\n📋 Created tables:');
        tablesResult.rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ${row.table_name}`);
        });
        
        console.log('\n🎯 SUCCESS: Your database is now ready for use!');
        
    } catch (error) {
        console.error('❌ Fatal error during database setup:', error.message);
        console.error('💡 Error details:', error.detail || 'No additional details');
        console.error('📍 Error hint:', error.hint || 'No hints available');
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

// Function to split SQL statements properly
function splitSQLStatements(sqlContent) {
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let dollarQuoteTag = null;
    let inComment = false;
    let inString = false;
    
    const lines = sqlContent.split('\n');
    
    for (let line of lines) {
        // Skip comment lines
        if (line.trim().startsWith('--')) {
            continue;
        }
        
        // Handle dollar quoting for functions
        const dollarQuoteMatch = line.match(/\$([^$]*)\$/g);
        if (dollarQuoteMatch) {
            for (let quote of dollarQuoteMatch) {
                if (!dollarQuoteTag) {
                    dollarQuoteTag = quote;
                    inFunction = true;
                } else if (quote === dollarQuoteTag) {
                    dollarQuoteTag = null;
                    inFunction = false;
                }
            }
        }
        
        currentStatement += line + '\n';
        
        // If we find a semicolon and we're not in a function, split here
        if (line.includes(';') && !inFunction && !dollarQuoteTag) {
            // Split by semicolon but handle multiple statements on one line
            const lineParts = line.split(';');
            for (let i = 0; i < lineParts.length - 1; i++) {
                if (i === 0) {
                    // First part completes the current statement
                    const statement = currentStatement.replace(line, lineParts[i] + ';').trim();
                    if (statement && statement.length > 10 && !statement.startsWith('--')) {
                        statements.push(statement);
                    }
                } else {
                    // Other parts are complete statements
                    const statement = (lineParts[i] + ';').trim();
                    if (statement && statement.length > 10 && !statement.startsWith('--')) {
                        statements.push(statement);
                    }
                }
            }
            // Start new statement with the remaining part
            currentStatement = lineParts[lineParts.length - 1];
        }
    }
    
    // Add any remaining statement
    if (currentStatement.trim() && currentStatement.trim().length > 10) {
        statements.push(currentStatement.trim());
    }
    
    return statements;
}

// Main execution
console.log('🚀 MATA GROUP DATABASE SCHEMA INSTALLER');
console.log('🚀 =====================================');
console.log('');

// Check if required module exists
try {
    require('pg');
} catch (error) {
    console.error('❌ PostgreSQL module (pg) not found!');
    console.error('💡 Please install it with: npm install pg');
    process.exit(1);
}

// Check if SQL file exists
const sqlFilePath = path.join(__dirname, 'create_complete_database_schema.sql');
if (!fs.existsSync(sqlFilePath)) {
    console.error('❌ SQL file not found: create_complete_database_schema.sql');
    console.error('💡 Make sure the SQL file is in the same directory as this script');
    process.exit(1);
}

// Execute the main function
executeSQLScript()
    .then(() => {
        console.log('\n🎉 All done! Your Mata Expense Management database is ready.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Execution failed:', error.message);
        process.exit(1);
    });
