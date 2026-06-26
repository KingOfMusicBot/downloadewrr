const { spawn } = require('child_process');
const readline = require('readline');

// Define the services to run
const services = [
  { name: 'api', command: 'npm', args: ['run', 'dev'], cwd: './backend', color: '\x1b[34m' },      // Blue
  { name: 'worker', command: 'npm', args: ['run', 'dev:worker'], cwd: './backend', color: '\x1b[35m' }, // Magenta
  { name: 'front', command: 'npm', args: ['run', 'dev'], cwd: './frontend', color: '\x1b[36m' }   // Cyan
];

const children = [];

console.log('\x1b[1m\x1b[32mStarting all Prime Downloader services concurrently...\x1b[0m\n');

services.forEach((s) => {
  const child = spawn(s.command, s.args, {
    cwd: s.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env, // Inherit parent environment
    shell: true       // Required on Windows to spawn batch/shell commands like npm
  });

  children.push(child);

  const prefix = `${s.color}[${s.name}]\x1b[0m`;

  // Helper to read output lines and log with prefix
  const bindStream = (stream) => {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', (line) => {
      console.log(`${prefix} ${line}`);
    });
  };

  bindStream(child.stdout);
  bindStream(child.stderr);

  child.on('error', (err) => {
    console.error(`${prefix} \x1b[31mFailed to start process:\x1b[0m`, err.message);
  });

  child.on('close', (code) => {
    console.log(`${prefix} exited with code ${code}`);
  });
});

// Handle graceful shutdown of all spawned processes on Ctrl+C (SIGINT)
process.on('SIGINT', () => {
  console.log('\n\x1b[1m\x1b[31mShutting down all services gracefully...\x1b[0m');
  children.forEach((child) => {
    try {
      if (!child.killed) {
        child.kill('SIGINT');
      }
    } catch (e) {
      // Ignore
    }
  });
  
  // Wait a short duration to let children exit
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});
