import { Schema, model, Document, Types } from 'mongoose';

export type DownloadStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IDownload extends Document {
  userId?: Types.ObjectId;
  url: string;
  filename: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
  outputFile?: string;
  fileSize?: number;
  duration?: number;
  headers?: Map<string, string>;
  originalUrl?: string;
  quality?: string;
  createdAt: Date;
  completedAt?: Date;
}

const DownloadSchema = new Schema<IDownload>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  error: {
    type: String
  },
  outputFile: {
    type: String
  },
  fileSize: {
    type: Number
  },
  duration: {
    type: Number
  },
  headers: {
    type: Map,
    of: String
  },
  originalUrl: {
    type: String
  },
  quality: {
    type: String,
    default: 'Default Quality'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

export const Download = model<IDownload>('Download', DownloadSchema);
