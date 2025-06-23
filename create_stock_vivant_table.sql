-- =====================================================
-- STOCK VIVANT TABLE CREATION
-- =====================================================
-- Table pour stocker les données de stock vivant
-- (animaux et aliments vivants)

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date ON stock_vivant(date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_categorie ON stock_vivant(categorie);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_produit ON stock_vivant(produit);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date_categorie ON stock_vivant(date_stock, categorie);

-- Create unique constraint to avoid duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_vivant_unique 
ON stock_vivant(date_stock, categorie, produit);

-- Add update trigger
CREATE OR REPLACE FUNCTION update_stock_vivant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stock_vivant_updated_at
    BEFORE UPDATE ON stock_vivant
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_vivant_updated_at();

-- Add comments for documentation
COMMENT ON TABLE stock_vivant IS 'Table pour stocker les données de stock vivant (animaux et aliments)';
COMMENT ON COLUMN stock_vivant.date_stock IS 'Date du stock';
COMMENT ON COLUMN stock_vivant.categorie IS 'Catégorie du produit (Ovin, Caprin, Bovin, etc.)';
COMMENT ON COLUMN stock_vivant.produit IS 'Nom du produit spécifique';
COMMENT ON COLUMN stock_vivant.quantite IS 'Quantité en stock';
COMMENT ON COLUMN stock_vivant.prix_unitaire IS 'Prix unitaire en FCFA';
COMMENT ON COLUMN stock_vivant.total IS 'Total = quantité × prix unitaire';
COMMENT ON COLUMN stock_vivant.commentaire IS 'Commentaires ou notes';

-- Verify the table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_vivant' 
ORDER BY ordinal_position;

-- Check indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'stock_vivant';

-- Check constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'stock_vivant';

-- Success message
SELECT 'stock_vivant table created successfully!' as status; 