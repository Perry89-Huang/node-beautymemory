require('dotenv').config();
const axios = require('axios');
const { nhost } = require('./config/nhost');

async function inspectUserType() {
  console.log('Inspecting User Type...');
  const url = nhost.graphql.url;

  const query = `
    query IntrospectionQuery {
      __type(name: "user") {
        name
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
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
      if (!response.data.data.__type) {
          console.log('Type "user" not found. Trying "users"...');
          // Try "users" just in case, though we know "user" query exists
      } else {
          const fields = response.data.data.__type.fields;
          console.log('Fields on "user" type:');
          fields.forEach(f => {
              let typeName = f.type.name;
              if (!typeName && f.type.ofType) {
                  typeName = f.type.ofType.name || f.type.ofType.kind;
              }
              console.log(` - ${f.name} (${typeName})`);
          });
      }
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

inspectUserType();
