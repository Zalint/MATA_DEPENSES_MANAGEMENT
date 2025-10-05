# Script pour démarrer l'application Mata Dépenses Management en préprod

# Tuer tout processus utilisant le port 3000
Write-Host "Arrêt des processus sur le port 3000..." -ForegroundColor Yellow
npx kill-port 3000

# Variables d'environnement pour la base de données
$env:DB_HOST="localhost"
$env:DB_PORT="5432"
$env:DB_NAME="matavolaille_db"
$env:DB_USER="zalint"
$env:DB_PASSWORD="bonea2024"

# Variables d'environnement pour les snapshots Puppeteer
$env:SNAPSHOT_USERNAME="Saliou"
$env:SNAPSHOT_PASSWORD="Murex2015"


# Démarrage du serveur
Write-Host "Démarrage de l'application Mata Dépenses Management en mode préprod..." -ForegroundColor Green
Write-Host "Base de données: $env:DB_NAME sur $env:DB_HOST:$env:DB_PORT" -ForegroundColor Cyan

node server.js
