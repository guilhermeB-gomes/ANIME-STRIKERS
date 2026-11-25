import type { DomainErrorPayload } from '@strikers/shared';

const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('NETWORK', 'Não foi possível falar com o servidor. Verifique sua conexão.', 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: DomainErrorPayload } | null)?.error;
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? 'Erro no servidor.', res.status);
  }
  return body as T;
}

export interface GuestSession {
  player: { id: string; name: string; wins: number; draws: number; losses: number };
  token: string;
}

export interface RoomInfo {
  code: string;
  status: string;
  humans: number;
  humanCapacity: number;
  maxPlayers: number;
}

export interface MatchHistoryEntry {
  matchId: string;
  roomCode: string;
  round: number;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  result: 'V' | 'E' | 'D';
}

export const api = {
  createGuest: (name: string) =>
    request<GuestSession>('/api/guests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }),
  roomInfo: (code: string) => request<RoomInfo>(`/api/rooms/${encodeURIComponent(code)}`),
  me: (token: string) =>
    request<{ player: GuestSession['player']; history: MatchHistoryEntry[] }>('/api/me', { headers: { authorization: `Bearer ${token}` } }),
};

export const SERVER_URL = BASE;
