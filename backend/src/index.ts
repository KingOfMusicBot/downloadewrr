import './config/env'; // Must be first to load env vars and system PATH variables
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import downloadRoutes from './routes/downloadRoutes';
import { logger } from './utils/logger';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Heroku load balancer)
const PORT = process.env.PORT || 5000;

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info(`Created upload directory at: ${path.resolve(uploadDir)}`);
}

// Database Connection
const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/m3u8-downloader';
logger.info(`Connecting to MongoDB at: ${mongodbUri}`);
mongoose.connect(mongodbUri)
  .then(() => {
    logger.info('Connected to MongoDB successfully');
    // Start API Server
    app.listen(PORT, () => {
      logger.info(`Prime M3U8 Downloader API Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  });

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request logging with Morgan (piped to Winston)
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.http(message.trim())
  }
}));

// Routes
app.use('/api/downloads', downloadRoutes);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// Serve uploads folder statically for development fallback (if needed)
app.use('/uploads', express.static(path.resolve(uploadDir)));

// 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled exception: ${err.message}\nStack: ${err.stack}`);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});


