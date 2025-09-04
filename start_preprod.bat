@echo off
echo 🧪 ==================================
echo 🧪 TESTS DE NON-REGRESSION PRE-PUSH
echo 🧪 ==================================

echo 📋 Configuration des variables d'environnement...
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=depenses_management_preprod
set DB_USER=zalint
set DB_PASSWORD=bonea2024
set NODE_ENV=test

echo ⚡ Démarrage des tests de régression...
call npm run test:regression

if %ERRORLEVEL% NEQ 0 (
    echo ❌ ==================================
    echo ❌ TESTS DE REGRESSION ECHOUES!
    echo ❌ ==================================
    echo ❌ Les tests de non-régression ont échoué.
    echo ❌ Corrigez les erreurs avant de continuer.
    pause
    exit /b 1
)

echo ✅ ==================================
echo ✅ TESTS DE REGRESSION REUSSIS!
echo ✅ ==================================
echo ✅ Tous les tests de non-régression sont passés.
pause