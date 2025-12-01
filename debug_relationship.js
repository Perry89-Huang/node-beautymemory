require('dotenv').config();
const axios = require('axios');
const { nhost } = require('./config/nhost');

async function debugRelationships() {
  console.log('Debug Relationships...');
  const userId = 'b013a678-b515-44d2-b688-2ab8e967de9d'; 
  const url = nhost.graphql.url;

  // Test 1: Nested user_profile (singular)
  console.log('\n1. Testing user { user_profile } ...');
  try {
    const query = `
      query GetUserAndProfile($id: uuid!) {
        user(id: $id) {
          id
          user_profile {
            member_level
          }
        }
      }
    `;
    const res = await axios.post(url, { query, variables: { id: userId } }, {
        headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET }
    });
    if (res.data.errors) console.log('   Failed:', res.data.errors[0].message);
    else console.log('   Success:', JSON.stringify(res.data.data));
  } catch (e) { console.log('   Error:', e.message); }

  // Test 2: Nested user_profiles (plural)
  console.log('\n2. Testing user { user_profiles } ...');
  try {
    const query = `
      query GetUserAndProfiles($id: uuid!) {
        user(id: $id) {
          id
          user_profiles {
            member_level
          }
        }
      }
    `;
    const res = await axios.post(url, { query, variables: { id: userId } }, {
        headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET }
    });
    if (res.data.errors) console.log('   Failed:', res.data.errors[0].message);
    else console.log('   Success:', JSON.stringify(res.data.data));
  } catch (e) { console.log('   Error:', e.message); }

  // Test 3: Direct user_profiles query
  console.log('\n3. Testing user_profiles(where: ...) ...');
  try {
    const query = `
      query GetProfileDirect($id: uuid!) {
        user_profiles(where: { user_id: { _eq: $id } }) {
          member_level
          remaining_analyses
        }
      }
    `;
    const res = await axios.post(url, { query, variables: { id: userId } }, {
        headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET }
    });
    if (res.data.errors) console.log('   Failed:', res.data.errors[0].message);
    else console.log('   Success:', JSON.stringify(res.data.data));
  } catch (e) { console.log('   Error:', e.message); }
}

debugRelationships();
