const fs = require('fs');
const path = require('path');

const schemaTsPath = path.join(__dirname, '..', 'drizzle', 'schema.ts');
const content = fs.readFileSync(schemaTsPath, 'utf8');

const regex = /export const (\w+)\s*=\s*pgTable\("([^"]+)"/g;
let match;
const tables = [];

while ((match = regex.exec(content)) !== null) {
  tables.push({ variableName: match[1], tableName: match[2] });
}

console.log('====================================================');
console.log(`✅ TOTAL DRIZZLE TABLES GENERATED: ${tables.length}`);
console.log('====================================================');
tables.forEach((t, i) => {
  console.log(`${(i + 1).toString().padStart(2, ' ')}. [${t.tableName}] -> variable: ${t.variableName}`);
});
console.log('====================================================');
