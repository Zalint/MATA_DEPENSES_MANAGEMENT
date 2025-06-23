-- =================================================================
-- SQL Script to Set Up stock_vivant Table on Render PostgreSQL
-- =================================================================

-- Step 1: Create the stock_vivant table
CREATE TABLE IF NOT EXISTS stock_vivant (
    id SERIAL PRIMARY KEY,
    date_stock DATE NOT NULL,
    categorie VARCHAR(50) NOT NULL, -- Ovin, Caprin, Bovin, Cheval, Ane, Aliments, Autres
    produit VARCHAR(100) NOT NULL, -- Brebis, Belier, Agneau, etc.
    quantite INTEGER DEFAULT 0,
    prix_unitaire DECIMAL(15,2) DEFAULT 0,
    total DECIMAL(15,2) DEFAULT 0,
    commentaire TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date ON stock_vivant(date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_categorie ON stock_vivant(categorie);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_produit ON stock_vivant(produit);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date_categorie ON stock_vivant(date_stock, categorie);

-- Step 3: Create unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_vivant_unique 
ON stock_vivant(date_stock, categorie, produit);

-- Step 4: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_stock_vivant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger for auto-updating updated_at
CREATE TRIGGER update_stock_vivant_updated_at
    BEFORE UPDATE ON stock_vivant
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_vivant_updated_at();

-- Step 6: Add comments for documentation
COMMENT ON TABLE stock_vivant IS 'Table pour stocker les données de stock vivant (animaux et aliments)';
COMMENT ON COLUMN stock_vivant.date_stock IS 'Date du stock';
COMMENT ON COLUMN stock_vivant.categorie IS 'Catégorie du produit (Ovin, Caprin, Bovin, etc.)';
COMMENT ON COLUMN stock_vivant.produit IS 'Nom du produit spécifique';
COMMENT ON COLUMN stock_vivant.quantite IS 'Quantité en stock';
COMMENT ON COLUMN stock_vivant.prix_unitaire IS 'Prix unitaire en FCFA';
COMMENT ON COLUMN stock_vivant.total IS 'Total = quantité × prix unitaire';
COMMENT ON COLUMN stock_vivant.commentaire IS 'Commentaires ou notes';

-- Step 7: Verify the table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant' 
ORDER BY ordinal_position;

-- Step 8: Check indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'stock_vivant';

-- Step 9: Check constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'stock_vivant';

-- =================================================================
-- Success message
-- =================================================================
SELECT 'stock_vivant table setup completed successfully!' as status;

-- =====================================================
-- STOCK VIVANT PERMISSIONS SETUP FOR RENDER
-- =====================================================
-- Script pour créer la table stock_vivant_permissions sur Render
-- et accorder les permissions initiales aux directeurs

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
-- This is done by finding a DG/PCA/admin user as the grantor
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
        
        RAISE NOTICE 'Permissions accordées aux directeurs par l''utilisateur ID: %', grantor_id;
    ELSE
        RAISE NOTICE 'Aucun utilisateur trouvé pour accorder les permissions';
    END IF;
END $$;

-- Verify the setup
SELECT 'stock_vivant_permissions table created successfully!' as status;

-- Show current permissions
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

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant_permissions' 
ORDER BY ordinal_position; 