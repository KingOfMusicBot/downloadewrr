import './config/env'; // Must be first to load env vars and system PATH variables
import mongoose from 'mongoose';
import { startVideoWorker } from './workers/videoWorker';
import { logger } from './utils/logger';

logger.info('Starting background download worker process...');

let videoWorker: any = null;

// Database Connection
const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/m3u8-downloader';
logger.info(`Worker connecting to MongoDB at: ${mongodbUri}`);
mongoose.connect(mongodbUri)
  .then(() => {
    logger.info('Worker connected to MongoDB successfully');
    
    // Start BullMQ Worker
    videoWorker = startVideoWorker();
  })
  .catch((err) => {
    logger.error(`Worker MongoDB connection error: ${err.message}`);
    process.exit(1);
  });

// Handle graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Cleaning up and shutting down worker...`);
  try {
    if (videoWorker) {
      logger.info('Closing BullMQ worker...');
      await videoWorker.close();
      logger.info('BullMQ worker closed successfully.');
    }
  } catch (err: any) {
    logger.error(`Error closing BullMQ worker: ${err.message}`);
  }
  
  try {
    logger.info('Closing MongoDB connection...');
    await mongoose.connection.close();
    logger.info('MongoDB connection closed successfully.');
  } catch (err: any) {
    logger.error(`Error closing MongoDB connection: ${err.message}`);
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.once('SIGUSR2', () => shutdown('SIGUSR2'));
