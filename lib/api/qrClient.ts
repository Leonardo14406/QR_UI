import { GeneratePageQRParams, GenerateSimpleQRParams, GenerateQRResponse, QRHistoryResponse, QRCodeResponse } from './qr.types';
import { authService } from '../auth';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555';

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isServer = typeof window === "undefined";
  console.log(`[fetchWithAuth] Starting request to ${url} (${isServer ? 'server' : 'client'})`);
  
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = new Headers();
  // Only set JSON content type when not sending FormData (browser will set multipart boundary automatically)
  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  // Merge custom headers
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => headers.set(key, value));
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => headers.set(key, value));
    } else {
      Object.entries(options.headers).forEach(([key, value]) =>
        headers.set(key, value as string)
      );
    }
  }

  // Get access token (server vs client)
  let accessToken: string | null = null;
  if (isServer) {
    console.log('[fetchWithAuth] Server-side token check');
    try {
      // For server-side requests, we need to pass the cookie header manually
      const { cookies } = await import("next/headers");
      const cookieStore = cookies();
      accessToken = cookieStore.get("accessToken")?.value || null;
      
      console.log('[fetchWithAuth] Server token check:', {
        hasToken: !!accessToken,
        tokenLength: accessToken?.length,
        availableCookies: cookieStore.getAll().map(c => c.name)
      });
      
      // For server-side requests, we need to include cookies in the fetch
      if (accessToken) {
        headers.set('Cookie', `accessToken=${accessToken}`);
      }
    } catch (error) {
      console.error('[fetchWithAuth] Error getting server token:', error);
    }
  } else {
    console.log('[fetchWithAuth] Client-side token check');
    try {
      accessToken = await authService.getAccessToken();
      console.log(`[fetchWithAuth] Client token: ${accessToken ? 'found' : 'not found'}`);
    } catch (error) {
      console.error("[fetchWithAuth] Error getting client access token:", error);
    }
  }

  if (accessToken) {
    console.log('[fetchWithAuth] Setting Authorization header');
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    console.log('[fetchWithAuth] No access token available');
  }

  // Log request details
  console.log(`[fetchWithAuth] Making request to: ${url}`, {
    method: options?.method || 'GET',
    headers: Object.fromEntries(headers.entries()),
    hasBody: !!options?.body,
    isServer
  });

  // First request
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
    
    console.log(`[fetchWithAuth] Response status: ${response.status} ${response.statusText}`, {
      url: response.url,
      redirected: response.redirected,
      type: response.type,
      headers: Object.fromEntries(response.headers.entries())
    });
  } catch (error) {
    console.error('[fetchWithAuth] Network error during fetch:', error);
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Handle expired token (401)
  if (response.status === 401) {
    console.log('[fetchWithAuth] Received 401, attempting token refresh');
    
    try {
      if (isServer) {
        console.log('[fetchWithAuth] Cannot refresh token on server, redirecting to login');
        throw new Error('Session expired. Please log in again.');
      }
      
      console.log(`[fetchWithAuth] Attempting to refresh token at ${API_BASE_URL}/auth/refresh`);
      
      // Client-side token refresh
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // This will send the httpOnly refresh token cookie
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`[fetchWithAuth] Refresh response status: ${refreshResponse.status}`);
      
      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text().catch(() => 'Could not read error response');
        console.error(`[fetchWithAuth] Refresh failed with status ${refreshResponse.status}:`, errorText);
        throw new Error(`Failed to refresh session: ${errorText}`);
      }

      const refreshData = await refreshResponse.json().catch(e => {
        console.error('[fetchWithAuth] Failed to parse refresh response:', e);
        throw new Error('Invalid response from authentication server');
      });
      
      console.log('[fetchWithAuth] Token refresh successful');
      const { accessToken } = refreshData;
      
      if (!accessToken) {
        console.error('[fetchWithAuth] No access token in refresh response:', refreshData);
        throw new Error('No access token received from refresh endpoint');
      }
      
      // Update the access token in localStorage for client-side use
      localStorage.setItem('accessToken', accessToken);
      console.log('[fetchWithAuth] Updated access token in localStorage');
      
      // Retry the original request with the new token
      headers.set('Authorization', `Bearer ${accessToken}`);
      console.log('[fetchWithAuth] Retrying original request with new token');
      
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      
      console.log(`[fetchWithAuth] Retry response status: ${response.status}`);
      
    } catch (error) {
      console.error('[fetchWithAuth] Token refresh failed:', error);
      // Clear auth state and redirect to login
      if (typeof window !== 'undefined') {
        console.log('[fetchWithAuth] Clearing auth state and redirecting to login');
        localStorage.removeItem('accessToken');
        window.location.href = '/login?error=session_expired';
      }
      throw new Error('Your session has expired. Please log in again.');
    }
  }

  // Handle errors (read body once)
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      try{
        const errorText = await response.text();
        if (errorText) errorMessage = errorText;
      }catch{
        //ignore
      }
    }

    console.error("API Error:", {
      url,
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
    });

    throw new Error(errorMessage);
  }

  // Success → read JSON once
  return response.json();
}

export const qrApi = {
  // Generate a simple QR code
  async generateSimple(params: GenerateSimpleQRParams): Promise<GenerateQRResponse> {
    const user = await authService.getCurrentUser(await authService.getAccessToken() || "");
    const creatorName = user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";

    const res = await fetchWithAuth<{ qr: QRCodeResponse }>(`${API_BASE_URL}/qr/generate`, {
      method: "POST",
      body: JSON.stringify({
        payload: typeof params.payload === "string" 
          ? { content: params.payload } 
          : params.payload,
        type: "generic",
        oneTime: params.oneTime,
        expiresAt: params.expiresAt,
        creator: creatorName,
      }),
    });

    // Return wrapped object to match GenerateQRResponse used by UI
    return { qr: res.qr };
  },

  // Generate a page QR code with rich content
  async generatePage(params: GeneratePageQRParams): Promise<GenerateQRResponse> {
    return fetchWithAuth(`${API_BASE_URL}/qr/generate-page`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        blocks: params.blocks,
        style: params.style,
      }),
    });
  },

  // Get QR code details
  async getQRCode(id: string): Promise<any> {
    return fetchWithAuth(`${API_BASE_URL}/qr/history/${id}`, {
      method: 'GET',
    });
  },

  // Delete a QR code
  async deleteQRCode(id: string): Promise<void> {
    return fetchWithAuth(`${API_BASE_URL}/qr/history/${id}`, {
      method: 'DELETE',
    });
  },
  
  // Get QR code history for the current user
  async getQRHistory(): Promise<QRHistoryResponse> {
    return fetchWithAuth<QRHistoryResponse>(`${API_BASE_URL}/qr/history`);
  },

  // Get all QR code IDs for static generation
  async getAllQRCodeIds(): Promise<{ id: string }[]> {
    const history = await this.getQRHistory();
    return history.items.map(item => ({ id: item.id }));
  },
  
  // Validate a QR code (new method, since backend supports it)
  async validateQRCode(code: string): Promise<any> {
    return fetchWithAuth(`${API_BASE_URL}/qr/validate`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  // Scan an uploaded image containing a QR code
  async scanImage(file: File): Promise<any> {
    const form = new FormData();
    form.append('image', file);
    return fetchWithAuth(`${API_BASE_URL}/qr/scan-image`, {
      method: 'POST',
      body: form,
    });
  },
};


