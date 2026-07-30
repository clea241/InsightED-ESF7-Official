const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = path.join(__dirname, '../eSF7-DB-131754-SY2024-2025_Kimondo ES (CARAGA -.xlsb');
const buf = fs.readFileSync(filePath);
const wb = xlsx.read(buf, { type: 'buffer', sheets: ['VIEW'] });
const ws = wb.Sheets['VIEW'];
const range = xlsx.utils.decode_range(ws['!ref']);

const getVal = (r, c) => {
  const cell = ws[xlsx.utils.encode_cell({ r, c })];
  return cell && cell.v !== undefined ? String(cell.v).trim() : '';
};

let currentPerson = null;

for (let r = 30; r <= range.e.r; r++) {
  const tin = getVal(r, 0);
  const firstName = getVal(r, 1);
  const lastName = getVal(r, 3);

  const subj = getVal(r, 11);
  const gradeLevel = getVal(r, 12);
  const sectionName = getVal(r, 13);
  const colX = getVal(r, 23); // Col X
  const colAI = getVal(r, 34); // Col AI (Merged header column AI in row 31!)

  if (tin) {
    currentPerson = `${lastName}, ${firstName} (TIN: ${tin})`;
  }

  const subjUpper = (subj || '').toUpperCase();
  const colAIUpper = (colAI || '').toUpperCase();
  
  if (subjUpper.includes('ADVISOR') || colAIUpper.includes('ADVISOR') || subjUpper.includes('CLASS') || colAIUpper.includes('CLASS')) {
    console.log(`R${r+1} [${currentPerson}]: Subj(Col L)="${subj}" | Section(Col N)="${sectionName}" | Col AI="${colAI}" | Col X="${colX}"`);
  }
}
