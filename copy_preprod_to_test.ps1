# Script pour copier la base preprod vers la base de test
Write-Host "Debut de la copie de la base preprod vers la base de test" -ForegroundColor Yellow

# Variables de configuration
$env:PGPASSWORD = "bonea2024"
$PG_PATH = "C:\Program Files\PostgreSQL\17\bin"
$SOURCE_DB = "depenses_management_preprod"
$TARGET_DB = "mata_expenses_test_db"
$DB_USER = "zalint"
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DUMP_FILE = "temp_preprod_dump.sql"

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Source: $SOURCE_DB" -ForegroundColor White
Write-Host "  Target: $TARGET_DB" -ForegroundColor White
Write-Host "  User: $DB_USER" -ForegroundColor White
Write-Host "  Host: ${DB_HOST}:${DB_PORT}" -ForegroundColor White

try {
    # 1. Creer le dump de la base preprod
    Write-Host "1. Creation du dump de la base preprod..." -ForegroundColor Yellow
    & "$PG_PATH\pg_dump.exe" -h $DB_HOST -p $DB_PORT -U $DB_USER -d $SOURCE_DB --clean --if-exists --no-owner --no-privileges -f $DUMP_FILE
    
    if ($LASTEXITCODE -ne 0) {
        throw "Erreur lors du dump de la base preprod"
    }
    
    Write-Host "Dump cree avec succes: $DUMP_FILE" -ForegroundColor Green

    # 2. Supprimer la base de test existante si elle existe
    Write-Host "2. Suppression de la base de test existante..." -ForegroundColor Yellow
    & "$PG_PATH\dropdb.exe" -h $DB_HOST -p $DB_PORT -U $DB_USER --if-exists $TARGET_DB
    
    Write-Host "Base de test supprimee" -ForegroundColor Green

    # 3. Creer une nouvelle base de test
    Write-Host "3. Creation de la nouvelle base de test..." -ForegroundColor Yellow
    & "$PG_PATH\createdb.exe" -h $DB_HOST -p $DB_PORT -U $DB_USER $TARGET_DB
    
    if ($LASTEXITCODE -ne 0) {
        throw "Erreur lors de la creation de la base de test"
    }
    
    Write-Host "Base de test creee: $TARGET_DB" -ForegroundColor Green

    # 4. Importer le dump dans la base de test
    Write-Host "4. Importation des donnees dans la base de test..." -ForegroundColor Yellow
    & "$PG_PATH\psql.exe" -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TARGET_DB -f $DUMP_FILE
    
    if ($LASTEXITCODE -ne 0) {
        throw "Erreur lors de l'importation dans la base de test"
    }
    
    Write-Host "Donnees importees avec succes" -ForegroundColor Green

    # 5. Nettoyer le fichier temporaire
    Write-Host "5. Nettoyage..." -ForegroundColor Yellow
    Remove-Item $DUMP_FILE -ErrorAction SilentlyContinue
    Write-Host "Fichier temporaire supprime" -ForegroundColor Green

    Write-Host "SUCCES: Base preprod copiee vers base de test!" -ForegroundColor Green
    Write-Host "La base '$TARGET_DB' contient maintenant une copie complete de '$SOURCE_DB'" -ForegroundColor Cyan
    
} catch {
    Write-Host "ERREUR: $_" -ForegroundColor Red
    Write-Host "Verifiez:" -ForegroundColor Yellow
    Write-Host "  - Le chemin PostgreSQL: $PG_PATH" -ForegroundColor White
    Write-Host "  - Les informations de connexion" -ForegroundColor White
    Write-Host "  - Les permissions de l'utilisateur '$DB_USER'" -ForegroundColor White
    exit 1
}

Write-Host "Script termine avec succes!" -ForegroundColor Green