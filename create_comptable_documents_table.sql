-- ===================================================
-- Table : comptable_documents
-- Stocke les métadonnées des documents comptables uploadés
-- (factures, justificatifs, états, etc.) accessibles depuis
-- Config > Documents comptables. Les fichiers physiques sont
-- conservés sur le disque dans uploads/comptable/{year}/.
-- ===================================================
CREATE TABLE IF NOT EXISTS comptable_documents (
    id SERIAL PRIMARY KEY,
    libelle VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    original_filename VARCHAR(500),
    stored_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comptable_documents_year
    ON comptable_documents(year);
CREATE INDEX IF NOT EXISTS idx_comptable_documents_uploaded_at
    ON comptable_documents(uploaded_at DESC);
