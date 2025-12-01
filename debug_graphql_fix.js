require('dotenv').config();
const { nhost } = require('./config/nhost');
const axios = require('axios');

async function debugGraphQL() {
  console.log('Debug GraphQL...');
  
  const userId = 'b013a678-b515-44d2-b688-2ab8e967de9d'; 

  // 1. Testing user(id: ...) with Admin Secret (Axios)
  console.log('\n1. Testing user(id: ...) with Admin Secret (Axios)...');
  try {
    const query = `
        query GetUser($id: uuid!) {
          user(id: $id) {
            id
            email
            displayName
          }
        }
      `;
    const variables = { id: userId };
    
    const axiosRes = await axios.post(
        nhost.graphql.url,
        { query, variables },
        { headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET } }
    );
    console.log('   Axios Result:', JSON.stringify(axiosRes.data));

  } catch (e) {
    console.error('   Error:', e.message);
    if (e.response) console.error('   Response:', JSON.stringify(e.response.data));
  }
}

debugGraphQL();
