-- =====================================================
-- SETUP RAPIDE STOCK VIVANT
-- =====================================================

-- Créer la table stock_vivant
CREATE TABLE IF NOT EXISTS stock_vivant (
    id SERIAL PRIMARY KEY,
    date_stock DATE NOT NULL,
    categorie VARCHAR(50) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    quantite INTEGER DEFAULT 0,
    prix_unitaire DECIMAL(15,2) DEFAULT 0,
    total DECIMAL(15,2) DEFAULT 0,
    commentaire TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (date_stock, categorie, produit)
);

-- Créer la table des permissions
CREATE TABLE IF NOT EXISTS stock_vivant_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id)
);

-- Créer la fonction de vérification des permissions
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

-- Créer les index
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date ON stock_vivant (date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_categorie ON stock_vivant (categorie);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_produit ON stock_vivant (produit);

-- Vérification finale
SELECT 'Tables stock_vivant créées avec succès!' as status; 