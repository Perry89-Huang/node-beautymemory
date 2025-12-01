require('dotenv').config();
const axios = require('axios');
const { nhost } = require('./config/nhost');

async function inspectSchema() {
  console.log('Inspecting Schema...');
  const url = nhost.graphql.url;
  console.log('URL:', url);

  const query = `
    query IntrospectionQuery {
      __schema {
        queryType {
          name
          fields {
            name
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      url,
      { query },
      {
        headers: {
          'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
        }
      }
    );

    if (response.data.errors) {
      console.error('Errors:', JSON.stringify(response.data.errors, null, 2));
    } else {
      const fields = response.data.data.__schema.queryType.fields;
      console.log('Available Queries:');
      fields.forEach(f => console.log(' -', f.name));
    }
  } catch (error) {
    console.error('Request failed:', error.message);
    if (error.response) {
        console.error('Response data:', error.response.data);
    }
  }
}

inspectSchema();
