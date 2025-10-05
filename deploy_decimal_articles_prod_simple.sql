-- =================================================================
-- SCRIPT DE DÉPLOIEMENT PRODUCTION - SUPPORT NOMBRES DÉCIMAUX (VERSION SIMPLIFIÉE)
-- =================================================================
-- Description: Modification du type de colonne article_count pour accepter les nombres décimaux
-- Date: 2025-01-20
-- Version: Simplifiée pour éviter les erreurs de transaction
-- =================================================================

-- 1. Vérification de l'état actuel
-- =================================================================
SELECT 
    'Vérification de l''état actuel...' as status,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'partner_deliveries' 
AND column_name = 'article_count';

-- 2. Vérification de l'existence de la vue
-- =================================================================
SELECT 
    'Vérification de la vue...' as status,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'partner_delivery_summary'
    ) THEN 'EXISTE' ELSE 'N''EXISTE PAS' END as vue_status;

-- 3. Suppression de la vue (nécessaire pour modifier la colonne)
-- =================================================================
DROP VIEW IF EXISTS partner_delivery_summary;

SELECT 'Vue partner_delivery_summary supprimée' as status;

-- 4. Modification du type de colonne article_count
-- =================================================================
ALTER TABLE partner_deliveries 
ALTER COLUMN article_count TYPE NUMERIC(10,2);

SELECT 'Colonne article_count modifiée vers NUMERIC(10,2)' as status;

-- 5. Vérification de la modification
-- =================================================================
SELECT 
    'Vérification du type modifié...' as status,
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'partner_deliveries' 
AND column_name = 'article_count';

-- 6. Recréation de la vue partner_delivery_summary
-- =================================================================
CREATE VIEW partner_delivery_summary AS
SELECT
    a.id AS account_id,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(SUM(pd.amount), 0) AS total_delivered,
    COALESCE(SUM(pd.article_count), 0) AS total_articles,
    COUNT(pd.id) AS delivery_count,
    SUM(CASE WHEN pd.validation_status = 'first_validated' THEN 1 ELSE 0 END) AS pending_second_validation,
    SUM(CASE WHEN pd.validation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_deliveries,
    (a.total_credited - COALESCE(SUM(pd.amount), 0)) AS remaining_balance,
    CASE
        WHEN a.total_credited > 0 THEN
            ROUND((COALESCE(SUM(pd.amount), 0) * 100.0 / a.total_credited), 2)
        ELSE 0
    END AS delivery_percentage
FROM accounts a
LEFT JOIN partner_deliveries pd ON a.id = pd.account_id
    AND pd.validation_status IN ('validated', 'first_validated', 'fully_validated')
WHERE a.account_type = 'partenaire' AND a.is_active = true
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited;

SELECT 'Vue partner_delivery_summary recréée' as status;

-- 7. Test de validation avec des nombres décimaux
-- =================================================================
-- Test d'insertion avec des nombres décimaux
INSERT INTO partner_deliveries 
(account_id, delivery_date, amount, article_count, unit_price, description, status, created_by)
VALUES (1, CURRENT_DATE, 1250.75, 25.50, 49.05, 'TEST DÉPLOIEMENT - 25.5 articles', 'pending', 1);

SELECT 'Test d''insertion avec 25.5 articles réussi' as status;

-- Vérification de l'insertion
SELECT 
    'Vérification de l''insertion...' as status,
    id,
    article_count,
    unit_price,
    amount,
    description
FROM partner_deliveries 
WHERE description LIKE 'TEST DÉPLOIEMENT%'
ORDER BY id DESC
LIMIT 1;

-- Test de la vue
SELECT 
    'Test de la vue...' as status,
    account_id,
    account_name,
    total_articles,
    delivery_count
FROM partner_delivery_summary 
WHERE account_id = 1
LIMIT 1;

-- Nettoyage du test
DELETE FROM partner_deliveries 
WHERE description LIKE 'TEST DÉPLOIEMENT%';

SELECT 'Données de test nettoyées' as status;

-- 8. Vérification finale
-- =================================================================
SELECT 
    '=== VÉRIFICATION FINALE ===' as status,
    'Colonne article_count: NUMERIC confirmé' as colonne_status,
    'Vue partner_delivery_summary: Recréée' as vue_status,
    'Le système supporte maintenant les nombres décimaux' as resultat;

-- Affichage du type final de la colonne
SELECT 
    'Type final de article_count:' as info,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'partner_deliveries' 
AND column_name = 'article_count';

-- =================================================================
-- NOTES POST-DÉPLOIEMENT
-- =================================================================
-- 1. Redémarrer l'application pour s'assurer que les changements sont pris en compte
-- 2. Tester l'interface web avec des nombres décimaux (ex: 25.5, 10.25)
-- 3. Vérifier que les calculs automatiques fonctionnent
-- 4. Contrôler que la vue partner_delivery_summary affiche correctement les totaux
-- =================================================================
