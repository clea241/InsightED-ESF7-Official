import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let grepArg = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--grep" && args[i + 1]) {
    grepArg = args[i + 1];
    i++;
  } else if (args[i].startsWith("--grep=")) {
    grepArg = args[i].slice("--grep=".length);
  } else if (args[i] === "-t" && args[i + 1]) {
    grepArg = args[i + 1];
    i++;
  }
}

if (grepArg) {
  console.log(`[test-runner] Filtering test suites matching: "${grepArg}"`);
  const res = spawnSync("npx", ["vitest", "run", "-t", grepArg], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(res.status ?? 0);
}

// Default complete test run
const cov = spawnSync("npm", ["run", "test:coverage"], {
  stdio: "inherit",
  shell: true,
});
if (cov.status !== 0) {
  process.exit(cov.status ?? 1);
}

const integration = spawnSync("npm", ["run", "test:integration"], {
  stdio: "inherit",
  shell: true,
});
process.exit(integration.status ?? 0);
