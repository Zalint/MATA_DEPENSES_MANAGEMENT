-- =====================================================
-- COMPREHENSIVE RENDER PRODUCTION DATABASE FIX
-- =====================================================
-- Script pour corriger les tables manquantes sur Render
-- 1. stock_mata table (pour les uploads de stock)
-- 2. stock_vivant_permissions table (pour les permissions Stock Vivant)

-- =====================================================
-- PARTIE 1: STOCK_MATA TABLE SETUP
-- =====================================================

-- Create the stock_mata table
CREATE TABLE IF NOT EXISTS stock_mata (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    point_de_vente VARCHAR(100) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    stock_matin DECIMAL(12,2) DEFAULT 0.00,
    stock_soir DECIMAL(12,2) DEFAULT 0.00,
    transfert DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_mata_date ON stock_mata(date);
CREATE INDEX IF NOT EXISTS idx_stock_mata_point_vente ON stock_mata(point_de_vente);
CREATE INDEX IF NOT EXISTS idx_stock_mata_produit ON stock_mata(produit);
CREATE INDEX IF NOT EXISTS idx_stock_mata_date_point ON stock_mata(date, point_de_vente);

-- Create unique constraint to prevent duplicates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_stock_mata_entry' 
        AND table_name = 'stock_mata'
    ) THEN
        ALTER TABLE stock_mata 
        ADD CONSTRAINT unique_stock_mata_entry 
        UNIQUE (date, point_de_vente, produit);
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE stock_mata IS 'Table pour stocker les données de stock quotidien par point de vente et produit';
COMMENT ON COLUMN stock_mata.date IS 'Date du stock';
COMMENT ON COLUMN stock_mata.point_de_vente IS 'Nom du point de vente';
COMMENT ON COLUMN stock_mata.produit IS 'Nom du produit';
COMMENT ON COLUMN stock_mata.stock_matin IS 'Stock du matin en FCFA';
COMMENT ON COLUMN stock_mata.stock_soir IS 'Stock du soir en FCFA';
COMMENT ON COLUMN stock_mata.transfert IS 'Montant des transferts en FCFA';

-- Create function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_stock_mata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_stock_mata_updated_at ON stock_mata;
CREATE TRIGGER trigger_update_stock_mata_updated_at
    BEFORE UPDATE ON stock_mata
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_mata_updated_at();

-- =====================================================
-- PARTIE 2: STOCK_VIVANT_PERMISSIONS TABLE SETUP
-- =====================================================

-- Create the stock_vivant_permissions table
CREATE TABLE IF NOT EXISTS stock_vivant_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_user ON stock_vivant_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_granted_by ON stock_vivant_permissions(granted_by);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_permissions_active ON stock_vivant_permissions(is_active);

-- Add comments for documentation
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

-- =====================================================
-- VERIFICATION ET RESULTATS
-- =====================================================

-- Verify stock_mata table
SELECT 'stock_mata table created successfully!' as status_stock_mata;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_mata' 
ORDER BY ordinal_position;

-- Verify stock_vivant_permissions table
SELECT 'stock_vivant_permissions table created successfully!' as status_permissions;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant_permissions' 
ORDER BY ordinal_position;

-- Show current stock vivant permissions granted
SELECT 
    u.username,
    u.full_name,
    u.role,
    svp.is_active as has_stock_vivant_access,
    svp.granted_at,
    ug.username as granted_by_username
FROM users u
LEFT JOIN stock_vivant_permissions svp ON u.id = svp.user_id
LEFT JOIN users ug ON svp.granted_by = ug.id
WHERE u.role IN ('directeur', 'directeur_general', 'pca', 'admin')
ORDER BY u.role, u.full_name;

-- Show stock_mata table info
SELECT COUNT(*) as stock_mata_records FROM stock_mata;

-- Final success message
SELECT '🎉 RENDER PRODUCTION DATABASE FIXED SUCCESSFULLY! 🎉' as final_status;
SELECT 'Both stock_mata and stock_vivant_permissions tables are now ready!' as message; 