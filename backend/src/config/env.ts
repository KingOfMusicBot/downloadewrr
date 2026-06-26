import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 1. Load environment variables immediately
dotenv.config();

// Fallback to loading root .env if running from backend subdirectory
const rootEnvPath = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// 2. Inject Gyan.FFmpeg bin path into PATH on Windows immediately
if (process.platform === 'win32') {
  const ffmpegBinPath = 'C:\\Users\\DELL\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin';
  process.env.PATH = `${ffmpegBinPath};${process.env.PATH}`;
}
