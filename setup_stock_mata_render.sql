-- =================================================================
-- SQL Script to Set Up stock_mata Table on Render PostgreSQL
-- =================================================================

-- Step 1: Create the stock_mata table
CREATE TABLE IF NOT EXISTS stock_mata (
    id SERIAL PRIMARY KEY,
    date_stock DATE NOT NULL,
    point_de_vente VARCHAR(100) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    stock_matin DECIMAL(12,2) DEFAULT 0.00,
    stock_soir DECIMAL(12,2) DEFAULT 0.00,
    transfert DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_mata_date ON stock_mata(date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_mata_point_vente ON stock_mata(point_de_vente);
CREATE INDEX IF NOT EXISTS idx_stock_mata_produit ON stock_mata(produit);
CREATE INDEX IF NOT EXISTS idx_stock_mata_date_point ON stock_mata(date_stock, point_de_vente);

-- Step 3: Create unique constraint to prevent duplicates
-- First check if constraint exists, then add if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_stock_mata_entry' 
        AND table_name = 'stock_mata'
    ) THEN
        ALTER TABLE stock_mata 
        ADD CONSTRAINT unique_stock_mata_entry 
        UNIQUE (date_stock, point_de_vente, produit);
    END IF;
END $$;

-- Step 4: Add comments for documentation
COMMENT ON TABLE stock_mata IS 'Table pour stocker les données de stock quotidien par point de vente et produit';
COMMENT ON COLUMN stock_mata.date_stock IS 'Date du stock';
COMMENT ON COLUMN stock_mata.point_de_vente IS 'Nom du point de vente';
COMMENT ON COLUMN stock_mata.produit IS 'Nom du produit';
COMMENT ON COLUMN stock_mata.stock_matin IS 'Stock du matin en FCFA';
COMMENT ON COLUMN stock_mata.stock_soir IS 'Stock du soir en FCFA';
COMMENT ON COLUMN stock_mata.transfert IS 'Montant des transferts en FCFA';

-- Step 5: Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_stock_mata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_stock_mata_updated_at ON stock_mata;
CREATE TRIGGER trigger_update_stock_mata_updated_at
    BEFORE UPDATE ON stock_mata
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_mata_updated_at();

-- Step 7: Verify the table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_mata' 
ORDER BY ordinal_position;

-- Step 8: Check indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'stock_mata';

-- Step 9: Check constraints
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'stock_mata';

-- =================================================================
-- Optional: Sample data insertion (remove if not needed)
-- =================================================================

-- Insert sample data to test the table (uncomment if needed)
/*
INSERT INTO stock_mata (date_stock, point_de_vente, produit, stock_matin, stock_soir, transfert) VALUES
('2025-06-19', 'Mbao', 'Boeuf', 85890.96, 522503.34, 0.00),
('2025-06-19', 'Mbao', 'Poulet', 176800.00, 163200.00, 0.00),
('2025-06-19', 'O.Foire', 'Agneau', 0.00, 103500.00, 0.00),
('2025-06-19', 'Abattage', 'Boeuf', 1690900.00, 0.00, 0.00),
('2025-06-19', 'Keur Massar', 'Boeuf', 0.00, 125423.63, 0.00)
ON CONFLICT (date_stock, point_de_vente, produit) DO NOTHING;
*/

-- =================================================================
-- Verification queries
-- =================================================================

-- Count total records
SELECT COUNT(*) as total_records FROM stock_mata;

-- Show latest date with data
SELECT MAX(date_stock) as latest_date FROM stock_mata;

-- Show summary by date
SELECT 
    date_stock,
    COUNT(*) as number_of_entries,
    SUM(stock_soir) as total_stock_soir
FROM stock_mata 
GROUP BY date_stock 
ORDER BY date_stock DESC;

-- =================================================================
-- Success message
-- =================================================================
SELECT 'stock_mata table setup completed successfully!' as status; 