-- =====================================================
-- TABLE VIREMENT_CLIENTS
-- =====================================================
-- Source de vérité du mapping client -> point de vente pour les virements.
-- Remplace progressivement virementMapping.json (qui reste comme fallback).
-- Un client peut ne pas avoir de point de vente (point_de_vente NULL).
-- is_internal = TRUE => virement interne, à exclure de l'API externe.

CREATE TABLE IF NOT EXISTS virement_clients (
    client_name VARCHAR(255) PRIMARY KEY,
    point_de_vente VARCHAR(255),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE virement_clients IS 'Clients virement et leur rattachement à un point de vente. Source de vérité, remplace virementMapping.json.';
COMMENT ON COLUMN virement_clients.client_name IS 'Nom du client tel que saisi dans virement_mensuel.client (case sensitive)';
COMMENT ON COLUMN virement_clients.point_de_vente IS 'Point de vente rattaché au client. NULL si non assigné.';
COMMENT ON COLUMN virement_clients.is_internal IS 'TRUE si virement interne (exclu de /external/api/virement[-mensuel])';

-- Seed depuis virementMapping.json (état au moment de la migration).
-- ON CONFLICT DO NOTHING : idempotent, ne réécrit pas une ligne existante.
INSERT INTO virement_clients (client_name, point_de_vente, is_internal) VALUES
    ('MaasAlmadie2',     'Centre de Découpe Banlieue', FALSE),
    ('MaaSMbao',         'Centre de Découpe Banlieue', FALSE),
    ('MaaSKeurMassar',   'Centre de Découpe Banlieue', FALSE),
    ('MaasSac',          'Centre de Découpe Dakar',    FALSE),
    ('Keur baly',        'Centre de Découpe Dakar',    FALSE),
    ('Abats',            'Abattage',                   FALSE),
    -- Exclusions internes (anciennement virementPointDeVenteInterneToExclude)
    ('Sacré Coeur',      NULL,                         TRUE),
    ('Keur Massar',      NULL,                         TRUE)
ON CONFLICT (client_name) DO NOTHING;

-- Index pour optimiser les jointures de l'API externe
CREATE INDEX IF NOT EXISTS idx_virement_clients_is_internal ON virement_clients(is_internal) WHERE is_internal = TRUE;

-- Vérification
SELECT
    'Table virement_clients créée et seedée' as message,
    COUNT(*) as nombre_clients,
    COUNT(*) FILTER (WHERE is_internal) as nombre_internes,
    COUNT(*) FILTER (WHERE point_de_vente IS NOT NULL) as nombre_avec_pdv
FROM virement_clients;
