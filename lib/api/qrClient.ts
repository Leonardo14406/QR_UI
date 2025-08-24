// lib/api/qrClient.ts
"use client";
import { authService } from "../auth";
import {
  QRCodeResponse,
  GenerateQRResponse,
  GeneratePageQRParams,
  GenerateSimpleQRParams,
  QRHistoryResponse,
  ScanResult,
} from "./qr.types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5555";
const DEBUG = process.env.NODE_ENV !== "production";

let isRefreshing = false;
let refreshWaiters: ((token: string | null) => void)[] = [];

/**
 * Run all waiting promises once refresh finishes
 */
function notifyRefreshWaiters(token: string | null) {
  refreshWaiters.forEach((resolve) => resolve(token));
  refreshWaiters = [];
}

/**
 * Handle refreshing access token
 */
async function refreshAuthToken(): Promise<string | null> {
  if (isRefreshing) {
    // Wait for the refresh to complete
    return new Promise((resolve) => {
      refreshWaiters.push(resolve);
    });
  }

  isRefreshing = true;

  try {
    const response = await authService.refreshAccessToken();
    const newToken = response?.accessToken || null;

    if (newToken) {
      localStorage.setItem("accessToken", newToken);
    } else {
      localStorage.removeItem("accessToken");
    }

    notifyRefreshWaiters(newToken);
    return newToken;
  } catch (error) {
    console.error("Token refresh failed:", error);
    localStorage.removeItem("accessToken");
    notifyRefreshWaiters(null);
    return null;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Wrapper fetch with token handling
 */
export async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isAuthRequest = url.includes("/auth/");

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let token = isAuthRequest ? null : localStorage.getItem("accessToken");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const doFetch = async (): Promise<Response> => {
    return fetch(url, {
      ...options,
      headers,
      credentials: "include",
      mode: "cors",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });
  };

  let res = await doFetch();

  if (res.status === 401 && !isAuthRequest) {
    if (DEBUG) console.log("[fetchWithAuth] 401 detected → refreshing token…");

    const newToken = await refreshAuthToken();

    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await doFetch();

      if (res.status === 401) {
        localStorage.removeItem("accessToken");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw new Error("Session expired. Please log in again.");
      }
    } else {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Session expired. Please log in again.");
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
    throw new Error(
      `[fetchWithAuth] ${res.status} ${res.statusText}: ${JSON.stringify(data)}`
    );
  }

  return data as T;
}

export const qrApi = {
  async generateSimple(
    params: GenerateSimpleQRParams
  ): Promise<GenerateQRResponse> {
    if (params.expiresAt) {
      const d = new Date(params.expiresAt);
      const valid =
        !isNaN(d.getTime()) && params.expiresAt === d.toISOString();
      if (!valid) {
        throw new Error("expiresAt must be a valid ISO date string");
      }
    }

    return fetchWithAuth<GenerateQRResponse>(`${API_BASE_URL}/qr/generate`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  async generatePage(
    params: GeneratePageQRParams
  ): Promise<GenerateQRResponse> {
    if (!params.blocks?.length) {
      throw new Error("At least one content block is required");
    }

    const res = await fetchWithAuth<GenerateQRResponse>(
      `${API_BASE_URL}/qr/generate-page`,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );

    const url = (res as any)?.url ?? (res as any)?.qr?.url;
    if (!url) {
      throw new Error("No URL returned for QR code");
    }
    return res;
  },

  async getQRCode(id: string, token?: string): Promise<QRCodeResponse> {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return fetchWithAuth<QRCodeResponse>(`${API_BASE_URL}/qr/history/${id}`, {
      headers,
    });
  },

  async deleteQRCode(id: string): Promise<{ message: string }> {
    return fetchWithAuth<{ message: string }>(
      `${API_BASE_URL}/qr/history/${id}`,
      {
        method: "DELETE",
      }
    );
  },

  async getHistory(): Promise<QRHistoryResponse> {
    return fetchWithAuth<QRHistoryResponse>(`${API_BASE_URL}/qr/history`);
  },

  async validateQRCode(code: string): Promise<ScanResult> {
    return fetchWithAuth<ScanResult>(`${API_BASE_URL}/qr/validate`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  async scanImage(file: File): Promise<ScanResult> {
    const formData = new FormData();
    formData.append("image", file);

    return fetchWithAuth<ScanResult>(`${API_BASE_URL}/qr/scan-image`, {
      method: "POST",
      body: formData,
    });
  },
};
