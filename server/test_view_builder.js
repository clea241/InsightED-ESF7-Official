const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../eSF7-R04A-Laguna-108348_MAJAYJAY-ES-UPDATED.xlsb');
const outPath = path.join(__dirname, 'esf7_view_pure_template.xlsb');

console.log('Extracting ONLY the VIEW sheet template...');
const buf = fs.readFileSync(srcPath);
const srcWb = xlsx.read(buf, { type: 'buffer' });

const ws = srcWb.Sheets['VIEW'];
if (!ws) {
  console.error('VIEW sheet not found!');
  process.exit(1);
}

// Create a new clean workbook containing ONLY the VIEW sheet
const newWb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(newWb, ws, 'VIEW');

// Clear any old sample data rows (Row 31 downwards)
ws['!ref'] = 'A1:AW30';
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

const outBuf = xlsx.write(newWb, { bookType: 'xlsb', type: 'buffer' });
fs.writeFileSync(outPath, outBuf);

console.log('✅ Created esf7_view_pure_template.xlsb!');
console.log('Template size:', Math.round(outBuf.length / 1024), 'KB');
console.log('Sheet names in generated template:', newWb.SheetNames);
