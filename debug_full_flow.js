require('dotenv').config();
const { nhost } = require('./config/nhost');
const axios = require('axios');

async function testFullFlow() {
  // Use a pre-verified test account
  const email = 'perry@ms3.url.com.tw';
  const password = 'Test1234!'; // Update with actual password if needed

  console.log('1. Logging in via API...');
  let session;
  try {
    const res = await nhost.auth.signInEmailPassword({ email, password });
    if (res.error) {
        console.error('   Login returned error:', res.error);
        // Try creating a temp user if login fails
        return;
    }
    session = res.session;
    console.log('   Logged in. User ID:', session?.user?.id);
    console.log('   Access Token:', session?.accessToken?.substring(0, 20) + '...');
  } catch (e) {
    console.error('   Login THREW:', e);
    return;
  }

  if (!session) {
      console.log('   No session returned.');
      return;
  }

  console.log('\n2. Testing /api/members/quota ...');
  try {
      const res = await axios.get('http://localhost:3000/api/members/quota', {
          headers: {
              'Authorization': `Bearer ${session.accessToken}`
          }
      });
      console.log('   Success:', res.status, res.data);
  } catch (e) {
      console.error('   Failed:', e.message);
      if (e.response) {
          console.error('   Status:', e.response.status);
          console.error('   Data:', e.response.data);
      }
  }
}

testFullFlow();
