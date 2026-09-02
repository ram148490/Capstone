import {
  AuthUser,
  RestaurantProfile,
  HistoricalSalesRecord,
  LocalEvent,
  Employee,
  ShiftAssignment,
  WhatIfScenario,
  WeatherForecastDay,
  ShiftAccuracyLog,
} from '../types';

const TOKEN_KEY = 'shiftcast_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const authApi = {
  async register(params: {
    email: string;
    password: string;
    name: string;
    restaurantName: string;
    concept?: string;
    location?: string;
  }): Promise<{ user: AuthUser; token: string }> {
    const res = await apiFetch<{ success: boolean; user: AuthUser; token: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    setAuthToken(res.token);
    return { user: res.user, token: res.token };
  },

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const res = await apiFetch<{ success: boolean; user: AuthUser; token: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    setAuthToken(res.token);
    return { user: res.user, token: res.token };
  },

  async loginDemo(): Promise<{ user: AuthUser; token: string }> {
    const res = await apiFetch<{ success: boolean; user: AuthUser; token: string }>(
      '/api/auth/demo',
      {
        method: 'POST',
      }
    );
    setAuthToken(res.token);
    return { user: res.user, token: res.token };
  },

  async getMe(): Promise<AuthUser> {
    const res = await apiFetch<{ success: boolean; user: AuthUser }>('/api/auth/me');
    return res.user;
  },

  logout(): void {
    setAuthToken(null);
  },
};

export interface LoadedRestaurantData {
  user: AuthUser | null;
  data: {
    profile: RestaurantProfile;
    historicalData: HistoricalSalesRecord[];
    localEvents: LocalEvent[];
    weatherForecast: WeatherForecastDay[];
    roster: Employee[];
    assignments: ShiftAssignment[];
    manualShiftOverrides: Record<string, number>;
    scenario: WhatIfScenario;
    accuracyLogs: ShiftAccuracyLog[];
    updatedAt: string;
  };
}

export const restaurantApi = {
  async loadData(restaurantId?: string): Promise<LoadedRestaurantData> {
    const query = restaurantId ? `?restaurantId=${encodeURIComponent(restaurantId)}` : '';
    return apiFetch<LoadedRestaurantData>(`/api/restaurant/data${query}`);
  },

  async switchPreset(presetId: string): Promise<LoadedRestaurantData> {
    const res = await apiFetch<{ success: boolean; data: any }>('/api/restaurant/switch-preset', {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    });
    return {
      user: null,
      data: res.data,
    };
  },

  async saveProfile(profile: RestaurantProfile, isPresetSwitch = false): Promise<{ profile: RestaurantProfile; fullData?: any }> {
    return apiFetch<{ success: boolean; profile: RestaurantProfile; fullData?: any }>(
      '/api/restaurant/profile',
      {
        method: 'POST',
        body: JSON.stringify({ profile, isPresetSwitch }),
      }
    );
  },

  async savePosRecords(
    records: HistoricalSalesRecord[],
    replaceAll = false
  ): Promise<{ historicalData: HistoricalSalesRecord[] }> {
    return apiFetch<{ success: boolean; historicalData: HistoricalSalesRecord[] }>(
      '/api/restaurant/pos/records',
      {
        method: 'POST',
        body: JSON.stringify({ records, replaceAll }),
      }
    );
  },

  async deletePosRecord(id: string): Promise<{ historicalData: HistoricalSalesRecord[] }> {
    return apiFetch<{ success: boolean; historicalData: HistoricalSalesRecord[] }>(
      `/api/restaurant/pos/records/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  },

  async saveEvents(events: LocalEvent[]): Promise<{ localEvents: LocalEvent[] }> {
    return apiFetch<{ success: boolean; localEvents: LocalEvent[] }>(
      '/api/restaurant/events',
      {
        method: 'POST',
        body: JSON.stringify({ events }),
      }
    );
  },

  async saveRoster(roster: Employee[]): Promise<{ roster: Employee[] }> {
    return apiFetch<{ success: boolean; roster: Employee[] }>('/api/restaurant/roster', {
      method: 'POST',
      body: JSON.stringify({ roster }),
    });
  },

  async saveAssignments(
    assignments: ShiftAssignment[]
  ): Promise<{ assignments: ShiftAssignment[] }> {
    return apiFetch<{ success: boolean; assignments: ShiftAssignment[] }>(
      '/api/restaurant/assignments',
      {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      }
    );
  },

  async saveOverrides(
    overrides: Record<string, number>
  ): Promise<{ manualShiftOverrides: Record<string, number> }> {
    return apiFetch<{ success: boolean; manualShiftOverrides: Record<string, number> }>(
      '/api/restaurant/overrides',
      {
        method: 'POST',
        body: JSON.stringify({ overrides }),
      }
    );
  },

  async saveScenario(scenario: WhatIfScenario): Promise<{ scenario: WhatIfScenario }> {
    return apiFetch<{ success: boolean; scenario: WhatIfScenario }>(
      '/api/restaurant/scenario',
      {
        method: 'POST',
        body: JSON.stringify({ scenario }),
      }
    );
  },

  async saveAccuracyLogs(
    logs: ShiftAccuracyLog[],
    replaceAll = false
  ): Promise<{ accuracyLogs: ShiftAccuracyLog[] }> {
    return apiFetch<{ success: boolean; accuracyLogs: ShiftAccuracyLog[] }>(
      '/api/restaurant/accuracy/logs',
      {
        method: 'POST',
        body: JSON.stringify({ logs, replaceAll }),
      }
    );
  },

  async deleteAccuracyLog(id: string): Promise<{ accuracyLogs: ShiftAccuracyLog[] }> {
    return apiFetch<{ success: boolean; accuracyLogs: ShiftAccuracyLog[] }>(
      `/api/restaurant/accuracy/logs/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  },

  async resetToDefaults(): Promise<LoadedRestaurantData> {
    const res = await apiFetch<{ success: boolean; data: any }>('/api/restaurant/reset-defaults', {
      method: 'POST',
    });
    return {
      user: null,
      data: res.data,
    };
  },
};
