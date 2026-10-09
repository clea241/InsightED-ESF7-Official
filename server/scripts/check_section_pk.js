const db = require('../db');

async function main() {
  const res = await db.query("SELECT payload FROM school_drafts WHERE school_id = '300434'");
  const sec = res.rows[0].payload.classSections || res.rows[0].payload.sections || [];
  console.log(`School 300434 has ${sec.length} sections in draft`);
  const seenIds = new Map();
  for (const s of sec) {
    if (seenIds.has(s.id)) {
      console.log(`Intra-draft duplicate section ID: "${s.id}"`);
      console.log(`  First section: ${seenIds.get(s.id)}`);
      console.log(`  Second section: ${s.gradeLevel} - ${s.sectionName}`);
    } else {
      seenIds.set(s.id, `${s.gradeLevel} - ${s.sectionName}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
