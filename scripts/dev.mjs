// Runs backend + both apps together. Ctrl+C stops all three.
import { spawn } from 'node:child_process';

const apps = [
  ['backend', 'backend'],
  ['partner', 'krewzo-partner'],
  ['customer', 'krewzo-customer'],
];
const kids = apps.map(([tag, ws]) => {
  const p = spawn('npm', ['run', 'dev', '-w', ws], { shell: true });
  const pipe = (s) => s.on('data', (d) => process.stdout.write(String(d).replace(/^/gm, `[${tag}] `)));
  pipe(p.stdout); pipe(p.stderr);
  return p;
});
process.on('SIGINT', () => { kids.forEach((k) => k.kill()); process.exit(0); });
