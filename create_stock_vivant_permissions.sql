-- =====================================================
-- STOCK VIVANT PERMISSIONS TABLE
-- =====================================================
-- Table pour gérer les permissions d'accès au stock vivant

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
COMMENT ON TABLE stock_vivant_permissions IS 'Table pour gérer les permissions d\'accès au module stock vivant';
COMMENT ON COLUMN stock_vivant_permissions.user_id IS 'ID de l\'utilisateur qui reçoit la permission';
COMMENT ON COLUMN stock_vivant_permissions.granted_by IS 'ID de l\'utilisateur qui a accordé la permission (DG)';
COMMENT ON COLUMN stock_vivant_permissions.granted_at IS 'Date d\'octroi de la permission';
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

-- Verify the table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant_permissions' 
ORDER BY ordinal_position;

-- Success message
SELECT 'stock_vivant_permissions table created successfully!' as status; 