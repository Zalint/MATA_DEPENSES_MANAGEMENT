-- Script de correction des colonnes créance pour Render
-- À exécuter sur la base de données de production

-- 1. Vérifier si la table creance_clients existe
-- Si elle n'existe pas, la créer avec la bonne structure
CREATE TABLE IF NOT EXISTS creance_clients (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    client_address TEXT,
    initial_credit INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- 2. Si la table existe mais avec les mauvaises colonnes, corriger
-- Ajouter client_phone si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'creance_clients' AND column_name = 'client_phone'
    ) THEN
        -- Si c'est 'phone' qui existe, la renommer
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'creance_clients' AND column_name = 'phone'
        ) THEN
            ALTER TABLE creance_clients RENAME COLUMN phone TO client_phone;
        ELSE
            -- Sinon, ajouter la colonne
            ALTER TABLE creance_clients ADD COLUMN client_phone VARCHAR(50);
        END IF;
    END IF;
END $$;

-- 3. Ajouter client_address si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'creance_clients' AND column_name = 'client_address'
    ) THEN
        -- Si c'est 'address' qui existe, la renommer
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'creance_clients' AND column_name = 'address'
        ) THEN
            ALTER TABLE creance_clients RENAME COLUMN address TO client_address;
        ELSE
            -- Sinon, ajouter la colonne
            ALTER TABLE creance_clients ADD COLUMN client_address TEXT;
        END IF;
    END IF;
END $$;

-- 4. Créer la table creance_operations si elle n'existe pas
CREATE TABLE IF NOT EXISTS creance_operations (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES creance_clients(id) ON DELETE CASCADE,
    operation_type VARCHAR(10) NOT NULL CHECK (operation_type IN ('credit', 'debit')),
    amount INTEGER NOT NULL,
    operation_date DATE NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Créer les index nécessaires
CREATE UNIQUE INDEX IF NOT EXISTS idx_creance_clients_unique_active
ON creance_clients (account_id, client_name) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_creance_operations_client_id ON creance_operations(client_id);
CREATE INDEX IF NOT EXISTS idx_creance_operations_date ON creance_operations(operation_date);
CREATE INDEX IF NOT EXISTS idx_creance_operations_type ON creance_operations(operation_type);

-- 6. Vérifier la structure finale
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('creance_clients', 'creance_operations')
ORDER BY table_name, ordinal_position;
