require('dotenv').config();
const { nhost } = require('./config/nhost');

async function debugGraphQL() {
  console.log('Debug GraphQL...');
  console.log('Admin Secret present:', !!process.env.NHOST_ADMIN_SECRET);
  if (process.env.NHOST_ADMIN_SECRET) {
      console.log('Admin Secret length:', process.env.NHOST_ADMIN_SECRET.length);
  }

  const userId = 'b013a678-b515-44d2-b688-2ab8e967de9d'; // The ID from your error log

  // 1. Try users_by_pk with Admin Secret
  console.log('\n1. Testing users_by_pk with Admin Secret...');
  try {
    const res = await nhost.graphql.request({
      query: `
        query GetUserPK($id: uuid!) {
          users_by_pk(id: $id) {
            id
            email
          }
        }
      `,
      variables: { id: userId },
      headers: {
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    });
    console.log('   Result:', JSON.stringify(res));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Try users (list) with Admin Secret
  console.log('\n2. Testing users (list) with Admin Secret...');
  try {
    const res = await nhost.graphql.request({
      query: `
        query GetUserList($id: uuid!) {
          users(where: {id: {_eq: $id}}) {
            id
            email
          }
        }
      `,
      variables: { id: userId },
      headers: {
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    });
    console.log('   Result:', JSON.stringify(res));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 3. Introspection (partial)
  console.log('\n3. Introspection (partial)...');
  try {
    const res = await nhost.graphql.request({
      query: `
        query Introspect {
          __schema {
            queryType {
              fields {
                name
              }
            }
          }
        }
      `,
      headers: {
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    });
    console.log('   Full Introspection Response:', JSON.stringify(res)); // Added this line
    if (res.data && res.data.__schema) {
        const fields = res.data.__schema.queryType.fields.map(f => f.name);
        console.log('   Available root fields:', fields.filter(f => f.includes('user')));
    } else {
        console.log('   No schema returned');
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Test user_profiles
  console.log('\n4. Testing user_profiles...');
  try {
    const res = await nhost.graphql.request({
      query: `
        query GetProfiles {
          user_profiles(limit: 1) {
            id
            member_level
          }
        }
      `,
      headers: {
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    });
    console.log('   Result:', JSON.stringify(res));
  } catch (e) {
    console.log('   Error:', e.message);
  }
}

debugGraphQL();