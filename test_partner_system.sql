-- Script de test pour le système des comptes partenaires
-- Attention: Ce script est uniquement pour les tests et doit être adapté selon vos données

-- 1. Vérifier la structure des nouvelles tables
SELECT 
    'Structure des tables' as test_section,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('partner_account_directors', 'partner_deliveries', 'partner_expense_validations')
ORDER BY table_name, ordinal_position;

-- 2. Vérifier les nouvelles colonnes ajoutées aux tables existantes
SELECT 
    'Nouvelles colonnes' as test_section,
    table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns 
WHERE (table_name = 'expenses' AND column_name IN ('requires_validation', 'validation_status', 'is_partner_expense'))
   OR (table_name = 'accounts' AND column_name = 'account_type')
ORDER BY table_name, column_name;

-- 3. Lister les comptes partenaires existants
SELECT 
    'Comptes partenaires' as test_section,
    id,
    account_name,
    account_type,
    current_balance,
    total_credited,
    user_id,
    is_active
FROM accounts 
WHERE account_type = 'partenaire';

-- 4. Tester la vue partner_delivery_summary
SELECT 
    'Vue résumé livraisons' as test_section,
    *
FROM partner_delivery_summary;

-- 5. Vérifier les fonctions PostgreSQL
SELECT 
    'Fonctions disponibles' as test_section,
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_name IN ('handle_special_credit', 'validate_partner_delivery')
ORDER BY routine_name;

-- 6. Test d'insertion d'un directeur partenaire (exemple)
-- Décommentez et adaptez selon vos données
/*
-- Supposons que nous avons un compte partenaire (id=1) et un directeur (id=2)
INSERT INTO partner_account_directors (account_id, user_id) 
VALUES (1, 2)
ON CONFLICT (account_id, user_id) DO NOTHING;

SELECT 'Test assignation directeur' as test_section, * FROM partner_account_directors;
*/

-- 7. Test d'insertion d'une livraison (exemple)
-- Décommentez et adaptez selon vos données
/*
-- Supposons que nous avons un compte partenaire (id=1) et un utilisateur (id=1)
INSERT INTO partner_deliveries (account_id, delivery_date, article_count, amount, description, created_by)
VALUES (1, CURRENT_DATE, 10, 50000, 'Test livraison - 10 articles divers', 1);

SELECT 'Test livraison' as test_section, * FROM partner_deliveries WHERE account_id = 1;
*/

-- 8. Vérifier les index créés
SELECT 
    'Index créés' as test_section,
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('partner_account_directors', 'partner_deliveries', 'partner_expense_validations')
ORDER BY tablename, indexname;

-- 9. Test de la fonction handle_special_credit pour les partenaires
-- Décommentez et adaptez selon vos données
/*
-- Test avec un compte partenaire existant et un DG
SELECT 
    'Test crédit partenaire' as test_section,
    handle_special_credit(1, 1, 100000, 'Test crédit fonction', CURRENT_DATE) as credit_success;
*/

-- 10. Résumé des permissions par type de compte
SELECT 
    'Permissions par type' as test_section,
    account_type,
    'DG peut créditer: ' || 
    CASE 
        WHEN account_type = 'partenaire' THEN 'OUI (seul autorisé)'
        WHEN account_type IN ('classique', 'fournisseur', 'statut') THEN 'OUI (+ PCA)'
        WHEN account_type = 'creance' THEN 'OUI (+ directeurs assignés)'
        ELSE 'NON DÉFINI'
    END as credit_permissions,
    'Qui peut dépenser: ' ||
    CASE 
        WHEN account_type = 'partenaire' THEN 'DG + directeurs assignés'
        WHEN account_type = 'classique' THEN 'DG + PCA'
        WHEN account_type = 'creance' THEN 'DG + directeurs assignés'
        WHEN account_type = 'fournisseur' THEN 'DG + PCA'
        WHEN account_type = 'statut' THEN 'DG + PCA'
        ELSE 'NON DÉFINI'
    END as expense_permissions
FROM (
    SELECT DISTINCT account_type FROM accounts 
    WHERE account_type IS NOT NULL
) types;

-- 11. État des comptes partenaires avec leurs directeurs assignés
SELECT 
    'État comptes partenaires' as test_section,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(array_agg(u.full_name) FILTER (WHERE u.full_name IS NOT NULL), ARRAY[]::text[]) as assigned_directors
FROM accounts a
LEFT JOIN partner_account_directors pad ON a.id = pad.account_id
LEFT JOIN users u ON pad.user_id = u.id
WHERE a.account_type = 'partenaire' AND a.is_active = true
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited
ORDER BY a.account_name;

-- 12. Vérifier la cohérence des données
SELECT 
    'Vérifications' as test_section,
    'Comptes sans type' as check_type,
    COUNT(*) as count
FROM accounts 
WHERE account_type IS NULL AND is_active = true

UNION ALL

SELECT 
    'Vérifications' as test_section,
    'Livraisons non validées' as check_type,
    COUNT(*) as count
FROM partner_deliveries 
WHERE is_validated = false

UNION ALL

SELECT 
    'Vérifications' as test_section,
    'Comptes partenaires actifs' as check_type,
    COUNT(*) as count
FROM accounts 
WHERE account_type = 'partenaire' AND is_active = true;

-- Fin du script de test
SELECT 'Tests terminés' as message, CURRENT_TIMESTAMP as executed_at; 