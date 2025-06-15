-- Script de migration pour changer de EUR vers XOF
-- Convertir les montants décimaux en entiers et changer la structure

-- 1. Modifier la table expenses pour utiliser des entiers
-- (Multiplier par 655.957 pour convertir approximativement EUR vers XOF, puis arrondir)
UPDATE expenses SET amount = ROUND(amount * 656) WHERE amount IS NOT NULL;
ALTER TABLE expenses ALTER COLUMN amount TYPE INTEGER USING amount::INTEGER;

-- 2. Modifier la table wallets pour utiliser des entiers
UPDATE wallets SET 
    initial_amount = ROUND(initial_amount * 656),
    current_balance = ROUND(current_balance * 656)
WHERE initial_amount IS NOT NULL;

ALTER TABLE wallets ALTER COLUMN initial_amount TYPE INTEGER USING initial_amount::INTEGER;
ALTER TABLE wallets ALTER COLUMN current_balance TYPE INTEGER USING current_balance::INTEGER;

-- 3. Afficher un message de confirmation
SELECT 'Migration vers XOF terminée avec succès!' as message; 