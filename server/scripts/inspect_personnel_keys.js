const { prodPool } = require("../db");

async function inspectSample() {
  const r = await prodPool.query(`
    SELECT d.school_id, p_elem
    FROM school_drafts d,
         jsonb_array_elements(d.payload->'personnel') as p_elem
    WHERE UPPER(COALESCE(p_elem->>'deploymentStatus', '')) IN ('CLUSTERED', 'REASSIGNED')
       OR p_elem->>'isClustered' = 'true'
       OR p_elem->>'isReassigned' = 'true'
    LIMIT 10
  `);

  console.log("Sample Clustered/Reassigned personnel:");
  console.log(JSON.stringify(r.rows, null, 2));
  await prodPool.end();
}

inspectSample().catch(console.error);
