require('dotenv').config();
const { nhost } = require('./config/nhost');

console.log('nhost object keys:', Object.keys(nhost));
if (nhost.auth) {
  console.log('nhost.auth keys:', Object.keys(nhost.auth));
  console.log('nhost.auth.signUp type:', typeof nhost.auth.signUp);
  console.log('nhost.auth.signIn type:', typeof nhost.auth.signIn);
} else {
  console.log('nhost.auth is undefined');
}
