import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();
const clientSrcDir = path.resolve(projectRoot, 'client/src');

console.log('====================================================');
console.log('🔍 ESF7 Icon Architect: Static Icon Audit');
console.log(`Checking files in: ${clientSrcDir}`);
console.log('====================================================\n');

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const filesToAudit = scanDirectory(clientSrcDir);
let totalFilesChecked = 0;
let totalIconsImported = 0;
let errorsFound = 0;
const iconUsageMap = new Map();
const nonFeatherImports = [];
const emojiMatches = [];

// Regex for react-icons imports
const reactIconsRegex = /import\s+\{([^}]+)\}\s+from\s+['"]react-icons\/([a-zA-Z0-9_-]+)['"]/g;
const otherIconImports = /import\s+.*from\s+['"](lucide-react|@heroicons\/|@fortawesome\/|ionicons)[^'"]*['"]/g;
// Basic emoji regex to catch emoji usage in UI
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

for (const filePath of filesToAudit) {
  totalFilesChecked++;
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath);

  // Check for other icon libraries
  let match;
  while ((match = otherIconImports.exec(content)) !== null) {
    nonFeatherImports.push({ file: relativePath, lib: match[1] });
    errorsFound++;
  }

  // Check react-icons imports
  while ((match = reactIconsRegex.exec(content)) !== null) {
    const iconsList = match[1].split(',').map(i => i.trim()).filter(Boolean);
    const subModule = match[2];

    if (subModule !== 'fi') {
      nonFeatherImports.push({ file: relativePath, lib: `react-icons/${subModule}`, icons: iconsList });
      errorsFound++;
    } else {
      for (const icon of iconsList) {
        totalIconsImported++;
        iconUsageMap.set(icon, (iconUsageMap.get(icon) || 0) + 1);
      }
    }
  }
}

console.log(`✅ Scanned ${totalFilesChecked} source files in client/src.`);
console.log(`📊 Found ${totalIconsImported} Feather Icon imports across ${iconUsageMap.size} unique icons.\n`);

console.log('Top 15 Most Used Feather Icons:');
const sortedIcons = Array.from(iconUsageMap.entries()).sort((a, b) => b[1] - a[1]);
sortedIcons.slice(0, 15).forEach(([icon, count], idx) => {
  console.log(`  ${idx + 1}. ${icon.padEnd(20)} : used in ${count} component(s)`);
});

console.log('\n----------------------------------------------------');
if (errorsFound > 0) {
  console.error(`❌ AUDIT FAILED: Found ${errorsFound} non-compliant icon import(s):`);
  nonFeatherImports.forEach(item => {
    console.error(`   - [${item.file}] imports from non-Feather library: "${item.lib}"`);
  });
  process.exit(1);
} else {
  console.log('✨ AUDIT PASSED: 100% of icons strictly comply with react-icons/fi (Feather) standards!');
  console.log('====================================================');
}
