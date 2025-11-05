-- =====================================================
-- TRIGGERS POUR MAINTENIR LA COHÉRENCE DES COMPTES SPÉCIAUX
-- =====================================================

-- 1. Fonction trigger pour INSERT de dépense
CREATE OR REPLACE FUNCTION update_special_account_on_expense_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = NEW.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        UPDATE accounts
        SET 
            total_spent = total_spent + NEW.total,
            current_balance = current_balance - NEW.total
        WHERE id = NEW.account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fonction trigger pour UPDATE de dépense
CREATE OR REPLACE FUNCTION update_special_account_on_expense_update()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = NEW.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        -- Annuler l'ancien montant
        UPDATE accounts
        SET 
            total_spent = total_spent - OLD.total,
            current_balance = current_balance + OLD.total
        WHERE id = OLD.account_id;
        
        -- Appliquer le nouveau montant
        UPDATE accounts
        SET 
            total_spent = total_spent + NEW.total,
            current_balance = current_balance - NEW.total
        WHERE id = NEW.account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Fonction trigger pour DELETE de dépense
CREATE OR REPLACE FUNCTION update_special_account_on_expense_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = OLD.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        UPDATE accounts
        SET 
            total_spent = total_spent - OLD.total,
            current_balance = current_balance + OLD.total
        WHERE id = OLD.account_id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 4. Fonction trigger pour INSERT de crédit spécial
CREATE OR REPLACE FUNCTION update_special_account_on_credit_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = NEW.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        UPDATE accounts
        SET 
            total_credited = total_credited + NEW.amount,
            current_balance = current_balance + NEW.amount
        WHERE id = NEW.account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Fonction trigger pour UPDATE de crédit spécial
CREATE OR REPLACE FUNCTION update_special_account_on_credit_update()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = NEW.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        -- Annuler l'ancien montant
        UPDATE accounts
        SET 
            total_credited = total_credited - OLD.amount,
            current_balance = current_balance - OLD.amount
        WHERE id = OLD.account_id;
        
        -- Appliquer le nouveau montant
        UPDATE accounts
        SET 
            total_credited = total_credited + NEW.amount,
            current_balance = current_balance + NEW.amount
        WHERE id = NEW.account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Fonction trigger pour DELETE de crédit spécial
CREATE OR REPLACE FUNCTION update_special_account_on_credit_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR;
BEGIN
    -- Vérifier si c'est un compte spécial
    SELECT account_type INTO v_account_type
    FROM accounts
    WHERE id = OLD.account_id;
    
    -- Mettre à jour uniquement si c'est un compte spécial
    IF v_account_type = 'special' THEN
        UPDATE accounts
        SET 
            total_credited = total_credited - OLD.amount,
            current_balance = current_balance - OLD.amount
        WHERE id = OLD.account_id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SUPPRESSION DES ANCIENS TRIGGERS (si existants)
-- =====================================================

DROP TRIGGER IF EXISTS trg_special_expense_insert ON expenses;
DROP TRIGGER IF EXISTS trg_special_expense_update ON expenses;
DROP TRIGGER IF EXISTS trg_special_expense_delete ON expenses;
DROP TRIGGER IF EXISTS trg_special_credit_insert ON special_credit_history;
DROP TRIGGER IF EXISTS trg_special_credit_update ON special_credit_history;
DROP TRIGGER IF EXISTS trg_special_credit_delete ON special_credit_history;

-- =====================================================
-- CRÉATION DES NOUVEAUX TRIGGERS
-- =====================================================

-- Triggers pour expenses (avec filtre pour comptes spéciaux)
CREATE TRIGGER trg_special_expense_insert
    AFTER INSERT ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_expense_insert();

CREATE TRIGGER trg_special_expense_update
    AFTER UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_expense_update();

CREATE TRIGGER trg_special_expense_delete
    AFTER DELETE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_expense_delete();

-- Triggers pour special_credit_history
CREATE TRIGGER trg_special_credit_insert
    AFTER INSERT ON special_credit_history
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_credit_insert();

CREATE TRIGGER trg_special_credit_update
    AFTER UPDATE ON special_credit_history
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_credit_update();

CREATE TRIGGER trg_special_credit_delete
    AFTER DELETE ON special_credit_history
    FOR EACH ROW
    EXECUTE FUNCTION update_special_account_on_credit_delete();

-- =====================================================
-- FONCTION DE RECALCUL POUR CORRIGER LES DONNÉES EXISTANTES
-- =====================================================

DROP FUNCTION IF EXISTS recalculate_special_accounts_totals();

CREATE OR REPLACE FUNCTION recalculate_special_accounts_totals()
RETURNS TABLE(
    account_name VARCHAR,
    old_total_spent NUMERIC,
    new_total_spent NUMERIC,
    old_total_credited NUMERIC,
    new_total_credited NUMERIC,
    old_balance NUMERIC,
    new_balance NUMERIC,
    corrected BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT 
            a.account_name,
            a.total_spent as old_spent,
            a.total_credited as old_credited,
            a.current_balance as old_bal,
            COALESCE(SUM(e.total), 0)::NUMERIC as real_spent,
            COALESCE(SUM(sch.amount), 0)::NUMERIC as real_credited
        FROM accounts a
        LEFT JOIN expenses e ON e.account_id = a.id
        LEFT JOIN special_credit_history sch ON sch.account_id = a.id
        WHERE a.account_type = 'special' AND a.is_active = true
        GROUP BY a.id, a.account_name, a.total_spent, a.total_credited, a.current_balance
    )
    SELECT 
        c.account_name,
        c.old_spent,
        c.real_spent,
        c.old_credited,
        c.real_credited,
        c.old_bal,
        c.real_credited - c.real_spent as new_bal,
        (c.old_spent <> c.real_spent OR c.old_credited <> c.real_credited OR c.old_bal <> (c.real_credited - c.real_spent))
    FROM calculated c;
    
    -- Effectuer les corrections
    UPDATE accounts a
    SET 
        total_spent = calc.real_spent,
        total_credited = calc.real_credited,
        current_balance = calc.real_credited - calc.real_spent
    FROM (
        SELECT 
            a2.id,
            COALESCE(SUM(e.total), 0) as real_spent,
            COALESCE(SUM(sch.amount), 0) as real_credited
        FROM accounts a2
        LEFT JOIN expenses e ON e.account_id = a2.id
        LEFT JOIN special_credit_history sch ON sch.account_id = a2.id
        WHERE a2.account_type = 'special' AND a2.is_active = true
        GROUP BY a2.id
    ) calc
    WHERE a.id = calc.id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INSTRUCTIONS
-- =====================================================
-- Pour exécuter ce script:
-- psql -U <username> -d <database> -f create_special_accounts_triggers.sql
--
-- Pour recalculer les totaux existants:
-- SELECT * FROM recalculate_special_accounts_totals();
