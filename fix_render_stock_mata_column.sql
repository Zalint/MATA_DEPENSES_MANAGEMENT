-- =====================================================
-- FIX STOCK_MATA COLUMN NAME ON RENDER
-- =====================================================
-- Script pour corriger le nom de colonne dans stock_mata
-- Le problème: table a 'date_stock' mais le code utilise 'date'

-- Vérifier d'abord la structure actuelle de la table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_mata' 
ORDER BY ordinal_position;

-- Si la colonne s'appelle 'date_stock', la renommer en 'date'
DO $$
BEGIN
    -- Vérifier si la colonne 'date_stock' existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_mata' 
        AND column_name = 'date_stock'
    ) THEN
        -- Renommer la colonne
        ALTER TABLE stock_mata RENAME COLUMN date_stock TO date;
        RAISE NOTICE 'Colonne date_stock renommée en date avec succès';
    ELSE
        RAISE NOTICE 'La colonne date_stock n''existe pas ou est déjà nommée date';
    END IF;
END $$;

-- Vérifier que la contrainte unique utilise le bon nom de colonne
DO $$
DECLARE
    constraint_rec RECORD;
BEGIN
    -- Supprimer l'ancienne contrainte si elle existe avec date_stock
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'stock_mata' 
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'date_stock'
    ) THEN
        -- Trouver et supprimer la contrainte
        FOR constraint_rec IN 
            SELECT constraint_name 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'stock_mata' 
            AND tc.constraint_type = 'UNIQUE'
            AND kcu.column_name = 'date_stock'
        LOOP
            EXECUTE 'ALTER TABLE stock_mata DROP CONSTRAINT ' || constraint_rec.constraint_name;
            RAISE NOTICE 'Ancienne contrainte % supprimée', constraint_rec.constraint_name;
        END LOOP;
    END IF;
    
    -- Créer la nouvelle contrainte avec le bon nom de colonne
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_stock_mata_entry' 
        AND table_name = 'stock_mata'
    ) THEN
        ALTER TABLE stock_mata 
        ADD CONSTRAINT unique_stock_mata_entry 
        UNIQUE (date, point_de_vente, produit);
        RAISE NOTICE 'Nouvelle contrainte unique_stock_mata_entry créée avec succès';
    ELSE
        RAISE NOTICE 'Contrainte unique_stock_mata_entry existe déjà';
    END IF;
END $$;

-- Créer les index manquants si nécessaire
CREATE INDEX IF NOT EXISTS idx_stock_mata_date ON stock_mata(date);
CREATE INDEX IF NOT EXISTS idx_stock_mata_point_vente ON stock_mata(point_de_vente);
CREATE INDEX IF NOT EXISTS idx_stock_mata_produit ON stock_mata(produit);
CREATE INDEX IF NOT EXISTS idx_stock_mata_date_point ON stock_mata(date, point_de_vente);

-- Maintenant créer la table stock_vivant_permissions qui manque
CREATE TABLE IF NOT EXISTS stock_vivant_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id)
);

-- Create indexes for stock_vivant_permissions
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_user ON stock_vivant_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_granted_by ON stock_vivant_permissions(granted_by);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_active ON stock_vivant_permissions(is_active);

-- Add comments for stock_vivant_permissions
COMMENT ON TABLE stock_vivant_permissions IS 'Table pour gérer les permissions d''accès au module stock vivant';
COMMENT ON COLUMN stock_vivant_permissions.user_id IS 'ID de l''utilisateur qui reçoit la permission';
COMMENT ON COLUMN stock_vivant_permissions.granted_by IS 'ID de l''utilisateur qui a accordé la permission (DG)';
COMMENT ON COLUMN stock_vivant_permissions.granted_at IS 'Date d''octroi de la permission';
COMMENT ON COLUMN stock_vivant_permissions.is_active IS 'Statut actif de la permission';

-- Create function to check stock vivant access permissions
CREATE OR REPLACE FUNCTION can_access_stock_vivant(user_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    user_role VARCHAR(20);
    has_permission BOOLEAN;
BEGIN
    -- Get user role
    SELECT role INTO user_role FROM users WHERE id = user_id_param;
    
    -- DG, PCA and admin always have access
    IF user_role IN ('directeur_general', 'pca', 'admin') THEN
        RETURN TRUE;
    END IF;
    
    -- Check if directeur has been granted permission
    IF user_role = 'directeur' THEN
        SELECT EXISTS(
            SELECT 1 FROM stock_vivant_permissions 
            WHERE user_id = user_id_param AND is_active = true
        ) INTO has_permission;
        
        RETURN has_permission;
    END IF;
    
    -- Other roles don't have access
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant initial permissions to all existing directors
DO $$
DECLARE
    grantor_id INTEGER;
    director_record RECORD;
BEGIN
    -- Find a DG, PCA, or admin user to be the grantor
    SELECT id INTO grantor_id 
    FROM users 
    WHERE role IN ('directeur_general', 'pca', 'admin') 
    AND is_active = true 
    LIMIT 1;
    
    -- If no DG/PCA/admin found, use the first active user
    IF grantor_id IS NULL THEN
        SELECT id INTO grantor_id 
        FROM users 
        WHERE is_active = true 
        LIMIT 1;
    END IF;
    
    -- Grant permissions to all active directors
    IF grantor_id IS NOT NULL THEN
        FOR director_record IN 
            SELECT id FROM users 
            WHERE role = 'directeur' AND is_active = true
        LOOP
            INSERT INTO stock_vivant_permissions (user_id, granted_by, is_active)
            VALUES (director_record.id, grantor_id, true)
            ON CONFLICT (user_id) DO NOTHING;
        END LOOP;
        
        RAISE NOTICE 'Permissions Stock Vivant accordées aux directeurs par l''utilisateur ID: %', grantor_id;
    ELSE
        RAISE NOTICE 'Aucun utilisateur trouvé pour accorder les permissions Stock Vivant';
    END IF;
END $$;

-- Vérification finale
SELECT 'stock_mata column fixed and stock_vivant_permissions created!' as status;

-- Afficher la structure corrigée de stock_mata
SELECT 
    'stock_mata structure:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_mata' 
ORDER BY ordinal_position;

-- Afficher la structure de stock_vivant_permissions
SELECT 
    'stock_vivant_permissions structure:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant_permissions' 
ORDER BY ordinal_position;

-- Afficher les permissions accordées
SELECT 
    'stock_vivant_permissions granted:' as info,
    u.username,
    u.full_name,
    u.role,
    svp.is_active as has_stock_vivant_access,
    svp.granted_at
FROM users u
LEFT JOIN stock_vivant_permissions svp ON u.id = svp.user_id
WHERE u.role IN ('directeur', 'directeur_general', 'pca', 'admin')
ORDER BY u.role, u.full_name;

SELECT '🎉 RENDER DATABASE FIXED SUCCESSFULLY! 🎉' as final_status; 