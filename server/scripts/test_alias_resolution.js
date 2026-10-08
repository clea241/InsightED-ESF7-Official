const { resolveTestDivision } = require('../utils/divisionTestRegistry');

const testCases = [
  'r5.naga.test',
  'r7.naga.test',
  'r7.nagacity.test',
  'r7.cityofnagacebu.test',
  'r3.sanfernando.test',
  'r1.sanfernando.test',
  'rncr.taguig.test',
  'r11.samal.test',
  'r3.munoz.test',
  'r6.sancarlos.test',
  'r1.sancarlos.test',
  'mcoc.elem.test',
  'mcoc.es.test',
  'mcoc.k12.test'
];

console.log('Testing Alias & Handle Resolution:\n');
let allOk = true;

for (const t of testCases) {
  const match = resolveTestDivision(t);
  if (!match) {
    console.error(`❌ Failed to resolve: ${t}`);
    allOk = false;
  } else {
    console.log(`✅ [${t}] -> ID: ${match.schoolId} | Region: ${match.region} | Division: ${match.division} | School: ${match.schoolName}`);
  }
}

if (allOk) {
  console.log('\n🎉 ALL DIVISION HANDLES & ALIASES RESOLVE PERFECTLY!');
  process.exit(0);
} else {
  process.exit(1);
}
