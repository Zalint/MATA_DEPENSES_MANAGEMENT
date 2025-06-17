#!/usr/bin/env node

/**
 * Generate a secure session secret for production deployment
 * Run with: node generate_session_secret.js
 */

const crypto = require('crypto');

// Generate a 32-byte random string and convert to hex
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('🔐 Generated SESSION_SECRET for production:');
console.log('');
console.log(sessionSecret);
console.log('');
console.log('📋 Copy this value and use it as your SESSION_SECRET environment variable in Render.');
console.log('⚠️  Keep this secret secure and never commit it to version control!'); 