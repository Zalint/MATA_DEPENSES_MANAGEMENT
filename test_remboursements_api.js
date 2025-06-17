const axios = require('axios');

async function testRemboursementsAPI() {
  try {
    // First, login to get a session
    console.log('Attempting to login...');
    const loginResponse = await axios.post('http://localhost:3000/api/login', {
      username: 'Ousmane',
      password: 'password123'
    });
    console.log('Login successful:', loginResponse.data);

    // Store the cookie from the login response
    const cookie = loginResponse.headers['set-cookie'][0];
    const config = {
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      }
    };

    // Test creating multiple operations for the same client
    const operations = [
      {
        nom_client: 'Test Client',
        numero_tel: '123456789',
        date: '2024-03-17',
        action: 'dette',
        commentaire: 'Nouvelle dette',
        montant: 8000
      },
      {
        nom_client: 'Test Client',
        numero_tel: '123456789',
        date: '2024-03-17',
        action: 'remboursement',
        commentaire: 'Remboursement partiel',
        montant: 3000
      }
    ];

    console.log('\nAttempting to create operations...');
    for (const operation of operations) {
      try {
        console.log('\nSending operation:', operation);
        const response = await axios.post('http://localhost:3000/api/remboursements', operation, config);
        console.log('Operation created successfully:', response.data);
      } catch (error) {
        console.error('Error creating operation:', {
          operation,
          error: error.response ? {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
          } : error.message
        });
      }
    }

    console.log('\nAttempting to get all operations...');
    try {
      const allOperations = await axios.get('http://localhost:3000/api/remboursements', config);
      console.log('All operations:', allOperations.data);
    } catch (error) {
      console.error('Error getting all operations:', error.response ? error.response.data : error.message);
    }

    console.log('\nAttempting to get synthesis...');
    try {
      const synthesis = await axios.get('http://localhost:3000/api/remboursements/synthese', config);
      console.log('Synthesis by client (should show net balance):', synthesis.data);
    } catch (error) {
      console.error('Error getting synthesis:', error.response ? error.response.data : error.message);
    }
  } catch (error) {
    console.error('Top level error:', error.response ? {
      status: error.response.status,
      data: error.response.data,
      headers: error.response.headers
    } : error.message);
  }
}

testRemboursementsAPI(); 