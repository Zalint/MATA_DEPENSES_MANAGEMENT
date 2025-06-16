-- Script de vérification rapide pour les comptes après migration

-- 1. Compter les comptes par type
SELECT 
    'Comptes par type' as section,
    COALESCE(account_type, 'NULL') as type_compte,
    COUNT(*) as nombre
FROM accounts 
WHERE is_active = true
GROUP BY account_type
ORDER BY account_type;

-- 2. Lister les comptes actifs avec leurs types (même requête que l'API)
SELECT 
    'Comptes pour crédit (simulation API)' as section,
    a.id, 
    a.account_name, 
    COALESCE(a.account_type, 'classique') as account_type,
    a.current_balance, 
    a.total_credited, 
    u.full_name as user_name
FROM accounts a
LEFT JOIN users u ON a.user_id = u.id
WHERE a.is_active = true
ORDER BY COALESCE(a.account_type, 'classique'), a.account_name;

-- 3. Vérification des comptes sans type (ne devrait retourner aucune ligne)
SELECT 
    'Comptes problématiques' as section,
    id,
    account_name,
    account_type,
    is_active
FROM accounts 
WHERE is_active = true AND account_type IS NULL;

-- 4. Test de la contrainte account_type
SELECT 
    'Test contrainte' as section,
    constraint_name,
    check_clause
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%account_type%';

-- Message de fin
SELECT 
    CASE 
        WHEN (SELECT COUNT(*) FROM accounts WHERE is_active = true AND account_type IS NULL) = 0 
        THEN 'SUCCÈS: Tous les comptes ont un type défini ✓'
        ELSE 'ATTENTION: Il reste des comptes sans type ⚠️'
    END as statut_migration; 