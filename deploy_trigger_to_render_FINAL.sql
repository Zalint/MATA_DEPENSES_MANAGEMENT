-- =========================================================
-- DÉPLOIEMENT TRIGGER SYNCHRONISATION BALANCE → SOLDE BICTORYS AFFICHE
-- VERSION FINALE - Crée l'index UNIQUE puis installe le trigger
-- Pour exécution sur Render (Production)
-- Date: 05/10/2025
-- =========================================================

-- ÉTAPE 1 : Vérifier les doublons existants (information seulement)
-- =========================================================
SELECT 
    '🔍 Vérification doublons' as etape,
    account_id, 
    credit_date, 
    COUNT(*) as nombre_doublons,
    STRING_AGG(id::text, ', ') as ids_doublons
FROM special_credit_history
GROUP BY account_id, credit_date
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 10;

-- ÉTAPE 2 : Créer l'index UNIQUE (ou afficher un message si doublons)
-- =========================================================
DO $$
DECLARE
    doublons_count INTEGER;
BEGIN
    -- Compter les doublons
    SELECT COUNT(*) INTO doublons_count
    FROM (
        SELECT account_id, credit_date
        FROM special_credit_history
        GROUP BY account_id, credit_date
        HAVING COUNT(*) > 1
    ) t;
    
    IF doublons_count > 0 THEN
        RAISE NOTICE '⚠️  ATTENTION: % combinaisons (account_id, credit_date) ont des doublons', doublons_count;
        RAISE NOTICE '   Les doublons empêchent la création de l''index UNIQUE';
        RAISE NOTICE '   Solution: Le trigger va gérer les doublons manuellement';
    ELSE
        -- Pas de doublons, on peut créer l'index
        CREATE UNIQUE INDEX IF NOT EXISTS idx_special_credit_history_account_date
        ON special_credit_history (account_id, credit_date);
        
        RAISE NOTICE '✓ Index UNIQUE créé: idx_special_credit_history_account_date';
    END IF;
END $$;

-- ÉTAPE 3 : Créer la fonction du trigger (version intelligente)
-- =========================================================
-- Cette version gère AUTOMATIQUEMENT le cas avec ou sans index UNIQUE
CREATE OR REPLACE FUNCTION sync_balance_to_solde_bictorys_affiche()
RETURNS TRIGGER AS $$
DECLARE
    latest_balance DECIMAL(15,2);
    solde_bictorys_affiche_id INTEGER;
    existing_id INTEGER;
    has_unique_index BOOLEAN;
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
    AND (amount > 0 OR balance > 0)
    ORDER BY date DESC, updated_at DESC
    LIMIT 1;
    
    -- Si aucune balance trouvée, ne rien faire
    IF latest_balance IS NULL THEN
        RAISE NOTICE 'Aucune balance trouvée dans cash_bictorys - synchronisation ignorée';
        RETURN NEW;
    END IF;
    
    -- Vérifier si un index UNIQUE existe
    SELECT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'special_credit_history' 
        AND indexdef LIKE '%UNIQUE%'
        AND indexdef LIKE '%account_id%'
        AND indexdef LIKE '%credit_date%'
    ) INTO has_unique_index;
    
    IF has_unique_index THEN
        -- Cas 1 : Index UNIQUE existe → utiliser ON CONFLICT
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
        ON CONFLICT (account_id, credit_date)
        DO UPDATE SET
            amount = EXCLUDED.amount,
            comment = EXCLUDED.comment,
            created_at = CURRENT_TIMESTAMP;
    ELSE
        -- Cas 2 : Pas d'index UNIQUE → UPDATE ou INSERT manuel
        -- Vérifier si une entrée existe déjà pour ce compte et cette date
        SELECT id INTO existing_id
        FROM special_credit_history
        WHERE account_id = solde_bictorys_affiche_id
        AND credit_date = CURRENT_DATE
        ORDER BY created_at DESC
        LIMIT 1;
        
        IF existing_id IS NOT NULL THEN
            -- UPDATE de l'entrée existante
            UPDATE special_credit_history
            SET 
                amount = latest_balance,
                comment = 'Synchronisation automatique depuis cash_bictorys',
                created_at = CURRENT_TIMESTAMP
            WHERE id = existing_id;
        ELSE
            -- INSERT nouvelle entrée
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
            );
        END IF;
    END IF;
    
    -- Mettre à jour current_balance
    UPDATE accounts
    SET 
        current_balance = latest_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = solde_bictorys_affiche_id;
    
    -- Log de la synchronisation
    RAISE NOTICE 'Balance synchronisée: % FCFA → SOLDE BICTORYS AFFICHE (ID: %) [Mode: %]', 
        latest_balance, solde_bictorys_affiche_id, 
        CASE WHEN has_unique_index THEN 'ON CONFLICT' ELSE 'UPDATE/INSERT manuel' END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ÉTAPE 4 : Recréer le trigger
-- =========================================================
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;

CREATE TRIGGER trigger_sync_balance_to_solde_bictorys
    AFTER INSERT OR UPDATE ON cash_bictorys
    FOR EACH ROW
    EXECUTE FUNCTION sync_balance_to_solde_bictorys_affiche();

-- ÉTAPE 5 : Vérification finale
-- =========================================================

-- Vérifier la fonction
SELECT 
    '✓ Fonction installée' as statut,
    routine_name
FROM information_schema.routines
WHERE routine_name = 'sync_balance_to_solde_bictorys_affiche';

-- Vérifier le trigger
SELECT 
    '✓ Trigger installé' as statut,
    trigger_name,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_name = 'trigger_sync_balance_to_solde_bictorys';

-- Vérifier l'index (peut être absent si doublons)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✓ Index UNIQUE présent'
        ELSE '⚠️  Index UNIQUE absent (trigger fonctionne quand même)'
    END as statut_index,
    COUNT(*) as nombre_index
FROM pg_indexes
WHERE tablename = 'special_credit_history'
AND indexdef LIKE '%UNIQUE%'
AND indexdef LIKE '%account_id%'
AND indexdef LIKE '%credit_date%';

-- État du compte
SELECT 
    '📊 État du compte' as info,
    account_name,
    current_balance,
    updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';

-- =========================================================
-- FIN DU DÉPLOIEMENT
-- =========================================================
-- ✅ Fonction sync_balance_to_solde_bictorys_affiche() créée
-- ✅ Trigger trigger_sync_balance_to_solde_bictorys créé
-- ✅ Fonctionne AVEC ou SANS index UNIQUE (logique adaptative)
-- 
-- Le trigger détecte automatiquement la présence d'un index UNIQUE
-- et adapte son comportement :
-- - Si index présent → Utilise ON CONFLICT (rapide)
-- - Si index absent → Utilise UPDATE/INSERT manuel (fonctionne quand même)
-- 
-- AUCUNE DONNÉE EXISTANTE N'A ÉTÉ MODIFIÉE
-- =========================================================

