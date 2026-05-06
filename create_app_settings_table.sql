-- =====================================================
-- TABLE APP_SETTINGS
-- =====================================================
-- Paramètres applicatifs typés en JSONB.
-- Migre les valeurs de financial_settings.json vers la base.
-- Le JSON reste comme fallback bootstrap si la DB est vide / inaccessible.

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE app_settings IS 'Paramètres applicatifs (financial_settings et autres) stockés en clé/valeur JSONB';
COMMENT ON COLUMN app_settings.key IS 'Identifiant unique du paramètre (ex: charges_fixes_estimation)';
COMMENT ON COLUMN app_settings.value IS 'Valeur JSONB du paramètre - préserve le type natif (number, boolean, array, object)';

-- Seed des paramètres depuis financial_settings.json
-- ON CONFLICT DO NOTHING : la migration est idempotente, ne réécrit pas une valeur déjà saisie en base
INSERT INTO app_settings (key, value) VALUES
    ('charges_fixes_estimation', '5900000'::jsonb),
    ('validate_expense_balance', 'false'::jsonb),
    ('stock_mata_abattement', '0.10'::jsonb),
    ('comptes_amortissement_investissement', '["EXCEPTIONNEL", "EQUIPEMENT"]'::jsonb),
    ('comptes_investissement', '["EXCEPTIONNEL"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Vérification
SELECT
    'Table app_settings créée et seedée' as message,
    COUNT(*) as nombre_parametres
FROM app_settings;
