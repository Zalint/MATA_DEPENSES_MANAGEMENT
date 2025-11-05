-- =====================================================
-- MIGRATION: Ajouter le type de compte "special" (CORRIGÉ)
-- Date: 2025-10-28
-- Description: Permet de créer des comptes isolés qui ne contribuent pas au PL, Cash et Solde
-- =====================================================

-- ÉTAPE 0: Vérifier les types de comptes existants
SELECT DISTINCT account_type, COUNT(*) as count
FROM accounts
GROUP BY account_type
ORDER BY account_type;

-- ÉTAPE 1: Normaliser les types existants si nécessaire
-- (Remplacer les valeurs NULL par 'classique')
UPDATE accounts 
SET account_type = 'classique' 
WHERE account_type IS NULL;

-- ÉTAPE 2: Identifier les types non-standards
-- Cette requête affiche les types qui ne sont pas dans la liste standard
SELECT DISTINCT account_type 
FROM accounts 
WHERE account_type NOT IN ('classique', 'partenaire', 'statut', 'Ajustement', 'depot', 'special', 'creance')
ORDER BY account_type;

-- ÉTAPE 3: Supprimer l'ancienne contrainte CHECK
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- ÉTAPE 4: Ajouter la nouvelle contrainte avec TOUS les types possibles
-- (Incluant les types découverts dans les données existantes)
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check 
    CHECK (account_type IN (
        'classique', 
        'partenaire', 
        'statut', 
        'Ajustement', 
        'depot', 
        'special',
        'creance'  -- Ajouté car souvent présent
    ));

-- ÉTAPE 5: Vérification finale - Afficher les types de comptes après migration
SELECT DISTINCT account_type, COUNT(*) as count
FROM accounts
GROUP BY account_type
ORDER BY account_type;

-- =====================================================
-- NOTES D'UTILISATION
-- =====================================================
-- Si des types non-standards sont découverts à l'ÉTAPE 2,
-- il faut soit:
-- 1. Les ajouter à la contrainte CHECK de l'ÉTAPE 4
-- 2. OU les convertir vers un type standard:
--    UPDATE accounts SET account_type = 'classique' WHERE account_type = 'type_inconnu';
-- =====================================================
