const https = require('https');

const GRAPHQL_HOST = 'kxubxmjrmlevvffkqkev.graphql.ap-southeast-1.nhost.run';
const HASURA_HOST  = 'kxubxmjrmlevvffkqkev.hasura.ap-southeast-1.nhost.run';
const ADMIN_SECRET = 'beautymemorylife';

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': ADMIN_SECRET,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  // Step 1: Create orders table
  const sql = `
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'TWD',
      transaction_id TEXT,
      line_pay_order_id TEXT UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      plan_name TEXT,
      plan_duration INTEGER,
      analyses_count INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      payment_info JSONB,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_line_pay_order_id ON orders(line_pay_order_id);
  `;

  console.log('1. Creating orders table...');
  const r1 = await post(HASURA_HOST, '/v2/query', { type: 'run_sql', args: { sql, cascade: false, read_only: false } });
  console.log('SQL result:', JSON.stringify(r1));

  // Step 2: Track the orders table in Hasura
  console.log('2. Tracking orders table...');
  const r2 = await post(HASURA_HOST, '/v1/metadata', { type: 'pg_track_table', args: { source: 'default', table: { schema: 'public', name: 'orders' } } });
  console.log('Track result:', JSON.stringify(r2));

  // Step 3: Check user_profiles fields
  console.log('3. Checking user_profiles fields...');
  const r3 = await post(GRAPHQL_HOST, '/v1', {
    query: `{ __type(name: "user_profiles") { fields { name } } }`
  });
  console.log('user_profiles fields:', JSON.stringify(r3?.data?.__type?.fields?.map(f => f.name)));
}

run().catch(e => console.error('Error:', e.message));
