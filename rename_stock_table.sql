-- Migration: Renommer la table stock_soir en stock_mata
-- Date: $(Get-Date)
-- Raison: Éviter la confusion entre nom de table et nom de colonne

BEGIN;

-- Vérifier si la table stock_soir existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_soir') THEN
        -- Renommer la table
        ALTER TABLE stock_soir RENAME TO stock_mata;
        
        -- Renommer l'index primary key si il existe
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stock_soir_pkey') THEN
                ALTER INDEX stock_soir_pkey RENAME TO stock_mata_pkey;
            END IF;
        END $$;
        
        -- Renommer les autres indexes s'ils existent
        DO $$
        BEGIN
            -- Index sur date si il existe
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname LIKE '%stock_soir%date%') THEN
                ALTER INDEX IF EXISTS stock_soir_date_idx RENAME TO stock_mata_date_idx;
            END IF;
            
            -- Index sur point_de_vente si il existe
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname LIKE '%stock_soir%point%') THEN
                ALTER INDEX IF EXISTS stock_soir_point_de_vente_idx RENAME TO stock_mata_point_de_vente_idx;
            END IF;
        END $$;
        
        RAISE NOTICE 'Table stock_soir renommée en stock_mata avec succès';
    ELSE
        RAISE NOTICE 'Table stock_soir non trouvée - vérifier si elle existe déjà sous le nom stock_mata';
    END IF;
END $$;

-- Vérifier le résultat
SELECT 
    table_name,
    table_schema,
    table_type
FROM information_schema.tables 
WHERE table_name IN ('stock_soir', 'stock_mata')
ORDER BY table_name;

-- Afficher la structure de la table renommée
\d stock_mata

COMMIT; 