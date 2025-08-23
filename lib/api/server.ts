import { cookies } from "next/headers";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5555";
const DEBUG = process.env.NODE_ENV !== "production";

export async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isServer = typeof window === "undefined";
  let token: string | null = null;

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (isServer) {
    token = cookies().get("accessToken")?.value || null;
  } else if (typeof window !== "undefined") {
    token = localStorage.getItem("accessToken") || null;
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const doFetch = async (): Promise<Response> =>
    fetch(url, { ...options, headers, credentials: "include" });

  let res = await doFetch();

  if (res.status === 401 && !isServer) {
    if (DEBUG) console.warn("[fetchWithAuth] refreshing token…");
    const refresh = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refresh.ok) {
      const { accessToken } = await refresh.json();
      if (accessToken) {
        localStorage.setItem("accessToken", accessToken);
        headers.set("Authorization", `Bearer ${accessToken}`);
        res = await doFetch();
      }
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
