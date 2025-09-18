-- =========================================================
-- MODIFICATION TABLE CASH_BICTORYS : INTEGER → DECIMAL
-- =========================================================
-- Permet d'accepter les nombres décimaux (ex: 3707746.48)
-- DECIMAL(15,2) = 15 chiffres au total, 2 après la virgule
-- Exemple: 9999999999999.99 (13 chiffres avant, 2 après)

-- 1. Commencer une transaction pour sécurité
BEGIN;

-- 2. Modifier la colonne amount (VALEUR)
ALTER TABLE cash_bictorys 
ALTER COLUMN amount TYPE DECIMAL(15,2);

-- 3. Modifier la colonne balance (BALANCE)  
ALTER TABLE cash_bictorys 
ALTER COLUMN balance TYPE DECIMAL(15,2);

-- 4. Modifier la colonne fees (FRAIS)
ALTER TABLE cash_bictorys 
ALTER COLUMN fees TYPE DECIMAL(15,2);

-- 5. Vérifier la nouvelle structure
\d cash_bictorys;

-- 6. Valider les changements
COMMIT;

-- =========================================================
-- VERIFICATION POST-MODIFICATION
-- =========================================================

-- Vérifier quelques enregistrements pour s'assurer que les données sont intactes
SELECT 
    date,
    amount,
    balance,
    fees,
    pg_typeof(amount) as amount_type,
    pg_typeof(balance) as balance_type,
    pg_typeof(fees) as fees_type
FROM cash_bictorys 
LIMIT 5;

-- =========================================================
-- NOTES IMPORTANTES
-- =========================================================
-- 1. DECIMAL(15,2) permet des valeurs comme:
--    - 5000000.50 (5 millions et 50 centimes)
--    - 28624343.48 (28 millions et 48 centimes)
--    - 3707746.99 (3 millions et 99 centimes)
--
-- 2. Les anciennes valeurs entières restent valides:
--    - 5000000 devient 5000000.00
--    - 28624343 devient 28624343.00
--
-- 3. Alternative: Si vous voulez plus de précision:
--    - DECIMAL(18,4) = 4 décimales (ex: 5000000.4825)
--    - DECIMAL(20,2) = plus de chiffres avant la virgule
