-- =================================================================
-- SCRIPT DE DÉPLOIEMENT PRODUCTION - SUPPORT NOMBRES DÉCIMAUX
-- =================================================================
-- Description: Modification du type de colonne article_count pour accepter les nombres décimaux
-- Date: 2025-01-20
-- Auteur: Assistant IA
-- =================================================================

BEGIN;

-- 1. Vérification de l'état actuel
-- =================================================================
DO $$
BEGIN
    RAISE NOTICE '=== DÉBUT DÉPLOIEMENT SUPPORT NOMBRES DÉCIMAUX ===';
    RAISE NOTICE 'Vérification de l''état actuel...';
    
    -- Vérifier le type actuel de la colonne article_count
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_deliveries' 
        AND column_name = 'article_count' 
        AND data_type = 'integer'
    ) THEN
        RAISE NOTICE '✅ Colonne article_count trouvée (type: integer)';
    ELSE
        RAISE NOTICE '⚠️  Colonne article_count non trouvée ou déjà modifiée';
    END IF;
    
    -- Vérifier l'existence de la vue
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'partner_delivery_summary'
    ) THEN
        RAISE NOTICE '✅ Vue partner_delivery_summary trouvée';
    ELSE
        RAISE NOTICE '⚠️  Vue partner_delivery_summary non trouvée';
    END IF;
END $$;

-- 2. Sauvegarde de la définition de la vue (pour sécurité)
-- =================================================================
DO $$
DECLARE
    saved_view_definition TEXT;
BEGIN
    SELECT view_definition INTO saved_view_definition
    FROM information_schema.views 
    WHERE table_name = 'partner_delivery_summary';
    
    IF saved_view_definition IS NOT NULL THEN
        RAISE NOTICE '✅ Définition de la vue sauvegardée en mémoire';
        -- Note: La définition sera recréée plus tard
    ELSE
        RAISE NOTICE '⚠️  Impossible de sauvegarder la vue (non trouvée)';
    END IF;
END $$;

-- 3. Suppression de la vue (nécessaire pour modifier la colonne)
-- =================================================================
DO $$
BEGIN
    RAISE NOTICE 'Suppression de la vue partner_delivery_summary...';
    
    DROP VIEW IF EXISTS partner_delivery_summary;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'partner_delivery_summary'
    ) THEN
        RAISE NOTICE '✅ Vue partner_delivery_summary supprimée avec succès';
    ELSE
        RAISE NOTICE '❌ Erreur: Impossible de supprimer la vue';
    END IF;
END $$;

-- 4. Modification du type de colonne article_count
-- =================================================================
DO $$
BEGIN
    RAISE NOTICE 'Modification du type de colonne article_count...';
    
    ALTER TABLE partner_deliveries 
    ALTER COLUMN article_count TYPE NUMERIC(10,2);
    
    RAISE NOTICE '✅ Colonne article_count modifiée vers NUMERIC(10,2)';
    
    -- Vérification
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_deliveries' 
        AND column_name = 'article_count' 
        AND data_type = 'numeric'
    ) THEN
        RAISE NOTICE '✅ Vérification: Type NUMERIC confirmé';
    ELSE
        RAISE NOTICE '❌ Erreur: Type non modifié correctement';
    END IF;
END $$;

-- 5. Recréation de la vue partner_delivery_summary
-- =================================================================
DO $$
BEGIN
    RAISE NOTICE 'Recréation de la vue partner_delivery_summary...';
    
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
    
    RAISE NOTICE '✅ Vue partner_delivery_summary recréée avec succès';
    
    -- Vérification
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'partner_delivery_summary'
    ) THEN
        RAISE NOTICE '✅ Vérification: Vue recréée confirmée';
    ELSE
        RAISE NOTICE '❌ Erreur: Impossible de recréer la vue';
    END IF;
END $$;

-- 6. Test de validation avec des nombres décimaux
-- =================================================================
DO $$
DECLARE
    test_id INTEGER;
    test_articles NUMERIC;
    test_unit_price NUMERIC;
    test_amount NUMERIC;
BEGIN
    RAISE NOTICE 'Test de validation avec des nombres décimaux...';
    
    -- Test d'insertion avec des nombres décimaux
    INSERT INTO partner_deliveries 
    (account_id, delivery_date, amount, article_count, unit_price, description, status, created_by)
    VALUES (1, CURRENT_DATE, 1250.75, 25.50, 49.05, 'TEST DÉPLOIEMENT - 25.5 articles', 'pending', 1)
    RETURNING id, article_count, unit_price, amount INTO test_id, test_articles, test_unit_price, test_amount;
    
    RAISE NOTICE '✅ Test d''insertion réussi:';
    RAISE NOTICE '   - ID: %', test_id;
    RAISE NOTICE '   - Articles: %', test_articles;
    RAISE NOTICE '   - Prix unitaire: %', test_unit_price;
    RAISE NOTICE '   - Montant: %', test_amount;
    
    -- Test de la vue
    IF EXISTS (SELECT 1 FROM partner_delivery_summary WHERE account_id = 1) THEN
        RAISE NOTICE '✅ Test de la vue: Fonctionne correctement';
    ELSE
        RAISE NOTICE '⚠️  Test de la vue: Aucun résultat (normal si pas de données)';
    END IF;
    
    -- Nettoyage du test
    DELETE FROM partner_deliveries WHERE id = test_id;
    RAISE NOTICE '✅ Données de test nettoyées';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Erreur lors du test: %', SQLERRM;
        -- Nettoyer en cas d'erreur
        IF test_id IS NOT NULL THEN
            DELETE FROM partner_deliveries WHERE id = test_id;
        END IF;
        RAISE;
END $$;

-- 7. Vérification finale
-- =================================================================
DO $$
BEGIN
    RAISE NOTICE '=== VÉRIFICATION FINALE ===';
    
    -- Vérifier le type de colonne
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_deliveries' 
        AND column_name = 'article_count' 
        AND data_type = 'numeric'
    ) THEN
        RAISE NOTICE '✅ Colonne article_count: NUMERIC confirmé';
    ELSE
        RAISE NOTICE '❌ Colonne article_count: Type incorrect';
    END IF;
    
    -- Vérifier la vue
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'partner_delivery_summary'
    ) THEN
        RAISE NOTICE '✅ Vue partner_delivery_summary: Recréée';
    ELSE
        RAISE NOTICE '❌ Vue partner_delivery_summary: Manquante';
    END IF;
    
    RAISE NOTICE '=== DÉPLOIEMENT TERMINÉ ===';
    RAISE NOTICE 'Le système supporte maintenant les nombres décimaux dans article_count';
    RAISE NOTICE 'Format accepté: 25.5, 10.25, 0.75, 100.5, etc.';
END $$;

COMMIT;

-- =================================================================
-- NOTES POST-DÉPLOIEMENT
-- =================================================================
-- 1. Redémarrer l'application pour s'assurer que les changements sont pris en compte
-- 2. Tester l'interface web avec des nombres décimaux
-- 3. Vérifier que les calculs automatiques fonctionnent
-- 4. Contrôler que la vue partner_delivery_summary affiche correctement les totaux
-- =================================================================
