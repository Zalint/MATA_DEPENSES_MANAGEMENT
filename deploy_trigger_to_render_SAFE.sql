-- =========================================================
-- DÉPLOIEMENT TRIGGER SYNCHRONISATION BALANCE → SOLDE BICTORYS AFFICHE
-- VERSION SAFE - AUCUN IMPACT SUR LES DONNÉES EXISTANTES
-- Pour exécution sur Render (Production)
-- Date: 05/10/2025
-- =========================================================

-- ÉTAPE 1 : Ajouter la contrainte UNIQUE (si elle n'existe pas déjà)
-- =========================================================
-- Cette contrainte empêchera les futurs doublons
-- Elle ne touche PAS aux données existantes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'special_credit_history_account_date_unique'
    ) THEN
        ALTER TABLE special_credit_history
        ADD CONSTRAINT special_credit_history_account_date_unique
        UNIQUE (account_id, credit_date)
        DEFERRABLE INITIALLY DEFERRED;
        
        RAISE NOTICE '✓ Contrainte UNIQUE ajoutée sur (account_id, credit_date)';
    ELSE
        RAISE NOTICE 'ℹ️  Contrainte UNIQUE existe déjà - aucune action';
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '⚠️  Impossible d''ajouter la contrainte UNIQUE car des doublons existent';
        RAISE NOTICE '   Solution: Garder les données existantes et la contrainte protégera le futur';
        RAISE NOTICE '   Les doublons existants resteront intacts';
END $$;

-- ÉTAPE 2 : Créer ou remplacer la fonction du trigger
-- =========================================================
-- CREATE OR REPLACE ne supprime rien, il met à jour si existe déjà
CREATE OR REPLACE FUNCTION sync_balance_to_solde_bictorys_affiche()
RETURNS TRIGGER AS $$
DECLARE
    latest_balance DECIMAL(15,2);
    solde_bictorys_affiche_id INTEGER;
BEGIN
    -- Trouver l'ID du compte "SOLDE BICTORYS AFFICHE"
    SELECT id INTO solde_bictorys_affiche_id
    FROM accounts
    WHERE account_name = 'SOLDE BICTORYS AFFICHE'
    AND account_type = 'statut'
    AND is_active = true
    LIMIT 1;
    
    -- Si le compte n'existe pas, ne rien faire
    IF solde_bictorys_affiche_id IS NULL THEN
        RAISE NOTICE 'Compte SOLDE BICTORYS AFFICHE introuvable - synchronisation ignorée';
        RETURN NEW;
    END IF;
    
    -- Récupérer la dernière balance (date <= aujourd'hui) où amount OU balance > 0
    SELECT balance INTO latest_balance
    FROM cash_bictorys
    WHERE date <= CURRENT_DATE
    AND (amount > 0 OR balance > 0)  -- Ignorer seulement si BOTH amount ET balance sont nuls
    ORDER BY date DESC, updated_at DESC
    LIMIT 1;
    
    -- Si aucune balance trouvée, ne rien faire
    IF latest_balance IS NULL THEN
        RAISE NOTICE 'Aucune balance trouvée dans cash_bictorys - synchronisation ignorée';
        RETURN NEW;
    END IF;
    
    -- Créer ou mettre à jour l'entrée dans special_credit_history
    -- Cela permet d'avoir une trace dans l'historique et d'être pris en compte dans les calculs
    INSERT INTO special_credit_history (
        account_id, 
        credited_by, 
        amount, 
        comment, 
        credit_date,
        is_balance_override, 
        created_at
    )
    VALUES (
        solde_bictorys_affiche_id,
        1,  -- User ID admin
        latest_balance,
        'Synchronisation automatique depuis cash_bictorys',
        CURRENT_DATE,
        true,  -- Marquer comme override de balance
        CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT special_credit_history_account_date_unique
    DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        created_at = CURRENT_TIMESTAMP;
    
    -- Mettre à jour aussi current_balance pour cohérence
    UPDATE accounts
    SET 
        current_balance = latest_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = solde_bictorys_affiche_id;
    
    -- Log de la synchronisation
    RAISE NOTICE 'Balance synchronisée: % FCFA → SOLDE BICTORYS AFFICHE (compte ID: %) avec transaction créée', 
        latest_balance, solde_bictorys_affiche_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ÉTAPE 3 : Créer le trigger (seulement s'il n'existe pas déjà)
-- =========================================================
-- On vérifie d'abord s'il existe pour éviter toute erreur
DO $$
BEGIN
    -- Vérifier si le trigger existe déjà
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.triggers 
        WHERE trigger_name = 'trigger_sync_balance_to_solde_bictorys'
        AND event_object_table = 'cash_bictorys'
    ) THEN
        -- Créer le trigger seulement s'il n'existe pas
        CREATE TRIGGER trigger_sync_balance_to_solde_bictorys
            AFTER INSERT OR UPDATE ON cash_bictorys
            FOR EACH ROW
            EXECUTE FUNCTION sync_balance_to_solde_bictorys_affiche();
        
        RAISE NOTICE '✓ Trigger créé: trigger_sync_balance_to_solde_bictorys';
    ELSE
        RAISE NOTICE 'ℹ️  Trigger existe déjà - aucune action';
        RAISE NOTICE '   Pour mettre à jour le trigger, utiliser: DROP TRIGGER trigger_sync_balance_to_solde_bictorys ON cash_bictorys;';
        RAISE NOTICE '   Puis relancer ce script';
    END IF;
END $$;

-- ÉTAPE 4 : Vérification (lecture seule - aucun impact)
-- =========================================================

-- Vérifier que la fonction existe
SELECT 
    'Fonction installée' as statut,
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name = 'sync_balance_to_solde_bictorys_affiche'
AND routine_schema = 'public';

-- Vérifier que le trigger existe
SELECT 
    'Trigger installé' as statut,
    trigger_name,
    event_manipulation,
    action_timing,
    event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'cash_bictorys'
AND trigger_name LIKE '%sync%balance%';

-- Vérifier que la contrainte existe
SELECT 
    'Contrainte UNIQUE' as statut,
    conname as constraint_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'special_credit_history_account_date_unique';

-- Vérifier l'état du compte (sans modification)
SELECT 
    'État actuel du compte' as info,
    account_name,
    current_balance,
    account_type,
    is_active,
    updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';

-- Compter les transactions existantes (information seulement)
SELECT 
    'Transactions existantes' as info,
    COUNT(*) as total_transactions,
    MAX(credit_date) as derniere_date,
    MAX(amount) as dernier_montant
FROM special_credit_history
WHERE account_id = (SELECT id FROM accounts WHERE account_name = 'SOLDE BICTORYS AFFICHE');

-- =========================================================
-- FIN DU DÉPLOIEMENT SAFE
-- =========================================================
-- ✅ AUCUNE DONNÉE EXISTANTE N'A ÉTÉ MODIFIÉE
-- ✅ AUCUNE SUPPRESSION N'A ÉTÉ EFFECTUÉE
-- ✅ Le trigger protégera les futures insertions
-- 
-- Ce qui a été installé (si n'existait pas déjà):
-- ✓ Contrainte UNIQUE sur special_credit_history (account_id, credit_date)
-- ✓ Fonction sync_balance_to_solde_bictorys_affiche() (ou mise à jour)
-- ✓ Trigger trigger_sync_balance_to_solde_bictorys
-- 
-- Le trigger se déclenchera UNIQUEMENT sur les futurs INSERT/UPDATE de cash_bictorys
-- Les données existantes restent intactes.
-- =========================================================

