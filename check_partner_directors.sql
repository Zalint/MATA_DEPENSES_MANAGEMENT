-- Vérifier les comptes partenaires et leurs directeurs assignés
SELECT 
    a.id as account_id,
    a.account_name,
    a.account_type,
    u1.id as user_id,
    u1.username,
    u1.role
FROM accounts a
LEFT JOIN users u1 ON a.user_id = u1.id
WHERE a.account_type = 'partenaire'
ORDER BY a.account_name;

-- Vérifier les directeurs assignés dans la table partner_account_directors
SELECT 
    pad.account_id,
    a.account_name,
    pad.director_id,
    u.username,
    u.role
FROM partner_account_directors pad
JOIN accounts a ON pad.account_id = a.id
JOIN users u ON pad.director_id = u.id
ORDER BY a.account_name, u.username;

-- Vérifier tous les utilisateurs avec rôle directeur
SELECT id, username, role FROM users WHERE role = 'directeur' ORDER BY username; 