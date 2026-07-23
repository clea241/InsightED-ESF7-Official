const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '../eSF7-R04A-Laguna-108348_MAJAYJAY-ES-UPDATED.xlsb');
const outPath = path.join(__dirname, 'esf7_template_trimmed.xlsb');

console.log('Paths:');
console.log('  template:', templatePath);
console.log('  output:  ', outPath);

// ── Step 1: Parse & trim original template ───────────────────────────────
console.log('\n[Step 1] Reading & parsing original template...');
console.time('parse-original');
const buf = fs.readFileSync(templatePath);
const wb = xlsx.read(buf, { type: 'buffer', cellStyles: false, cellNF: false, cellDates: false, sheetStubs: false });
console.timeEnd('parse-original');

const ws = wb.Sheets['VIEW'] || wb.Sheets[wb.SheetNames[0]];
console.log('Original ref:', ws['!ref']);

// Trim to rows with actual data (max observed row = 504, give 20-row buffer)
ws['!ref'] = 'A1:BZ520';

console.time('write-trimmed');
const outBuf = xlsx.write(wb, { bookType: 'xlsb', type: 'buffer' });
console.timeEnd('write-trimmed');

fs.writeFileSync(outPath, outBuf);
console.log('Trimmed saved:', outPath, '(' + Math.round(outBuf.length / 1024) + ' KB)');

// ── Step 2: Benchmark re-parse of trimmed file ────────────────────────────
console.log('\n[Step 2] Benchmarking re-parse of trimmed file...');
const trimBuf = fs.readFileSync(outPath);
console.time('parse-trimmed');
const wb2 = xlsx.read(trimBuf, { type: 'buffer', cellStyles: false, cellNF: false, cellDates: false });
console.timeEnd('parse-trimmed');

console.time('write-final');
const finalBuf = xlsx.write(wb2, { bookType: 'xlsb', type: 'buffer' });
console.timeEnd('write-final');
console.log('Final output size:', finalBuf.length, 'bytes');
console.log('\nDone. Use esf7_template_trimmed.xlsb as the export template.');
