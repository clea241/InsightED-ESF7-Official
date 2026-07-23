const { Client } = require('pg'); 
const client = new Client({ 
  connectionString: 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7', 
  ssl: { rejectUnauthorized: false } 
}); 
client.connect().then(() => {
  return client.query('SELECT * FROM clustered_connections WHERE target_school_id = $1', ['123458']);
}).then(res => { 
  console.log(res.rows); 
  client.end(); 
}).catch(console.error);
