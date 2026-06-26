import { Queue } from 'bullmq';
import { logger } from '../utils/logger';

const redisUrlString = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';
logger.info(`Configuring Redis queue at: ${redisUrlString}`);

let redisHost = 'localhost';
let redisPort = 6379;
let redisPassword = undefined;
let redisUsername = undefined;

try {
  const parsed = new URL(redisUrlString);
  redisHost = parsed.hostname;
  redisPort = parseInt(parsed.port) || 6379;
  if (parsed.password) redisPassword = decodeURIComponent(parsed.password);
  if (parsed.username) redisUsername = decodeURIComponent(parsed.username);
} catch (err) {
  logger.warn('Could not parse Redis URL. Falling back to default localhost:6379 options.');
}

export const connectionOptions = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  username: redisUsername,
  maxRetriesPerRequest: null, // Required by BullMQ
};

export const downloadQueue = new Queue('video-downloader', {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true, // Clean up job records from Redis on success
    removeOnFail: false,    // Keep failed jobs in Redis for logs and monitoring
  },
});
