-- =====================================================
-- MIGRATION FINALE: Ajouter le type de compte "special"
-- Date: 2025-10-28
-- Types existants confirmés: Ajustement, classique, creance, depot, partenaire, statut
-- =====================================================

-- 1. Supprimer l'ancienne contrainte CHECK
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- 2. Ajouter la nouvelle contrainte avec 'special' inclus
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check 
    CHECK (account_type IN (
        'Ajustement',
        'classique', 
        'creance',
        'depot',
        'partenaire', 
        'special',
        'statut'
    ));

-- 3. Vérification finale
SELECT DISTINCT account_type, COUNT(*) as count
FROM accounts
GROUP BY account_type
ORDER BY account_type;

-- =====================================================
-- SUCCÈS ! Le type 'special' est maintenant disponible
-- =====================================================
-- Pour créer un compte special:
-- INSERT INTO accounts (account_name, account_type, user_id, created_by) 
-- VALUES ('Mon Compte Special', 'special', 1, 1);
-- =====================================================
