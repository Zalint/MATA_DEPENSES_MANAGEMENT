const { Pool } = require('pg');

// Configuration pour Render (utilise DATABASE_URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixRenderExpensesTable() {
    try {
        console.log('🔧 === CORRECTION TABLE EXPENSES SUR RENDER ===');
        console.log('🌐 Connexion à la base Render...');
        
        // 1. Ajouter la colonne amount
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'amount') THEN
                    ALTER TABLE expenses ADD COLUMN amount NUMERIC;
                    RAISE NOTICE 'Colonne amount ajoutée à expenses';
                ELSE
                    RAISE NOTICE 'Colonne amount existe déjà';
                END IF;
            END $$;
        `);
        
        // 2. Ajouter unit_price
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'unit_price') THEN
                    ALTER TABLE expenses ADD COLUMN unit_price NUMERIC;
                    RAISE NOTICE 'Colonne unit_price ajoutée à expenses';
                ELSE
                    RAISE NOTICE 'Colonne unit_price existe déjà';
                END IF;
            END $$;
        `);
        
        // 3. Ajouter selected_for_invoice
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'selected_for_invoice') THEN
                    ALTER TABLE expenses ADD COLUMN selected_for_invoice BOOLEAN DEFAULT false;
                    RAISE NOTICE 'Colonne selected_for_invoice ajoutée à expenses';
                ELSE
                    RAISE NOTICE 'Colonne selected_for_invoice existe déjà';
                END IF;
            END $$;
        `);
        
        console.log('✅ Table expenses corrigée sur Render');
        console.log('🎯 L\'ajout de dépenses devrait maintenant fonctionner');
        console.log('🔄 Testez votre application Render');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        console.log('\n💡 Solutions:');
        console.log('   - Vérifiez la variable DATABASE_URL');
        console.log('   - Ou exécutez le script SQL fix_render_expenses_table.sql directement');
    } finally {
        await pool.end();
    }
}

// Exécuter uniquement si DATABASE_URL est définie
if (process.env.DATABASE_URL) {
    fixRenderExpensesTable();
} else {
    console.log('❌ Variable DATABASE_URL non définie');
    console.log('💡 Définissez DATABASE_URL ou utilisez le script SQL');
    console.log('📄 Script SQL disponible: fix_render_expenses_table.sql');
} 