const { createClient } = require('@nhost/nhost-js');
require('dotenv').config();

const nhost = createClient({
  subdomain: process.env.NHOST_SUBDOMAIN || 'kxubxmjrmlevvffkqkev',
  region: process.env.NHOST_REGION || 'ap-southeast-1',
});

async function test() {
  console.log('Testing Nhost connection...');
  try {
    console.log('Attempt 1: String query');
    const response1 = await nhost.graphql.request(
      `query TestConnection {
        __typename
      }`
    );
    console.log('Response 1:', response1);
  } catch (error) {
    console.error('Error 1:', error.message);
  }

  try {
    console.log('Attempt 2: Object with query property');
    // This is not standard for nhost-js but worth a try if it's just passing through to fetch
    const response2 = await nhost.graphql.request({
      query: `query TestConnection {
        __typename
      }`
    });
    console.log('Response 2:', response2);
  } catch (error) {
    console.error('Error 2:', error.message);
  }
}

test();
