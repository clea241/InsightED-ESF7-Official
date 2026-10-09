const db = require('../db');

async function main() {
  // Check 102664
  const res664 = await db.query("SELECT payload FROM school_drafts WHERE school_id = '102664'");
  const p664 = (res664.rows[0].payload.personnel || []).find(x => x.id && x.id.includes('chtk2cbzc'));
  console.log('--- Colliding teacher in 102664 ---');
  console.log({
    id: p664.id,
    prn: p664.prn,
    name: `${p664.firstName} ${p664.lastName}`
  });

  // Check 101028
  const res028 = await db.query("SELECT payload FROM school_drafts WHERE school_id = '101028'");
  const per028 = res028.rows[0].payload.personnel || [];
  console.log('\n--- Workloads in 101028 with NaN time ---');
  per028.forEach(p => {
    (p.workloadRows || []).forEach(w => {
      if (String(w.startTime).includes('NaN') || String(w.endTime).includes('NaN')) {
        console.log({ teacher: `${p.firstName} ${p.lastName}`, startTime: w.startTime, endTime: w.endTime, subject: w.subject });
      }
    });
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
