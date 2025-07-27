-- Script pour mettre à jour la base de données PROD
-- Ajouter le champ pl_final à la table dashboard_snapshots

-- Vérifier si la colonne existe déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'dashboard_snapshots' 
        AND column_name = 'pl_final'
    ) THEN
        -- Ajouter la colonne pl_final
        ALTER TABLE dashboard_snapshots 
        ADD COLUMN pl_final DECIMAL(15,2) DEFAULT 0;
        
        RAISE NOTICE 'Colonne pl_final ajoutée à dashboard_snapshots';
    ELSE
        RAISE NOTICE 'Colonne pl_final existe déjà dans dashboard_snapshots';
    END IF;
END $$;

-- Vérifier aussi la colonne livraisons_partenaires
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'dashboard_snapshots' 
        AND column_name = 'livraisons_partenaires'
    ) THEN
        -- Ajouter la colonne livraisons_partenaires
        ALTER TABLE dashboard_snapshots 
        ADD COLUMN livraisons_partenaires DECIMAL(15,2) DEFAULT 0;
        
        RAISE NOTICE 'Colonne livraisons_partenaires ajoutée à dashboard_snapshots';
    ELSE
        RAISE NOTICE 'Colonne livraisons_partenaires existe déjà dans dashboard_snapshots';
    END IF;
END $$;

-- Afficher la structure de la table pour vérification
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'dashboard_snapshots' 
ORDER BY ordinal_position; 