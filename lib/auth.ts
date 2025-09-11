// src/services/authService.ts

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  intendedUse: ('GENERATOR' | 'RECEIVER' | 'SCANNER')[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user?: User;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555';

const REFRESH_TOKEN_KEY = 'app_refresh_token';

class AuthService {
  private accessToken: string | null = null;
  private currentUser: User | null = null;

  private async request(endpoint: string, options: RequestInit = {}, expectJson = true): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    if (this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = text ? JSON.parse(text) : { message: 'Network error' };
      } catch {
        error = { message: text || `HTTP ${response.status}` };
      }
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    if (!expectJson || response.status === 204) return;
    return response.json();
  }

  // ---- Token & Session Management ----
  getAccessToken() {
    return this.accessToken;
  }

  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Refreshes the access token using the refresh token
   * @throws {Error} If refresh token is missing or refresh fails
   */
  async refreshAccessToken(): Promise<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available. Please log in again.');
    }

    try {
      const response = await this.request('/auth/refresh-token', {
        method: 'POST',
        headers: { 'x-refresh-token': refreshToken },
      });
      
      this.setSession(response);
      return response;
    } catch (error) {
      // Clear session on any error during refresh
      this.clearSession();
      throw new Error(`Failed to refresh access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getUser() {
    return this.currentUser;
  }

  clearSession() {
    this.accessToken = null;
    this.currentUser = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  private setSession(resp: AuthResponse) {
    this.accessToken = resp.accessToken;
    if (resp.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, resp.refreshToken);
    }
    if (resp.user) this.currentUser = resp.user;
  }

  // ---- Auth Endpoints ----
  async signup(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    intendedUse: ('GENERATOR' | 'RECEIVER')[];
  }): Promise<AuthResponse> {
    const resp = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(resp);
    return resp;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const resp = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setSession(resp);
    return resp;
  }

  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      try {
        await this.request(
          '/auth/logout',
          {
            method: 'POST',
            headers: { 'x-refresh-token': refreshToken },
          },
          false
        );
      } catch {
        // ignore logout error, still clear session
      }
    }
    this.clearSession();
  }

  /**
   * @deprecated Use refreshAccessToken() instead
   */
  async refreshTokenRequest(): Promise<AuthResponse> {
    console.warn('refreshTokenRequest() is deprecated. Use refreshAccessToken() instead.');
    return this.refreshAccessToken();
  }

  async getCurrentUser(): Promise<User> {
    if (this.currentUser) return this.currentUser;
    const user = await this.request('/auth/me', { method: 'GET' });
    this.currentUser = {
      id: user.id,
      firstName: user.firstName || user.first_name || '',
      lastName: user.lastName || user.last_name || '',
      email: user.email,
      intendedUse: user.roles || user.intendedUse || [],
    };
    return this.currentUser;
  }

  // ---- Password Reset ----
  async forgotPassword(email: string): Promise<void> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(id: string, token: string, newPassword: string): Promise<void> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ id, token, newPassword }),
    });
  }
}

export const authService = new AuthService();
