-- =================================================================
-- SIMPLE SQL Script for stock_mata Table on Render PostgreSQL
-- =================================================================

-- Drop table if exists (careful - this will delete data!)
-- DROP TABLE IF EXISTS stock_mata;

-- Create the stock_mata table
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_mata_date ON stock_mata(date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_mata_point_vente ON stock_mata(point_de_vente);
CREATE INDEX IF NOT EXISTS idx_stock_mata_produit ON stock_mata(produit);
CREATE INDEX IF NOT EXISTS idx_stock_mata_date_point ON stock_mata(date_stock, point_de_vente);

-- Create unique constraint (simple version)
-- This will fail if constraint already exists, which is fine
ALTER TABLE stock_mata 
ADD CONSTRAINT unique_stock_mata_entry 
UNIQUE (date_stock, point_de_vente, produit);

-- Verification: Check if table exists and show structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_mata' 
ORDER BY ordinal_position;

-- Show success message
SELECT 'stock_mata table created successfully!' as status;

-- =================================================================
-- Alternative: If you get constraint error, run this instead:
-- =================================================================

/*
-- If the constraint already exists, you can check with:
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'stock_mata';

-- To drop and recreate constraint if needed:
-- ALTER TABLE stock_mata DROP CONSTRAINT IF EXISTS unique_stock_mata_entry;
-- ALTER TABLE stock_mata ADD CONSTRAINT unique_stock_mata_entry UNIQUE (date_stock, point_de_vente, produit);
*/ 