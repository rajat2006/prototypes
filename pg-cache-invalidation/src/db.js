const { Pool, Client } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createListenerClient() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  return client;
}

module.exports = { pool, createListenerClient };
