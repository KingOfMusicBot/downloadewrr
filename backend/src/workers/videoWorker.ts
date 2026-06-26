import { Worker, Job } from 'bullmq';
import path from 'path';
import fs from 'fs';
import { Download } from '../models/download';
import { downloadM3U8 } from '../services/ffmpegService';
import { connectionOptions } from '../config/queue';
import { logger } from '../utils/logger';

export const startVideoWorker = () => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  // Ensure upload directory exists on the worker dyno
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    logger.info(`Created upload directory at: ${path.resolve(uploadDir)}`);
  }

  const worker = new Worker(
    'video-downloader',
    async (job: Job) => {
      const { downloadId, url, filename, headers } = job.data;
      
      logger.info(`Worker processing job ${job.id} for download ${downloadId}`);
      
      const download = await Download.findById(downloadId);
      if (!download) {
        throw new Error(`Download record not found for ID: ${downloadId}`);
      }

      // 1. Update status to processing
      download.status = 'processing';
      download.progress = 0;
      await download.save();

      // We prepend downloadId to prevent name collisions across downloads
      const finalFilename = `${downloadId}_${filename}`;
      const outputPath = path.resolve(uploadDir, finalFilename);

      let lastSavedProgress = 0;
      let lastDbUpdateTime = 0;

      // Throttle DB updates during download progress
      const onProgress = async (progress: number) => {
        const now = Date.now();
        // Update database if progress increases by >= 3% OR if at least 2 seconds have passed since last update
        if (progress - lastSavedProgress >= 3 || now - lastDbUpdateTime >= 2000) {
          lastSavedProgress = progress;
          lastDbUpdateTime = now;
          
          await Download.findByIdAndUpdate(downloadId, {
            progress,
            status: 'processing'
          });
          
          await job.updateProgress(progress);
          logger.debug(`Job ${job.id} progress: ${progress}%`);
        }
      };

      try {
        // 2. Perform the download via FFmpeg
        const result = await downloadM3U8(url, outputPath, headers, onProgress);
        
        // 3. Mark completed in DB
        download.status = 'completed';
        download.progress = 100;
        download.outputFile = finalFilename;
        download.fileSize = result.fileSize;
        download.duration = result.duration;
        download.completedAt = new Date();
        await download.save();

        logger.info(`Job ${job.id} completed successfully!`);
        return result;

      } catch (error: any) {
        logger.error(`Job ${job.id} failed: ${error.message}`);
        
        // Mark failed in DB
        download.status = 'failed';
        download.error = error.message;
        download.completedAt = new Date();
        await download.save();

        throw error;
      }
    },
    {
      connection: connectionOptions,
      concurrency: 2, // Limit concurrency of downloads on a single worker
    }
  );

  worker.on('active', (job) => {
    logger.info(`Job ${job.id} has started processing`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  logger.info('Video downloader BullMQ worker started and listening for jobs...');
  return worker;
};
