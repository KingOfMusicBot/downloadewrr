import { Router } from 'express';
import {
  submitDownload,
  getDownloads,
  getDownloadById,
  deleteDownload,
  downloadFile,
  analyzeDownloadUrl
} from '../controllers/downloadController';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply general API rate limiting to all download routes
router.use(apiLimiter);

router.post('/', submitDownload as any);
router.post('/analyze', analyzeDownloadUrl as any);
router.get('/', getDownloads as any);
router.get('/:id', getDownloadById as any);
router.delete('/:id', deleteDownload as any);
router.get('/:id/file', downloadFile as any);

export default router;
