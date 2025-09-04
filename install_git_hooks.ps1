# Script pour installer les hooks Git pour les tests de régression
# Compatible avec Windows PowerShell

Write-Host "🔗 INSTALLATION DES HOOKS GIT POUR TESTS DE RÉGRESSION" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green

# Vérifier que nous sommes dans un dépôt Git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Ce répertoire n'est pas un dépôt Git" -ForegroundColor Red
    Write-Host "💡 Initialisez d'abord un dépôt Git avec: git init" -ForegroundColor Yellow
    exit 1
}

# Créer le répertoire hooks s'il n'existe pas
$hooksDir = ".git/hooks"
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force
    Write-Host "✅ Répertoire hooks créé: $hooksDir" -ForegroundColor Green
}

# Contenu du hook pre-push
$prePushContent = @"
#!/bin/sh
# Hook Git pre-push pour exécuter les tests de régression BOVIN
# Généré automatiquement par install_git_hooks.ps1

echo "🧪 Exécution des tests de régression avant push..."

# Définir les variables d'environnement pour les tests
export DB_HOST=`${DB_HOST:-localhost}
export DB_PORT=`${DB_PORT:-5432}
export DB_NAME=`${DB_NAME:-mata_expenses_test_db}
export DB_USER=`${DB_USER:-zalint}
export DB_PASSWORD=`${DB_PASSWORD:-bonea2024}
export NODE_ENV=test

# Exécuter les tests de régression
npm run test:regression

if [ `$? -ne 0 ]; then
    echo "❌ Les tests de régression ont échoué!"
    echo "🚫 Push annulé pour préserver l'intégrité du code."
    echo "🔍 Corrigez les erreurs et réessayez."
    exit 1
fi

echo "✅ Tests de régression réussis - Push autorisé"
exit 0
"@

# Écrire le hook pre-push
$prePushFile = "$hooksDir/pre-push"
$prePushContent | Out-File -FilePath $prePushFile -Encoding UTF8 -NoNewline

# Rendre le fichier exécutable (sur Windows, pas nécessaire, mais on simule)
Write-Host "✅ Hook pre-push créé: $prePushFile" -ForegroundColor Green

# Contenu du hook post-commit pour les tests optionnels
$postCommitContent = @"
#!/bin/sh
# Hook Git post-commit pour vérifier l'état après commit
# Généré automatiquement par install_git_hooks.ps1

echo "📋 Rappel: Les tests de régression s'exécuteront au push"
echo "💡 Pour tester manuellement: npm run test:regression"
"@

# Écrire le hook post-commit
$postCommitFile = "$hooksDir/post-commit"
$postCommitContent | Out-File -FilePath $postCommitFile -Encoding UTF8 -NoNewline
Write-Host "✅ Hook post-commit créé: $postCommitFile" -ForegroundColor Green

# Instructions
Write-Host ""
Write-Host "🎯 INSTALLATION TERMINÉE" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta
Write-Host "Les hooks Git suivants ont été installés:" -ForegroundColor Cyan
Write-Host "  • pre-push: Exécute les tests de régression avant chaque push" -ForegroundColor Cyan
Write-Host "  • post-commit: Affiche un rappel après chaque commit" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚙️  FONCTIONNEMENT:" -ForegroundColor Yellow
Write-Host "  1. À chaque 'git push', les tests de régression s'exécutent automatiquement" -ForegroundColor Yellow
Write-Host "  2. Si les tests échouent, le push est annulé" -ForegroundColor Yellow
Write-Host "  3. Si les tests réussissent, le push continue normalement" -ForegroundColor Yellow
Write-Host ""
Write-Host "🧪 TESTS INCLUS:" -ForegroundColor Green
Write-Host "  ✓ Ajout/Suppression dépense 1000 FCFA" -ForegroundColor Green
Write-Host "  ✓ Ajout/Suppression créance 500 FCFA" -ForegroundColor Green
Write-Host "  ✓ Ajout/Suppression transfert 750 FCFA" -ForegroundColor Green
Write-Host "  ✓ Vérification Solde actuel = Solde Net" -ForegroundColor Green
Write-Host "  ✓ Vérification Audit Flux = Solde Net" -ForegroundColor Green
Write-Host ""
Write-Host "🔄 POUR DÉSACTIVER TEMPORAIREMENT:" -ForegroundColor Cyan
Write-Host "   git push --no-verify" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 POUR TESTER MANUELLEMENT:" -ForegroundColor Cyan
Write-Host "   npm run test:regression" -ForegroundColor Cyan
Write-Host "   # ou" -ForegroundColor Cyan
Write-Host "   .\run_regression_tests.ps1" -ForegroundColor Cyan

Write-Host ""
Write-Host "🎉 Configuration terminée! Vos tests de régression sont maintenant automatisés." -ForegroundColor Green
