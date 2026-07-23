const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Try loading .env manually if exists (root .env or server/.env)
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../../server/.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        let val = vals.join('=').trim();
        // Remove trailing comments if any
        if (val.includes('#')) {
          val = val.split('#')[0].trim();
        }
        val = val.replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

const API_KEY = process.env.GEMINI_API_KEY;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function loadMemory() {
  const rootDir = path.join(__dirname, '../../');
  const memoryDir = path.join(__dirname, '../memory');
  let contextText = '';

  // 1. Load Repository Architecture Blueprint (synth-*.md or blueprint files)
  if (fs.existsSync(rootDir)) {
    const rootFiles = fs.readdirSync(rootDir);
    const synthFiles = rootFiles.filter(f => f.startsWith('synth-') && f.endsWith('.md')).sort().reverse();
    if (synthFiles.length > 0) {
      const blueprintPath = path.join(rootDir, synthFiles[0]);
      const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
      contextText += `\n--- REPOSITORY ARCHITECTURE BLUEPRINT (${synthFiles[0]}) ---\n${blueprintContent}\n`;
    }
  }

  // 2. Load Code Synthesizer Rules if present
  const synthRulesPath = path.join(rootDir, 'code_synthesizer.md');
  if (fs.existsSync(synthRulesPath)) {
    const synthRules = fs.readFileSync(synthRulesPath, 'utf-8');
    contextText += `\n--- CODE SYNTHESIZER GUIDE (code_synthesizer.md) ---\n${synthRules}\n`;
  }

  // 3. Load Persistent Memory Files
  if (fs.existsSync(memoryDir)) {
    const files = fs.readdirSync(memoryDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(memoryDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        contextText += `\n--- MEMORY FILE: ${file} ---\n${content}\n`;
      }
    }
  }

  return contextText;
}

async function callGeminiChat(contents, memoryText) {
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash-lite',
    'gemini-pro-latest',
    'gemini-2.0-flash'
  ];

  let lastError;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': API_KEY
  };

  const systemInstruction = `You are an expert Co-Pilot, System Architect, and Prompt Synthesizer for the InsightED eSF7 platform.

Your goal is to engage in a collaborative, two-way brainstorming discussion with the developer. 
- Pitch creative ideas, UI/UX improvements, and architectural options.
- Ask high-value clarifying questions about data structures, edge cases, and user flows.
- Keep responses interactive, concise, and focused.
- When the developer indicates they are ready (e.g. typing "done", "finish", or "create prompt"), synthesize the entire discussion into a complete, structured, copy-pasteable PROMPT SPEC for ANTIGRAVITY.

Repository Blueprint & Persistent Memory:
${memoryText}`;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: contents
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
      }

      const errText = await response.text();
      lastError = new Error(`Gemini API (${model}) error (${response.status}): ${errText}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

async function appendMemory(filename, content) {
  const filePath = path.join(__dirname, '../memory', filename);
  const entry = `\n\n### Added ${new Date().toISOString().split('T')[0]}\n${content}`;
  fs.appendFileSync(filePath, entry, 'utf-8');
  console.log(`\n✅ Saved new memory to .agents/memory/${filename}`);
}

async function main() {
  console.log('\n======================================================');
  console.log('    🧠 GEMINI INTERACTIVE BRAINSTORM & PROMPT AGENT  ');
  console.log('======================================================\n');

  if (!API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is missing.');
    console.error('Please add GEMINI_API_KEY=your_key to your .env file or system environment.\n');
    rl.close();
    process.exit(1);
  }

  console.log('💡 Tip: Discuss your ideas back and forth with Gemini. When ready, type "done" or "finish" to generate the final Antigravity prompt!\n');

  const memory = loadMemory();
  const conversationHistory = [];

  let initialPrompt = process.argv.slice(2).join(' ').trim();
  if (!initialPrompt) {
    initialPrompt = await ask('📝 Enter your initial idea or feature topic: ');
  }

  if (!initialPrompt.trim()) {
    console.log('No prompt provided. Exiting.');
    rl.close();
    return;
  }

  conversationHistory.push({
    role: 'user',
    parts: [{ text: initialPrompt }]
  });

  while (true) {
    console.log('\n🔍 Thinking & generating ideas with Gemini...');
    try {
      const geminiReply = await callGeminiChat(conversationHistory, memory);
      console.log('\n------------------------------------------------------');
      console.log(geminiReply);
      console.log('------------------------------------------------------');

      conversationHistory.push({
        role: 'model',
        parts: [{ text: geminiReply }]
      });

      const userInput = await ask('\n🗣️ Reply to Gemini (or type "done" / "finish" to compile prompt): ');
      if (!userInput.trim()) continue;

      if (['done', 'finish', 'generate', 'create prompt'].includes(userInput.trim().toLowerCase())) {
        conversationHistory.push({
          role: 'user',
          parts: [{ text: 'We have finished brainstorming. Please synthesize our entire conversation into a complete, structured, copy-pasteable PROMPT SPEC for ANTIGRAVITY.' }]
        });

        console.log('\n🚀 Synthesizing final ANTIGRAVITY PROMPT SPEC...');
        const finalSpec = await callGeminiChat(conversationHistory, memory);
        console.log('\n======================================================');
        console.log('       🎯 FINAL REFINED PROMPT SPEC FOR ANTIGRAVITY    ');
        console.log('======================================================\n');
        console.log(finalSpec);
        console.log('\n======================================================\n');

        const saveChoice = await ask('💡 Save any new preferences/knowledge to .agents/memory/? (y/N): ');
        if (saveChoice.trim().toLowerCase() === 'y') {
          const fileTarget = await ask('Select file (1: preferences.md, 2: domain_knowledge.md): ');
          const targetName = fileTarget.trim() === '2' ? 'domain_knowledge.md' : 'preferences.md';
          const textToSave = await ask('Enter knowledge entry to save: ');
          if (textToSave.trim()) {
            await appendMemory(targetName, textToSave.trim());
          }
        }
        break;
      } else {
        conversationHistory.push({
          role: 'user',
          parts: [{ text: userInput }]
        });
      }
    } catch (err) {
      console.error('❌ Error during chat session:', err.message);
      break;
    }
  }

  rl.close();
}

main();
