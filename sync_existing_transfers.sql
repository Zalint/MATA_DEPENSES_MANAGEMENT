-- =========================================================
-- SCRIPT DE SYNCHRONISATION DES TRANSFERTS EXISTANTS
-- Met à jour toutes les colonnes transfert_entrants et transfert_sortants
-- pour tous les comptes existants en base de données
-- =========================================================

-- 1. Vérifier si les colonnes existent déjà
DO $$ 
BEGIN
    -- Ajouter les colonnes si elles n'existent pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'accounts' AND column_name = 'transfert_entrants') THEN
        ALTER TABLE accounts ADD COLUMN transfert_entrants DECIMAL(15,2) DEFAULT 0;
        RAISE NOTICE 'Colonne transfert_entrants ajoutée';
    ELSE
        RAISE NOTICE 'Colonne transfert_entrants existe déjà';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'accounts' AND column_name = 'transfert_sortants') THEN
        ALTER TABLE accounts ADD COLUMN transfert_sortants DECIMAL(15,2) DEFAULT 0;
        RAISE NOTICE 'Colonne transfert_sortants ajoutée';
    ELSE
        RAISE NOTICE 'Colonne transfert_sortants existe déjà';
    END IF;
END $$;

-- 2. Fonction pour calculer et mettre à jour les transferts d'un compte
CREATE OR REPLACE FUNCTION sync_account_transfers(p_account_id INTEGER)
RETURNS VOID AS $$
DECLARE
    total_entrants DECIMAL(15,2) := 0;
    total_sortants DECIMAL(15,2) := 0;
    account_name_var TEXT;
BEGIN
    -- Récupérer le nom du compte pour les logs
    SELECT account_name INTO account_name_var FROM accounts WHERE id = p_account_id;
    
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

    -- Log pour le suivi
    IF total_entrants > 0 OR total_sortants > 0 THEN
        RAISE NOTICE 'Compte "%" (ID %): Entrants = % FCFA, Sortants = % FCFA', 
                     account_name_var, p_account_id, total_entrants, total_sortants;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Synchronisation de TOUS les comptes existants
DO $$
DECLARE
    account_record RECORD;
    total_accounts INTEGER := 0;
    accounts_with_transfers INTEGER := 0;
BEGIN
    RAISE NOTICE '🔄 DÉBUT DE LA SYNCHRONISATION DES TRANSFERTS EXISTANTS';
    RAISE NOTICE '==========================================================';
    
    -- Compter le nombre total de comptes
    SELECT COUNT(*) INTO total_accounts FROM accounts;
    RAISE NOTICE '📊 Nombre total de comptes à traiter: %', total_accounts;
    
    -- Parcourir tous les comptes
    FOR account_record IN 
        SELECT id, account_name 
        FROM accounts 
        ORDER BY account_name
    LOOP
        -- Synchroniser chaque compte
        PERFORM sync_account_transfers(account_record.id);
        
        -- Vérifier si le compte a des transferts
        IF EXISTS (
            SELECT 1 FROM accounts 
            WHERE id = account_record.id 
            AND (transfert_entrants > 0 OR transfert_sortants > 0)
        ) THEN
            accounts_with_transfers := accounts_with_transfers + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ SYNCHRONISATION TERMINÉE';
    RAISE NOTICE '📊 Comptes traités: %', total_accounts;
    RAISE NOTICE '🔄 Comptes avec transferts: %', accounts_with_transfers;
    RAISE NOTICE '==========================================================';
END $$;

-- 4. Vérification des résultats - Top 10 des comptes avec le plus de transferts
SELECT 
    account_name,
    ROUND(transfert_entrants, 2) as entrants_fcfa,
    ROUND(transfert_sortants, 2) as sortants_fcfa,
    ROUND(transfert_entrants - transfert_sortants, 2) as net_transferts_fcfa
FROM accounts 
WHERE transfert_entrants > 0 OR transfert_sortants > 0
ORDER BY (transfert_entrants + transfert_sortants) DESC
LIMIT 10;

-- 5. Statistiques globales
SELECT 
    COUNT(*) as total_comptes,
    COUNT(CASE WHEN transfert_entrants > 0 THEN 1 END) as comptes_avec_entrants,
    COUNT(CASE WHEN transfert_sortants > 0 THEN 1 END) as comptes_avec_sortants,
    ROUND(SUM(transfert_entrants), 2) as total_entrants_fcfa,
    ROUND(SUM(transfert_sortants), 2) as total_sortants_fcfa,
    ROUND(SUM(transfert_entrants) - SUM(transfert_sortants), 2) as difference_fcfa
FROM accounts;

-- 6. Créer l'index pour optimiser les performances (si pas déjà fait)
CREATE INDEX IF NOT EXISTS idx_accounts_transferts 
ON accounts(transfert_entrants, transfert_sortants);

-- 7. Vérification de cohérence finale
DO $$
DECLARE
    total_entrants_accounts DECIMAL(15,2);
    total_sortants_accounts DECIMAL(15,2);
    total_entrants_history DECIMAL(15,2);
    total_sortants_history DECIMAL(15,2);
BEGIN
    -- Totaux depuis les comptes
    SELECT SUM(transfert_entrants), SUM(transfert_sortants) 
    INTO total_entrants_accounts, total_sortants_accounts
    FROM accounts;
    
    -- Totaux depuis l'historique
    SELECT SUM(montant), SUM(montant)
    INTO total_entrants_history, total_sortants_history  
    FROM transfer_history;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VÉRIFICATION DE COHÉRENCE:';
    RAISE NOTICE 'Total entrants (comptes): % FCFA', total_entrants_accounts;
    RAISE NOTICE 'Total entrants (historique): % FCFA', total_entrants_history;
    RAISE NOTICE 'Total sortants (comptes): % FCFA', total_sortants_accounts;
    RAISE NOTICE 'Total sortants (historique): % FCFA', total_sortants_history;
    
    IF total_entrants_accounts = total_entrants_history AND 
       total_sortants_accounts = total_sortants_history THEN
        RAISE NOTICE '✅ COHÉRENCE PARFAITE !';
    ELSE
        RAISE NOTICE '⚠️ Incohérence détectée - Vérifier les données';
    END IF;
END $$;
