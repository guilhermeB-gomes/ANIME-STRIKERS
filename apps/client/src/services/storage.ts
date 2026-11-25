/**
 * localStorage guarda apenas identidade da sessão de convidado e preferências visuais.
 * NUNCA estado de jogo (orçamento, lances, elencos): isso vive no servidor/banco.
 */
const SESSION_KEY = 'strikers.session.v1';
const PREFS_KEY = 'strikers.prefs.v1';

export interface StoredSession {
  token: string;
  playerId: string;
  name: string;
}

export interface Prefs {
  reduceMotion: boolean;
  lastName: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (modo privado, cota cheia): o jogo continua funcionando sem persistir preferências.
  }
}

export const storage = {
  getSession: () => read<StoredSession>(SESSION_KEY),
  setSession: (s: StoredSession) => write(SESSION_KEY, s),
  clearSession: () => {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // ver comentário em `write`
    }
  },
  getPrefs: (): Prefs => ({ reduceMotion: false, lastName: '', ...(read<Partial<Prefs>>(PREFS_KEY) ?? {}) }),
  setPrefs: (p: Prefs) => write(PREFS_KEY, p),
};
