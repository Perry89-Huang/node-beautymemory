require('dotenv').config();
const { nhost } = require('./config/nhost');

async function testSignin() {
  // Use the email from the previous run if possible, or hardcode one I know exists or create a new one.
  // Since I don't know the email from the previous run (it was random), I'll create a new one and try to sign in immediately.
  
  const email = `test_signin_${Date.now()}@example.com`;
  const password = 'password123';
  
  console.log(`Creating user ${email}...`);
  await nhost.auth.signUpEmailPassword({
      email,
      password,
      options: {
        displayName: 'Signin Test'
      }
  });

  console.log(`Attempting to sign in with ${email}...`);

  try {
    const response = await nhost.auth.signInEmailPassword({
      email,
      password
    });

    console.log('Signin Response:', JSON.stringify(response, null, 2));

    if (response.body && response.body.session) {
        console.log('✅ Signin successful, session obtained.');
    } else {
        console.log('❌ Signin failed or no session returned.');
        if (response.error) console.error(response.error);
    }

  } catch (error) {
    console.error('Exception:', error);
  }
}

testSignin();
