-- =====================================================
-- MIGRATION: Ajouter le type de compte "special"
-- Date: 2025-10-28
-- Description: Permet de créer des comptes isolés qui ne contribuent pas au PL, Cash et Solde
-- =====================================================

-- 1. Supprimer l'ancienne contrainte CHECK si elle existe
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- 2. Ajouter la nouvelle contrainte avec 'special' et 'depot' inclus
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check 
    CHECK (account_type IN ('classique', 'partenaire', 'statut', 'Ajustement', 'depot', 'special'));

-- 3. Vérification: Afficher les types de comptes existants
SELECT DISTINCT account_type, COUNT(*) as count
FROM accounts
GROUP BY account_type
ORDER BY account_type;

-- =====================================================
-- NOTES D'UTILISATION
-- =====================================================
-- Pour créer un compte special:
-- INSERT INTO accounts (account_name, account_type, user_id, created_by) 
-- VALUES ('Mon Compte Special', 'special', 1, 1);
--
-- Pour convertir un compte existant:
-- UPDATE accounts SET account_type = 'special' WHERE id = <compte_id>;
-- =====================================================
