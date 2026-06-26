import { spawn } from 'child_process';
import fs from 'fs';
import { logger } from '../utils/logger';

interface DownloadResult {
  duration: number;
  fileSize: number;
}

// Helper to convert HH:MM:SS.xx to seconds
const timeToSeconds = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  
  const hours = parseFloat(parts[0]);
  const minutes = parseFloat(parts[1]);
  const seconds = parseFloat(parts[2]);
  
  return hours * 3600 + minutes * 60 + seconds;
};

// 1. Get video duration using ffprobe
export const getVideoDuration = (url: string, headers?: Record<string, string>): Promise<number> => {
  return new Promise((resolve) => {
    logger.info(`Checking video duration using ffprobe for: ${url}`);
    
    const args = ['-v', 'error', '-timeout', '30000000'];
    
    if (headers && Object.keys(headers).length > 0) {
      const headerStr = Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') + '\r\n';
      args.push('-headers', headerStr);
    }
    
    args.push('-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url);
    
    const child = spawn('ffprobe', args);
    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        logger.warn(`ffprobe exited with code ${code}. Error: ${errorOutput.trim()}`);
        resolve(0); // Return 0 duration if ffprobe fails, progress will just be estimated
        return;
      }
      
      const duration = parseFloat(output.trim());
      if (isNaN(duration)) {
        logger.warn(`ffprobe returned invalid duration: ${output}`);
        resolve(0);
      } else {
        logger.info(`ffprobe retrieved duration: ${duration} seconds`);
        resolve(duration);
      }
    });

    // Handle spawn errors (e.g. executable not found)
    child.on('error', (err) => {
      logger.warn(`ffprobe spawn error: ${err.message}. Make sure FFmpeg is installed and in PATH.`);
      resolve(0);
    });

    // Timeout ffprobe after 30 seconds to avoid locking up
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve(0);
    }, 30000);
  });
};

// 2. Download M3U8 stream and convert to MP4
export const downloadM3U8 = (
  url: string,
  outputPath: string,
  headers?: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<DownloadResult> => {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = await getVideoDuration(url, headers);
      
      logger.info(`Starting FFmpeg download: Input=${url}, Output=${outputPath}`);
      
      const args = [
        '-y', 
        '-nostdin',
        '-timeout', '30000000',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      ];
      
      if (headers && Object.keys(headers).length > 0) {
        const headerStr = Object.entries(headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') + '\r\n';
        args.push('-headers', headerStr);
      }
      
      args.push('-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', outputPath);
      
      const child = spawn('ffmpeg', args);
      let stderrContent = '';

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrContent += chunk;

        // FFmpeg progress format: time=00:01:23.45
        const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch && onProgress && duration > 0) {
          const currentTime = timeToSeconds(timeMatch[1]);
          const progressPercent = Math.min(Math.round((currentTime / duration) * 100), 99);
          onProgress(progressPercent);
        }
      });

      child.on('close', (code) => {
        if (code !== 0) {
          logger.error(`ffmpeg process exited with code ${code}`);
          reject(new Error(`ffmpeg failed. Code: ${code}. Output: ${stderrContent.slice(-500)}`));
          return;
        }

        // Get output file details on success
        try {
          const stats = fs.statSync(outputPath);
          logger.info(`Download completed successfully: ${outputPath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
          resolve({
            duration: duration || 0,
            fileSize: stats.size
          });
        } catch (err: any) {
          reject(new Error(`Download completed, but output file stats could not be read: ${err.message}`));
        }
      });

      // Handle process errors (e.g. executable not found)
      child.on('error', (err) => {
        logger.error(`ffmpeg process execution error: ${err.message}`);
        reject(new Error(`Failed to execute FFmpeg: ${err.message}`));
      });

    } catch (error: any) {
      reject(error);
    }
  });
};
