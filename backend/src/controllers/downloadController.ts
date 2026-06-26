import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { Download } from '../models/download';
import { downloadQueue } from '../config/queue';
import { logger } from '../utils/logger';
import { parseM3U8Playlists } from '../services/m3u8Service';
import { sendTelegramNotification } from '../services/telegramService';

// Helper to sanitize filename
const sanitizeFilename = (filename: string): string => {
  let cleaned = filename.replace(/[^a-zA-Z0-9_\-\s]/g, '');
  cleaned = cleaned.trim();
  if (!cleaned) {
    cleaned = 'video_' + Date.now();
  }
  if (!cleaned.endsWith('.mp4')) {
    cleaned += '.mp4';
  }
  return cleaned;
};

// 1. Submit M3U8 URL and queue the job
export const submitDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { url, originalUrl, filename, headers, quality } = req.body;

    if (!url || !filename) {
      res.status(400).json({ message: 'URL and Filename are required' });
      return;
    }

    // Basic URL validation
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).json({ message: 'Invalid protocol. Only HTTP and HTTPS are supported.' });
        return;
      }
    } catch (err) {
      res.status(400).json({ message: 'Invalid M3U8 URL format' });
      return;
    }

    const cleanFilename = sanitizeFilename(filename);

    // Parse custom headers if any
    let customHeaders: Record<string, string> = {};
    if (headers) {
      try {
        customHeaders = typeof headers === 'string' ? JSON.parse(headers) : headers;
      } catch (err) {
        res.status(400).json({ message: 'Invalid custom headers format. Must be a valid JSON object.' });
        return;
      }
    }

    // Create database record
    const download = new Download({
      url,
      originalUrl: originalUrl || url,
      filename: cleanFilename,
      status: 'pending',
      progress: 0,
      headers: customHeaders,
      quality: quality || 'Default Quality'
    });

    await download.save();

    // Push to BullMQ
    const job = await downloadQueue.add('process-video', {
      downloadId: download.id,
      url,
      filename: cleanFilename,
      headers: customHeaders
    });

    logger.info(`Download queued: ID=${download.id}, JobID=${job.id}, URL=${url}`);

    res.status(201).json(download);
  } catch (error: any) {
    logger.error(`Error submitting download: ${error.message}`);
    res.status(500).json({ message: 'Server error while scheduling download' });
  }
};

// 2. Get user's download history with search & pagination
export const getDownloads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const ids = req.query.ids as string;

    const query: any = {};

    if (ids) {
      const idArray = ids.split(',').filter(id => id.match(/^[0-9a-fA-F]{24}$/));
      query._id = { $in: idArray };
    }

    if (search) {
      query.filename = { $regex: search, $options: 'i' };
    }

    if (status) {
      query.status = status;
    }

    const total = await Download.countDocuments(query);
    const downloads = await Download.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      downloads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    logger.error(`Error fetching downloads: ${error.message}`);
    res.status(500).json({ message: 'Server error while fetching history' });
  }
};

// 3. Get specific download status
export const getDownloadById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const download = await Download.findById(id);

    if (!download) {
      res.status(404).json({ message: 'Download not found' });
      return;
    }

    res.status(200).json(download);
  } catch (error: any) {
    logger.error(`Error fetching download details: ${error.message}`);
    res.status(500).json({ message: 'Server error while fetching download details' });
  }
};

// 4. Delete download and clean up its file
export const deleteDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const download = await Download.findById(id);

    if (!download) {
      res.status(404).json({ message: 'Download not found' });
      return;
    }

    // Delete local file if it exists
    if (download.outputFile) {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const filePath = path.resolve(uploadDir, download.outputFile);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          logger.info(`Deleted file from storage: ${filePath}`);
        } catch (fileErr: any) {
          logger.error(`Error deleting file ${filePath}: ${fileErr.message}`);
        }
      }
    }

    await Download.findByIdAndDelete(id);
    logger.info(`Deleted download record: ${id}`);

    res.status(200).json({ message: 'Download record and associated file deleted successfully' });
  } catch (error: any) {
    logger.error(`Error deleting download: ${error.message}`);
    res.status(500).json({ message: 'Server error during deletion' });
  }
};

// 5. Download the file (Stream to Client)
export const downloadFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const download = await Download.findById(id);

    if (!download) {
      res.status(404).json({ message: 'Download not found' });
      return;
    }

    if (download.status !== 'completed' || !download.outputFile) {
      res.status(400).json({ message: 'Download is not complete or file does not exist' });
      return;
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = path.resolve(uploadDir, download.outputFile);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'Physical file not found on disk. It may have been cleaned up.' });
      return;
    }

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Send Telegram Notification in background (non-blocking)
    const formattedDuration = download.duration 
      ? `${Math.floor(download.duration / 60)}m ${Math.floor(download.duration % 60)}s` 
      : 'N/A';
    const formattedSize = download.fileSize 
      ? `${(download.fileSize / (1024 * 1024)).toFixed(2)} MB` 
      : 'N/A';

    const message = `🔔 <b>Lecture Downloaded Successfully</b>\n\n` +
      `📖 <b>Name:</b> <code>${download.filename}</code>\n` +
      `🎯 <b>Quality:</b> <code>${download.quality || 'Default Quality'}</code>\n` +
      `⏱ <b>Duration:</b> <code>${formattedDuration}</code>\n` +
      `💾 <b>Size:</b> <code>${formattedSize}</code>\n\n` +
      `✅ Video file streamed and downloaded successfully by user.`;

    sendTelegramNotification(message).catch(err => {
      logger.error(`Error in sendTelegramNotification background task: ${err.message}`);
    });
  } catch (error: any) {
    logger.error(`Error streaming download file: ${error.message}`);
    res.status(500).json({ message: 'Server error during file streaming' });
  }
};

// 6. Analyze M3U8 Master URL to fetch variant qualities
export const analyzeDownloadUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { url, headers } = req.body;

    if (!url) {
      res.status(400).json({ message: 'URL is required' });
      return;
    }

    // Basic URL validation
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).json({ message: 'Invalid protocol. Only HTTP and HTTPS are supported.' });
        return;
      }
    } catch (err) {
      res.status(400).json({ message: 'Invalid URL format' });
      return;
    }

    let customHeaders: Record<string, string> = {};
    if (headers) {
      try {
        customHeaders = typeof headers === 'string' ? JSON.parse(headers) : headers;
      } catch (err) {
        res.status(400).json({ message: 'Invalid custom headers format. Must be a valid JSON object.' });
        return;
      }
    }

    const variants = await parseM3U8Playlists(url, customHeaders);
    res.status(200).json({ url, variants });
  } catch (error: any) {
    logger.error(`Error analyzing download URL: ${error.message}`);
    res.status(400).json({ message: error.message || 'Failed to analyze playlist URL' });
  }
};
