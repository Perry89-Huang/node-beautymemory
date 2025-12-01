require('dotenv').config();
const { nhost } = require('./config/nhost');

async function testSignup() {
  const email = `test_${Date.now()}@example.com`;
  const password = 'password123';
  const displayName = 'Test User';

  console.log(`Attempting to sign up with ${email}...`);

  try {
    const response = await nhost.auth.signUpEmailPassword({
      email,
      password,
      options: {
        displayName,
        metadata: {
          registrationSource: 'test_script'
        }
      }
    });

    console.log('Full Response:', JSON.stringify(response, null, 2));

    if (response.error) {
        console.error('Error:', response.error);
    }
    
    if (response.session) { // Check if session is at top level (old SDK?)
        console.log('Session found at top level');
    }

    if (response.body) {
        console.log('Body found:', response.body);
        if (response.body.session) {
            console.log('Session found in body');
        }
    }

  } catch (error) {
    console.error('Exception:', error);
  }
}

testSignup();
