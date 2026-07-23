const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../eSF7-R04A-Laguna-108348_MAJAYJAY-ES-UPDATED.xlsb');
const outPath = path.join(__dirname, 'esf7_view_only.xlsb');

console.log('Reading base XLSB template...');
const buf = fs.readFileSync(srcPath);
const wb  = xlsx.read(buf, { type: 'buffer' });

// 1. Keep ONLY VIEW sheet
const ws = wb.Sheets['VIEW'] || wb.Sheets[wb.SheetNames[0]];
wb.SheetNames = ['VIEW'];
wb.Sheets = { VIEW: ws };

// 2. Clear old Majayjay hardcoded summary numbers in rows 12 to 26
const clearCols = ['AB', 'AF', 'AV', 'AW'];
for (let r = 12; r <= 26; r++) {
  clearCols.forEach(c => {
    if (!ws[c + r]) ws[c + r] = { t: 'n', v: 0 };
    else { ws[c + r].v = 0; ws[c + r].t = 'n'; }
  });
}

// 3. Clear old data rows from Row 31 downwards
ws['!ref'] = 'A1:BZ50';
Object.keys(ws).forEach(k => {
  if (!k.startsWith('!')) {
    const rowMatch = k.match(/\d+/);
    if (rowMatch) {
      const r = parseInt(rowMatch[0], 10);
      if (r >= 31) {
        delete ws[k];
      }
    }
  }
});

// 4. Save clean VIEW-only template
const outBuf = xlsx.write(wb, { bookType: 'xlsb', type: 'buffer' });
fs.writeFileSync(outPath, outBuf);

console.log('✅ Created esf7_view_only.xlsb successfully!');
console.log('File size:', Math.round(outBuf.length / 1024), 'KB');
