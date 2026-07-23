const fs = require('fs');

function checkJsxTags() {
  const content = fs.readFileSync('../client/src/pages/Workload.jsx', 'utf8');
  const lines = content.split('\n');
  const stack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const currentLineNum = i + 1;
    let lineMatch;
    
    // Match JSX tags: opening <div ...>, closing </div>, fragment <>, </>
    const re = /<(\/?[a-zA-Z0-9_\-:]+)(?:\s+[^>]*?)?(\/?)>|<\s*(\/?)>/g;
    while ((lineMatch = re.exec(line)) !== null) {
      const full = lineMatch[0];
      const nameRaw = lineMatch[1] || 'fragment';
      const isClose = nameRaw.startsWith('/') || lineMatch[3] === '/';
      const name = nameRaw.replace('/', '');
      const isSelfClose = lineMatch[2] === '/';
      
      if (isSelfClose) {
        continue;
      }
      
      if (isClose) {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.name === name || name === 'fragment') {
            stack.pop();
          } else {
            // Unmatched tag closing
            // console.log(`Unmatched close on line ${currentLineNum}: ${full} (expected ${top.name})`);
          }
        }
      } else {
        stack.push({ name, line: currentLineNum, text: full });
      }
    }
  }
  
  console.log('--- FINAL UNCLOSED TAGS STACK ---');
  stack.forEach((t, idx) => {
    console.log(`${idx}: Line ${t.line} -> ${t.text}`);
  });
}

checkJsxTags();
