-- MATA GROUP - ADD COMPTABLE ROLE
-- =====================================================
-- This script adds the 'comptable' (accountant) role
-- Comptable has read-only access to all data
-- =====================================================

-- Update users table role constraint to include 'comptable'
DO $$
BEGIN
    -- Drop existing role check constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'users_role_check' AND table_name = 'users') THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
        RAISE NOTICE 'Dropped existing users_role_check constraint';
    END IF;
    
    -- Add updated constraint with comptable role
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin', 'comptable'));
    
    RAISE NOTICE 'Added comptable role to users_role_check constraint';
END $$;

-- Verification
SELECT 'Comptable role added successfully!' as message;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'role';
