const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
      database: 'depenses_management',
  user: 'zalint',
  password: 'bonea2024',
});

async function main() {
  await client.connect();
  console.log('--- Toutes les opérations remboursements ---');
  const all = await client.query('SELECT * FROM remboursements ORDER BY date DESC, id DESC');
  console.table(all.rows);

  console.log('\n--- Synthèse par client ---');
  const synthese = await client.query(`
    SELECT nom_client, numero_tel,
      SUM(CASE WHEN action = 'remboursement' THEN montant ELSE -montant END) AS total,
      MAX(date) AS dernier_paiement
    FROM remboursements
    GROUP BY nom_client, numero_tel
    ORDER BY nom_client
  `);
  console.table(synthese.rows);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); }); 