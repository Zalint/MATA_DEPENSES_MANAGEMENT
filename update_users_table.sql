-- Script pour mettre à jour la structure de la table users
-- À exécuter avec un utilisateur ayant les permissions appropriées (postgres ou propriétaire de la table)

-- 1. Ajouter les colonnes manquantes
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Mettre à jour les utilisateurs existants
UPDATE users SET is_active = true WHERE is_active IS NULL;
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Ajouter une contrainte d'unicité pour les emails non vides
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique 
ON users (email) 
WHERE email IS NOT NULL AND email != '';

-- 4. Donner les permissions à l'utilisateur depenses_app
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO depenses_app;

-- 5. Vérifier la structure finale
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- 6. Afficher les utilisateurs existants
SELECT id, username, full_name, email, role, is_active, created_at FROM users ORDER BY id; 