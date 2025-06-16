-- Script de test pour les types de comptes
-- Exécutez ce script après avoir installé add_account_types.sql

-- 1. Vérifier que les colonnes ont été ajoutées
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'accounts' 
AND column_name IN ('account_type', 'access_restricted', 'allowed_roles')
ORDER BY column_name;

-- 2. Vérifier que les nouvelles tables existent
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('account_creditors', 'special_credit_history')
ORDER BY table_name;

-- 3. Vérifier que la fonction existe
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'handle_special_credit';

-- 4. Vérifier que la vue existe
SELECT table_name, table_type 
FROM information_schema.views 
WHERE table_name = 'accounts_with_creditors';

-- 5. Test de création d'un compte de chaque type (remplacez les IDs selon votre DB)
-- Note: Ces INSERT sont des exemples, adaptez les IDs selon vos données

-- Exemple compte classique (déjà existant normalement)
SELECT 'Test Compte Classique' as test_type, 
       COUNT(*) as count 
FROM accounts 
WHERE account_type = 'classique' OR account_type IS NULL;

-- Test création compte créance (exemple)
/*
INSERT INTO accounts (user_id, account_name, account_type, created_by) 
VALUES (2, 'Test Compte Créance', 'creance', 1);

-- Ajouter des créditeurs au compte créance
INSERT INTO account_creditors (account_id, user_id, creditor_type) 
VALUES (
    (SELECT id FROM accounts WHERE account_name = 'Test Compte Créance' LIMIT 1),
    1, 
    'dg'
);
*/

-- 6. Tester la fonction handle_special_credit
SELECT 'Test fonction handle_special_credit' as test_type,
       handle_special_credit(
           (SELECT id FROM accounts WHERE account_type = 'classique' LIMIT 1),  -- account_id
           1,  -- credited_by (ID du DG)
           1000,  -- amount
           'Test de crédit',  -- comment
           CURRENT_DATE  -- credit_date
       ) as function_result;

-- 7. Vérifier l'historique spécial
SELECT 'Historique spécial créé' as test_type, 
       COUNT(*) as count 
FROM special_credit_history 
WHERE comment = 'Test de crédit';

-- 8. Nettoyer le test
DELETE FROM special_credit_history WHERE comment = 'Test de crédit';
UPDATE accounts 
SET current_balance = current_balance - 1000, 
    total_credited = total_credited - 1000 
WHERE id = (SELECT id FROM accounts WHERE account_type = 'classique' LIMIT 1);

-- 9. Résultat final
SELECT 'Installation réussie!' as status,
       'Les types de comptes sont prêts à être utilisés' as message; 