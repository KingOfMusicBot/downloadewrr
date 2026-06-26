'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { api } from '../lib/api';
import {
  Download,
  Link as LinkIcon,
  FileVideo,
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Activity
} from 'lucide-react';

interface DownloadItem {
  _id: string;
  url: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  outputFile?: string;
  fileSize?: number;
  duration?: number;
  createdAt: string;
  quality?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recentDownloads, setRecentDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Session-specific downloads tracking (removes global history view)
  const [sessionDownloadIds, setSessionDownloadIds] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Quality Selection States
  const [variants, setVariants] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analyzed, setAnalyzed] = useState(false);
  const [isRedirected, setIsRedirected] = useState(false);

  // Load session downloads on mount
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('session_downloads');
    if (saved) {
      try {
        setSessionDownloadIds(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to parse session downloads:', err);
      }
    }
  }, []);

  // Fetch session downloads
  const fetchRecentDownloads = useCallback(async (ids?: string[]) => {
    const queryIds = ids || sessionDownloadIds;
    if (!queryIds || queryIds.length === 0) {
      setRecentDownloads([]);
      return;
    }
    try {
      const data = await api.get<{ downloads: DownloadItem[] }>(`/api/downloads?limit=100&ids=${queryIds.join(',')}`);
      setRecentDownloads(data.downloads);
    } catch (err) {
      console.error('Failed to fetch recent downloads:', err);
    }
  }, [sessionDownloadIds]);

  // Trigger queue download programmatically (backend-to-backend redirect helper)
  const startDownloadProgrammatically = useCallback(async (
    downloadUrl: string,
    origUrl: string | null,
    file: string,
    customHdrs: string | null,
    qual: string | null
  ) => {
    setLoading(true);
    setSubmitError('');
    setSubmitSuccess(false);
    try {
      let parsedHeaders = null;
      if (customHdrs && customHdrs.trim()) {
        try {
          parsedHeaders = JSON.parse(customHdrs);
        } catch {
          // ignore parsing issues
        }
      }

      const data = await api.post<{ _id: string }>('/api/downloads', {
        url: downloadUrl,
        originalUrl: origUrl || downloadUrl,
        filename: file || 'video_' + Date.now(),
        headers: parsedHeaders,
        quality: qual || 'Default Quality'
      });

      // Retrieve existing session downloads list
      const saved = localStorage.getItem('session_downloads');
      let currentIds: string[] = [];
      if (saved) {
        try {
          currentIds = JSON.parse(saved);
        } catch {}
      }
      const updatedIds = [...currentIds, data._id];
      setSessionDownloadIds(updatedIds);
      localStorage.setItem('session_downloads', JSON.stringify(updatedIds));

      setSubmitSuccess(true);
      await fetchRecentDownloads(updatedIds);
      
      // Clear success alert after 3 seconds
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err: any) {
      console.error('Programmatic download failed:', err);
      setSubmitError(err.message || 'Failed to trigger video download queue.');
    } finally {
      setLoading(false);
    }
  }, [fetchRecentDownloads]);

  // Parse query parameters and auto-start download if configured
  useEffect(() => {
    if (!isMounted) return;

    try {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get('url');
      const queryOriginalUrl = params.get('originalUrl') || queryUrl;
      const queryFilename = params.get('filename');
      const queryHeaders = params.get('headers');
      const queryQuality = params.get('quality');

      if (queryUrl && queryFilename) {
        // Clean URL params immediately to avoid re-submitting on refresh
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        window.history.replaceState({}, '', cleanUrl.pathname);

        // Call the programmatic download directly
        startDownloadProgrammatically(
          queryUrl,
          queryOriginalUrl,
          queryFilename,
          queryHeaders,
          queryQuality
        );
      }
    } catch (err) {
      console.error('Error handling redirect parameters:', err);
    }
  }, [isMounted, startDownloadProgrammatically]);



  useEffect(() => {
    if (isMounted && sessionDownloadIds.length > 0) {
      fetchRecentDownloads();
    }
  }, [isMounted, sessionDownloadIds, fetchRecentDownloads]);

  // Polling for active jobs in current session
  useEffect(() => {
    const activeJobs = recentDownloads.some(
      (d) => d.status === 'pending' || d.status === 'processing'
    );

    if (!activeJobs || sessionDownloadIds.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.get<{ downloads: DownloadItem[] }>(`/api/downloads?limit=100&ids=${sessionDownloadIds.join(',')}`);
        setRecentDownloads((prev) => {
          // Compare if any status changed, update if needed
          const hasChanges = data.downloads.some((newDl) => {
            const oldDl = prev.find(p => p._id === newDl._id);
            return !oldDl || oldDl.status !== newDl.status || oldDl.progress !== newDl.progress;
          });
          return hasChanges ? data.downloads : prev;
        });
      } catch (err) {
        console.error('Error polling download progress:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [recentDownloads, sessionDownloadIds]);

  // Handle stream analysis
  const handleAnalyze = async () => {
    if (!url) return;
    setAnalysisError('');
    setAnalyzing(true);
    setAnalyzed(false);
    setVariants([]);
    setSelectedVariant(null);

    let parsedHeaders = null;
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (err) {
        setAnalysisError('Invalid JSON format in custom headers.');
        setAnalyzing(false);
        return;
      }
    }

    try {
      const data = await api.post<{ url: string; variants: any[] }>('/api/downloads/analyze', {
        url,
        headers: parsedHeaders
      });
      setVariants(data.variants);
      if (data.variants && data.variants.length > 0) {
        setSelectedVariant(data.variants[0]); // Default to first (best quality)
      }
      setAnalyzed(true);
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to analyze URL. Make sure it is a valid M3U8.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle download submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);

    if (!url || !filename) {
      setSubmitError('Please fill in both the URL and Filename');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setSubmitError('Invalid URL. Must start with http:// or https://');
      return;
    }

    let parsedHeaders = null;
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (err) {
        setSubmitError('Invalid JSON format in custom headers field.');
        return;
      }
    }

    setLoading(true);
    try {
      const data = await api.post<{ _id: string }>('/api/downloads', {
        url: selectedVariant ? selectedVariant.url : url,
        originalUrl: url,
        filename,
        headers: parsedHeaders,
        quality: selectedVariant ? selectedVariant.name : 'Default Quality'
      });

      const updatedIds = [...sessionDownloadIds, data._id];
      setSessionDownloadIds(updatedIds);
      localStorage.setItem('session_downloads', JSON.stringify(updatedIds));

      setUrl('');
      setFilename('');
      setHeaders('');
      setVariants([]);
      setSelectedVariant(null);
      setAnalyzed(false);
      setSubmitSuccess(true);
      setShowAdvanced(false);

      // Refresh list
      await fetchRecentDownloads(updatedIds);

      // Clear success message after 3 seconds
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to queue download. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Delete download
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this download record and its file?')) return;
    try {
      await api.delete(`/api/downloads/${id}`);
      setRecentDownloads((prev) => prev.filter((d) => d._id !== id));
      const updatedIds = sessionDownloadIds.filter(sid => sid !== id);
      setSessionDownloadIds(updatedIds);
      localStorage.setItem('session_downloads', JSON.stringify(updatedIds));
    } catch (err: any) {
      alert(err.message || 'Failed to delete record.');
    }
  };

  // Compute metrics
  const stats = {
    total: recentDownloads.length,
    processing: recentDownloads.filter((d) => d.status === 'processing' || d.status === 'pending').length,
    completed: recentDownloads.filter((d) => d.status === 'completed').length,
    failed: recentDownloads.filter((d) => d.status === 'failed').length,
  };

  // Get download file url
  const getDownloadUrl = (id: string) => {
    const apiBase = typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
    return `${apiBase}/api/downloads/${id}/file`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex-1 bg-slate-950 min-h-screen flex flex-col">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow">
        {/* Statistics Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass-panel p-4 rounded-xl border border-border/50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Added</p>
            <p className="text-2xl font-black mt-1 text-white">{stats.total}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-border/50 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Jobs</p>
              <p className="text-2xl font-black mt-1 text-indigo-400">{stats.processing}</p>
            </div>
            {stats.processing > 0 && <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />}
          </div>
          <div className="glass-panel p-4 rounded-xl border border-border/50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-black mt-1 text-emerald-400">{stats.completed}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-border/50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Failed</p>
            <p className="text-2xl font-black mt-1 text-rose-500">{stats.failed}</p>
          </div>
        </section>

        <div className="w-full animate-fadeIn">
          {/* Active Downloads List */}
          <section className="w-full">
            <div className="glass-panel p-6 rounded-2xl border border-border/60">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center justify-between">
                <span>Active Downloads</span>
                <span className="text-xs font-normal text-slate-500">Live Updates</span>
              </h2>

              {recentDownloads.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Clock className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm font-semibold">No active downloads in this session</p>
                  <p className="text-xs mt-1">Submit an M3U8 link in the sidebar to start.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentDownloads.map((dl) => (
                    <div
                      key={dl._id}
                      className="p-4 rounded-xl border border-border/40 bg-slate-900/20 hover:bg-slate-900/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Filename & Badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white truncate max-w-[250px] md:max-w-[350px]">
                            {dl.filename}
                          </span>

                          {dl.quality && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 select-none">
                              {dl.quality}
                            </span>
                          )}

                          {/* Badge Status */}
                          {dl.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                          {dl.status === 'processing' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                              <Activity className="w-3 h-3 animate-spin" /> Processing
                            </span>
                          )}
                          {dl.status === 'completed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Done
                            </span>
                          )}
                          {dl.status === 'failed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Failed
                            </span>
                          )}
                        </div>


                        {/* File Details (Duration, Size) */}
                        {dl.status === 'completed' && (
                          <div className="flex gap-4 text-xs text-slate-400 mt-1">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-slate-500" /> {formatSize(dl.fileSize)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" /> {formatDuration(dl.duration)}
                            </span>
                          </div>
                        )}

                        {/* Error Message */}
                        {dl.status === 'failed' && dl.error && (
                          <p className="text-xs font-semibold text-red-400 mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Error: {dl.error}</span>
                          </p>
                        )}

                        {/* Progress Bar */}
                        {(dl.status === 'processing' || dl.status === 'pending') && (
                          <div className="w-full mt-2 space-y-1">
                            <div className="flex justify-between text-xs font-medium text-slate-400">
                              <span>
                                {dl.status === 'pending'
                                  ? 'Queued in Redis...'
                                  : dl.progress === 0
                                    ? 'Assembling stream segments...'
                                    : 'Downloading stream segments...'}
                              </span>
                              <span>{dl.progress > 0 ? `${dl.progress}%` : ''}</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden relative">
                              <div
                                className={`gradient-bg h-1.5 rounded-full transition-all duration-500 ${dl.progress === 0 && dl.status === 'processing'
                                    ? 'w-full animate-pulse opacity-75'
                                    : ''
                                  }`}
                                style={{ width: dl.progress > 0 ? `${dl.progress}%` : '100%' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        {dl.status === 'completed' && (
                          <a
                            href={getDownloadUrl(dl._id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all"
                            download={dl.filename}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download MP4
                          </a>
                        )}

                        <button
                          onClick={() => handleDelete(dl._id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                          title="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
