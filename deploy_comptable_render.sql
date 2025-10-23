-- =====================================================
-- DEPLOY RÔLE COMPTABLE - PRODUCTION RENDER
-- Date: 2025-01-10
-- =====================================================
-- IMPORTANT: Exécutez ce script sur la base de données 
-- Render après le déploiement du code
-- =====================================================

BEGIN;

-- Supprimer l'ancienne contrainte de rôle
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_role_check' 
        AND table_name = 'users'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
        RAISE NOTICE '✅ Ancienne contrainte supprimée';
    END IF;
END $$;

-- Ajouter la nouvelle contrainte incluant 'comptable'
ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin', 'comptable'));

-- Vérification
SELECT 
    '✅ Rôle Comptable ajouté avec succès!' as status,
    CURRENT_TIMESTAMP as executed_at;

-- Afficher les rôles valides
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'users_role_check';

-- Afficher les colonnes de la table users
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'role';

COMMIT;

-- =====================================================
-- RÉSULTAT ATTENDU:
-- ✅ Contrainte mise à jour avec les rôles:
--    - directeur
--    - directeur_general  
--    - pca
--    - admin
--    - comptable (NOUVEAU)
-- =====================================================

