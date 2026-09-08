const fs = require('fs');
const path = require('path');

const harvesterPath = 'E:\\ESF7 Official\\api\\esf7_harvester.js';

if (!fs.existsSync(harvesterPath)) {
  console.error('Harvester file not found at:', harvesterPath);
  process.exit(1);
}

let content = fs.readFileSync(harvesterPath, 'utf8');

const oldLine = "const targetTable = currentSemester === '1ST SEM' ? 'esf7_1st' : 'esf7_database';";
const newLine = `// [InsightED Sandbox Isolation] Route test schools to esf7_database_dummy
                    const numericSchoolId = parseInt(school_id, 10);
                    const isTestSchool = (numericSchoolId >= 800000 && numericSchoolId <= 800100) || String(school_id).startsWith('1999');
                    const targetTable = isTestSchool ? 'esf7_database_dummy' : (currentSemester === '1ST SEM' ? 'esf7_1st' : 'esf7_database');`;

const oldSummaryLine = "const targetTableSummary = currentSemester === '1ST SEM' ? 'esf7_1st' : 'esf7_database';";
const newSummaryLine = `const targetTableSummary = isTestSchool ? 'esf7_database_dummy' : (currentSemester === '1ST SEM' ? 'esf7_1st' : 'esf7_database');`;

if (!content.includes(oldLine)) {
  console.log('oldLine not found, checking if already patched...');
  if (content.includes('esf7_database_dummy')) {
    console.log('Already patched!');
  } else {
    console.error('Could not find target line to patch.');
    process.exit(1);
  }
} else {
  content = content.replace(oldLine, newLine);
  content = content.replace(oldSummaryLine, newSummaryLine);
  fs.writeFileSync(harvesterPath, content, 'utf8');
  console.log('Successfully patched E:\\ESF7 Official\\api\\esf7_harvester.js!');
}
