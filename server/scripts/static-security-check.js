const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '..');
const findings = [];
const forbidden = [
  [/\$queryRawUnsafe\s*\(/g, 'unsafe raw database query'],
  [/\$executeRawUnsafe\s*\(/g, 'unsafe raw database execution'],
  [/(^|[^\w.])eval\s*\(/gm, 'runtime eval'],
  [/new\s+Function\s*\(/g, 'runtime function construction'],
  [/from\s+['"]child_process['"]/g, 'child process import in application code'],
  [/require\s*\(\s*['"]child_process['"]\s*\)/g, 'child process import in application code'],
];

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (/\.(ts|tsx|js)$/.test(name)) {
      const source = readFileSync(path, 'utf8');
      for (const [pattern, description] of forbidden) {
        pattern.lastIndex = 0;
        if (pattern.test(source)) findings.push(`${relative(root, path)}: ${description}`);
      }
    }
  }
}

visit(join(root, 'src'));
if (findings.length) {
  console.error(`Static security check failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('Static security check passed');
