-- =================================================================
-- SCRIPT DE CORRECTION POUR TABLE EXPENSES SUR RENDER
-- Ajoute les colonnes manquantes
-- =================================================================

-- 1. Ajouter la colonne amount si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'amount') THEN
        ALTER TABLE expenses ADD COLUMN amount NUMERIC;
        RAISE NOTICE 'Colonne amount ajoutée à expenses';
    ELSE
        RAISE NOTICE 'Colonne amount existe déjà';
    END IF;
END $$;

-- 2. Ajouter unit_price si manquante
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'unit_price') THEN
        ALTER TABLE expenses ADD COLUMN unit_price NUMERIC;
        RAISE NOTICE 'Colonne unit_price ajoutée à expenses';
    ELSE
        RAISE NOTICE 'Colonne unit_price existe déjà';
    END IF;
END $$;

-- 3. Ajouter selected_for_invoice si manquante
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'selected_for_invoice') THEN
        ALTER TABLE expenses ADD COLUMN selected_for_invoice BOOLEAN DEFAULT false;
        RAISE NOTICE 'Colonne selected_for_invoice ajoutée à expenses';
    ELSE
        RAISE NOTICE 'Colonne selected_for_invoice existe déjà';
    END IF;
END $$;

-- Afficher le résultat
SELECT 'Table expenses corrigée avec succès' as status; 