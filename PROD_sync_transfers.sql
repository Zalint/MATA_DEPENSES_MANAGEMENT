-- =========================================================
-- SCRIPT DE SYNCHRONISATION DES TRANSFERTS - PRODUCTION
-- À exécuter sur la base de données PRODUCTION
-- =========================================================

-- ⚠️  IMPORTANT: Ce script est destiné à la base PRODUCTION
-- ⚠️  Vérifiez bien la connexion avant l'exécution

-- 1. Vérifier et ajouter les colonnes si nécessaires
DO $$ 
BEGIN
    RAISE NOTICE '🚀 DÉBUT SYNCHRONISATION TRANSFERTS - PRODUCTION';
    RAISE NOTICE 'Base de données: %', current_database();
    RAISE NOTICE '==================================================';
    
    -- Ajouter transfert_entrants
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'accounts' AND column_name = 'transfert_entrants') THEN
        ALTER TABLE accounts ADD COLUMN transfert_entrants DECIMAL(15,2) DEFAULT 0;
        RAISE NOTICE '✅ Colonne transfert_entrants ajoutée';
    ELSE
        RAISE NOTICE '📋 Colonne transfert_entrants existe déjà';
    END IF;
    
    -- Ajouter transfert_sortants
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'accounts' AND column_name = 'transfert_sortants') THEN
        ALTER TABLE accounts ADD COLUMN transfert_sortants DECIMAL(15,2) DEFAULT 0;
        RAISE NOTICE '✅ Colonne transfert_sortants ajoutée';
    ELSE
        RAISE NOTICE '📋 Colonne transfert_sortants existe déjà';
    END IF;
END $$;

-- 2. Mise à jour en masse de tous les comptes
UPDATE accounts 
SET 
    transfert_entrants = COALESCE((
        SELECT SUM(th.montant) 
        FROM transfer_history th 
        WHERE th.destination_id = accounts.id
    ), 0),
    transfert_sortants = COALESCE((
        SELECT SUM(th.montant) 
        FROM transfer_history th 
        WHERE th.source_id = accounts.id  
    ), 0);

-- 3. Créer les fonctions et triggers pour la synchronisation automatique
CREATE OR REPLACE FUNCTION sync_transferts_account(p_account_id INTEGER)
RETURNS VOID AS $$
DECLARE
    total_entrants DECIMAL(15,2) := 0;
    total_sortants DECIMAL(15,2) := 0;
BEGIN
    -- Calculer les transferts entrants
    SELECT COALESCE(SUM(montant), 0) INTO total_entrants
    FROM transfer_history
    WHERE destination_id = p_account_id;

    -- Calculer les transferts sortants
    SELECT COALESCE(SUM(montant), 0) INTO total_sortants
    FROM transfer_history
    WHERE source_id = p_account_id;

    -- Mettre à jour la table accounts
    UPDATE accounts 
    SET 
        transfert_entrants = total_entrants,
        transfert_sortants = total_sortants
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Fonction trigger pour synchronisation automatique
CREATE OR REPLACE FUNCTION trigger_sync_transferts()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchroniser le compte source (OLD et NEW pour les updates)
    IF TG_OP = 'DELETE' THEN
        PERFORM sync_transferts_account(OLD.source_id);
        PERFORM sync_transferts_account(OLD.destination_id);
        RETURN OLD;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        -- Si les comptes ont changé, synchroniser les anciens comptes
        IF OLD.source_id != NEW.source_id THEN
            PERFORM sync_transferts_account(OLD.source_id);
        END IF;
        IF OLD.destination_id != NEW.destination_id THEN
            PERFORM sync_transferts_account(OLD.destination_id);
        END IF;
    END IF;
    
    -- Synchroniser les nouveaux comptes
    PERFORM sync_transferts_account(NEW.source_id);
    PERFORM sync_transferts_account(NEW.destination_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Créer le trigger
DROP TRIGGER IF EXISTS trig_sync_transferts ON transfer_history;
CREATE TRIGGER trig_sync_transferts
    AFTER INSERT OR UPDATE OR DELETE ON transfer_history
    FOR EACH ROW
    EXECUTE FUNCTION trigger_sync_transferts();

-- 6. Créer l'index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_accounts_transferts 
ON accounts(transfert_entrants, transfert_sortants);

-- 7. Rapport de résultats
DO $$
DECLARE
    total_comptes INTEGER;
    comptes_avec_transferts INTEGER;
    total_entrants DECIMAL(15,2);
    total_sortants DECIMAL(15,2);
BEGIN
    -- Statistiques
    SELECT COUNT(*) INTO total_comptes FROM accounts;
    
    SELECT COUNT(*) INTO comptes_avec_transferts 
    FROM accounts 
    WHERE transfert_entrants > 0 OR transfert_sortants > 0;
    
    SELECT SUM(transfert_entrants), SUM(transfert_sortants)
    INTO total_entrants, total_sortants
    FROM accounts;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 RAPPORT DE SYNCHRONISATION:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total comptes: %', total_comptes;
    RAISE NOTICE 'Comptes avec transferts: %', comptes_avec_transferts;
    RAISE NOTICE 'Total transferts entrants: % FCFA', total_entrants;
    RAISE NOTICE 'Total transferts sortants: % FCFA', total_sortants;
    RAISE NOTICE 'Cohérence: %', 
        CASE WHEN total_entrants = total_sortants THEN '✅ PARFAITE' ELSE '⚠️ À vérifier' END;
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ SYNCHRONISATION TERMINÉE AVEC SUCCÈS';
END $$;

-- 8. Afficher les comptes avec le plus de transferts
SELECT 
    '📋 TOP 10 COMPTES AVEC TRANSFERTS:' as rapport;

SELECT 
    RPAD(account_name, 30) as compte,
    TO_CHAR(transfert_entrants, 'FM999,999,999') || ' FCFA' as entrants,
    TO_CHAR(transfert_sortants, 'FM999,999,999') || ' FCFA' as sortants,
    TO_CHAR(transfert_entrants - transfert_sortants, 'FM999,999,999') || ' FCFA' as net
FROM accounts 
WHERE transfert_entrants > 0 OR transfert_sortants > 0
ORDER BY (transfert_entrants + transfert_sortants) DESC
LIMIT 10;
