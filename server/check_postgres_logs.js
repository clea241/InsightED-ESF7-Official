const fs = require('fs');
const path = require('path');

function findPostgresLogs() {
  // Common installation paths for PostgreSQL on Windows
  const searchDirs = [
    'C:\\Program Files\\PostgreSQL\\16\\data\\log',
    'C:\\Program Files\\PostgreSQL\\15\\data\\log',
    'C:\\Program Files\\PostgreSQL\\14\\data\\log',
    'C:\\Program Files\\PostgreSQL\\13\\data\\log',
    'C:\\Program Files\\PostgreSQL\\12\\data\\log'
  ];

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      console.log(`Found log directory: ${dir}`);
      const files = fs.readdirSync(dir).sort();
      if (files.length > 0) {
        const latestFile = path.join(dir, files[files.length - 1]);
        console.log(`Reading latest log file: ${latestFile}`);
        const logContent = fs.readFileSync(latestFile, 'utf8');
        const lines = logContent.split('\n');
        console.log('--- LATEST LOG LINES ---');
        console.log(lines.slice(-30).join('\n'));
        return;
      }
    }
  }
  console.log('No Postgres log directory found in default paths.');
}

findPostgresLogs();
