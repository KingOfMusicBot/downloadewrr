export class ApiError extends Error {
  status?: number;
  data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');

interface RequestOptions extends RequestInit {
  token?: string | null;
}

class ApiClient {
  private getHeaders(options: RequestOptions = {}): Headers {
    const headers = new Headers(options.headers || {});
    
    // Automatically set Content-Type to JSON if sending a body and it's not FormData
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Append JWT token from localStorage or options
    const token = options.token || (typeof window !== 'undefined' ? localStorage.getItem('m3u8_token') : null);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    
    const requestOptions: RequestInit = {
      ...options,
      headers: this.getHeaders(options),
    };

    try {
      const response = await fetch(url, requestOptions);
      
      // Handle file downloads separately
      if (response.headers.get('Content-Disposition') || endpoint.endsWith('/file')) {
        if (!response.ok) {
          throw new ApiError('Failed to download file', response.status);
        }
        return response as any; // Return raw response so the page can handle streaming/saving
      }

      let data: any;
      try {
        data = await response.json();
      } catch (jsonErr) {
        if (!response.ok) {
          throw new ApiError(response.statusText || 'Something went wrong', response.status);
        }
        throw jsonErr;
      }
      
      if (!response.ok) {
        throw new ApiError(data.message || 'Something went wrong', response.status, data);
      }
      
      return data as T;
    } catch (error: any) {
      console.error('API Client error:', error.message);
      throw error;
    }
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
