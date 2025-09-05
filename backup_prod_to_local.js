#!/usr/bin/env node

/**
 * 🔄 SCRIPT DE SAUVEGARDE PRODUCTION → LOCAL
 * 
 * Ce script effectue une copie sécurisée de la base de données de production
 * vers un environnement local de préprod sans risquer de corrompre la production.
 * 
 * CONFIGURATION :
 * - PROD: postgresql://depenses_management_user:zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu@dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com/depenses_management
 * - LOCAL: localhost:5432/depenses_management_preprod (user: zalint, pass: bonea2024)
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration des bases de données
const PROD_CONFIG = {
    host: 'dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com',
    port: 5432,
    database: 'depenses_management',
    user: 'depenses_management_user',
    password: 'zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu'
};

const LOCAL_CONFIG = {
    host: 'localhost',
    port: 5432,
    database: 'depenses_management_preprod',
    user: 'zalint',
    password: 'bonea2024'
};

// Fonction utilitaire pour exécuter des commandes
function runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`📝 Exécution: ${command}`);
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erreur: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr && !stderr.includes('NOTICE')) {
                console.warn(`⚠️ Avertissement: ${stderr}`);
            }
            if (stdout) {
                console.log(`✅ Résultat: ${stdout}`);
            }
            resolve(stdout);
        });
    });
}

// Fonction pour créer la base de données locale
async function createLocalDatabase() {
    console.log('\n🗄️ === CRÉATION DE LA BASE LOCALE ===');
    
    try {
        // Connexion URL pour administration (postgres)
        const adminUrl = `postgresql://${LOCAL_CONFIG.user}:${LOCAL_CONFIG.password}@${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/postgres`;
        
        // Supprimer la base si elle existe déjà
        console.log('🗑️ Suppression de la base existante (si elle existe)...');
        await runCommand(`psql "${adminUrl}" -c "DROP DATABASE IF EXISTS ${LOCAL_CONFIG.database};"`);
        
        // Créer la nouvelle base
        console.log('🆕 Création de la nouvelle base...');
        await runCommand(`psql "${adminUrl}" -c "CREATE DATABASE ${LOCAL_CONFIG.database} WITH ENCODING='UTF8';"`);
        
        console.log(`✅ Base de données locale '${LOCAL_CONFIG.database}' créée avec succès !`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la création de la base locale:', error.message);
        throw error;
    }
}

// Fonction pour faire le dump de la production
async function dumpProductionDatabase() {
    console.log('\n📦 === DUMP DE LA BASE DE PRODUCTION ===');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const dumpFile = `prod_backup_${timestamp}.sql`;
    
    try {
        // URL de connexion pour la production
        const prodUrl = `postgresql://${PROD_CONFIG.user}:${PROD_CONFIG.password}@${PROD_CONFIG.host}:${PROD_CONFIG.port}/${PROD_CONFIG.database}`;
        
        console.log('🔄 Téléchargement des données de production...');
        console.log(`📁 Fichier de sauvegarde: ${dumpFile}`);
        
        // Commande pg_dump sécurisée (lecture seule)
        const dumpCommand = `pg_dump "${prodUrl}" --no-password --verbose --clean --if-exists --create --format=custom --file="${dumpFile}"`;
        
        await runCommand(dumpCommand);
        
        // Vérifier que le fichier a été créé
        if (!fs.existsSync(dumpFile)) {
            throw new Error('Le fichier de sauvegarde n\'a pas été créé');
        }
        
        const stats = fs.statSync(dumpFile);
        console.log(`✅ Dump terminé ! Taille: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        return dumpFile;
        
    } catch (error) {
        console.error('❌ Erreur lors du dump de production:', error.message);
        throw error;
    }
}

// Fonction pour restaurer dans la base locale
async function restoreToLocal(dumpFile) {
    console.log('\n📥 === RESTAURATION DANS LA BASE LOCALE ===');
    
    try {
        // URL de connexion pour la base locale
        const localUrl = `postgresql://${LOCAL_CONFIG.user}:${LOCAL_CONFIG.password}@${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/${LOCAL_CONFIG.database}`;
        
        console.log('🔄 Restauration des données...');
        
        // Commande pg_restore
        const restoreCommand = `pg_restore --no-password --verbose --clean --if-exists --dbname="${localUrl}" "${dumpFile}"`;
        
        await runCommand(restoreCommand);
        
        console.log('✅ Restauration terminée avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la restauration:', error.message);
        throw error;
    }
}

// Fonction pour vérifier la copie
async function verifyLocalDatabase() {
    console.log('\n🔍 === VÉRIFICATION DE LA COPIE ===');
    
    try {
        const localUrl = `postgresql://${LOCAL_CONFIG.user}:${LOCAL_CONFIG.password}@${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/${LOCAL_CONFIG.database}`;
        
        // Compter les tables
        const tablesResult = await runCommand(`psql "${localUrl}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"`);
        const tableCount = parseInt(tablesResult.trim());
        
        // Compter les utilisateurs
        const usersResult = await runCommand(`psql "${localUrl}" -t -c "SELECT COUNT(*) FROM users;"`);
        const userCount = parseInt(usersResult.trim());
        
        // Compter les comptes
        const accountsResult = await runCommand(`psql "${localUrl}" -t -c "SELECT COUNT(*) FROM accounts;"`);
        const accountCount = parseInt(accountsResult.trim());
        
        console.log('📊 === STATISTIQUES DE LA BASE LOCALE ===');
        console.log(`📋 Tables: ${tableCount}`);
        console.log(`👥 Utilisateurs: ${userCount}`);
        console.log(`💰 Comptes: ${accountCount}`);
        
        if (tableCount > 0 && userCount > 0) {
            console.log('✅ La copie semble avoir réussi !');
        } else {
            console.log('⚠️ La copie pourrait être incomplète');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification:', error.message);
    }
}

// Fonction principale
async function main() {
    console.log('🚀 === DÉBUT DE LA COPIE PRODUCTION → LOCAL ===\n');
    
    const startTime = Date.now();
    let dumpFile = null;
    
    try {
        // Étape 1: Créer la base locale
        await createLocalDatabase();
        
        // Étape 2: Dump de la production
        dumpFile = await dumpProductionDatabase();
        
        // Étape 3: Restaurer dans la base locale
        await restoreToLocal(dumpFile);
        
        // Étape 4: Vérifier la copie
        await verifyLocalDatabase();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n🎉 === COPIE TERMINÉE AVEC SUCCÈS ===');
        console.log(`⏱️ Durée: ${duration} secondes`);
        console.log(`📁 Fichier de sauvegarde: ${dumpFile}`);
        console.log(`🗄️ Base locale: ${LOCAL_CONFIG.database}`);
        console.log('\n💡 Vous pouvez maintenant utiliser votre copie locale pour les tests !');
        
        // Proposer de supprimer le fichier dump
        console.log(`\n🗑️ Voulez-vous supprimer le fichier ${dumpFile} ? (il prend de l'espace disque)`);
        console.log('   Pour le garder: ne rien faire');
        console.log(`   Pour le supprimer: rm "${dumpFile}"`);
        
    } catch (error) {
        console.error('\n💥 === ERREUR FATALE ===');
        console.error(error.message);
        console.error('\n🔧 Vérifiez que:');
        console.error('   1. PostgreSQL est installé et accessible');
        console.error('   2. Les credentials de connection sont corrects');
        console.error('   3. Vous avez une connexion internet pour la production');
        console.error('   4. L\'utilisateur local a les droits pour créer des bases');
        
        process.exit(1);
    } finally {
        // Nettoyer les variables d'environnement sensibles
        delete process.env.PGPASSWORD;
    }
}

// Point d'entrée
if (require.main === module) {
    main();
}

module.exports = {
    createLocalDatabase,
    dumpProductionDatabase,
    restoreToLocal,
    verifyLocalDatabase
};
