-- =========================================================
-- TRIGGER AUTOMATIQUE : Synchronisation Balance → SOLDE BICTORYS AFFICHE
-- =========================================================
-- Ce trigger copie automatiquement la dernière valeur de la colonne
-- "balance" de la table cash_bictorys vers le compte "SOLDE BICTORYS AFFICHE"
-- 
-- Déclenchement : À chaque INSERT ou UPDATE dans cash_bictorys
-- Date : La plus récente qui n'est pas dans le futur (date <= CURRENT_DATE)
-- =========================================================

-- 1. Créer la fonction qui effectue la synchronisation
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

-- 2. Supprimer les anciens triggers s'ils existent (pour éviter les doublons)
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_courant ON cash_bictorys;
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;

-- 3. Créer le trigger qui se déclenche après INSERT ou UPDATE
CREATE TRIGGER trigger_sync_balance_to_solde_bictorys
    AFTER INSERT OR UPDATE ON cash_bictorys
    FOR EACH ROW
    EXECUTE FUNCTION sync_balance_to_solde_bictorys_affiche();

-- =========================================================
-- VERIFICATION : Synchronisation manuelle initiale
-- =========================================================
-- Exécuter une première fois la synchronisation pour mettre à jour
-- avec la dernière valeur existante

DO $$
DECLARE
    latest_balance DECIMAL(15,2);
    solde_bictorys_affiche_id INTEGER;
    latest_date DATE;
BEGIN
    -- Trouver l'ID du compte
    SELECT id INTO solde_bictorys_affiche_id
    FROM accounts
    WHERE account_name = 'SOLDE BICTORYS AFFICHE'
    AND account_type = 'statut'
    AND is_active = true
    LIMIT 1;
    
    IF solde_bictorys_affiche_id IS NULL THEN
        RAISE NOTICE '❌ Compte SOLDE BICTORYS AFFICHE introuvable';
        RETURN;
    END IF;
    
    -- Récupérer la dernière balance (où amount OU balance > 0)
    SELECT balance, date INTO latest_balance, latest_date
    FROM cash_bictorys
    WHERE date <= CURRENT_DATE
    AND (amount > 0 OR balance > 0)  -- Ignorer seulement si BOTH amount ET balance sont nuls
    ORDER BY date DESC, updated_at DESC
    LIMIT 1;
    
    IF latest_balance IS NULL THEN
        RAISE NOTICE '❌ Aucune balance trouvée dans cash_bictorys';
        RETURN;
    END IF;
    
    -- Créer/mettre à jour l'entrée dans special_credit_history
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
        1,
        latest_balance,
        'Synchronisation automatique depuis cash_bictorys',
        CURRENT_DATE,
        true,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT special_credit_history_account_date_unique
    DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        created_at = CURRENT_TIMESTAMP;
    
    -- Mettre à jour current_balance
    UPDATE accounts
    SET 
        current_balance = latest_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = solde_bictorys_affiche_id;
    
    RAISE NOTICE '✅ Synchronisation initiale réussie:';
    RAISE NOTICE '   Date: %', latest_date;
    RAISE NOTICE '   Balance: % FCFA', latest_balance;
    RAISE NOTICE '   Compte ID: %', solde_bictorys_affiche_id;
    RAISE NOTICE '   Transaction créée dans special_credit_history';
END $$;

-- =========================================================
-- TESTS DE VERIFICATION
-- =========================================================

-- Afficher les dernières valeurs de cash_bictorys
SELECT 
    'Dernières valeurs Cash Bictorys' as info,
    date,
    balance,
    amount,
    fees
FROM cash_bictorys
WHERE date <= CURRENT_DATE
ORDER BY date DESC
LIMIT 5;

-- Afficher le solde actuel du compte SOLDE BICTORYS AFFICHE
SELECT 
    'Compte SOLDE BICTORYS AFFICHE' as info,
    id,
    account_name,
    current_balance,
    updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE'
AND account_type = 'statut';

-- =========================================================
-- NOTES IMPORTANTES
-- =========================================================
-- 1. Le trigger se déclenche automatiquement après chaque INSERT/UPDATE
-- 2. Seules les dates <= CURRENT_DATE sont prises en compte (pas de dates futures)
-- 3. Les lignes sont ignorées seulement si amount = 0 ET balance = 0
-- 4. Une balance = 0 avec amount > 0 est VALIDE (affiche balance = 0)
-- 5. La dernière valeur est déterminée par : date DESC puis updated_at DESC
-- 6. Si plusieurs lignes ont la même date, la plus récemment modifiée est utilisée
-- 7. Le compte SOLDE BICTORYS AFFICHE doit exister et être actif
-- 
-- Pour désactiver le trigger :
--   DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;
-- 
-- Pour réactiver le trigger :
--   Exécuter à nouveau la section "3. Créer le trigger..."

