import { logger } from '../utils/logger';

export interface M3U8Variant {
  resolution?: string;
  bandwidth?: number;
  name: string;
  url: string;
}

export const parseM3U8Playlists = async (
  masterUrl: string,
  headers?: Record<string, string>
): Promise<M3U8Variant[]> => {
  try {
    const requestHeaders = new Headers();
    
    // Set a standard browser User-Agent by default to bypass CDN blocking
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (headers) {
      Object.entries(headers).forEach(([k, v]) => {
        requestHeaders.set(k, v);
      });
    }

    logger.info(`Fetching and parsing M3U8 master playlist from: ${masterUrl}`);
    const response = await fetch(masterUrl, { headers: requestHeaders });
    if (!response.ok) {
      throw new Error(`Failed to fetch playlist (HTTP ${response.status})`);
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/);

    if (!lines[0] || !lines[0].startsWith('#EXTM3U')) {
      throw new Error('Invalid M3U8 file format: missing EXTM3U header');
    }

    const variants: M3U8Variant[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse attributes
        const attributesStr = line.substring(18);
        const resolutionMatch = attributesStr.match(/RESOLUTION=(\d+x\d+)/i);
        const bandwidthMatch = attributesStr.match(/BANDWIDTH=(\d+)/i);
        const nameMatch = attributesStr.match(/NAME="([^"]+)"/i) || attributesStr.match(/NAME=([^,]+)/i);

        const resolution = resolutionMatch ? resolutionMatch[1] : undefined;
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : undefined;
        let name = nameMatch ? nameMatch[1] : '';

        // Find the URL line (first non-empty, non-comment line after the tag)
        let url = '';
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (!nextLine) continue;
          if (nextLine.startsWith('#')) {
            if (nextLine.startsWith('#EXT-X-STREAM-INF:')) {
              break;
            }
            continue;
          }
          url = nextLine;
          i = j; // Update outer loop index
          break;
        }

        if (url) {
          // Resolve relative URL
          const absoluteUrl = new URL(url, masterUrl).href;

          // Construct standard name if none provided
          if (!name) {
            if (resolution) {
              const height = resolution.split('x')[1];
              name = `${height}p`;
            } else if (bandwidth) {
              name = `${Math.round(bandwidth / 1000)}kbps`;
            } else {
              name = `Stream ${variants.length + 1}`;
            }
          }

          variants.push({
            resolution,
            bandwidth,
            name,
            url: absoluteUrl
          });
        }
      }
    }

    // Sort variants by bandwidth/quality descending
    variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

    // If no variants found, treat the playlist as single quality
    if (variants.length === 0) {
      logger.info('No variant streams found in playlist. Treating as single-quality stream.');
      variants.push({
        name: 'Default Quality',
        url: masterUrl
      });
    }

    return variants;
  } catch (error: any) {
    logger.error(`Error parsing M3U8 playlist: ${error.message}`);
    throw new Error(`M3U8 analysis failed: ${error.message}`);
  }
};
