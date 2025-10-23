# Script PowerShell pour corriger la date du stock vivant
# Du 22/10/2025 vers 23/10/2025

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   CORRECTION DATE STOCK VIVANT                      ║" -ForegroundColor Cyan
Write-Host "║   22/10/2025 → 23/10/2025                           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Configuration de la base de données
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "depenses_management_preprod"
$DB_USER = "zalint"
$DB_PASSWORD = "bonea2024"

# Chemin vers psql (ajustez si nécessaire)
$PSQL_PATHS = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "psql"
)

$PSQL = $null
foreach ($path in $PSQL_PATHS) {
    if (Test-Path $path -ErrorAction SilentlyContinue) {
        $PSQL = $path
        Write-Host "✓ psql trouvé: $path" -ForegroundColor Green
        break
    }
}

if (-not $PSQL) {
    # Essayer avec la commande globale
    try {
        $null = Get-Command psql -ErrorAction Stop
        $PSQL = "psql"
        Write-Host "✓ psql trouvé dans PATH" -ForegroundColor Green
    } catch {
        Write-Host "✗ ERREUR: psql non trouvé" -ForegroundColor Red
        Write-Host "Installez PostgreSQL ou ajoutez-le au PATH" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`nConnexion à la base de données..." -ForegroundColor Yellow
Write-Host "  Host: $DB_HOST"
Write-Host "  Port: $DB_PORT"
Write-Host "  Database: $DB_NAME"
Write-Host "  User: $DB_USER`n"

# Définir le mot de passe
$env:PGPASSWORD = $DB_PASSWORD

# Exécuter le script SQL
$SQL_FILE = Join-Path $PSScriptRoot "fix_stock_date.sql"

if (-not (Test-Path $SQL_FILE)) {
    Write-Host "✗ ERREUR: Fichier SQL non trouvé: $SQL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "Exécution du script SQL..." -ForegroundColor Yellow

try {
    & $PSQL -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $SQL_FILE
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║         ✓ CORRECTION RÉUSSIE                        ║" -ForegroundColor Green
        Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host "La date du stock vivant a été corrigée:" -ForegroundColor Green
        Write-Host "  22/10/2025 → 23/10/2025`n" -ForegroundColor Green
        
        Write-Host "Rechargez la page web pour voir les changements." -ForegroundColor Yellow
    } else {
        Write-Host "`n✗ ERREUR lors de l'exécution du script SQL" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n✗ ERREUR: $_" -ForegroundColor Red
    exit 1
} finally {
    # Nettoyer le mot de passe
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
