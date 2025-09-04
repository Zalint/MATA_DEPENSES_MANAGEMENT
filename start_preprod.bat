@echo off
echo ============================================
echo   DEMARRAGE SERVEUR DEPENSES MANAGEMENT
echo   Base de donnees: PREPROD
echo ============================================
echo.

REM Configuration des variables d'environnement pour la base de donnees preprod
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=depenses_management_preprod
set DB_USER=zalint
set DB_PASSWORD=bonea2024

echo Configuration base de donnees:
echo - Host: %DB_HOST%
echo - Port: %DB_PORT%
echo - Database: %DB_NAME%
echo - User: %DB_USER%
echo.

REM Arreter tout processus Node.js existant
echo Arret des processus Node.js existants...
taskkill /f /im node.exe 2>nul
if %errorlevel% == 0 (
    echo Processus Node.js arretes.
) else (
    echo Aucun processus Node.js a arreter.
)
echo.

REM Demarrer le serveur
echo Demarrage du serveur...
echo.
node server.js
