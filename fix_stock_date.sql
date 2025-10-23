-- Script pour corriger la date du stock vivant du 22/10/2025 vers 23/10/2025
-- Date: 2025-10-23
-- Raison: Problème de timezone lors de la sauvegarde

BEGIN;

-- Vérifier les données avant la correction
SELECT 'AVANT CORRECTION:' as etape;
SELECT date_stock, COUNT(*) as nb_lignes 
FROM stock_vivant 
WHERE date_stock = '2025-10-22'
GROUP BY date_stock;

-- Mettre à jour la date du 22/10/2025 vers 23/10/2025
UPDATE stock_vivant 
SET date_stock = '2025-10-23'
WHERE date_stock = '2025-10-22';

-- Vérifier les données après la correction
SELECT 'APRES CORRECTION:' as etape;
SELECT date_stock, COUNT(*) as nb_lignes 
FROM stock_vivant 
WHERE date_stock = '2025-10-23'
GROUP BY date_stock;

-- Afficher toutes les dates disponibles
SELECT 'TOUTES LES DATES DISPONIBLES:' as etape;
SELECT DISTINCT date_stock, 
       TO_CHAR(date_stock, 'DD/MM/YYYY') as date_fr,
       COUNT(*) as nb_lignes
FROM stock_vivant 
GROUP BY date_stock
ORDER BY date_stock DESC
LIMIT 10;

COMMIT;
