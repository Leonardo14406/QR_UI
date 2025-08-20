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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555';

class AuthService {
  async getAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined') {
      // Server-side: Try to get token from cookies
      try {
        const { cookies } = await import('next/headers');
        return cookies().get('accessToken')?.value || null;
      } catch (error) {
        console.error('Error getting server token:', error);
        return null;
      }
    }
    // Client-side: Get token from localStorage
    return localStorage.getItem('accessToken');
  }
  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      credentials: 'include', // Include cookies for refresh token
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

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
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async refreshToken(): Promise<AuthResponse> {
    return this.request('/auth/refresh-token', {
      method: 'POST',
    });
  }

  async getCurrentUser(accessToken: string): Promise<User> {
    try {
      const user = await this.request('/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      // Log the raw user data for debugging
      console.log('Raw user data from API:', JSON.stringify(user, null, 2));
      
      // Map the user data to ensure it matches our User interface
      const mappedUser: User = {
        id: user.id,
        firstName: user.firstName || user.first_name || '',
        lastName: user.lastName || user.last_name || '',
        email: user.email,
        // Use the roles array from the API response, or default to ['GENERATOR']
        intendedUse: user.roles || user.intendedUse || ['GENERATOR']
      };
      
      // Log the mapped user data
      console.log('Mapped user data:', JSON.stringify(mappedUser, null, 2));
      
      return mappedUser;
    } catch (error) {
      console.error('Error getting current user:', error);
      throw error;
    }
  }

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