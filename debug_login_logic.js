require('dotenv').config();
const { nhost } = require('./config/nhost');

async function test() {
  const email = 'test' + Date.now() + '@example.com';
  const password = 'password123';

  console.log('1. Registering ' + email + '...');
  try {
    const res = await nhost.auth.signUpEmailPassword({
        email,
        password,
        options: { displayName: 'Test User' }
    });
    if (res.error) {
        console.log('   Registration error:', res.error);
    } else {
        console.log('   Registered.');
    }
  } catch (e) {
    console.log('   Registration THREW:', e);
  }

  console.log('2. Logging in...');
  let session;
  try {
    const res = await nhost.auth.signInEmailPassword({ email, password });
    if (res.error) {
        console.error('   Login returned error:', res.error);
        return;
    }
    session = res.session;
    console.log('   Logged in. User ID:', session?.user?.id);
  } catch (e) {
    console.error('   Login THREW:', e);
    return;
  }

  if (!session) {
      console.log('   No session returned.');
      return;
  }

  console.log('3. Querying User Info...');
  try {
    const response = await nhost.graphql.request({
      query: `
      query GetUserInfo($userId: uuid!) {
        users_by_pk(id: $userId) {
          id
          email
          displayName
          user_profile {
            member_level
          }
        }
      }
      `,
      variables: { userId: session.user.id }
    });
    console.log('   Query response:', JSON.stringify(response, null, 2));
  } catch (e) {
    console.error('   Query THREW error:', e);
  }
}

test();