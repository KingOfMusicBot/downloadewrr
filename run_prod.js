const { spawn } = require('child_process');
const readline = require('readline');

// The main web port given by Heroku
const PORT = process.env.PORT || '3001';

console.log('Starting production orchestrator...');
console.log(`Heroku Web Port (External): ${PORT}`);
console.log('Express API Port (Internal): 5000');

// Define processes
// 1. Backend API (runs on internal port 5000)
const apiEnv = { ...process.env, PORT: '5000' };
const apiProcess = spawn('node', ['backend/dist/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: apiEnv
});

// 2. Frontend Next.js Server (runs on the main Heroku port)
const frontProcess = spawn('npx', ['next', 'start', 'frontend', '--port', PORT], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
  shell: true // Necessary for npx on Windows/Heroku
});

// 3. Background Worker
const workerProcess = spawn('node', ['backend/dist/worker.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
});

const children = [apiProcess, frontProcess, workerProcess];

// Logger helper
const logProcess = (name, stream, color) => {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    console.log(`${color}[${name}]\x1b[0m ${line}`);
  });
};

logProcess('api', apiProcess.stdout, '\x1b[34m'); // Blue
logProcess('api-err', apiProcess.stderr, '\x1b[31m'); // Red

logProcess('front', frontProcess.stdout, '\x1b[36m'); // Cyan
logProcess('front-err', frontProcess.stderr, '\x1b[31m'); // Red

logProcess('worker', workerProcess.stdout, '\x1b[35m'); // Magenta
logProcess('worker-err', workerProcess.stderr, '\x1b[31m'); // Red

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down production orchestrator...');
  children.forEach((child) => {
    try {
      if (!child.killed) {
        child.kill('SIGINT');
      }
    } catch (e) {
      // Ignore
    }
  });
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Exit if any of the child processes exit
apiProcess.on('close', (code) => {
  console.log(`Express API process exited with code ${code}`);
  shutdown();
});

frontProcess.on('close', (code) => {
  console.log(`Next.js Frontend process exited with code ${code}`);
  shutdown();
});

workerProcess.on('close', (code) => {
  console.log(`Worker process exited with code ${code}`);
  shutdown();
});
