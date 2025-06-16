-- Script de migration des comptes existants vers le type "classique"
-- Ce script corrige le problème d'affichage des comptes dans la liste de crédit

-- 1. Vérifier l'état actuel des comptes
SELECT 
    'État avant migration' as section,
    account_type,
    COUNT(*) as nombre_comptes
FROM accounts 
WHERE is_active = true
GROUP BY account_type
ORDER BY account_type;

-- 2. Migrer tous les comptes sans type vers "classique"
UPDATE accounts 
SET account_type = 'classique'
WHERE account_type IS NULL AND is_active = true;

-- 3. S'assurer que la colonne account_type existe et a une valeur par défaut
-- (Au cas où la migration précédente n'aurait pas fonctionné)
DO $$
BEGIN
    -- Vérifier si la colonne existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'account_type'
    ) THEN
        -- Ajouter la colonne si elle n'existe pas
        ALTER TABLE accounts 
        ADD COLUMN account_type VARCHAR(20) DEFAULT 'classique' 
        CHECK (account_type IN ('classique', 'creance', 'fournisseur', 'partenaire', 'statut'));
        
        -- Mettre à jour tous les comptes existants
        UPDATE accounts SET account_type = 'classique' WHERE account_type IS NULL;
    END IF;
END $$;

-- 4. Mettre à jour tous les comptes qui n'ont toujours pas de type
UPDATE accounts 
SET account_type = 'classique'
WHERE account_type IS NULL OR account_type = '';

-- 5. S'assurer que tous les comptes actifs ont un type
UPDATE accounts 
SET account_type = 'classique'
WHERE is_active = true AND (account_type IS NULL OR account_type = '');

-- 6. Mettre à jour les colonnes d'accès pour les comptes classiques
UPDATE accounts 
SET access_restricted = false, 
    allowed_roles = NULL 
WHERE account_type = 'classique';

-- 7. Vérifier l'état après migration
SELECT 
    'État après migration' as section,
    account_type,
    COUNT(*) as nombre_comptes
FROM accounts 
WHERE is_active = true
GROUP BY account_type
ORDER BY account_type;

-- 8. Afficher tous les comptes actifs avec leur type
SELECT 
    'Liste des comptes migrés' as section,
    id,
    account_name,
    account_type,
    current_balance,
    total_credited,
    is_active
FROM accounts 
WHERE is_active = true
ORDER BY account_name;

-- 9. Vérifier qu'il n'y a plus de comptes sans type
SELECT 
    'Vérification finale' as section,
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCÈS: Tous les comptes ont un type'
        ELSE 'ATTENTION: ' || COUNT(*) || ' compte(s) sans type trouvé(s)'
    END as resultat
FROM accounts 
WHERE is_active = true AND (account_type IS NULL OR account_type = '');

-- 10. Recréer la vue partner_delivery_summary au cas où
DROP VIEW IF EXISTS partner_delivery_summary;
CREATE OR REPLACE VIEW partner_delivery_summary AS
SELECT 
    a.id as account_id,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(SUM(pd.amount), 0) as total_delivered,
    COALESCE(SUM(pd.article_count), 0) as total_articles,
    COUNT(pd.id) as delivery_count,
    (a.total_credited - COALESCE(SUM(pd.amount), 0)) as remaining_balance,
    CASE 
        WHEN a.total_credited > 0 THEN 
            ROUND((COALESCE(SUM(pd.amount), 0)::DECIMAL / a.total_credited) * 100, 2)
        ELSE 0
    END as delivery_percentage
FROM accounts a
LEFT JOIN partner_deliveries pd ON a.id = pd.account_id AND pd.is_validated = true
WHERE a.account_type = 'partenaire' AND a.is_active = true
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited;

SELECT 'Migration terminée avec succès!' as message, CURRENT_TIMESTAMP as executed_at; 