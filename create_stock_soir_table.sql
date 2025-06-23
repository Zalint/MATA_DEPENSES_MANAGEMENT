-- =====================================================
-- STOCK SOIR TABLE CREATION
-- =====================================================
-- Table pour stocker les données de stock du soir
-- par point de vente et par produit

CREATE TABLE IF NOT EXISTS stock_soir (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    point_de_vente VARCHAR(100) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    stock_matin DECIMAL(15,2) DEFAULT 0,
    stock_soir DECIMAL(15,2) DEFAULT 0,
    transfert DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_soir_date ON stock_soir(date);
CREATE INDEX IF NOT EXISTS idx_stock_soir_point_vente ON stock_soir(point_de_vente);
CREATE INDEX IF NOT EXISTS idx_stock_soir_produit ON stock_soir(produit);
CREATE INDEX IF NOT EXISTS idx_stock_soir_date_point ON stock_soir(date, point_de_vente);

-- Create unique constraint to avoid duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_soir_unique 
ON stock_soir(date, point_de_vente, produit);

-- Add update trigger
CREATE OR REPLACE FUNCTION update_stock_soir_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stock_soir_updated_at
    BEFORE UPDATE ON stock_soir
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_soir_updated_at(); 