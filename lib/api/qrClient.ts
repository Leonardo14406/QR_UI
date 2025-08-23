// lib/api/qrClient.ts
"use client";
import { authService } from '../auth';
import { QRCodeResponse, GenerateQRResponse, GeneratePageQRParams, GenerateSimpleQRParams, QRHistoryResponse, ScanResult } from "./qr.types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5555";
const DEBUG = process.env.NODE_ENV !== "production";

// Track if we're already refreshing the token
let isRefreshing = false;

// Helper function to handle token refresh
async function refreshAuthToken(): Promise<string | null> {
  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing) {
    // Wait for the ongoing refresh to complete
    return new Promise((resolve) => {
      const checkRefresh = () => {
        if (!isRefreshing) {
          resolve(localStorage.getItem("accessToken"));
        } else {
          setTimeout(checkRefresh, 100);
        }
      };
      checkRefresh();
    });
  }

  isRefreshing = true;
  
  try {
    const response = await authService.refreshToken();
    if (response?.accessToken) {
      localStorage.setItem("accessToken", response.accessToken);
      return response.accessToken;
    }
    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    localStorage.removeItem("accessToken");
    return null;
  } finally {
    isRefreshing = false;
  }
}

export async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  // Skip token refresh for auth-related endpoints
  const isAuthRequest = url.includes('/auth/');
  
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  // Get access token from localStorage if this isn't an auth request
  let token = isAuthRequest ? null : localStorage.getItem("accessToken");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Helper function to make the actual fetch call
  const doFetch = async (): Promise<Response> => {
    return fetch(url, { 
      ...options, 
      headers,
      credentials: 'include', // This ensures cookies (including refresh token) are sent with the request
      mode: 'cors', // Ensure CORS mode is set
      // Ensure the request is made with credentials
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer'
    });
  };

  // Initial request
  let res = await doFetch();

  // If unauthorized and not already trying to refresh, try to refresh the token
  if (res.status === 401 && !isAuthRequest) {
    if (DEBUG) console.log("[fetchWithAuth] Attempting to refresh token...");
    
    const newToken = await refreshAuthToken();
    
    if (newToken) {
      // Update the Authorization header with the new token
      headers.set("Authorization", `Bearer ${newToken}`);
      
      // Retry the original request with the new token
      res = await doFetch();
      
      // If still unauthorized after refresh, clear tokens and redirect
      if (res.status === 401) {
        localStorage.removeItem("accessToken");
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new Error('Session expired. Please log in again.');
      }
    } else {
      // If no access token was returned, clear tokens and redirect to login
      localStorage.removeItem("accessToken");
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
  }

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`[fetchWithAuth] ${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  }
  return data as T;
}
export const qrApi = {
  async generateSimple(params: GenerateSimpleQRParams): Promise<GenerateQRResponse> {
    try {
      // Validate expiresAt if provided (ISO 8601)
      if (params.expiresAt) {
        const d = new Date(params.expiresAt);
        const valid = !isNaN(d.getTime()) && params.expiresAt === d.toISOString();
        if (!valid) {
          throw new Error("expiresAt must be a valid ISO date string");
        }
      }

      const res = await fetchWithAuth<GenerateQRResponse>(`${API_BASE_URL}/qr/generate`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      return res;
    } catch (e: any) {
      const msg = e?.message || "Failed to generate QR code";
      throw new Error(msg);
    }
  },

  async generatePage(params: GeneratePageQRParams): Promise<GenerateQRResponse> {
    try {
      if (!params.blocks?.length) {
        throw new Error("At least one content block is required");
      }
      const res = await fetchWithAuth<GenerateQRResponse>(`${API_BASE_URL}/qr/generate-page`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      const url = (res as any)?.url ?? (res as any)?.qr?.url;
      if (!url) {
        throw new Error("No URL returned for QR code");
      }
      return res;
    } catch (e: any) {
      const msg = e?.message || "Failed to generate page QR code";
      throw new Error(msg);
    }
  },

  async getQRCode(id: string, token?: string): Promise<QRCodeResponse> {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      return await fetchWithAuth<QRCodeResponse>(`${API_BASE_URL}/qr/history/${id}`, {
        headers
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to fetch QR code";
      throw new Error(msg);
    }
  },

  async deleteQRCode(id: string): Promise<{ message: string }> {
    try {
      return await fetchWithAuth<{ message: string }>(`${API_BASE_URL}/qr/history/${id}`, {
        method: "DELETE",
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to delete QR code";
      throw new Error(msg);
    }
  },

  async getHistory(): Promise<QRHistoryResponse> {
    try {
      return await fetchWithAuth<QRHistoryResponse>(`${API_BASE_URL}/qr/history`);
    } catch (e: any) {
      const msg = e?.message || "Failed to fetch history";
      throw new Error(msg);
    }
  },

  async validateQRCode(code: string): Promise<ScanResult> {
    try {
      return await fetchWithAuth<ScanResult>(`${API_BASE_URL}/qr/validate`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to validate QR code";
      throw new Error(msg);
    }
  },

  async scanImage(file: File): Promise<ScanResult> {
    try {
      const formData = new FormData();
      formData.append("image", file); // must match backend field name

      return await fetchWithAuth<ScanResult>(`${API_BASE_URL}/qr/scan-image`, {
        method: "POST",
        body: formData,
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to scan image";
      throw new Error(msg);
    }
  },
}

