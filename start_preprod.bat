@echo off
echo =====================================
echo TESTS DE NON-REGRESSION PRE-PUSH
echo =====================================

REM Les credentials NE doivent PAS etre embarques en clair dans ce script.
REM Configurez DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD via votre
REM secret manager ou votre shell avant d'invoquer ce script.
if "%DB_HOST%"=="" goto :missing
if "%DB_PORT%"=="" goto :missing
if "%DB_NAME%"=="" goto :missing
if "%DB_USER%"=="" goto :missing
if "%DB_PASSWORD%"=="" goto :missing
goto :run

:missing
echo ERREUR: Variables d'environnement manquantes.
echo Requises: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
echo Configurez-les avant d'executer ce script.
exit /b 1

:run
set NODE_ENV=test

echo Demarrage des tests de regression...
call npm run test:regression

if %ERRORLEVEL% NEQ 0 (
    echo =====================================
    echo TESTS DE REGRESSION ECHOUES
    echo =====================================
    echo Les tests de non-regression ont echoue.
    echo Corrigez les erreurs avant de continuer.
    pause
    exit /b 1
)

echo =====================================
echo TESTS DE REGRESSION REUSSIS
echo =====================================
echo Tous les tests de non-regression sont passes.
pause
