export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  intendedUse: ('GENERATOR' | 'RECEIVER')[];
}

export interface AuthResponse {
  accessToken: string;
  user?: User;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555';

class AuthService {
  private async request(
    endpoint: string,
    options: RequestInit = {},
    expectJson: boolean = true
  ): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers, // caller decides if Authorization is needed
    });

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // This ensures cookies (including refresh token) are sent with the request
      mode: 'cors',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer'
    });

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

    if (!expectJson || response.status === 204) {
      return; // return void for logout / no content
    }

    return response.json();
  }

  // ---- Auth Endpoints ----

  async signup(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    intendedUse: ('GENERATOR' | 'RECEIVER')[];
  }): Promise<AuthResponse> {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<void> {
    return this.request(
      '/auth/logout',
      { method: 'POST' },
      false // no JSON expected
    );
  }

  async refreshToken(): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
        method: 'POST',
        credentials: 'include', // This is crucial for sending the refresh token cookie
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to refresh token');
      }

      return response.json();
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new Error('Missing refresh token');
    }
  }

  async getCurrentUser(accessToken: string): Promise<User> {
    try {
      const user = await this.request('/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Normalize user fields
      const mappedUser: User = {
        id: user.id,
        firstName: user.firstName || user.first_name || '',
        lastName: user.lastName || user.last_name || '',
        email: user.email,
        intendedUse: user.roles || user.intendedUse || [],
      };

      return mappedUser;
    } catch (error) {
      console.error('Error getting current user:', error);
      throw error;
    }
  }

  // ---- Password Reset ----

  async forgotPassword(email: string): Promise<void> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(
    id: string,
    token: string,
    newPassword: string
  ): Promise<void> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ id, token, newPassword }),
    });
  }
}

export const authService = new AuthService();
