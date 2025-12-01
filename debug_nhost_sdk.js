require('dotenv').config();
const { nhost } = require('./config/nhost');

console.log('--- Nhost SDK Inspection ---');
console.log('nhost.auth keys:', Object.keys(nhost.auth));
console.log('nhost.graphql keys:', Object.keys(nhost.graphql));

if (nhost.auth.setAccessToken) {
    console.log('nhost.auth.setAccessToken exists');
} else {
    console.log('nhost.auth.setAccessToken DOES NOT exist');
}

console.log('nhost.graphql.request type:', typeof nhost.graphql.request);
