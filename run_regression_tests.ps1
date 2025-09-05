# Script PowerShell pour exécuter les tests de régression
# Compatible avec l'environnement Windows PowerShell

Write-Host "🧪 DÉMARRAGE DES TESTS DE NON-RÉGRESSION" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Vérifier que Node.js est installé
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js détecté: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    exit 1
}

# Vérifier que npm est installé
try {
    $npmVersion = npm --version
    Write-Host "✅ npm détecté: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    exit 1
}

# Vérifier que PostgreSQL est accessible
Write-Host "🔍 Vérification de la connexion à la base de données..." -ForegroundColor Yellow

$env:DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$env:DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$env:DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "mata_expenses_test_db" }
$env:DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "zalint" }
$env:DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "bonea2024" }

Write-Host "📡 Configuration de la base de données:" -ForegroundColor Cyan
Write-Host "   Host: $env:DB_HOST" -ForegroundColor Cyan
Write-Host "   Port: $env:DB_PORT" -ForegroundColor Cyan
Write-Host "   Database: $env:DB_NAME" -ForegroundColor Cyan
Write-Host "   User: $env:DB_USER" -ForegroundColor Cyan

# Installer les dépendances si nécessaire
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installation des dépendances..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Échec de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Dépendances installées avec succès" -ForegroundColor Green
}

# Exécuter les tests de base d'abord
Write-Host "🔧 Exécution des tests de base..." -ForegroundColor Yellow
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Les tests de base ont échoué" -ForegroundColor Red
    Write-Host "🔍 Vérifiez la configuration de la base de données et les dépendances" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Tests de base réussis" -ForegroundColor Green

# Exécuter les tests de régression
Write-Host ""
Write-Host "🧪 EXÉCUTION DES TESTS DE RÉGRESSION" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta

npm run test:regression
$regressionExitCode = $LASTEXITCODE

if ($regressionExitCode -eq 0) {
    Write-Host ""
    Write-Host "🎉 TOUS LES TESTS DE RÉGRESSION ONT RÉUSSI!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "✅ Test 1: Ajout dépense 1000 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Test 2: Suppression dépense 1000 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Test 3: Ajout créance 500 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Test 4: Suppression créance 500 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Test 5: Ajout transfert 750 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Test 6: Suppression transfert 750 FCFA - PASSÉ" -ForegroundColor Green
    Write-Host "✅ Cohérence Solde actuel = Solde Net - VALIDÉE" -ForegroundColor Green
    Write-Host "✅ Cohérence Audit Flux = Solde Net - VALIDÉE" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Les tests de non-régression garantissent l'intégrité des calculs de solde." -ForegroundColor Cyan
    Write-Host "🔒 Prêt pour le déploiement!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ ÉCHEC DES TESTS DE RÉGRESSION!" -ForegroundColor Red
    Write-Host "=================================" -ForegroundColor Red
    Write-Host "🔍 Des incohérences ont été détectées dans les calculs de solde." -ForegroundColor Yellow
    Write-Host "📋 Actions recommandées:" -ForegroundColor Yellow
    Write-Host "   1. Vérifiez la logique de calcul du solde net" -ForegroundColor Yellow
    Write-Host "   2. Contrôlez la cohérence des transactions" -ForegroundColor Yellow
    Write-Host "   3. Validez l'audit flux" -ForegroundColor Yellow
    Write-Host "   4. Consultez les logs détaillés ci-dessus" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "⚠️  NE PAS DÉPLOYER TANT QUE LES TESTS NE PASSENT PAS!" -ForegroundColor Red
}

# Afficher les instructions pour l'automatisation Git
Write-Host ""
Write-Host "🔄 AUTOMATISATION GIT" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "Ces tests s'exécuteront automatiquement:" -ForegroundColor Cyan
Write-Host "  • À chaque push vers main/master/develop" -ForegroundColor Cyan
Write-Host "  • À chaque pull request" -ForegroundColor Cyan
Write-Host "  • Via GitHub Actions (voir .github/workflows/regression-tests.yml)" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Pour exécuter manuellement:" -ForegroundColor Cyan
Write-Host "   npm run test:regression" -ForegroundColor Cyan
Write-Host "   # ou" -ForegroundColor Cyan
Write-Host "   .\run_regression_tests.ps1" -ForegroundColor Cyan

exit $regressionExitCode
