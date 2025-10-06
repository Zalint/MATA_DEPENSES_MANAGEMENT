-- =========================================================
-- CORRECTION DU TRIGGER prevent_expense_duplicate
-- Problème : Le trigger bloque les UPDATE de selected_for_invoice
-- Solution : Ne déclencher que sur les champs métier importants
-- Date: 06/10/2025
-- =========================================================

-- Afficher l'état actuel du trigger
SELECT 
    'État actuel du trigger' as info,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'expenses'
AND t.tgname = 'trigger_prevent_expense_duplicate';

-- Supprimer l'ancien trigger
DROP TRIGGER IF EXISTS trigger_prevent_expense_duplicate ON expenses;

-- Créer le nouveau trigger qui ne se déclenche que sur les champs métier
-- Il ne bloquera plus les modifications de selected_for_invoice, validation_status, etc.
CREATE TRIGGER trigger_prevent_expense_duplicate
    BEFORE INSERT OR UPDATE OF account_id, expense_date, designation, total, amount, supplier
    ON expenses
    FOR EACH ROW 
    EXECUTE FUNCTION prevent_expense_duplicate();

-- Vérifier la création du nouveau trigger
SELECT 
    '✅ Nouveau trigger créé' as info,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'expenses'
AND t.tgname = 'trigger_prevent_expense_duplicate';

-- Message de confirmation
SELECT '🎯 CORRECTION TERMINÉE: Le trigger ne bloquera plus les UPDATE de selected_for_invoice' as status;
