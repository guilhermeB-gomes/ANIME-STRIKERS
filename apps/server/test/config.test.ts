import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { loadDotEnv } from '../src/load-env';

describe('configuração', () => {
  it('usa valores padrão em desenvolvimento e separa várias origens do CORS', () => {
    const c = loadConfig({ NODE_ENV: 'development', CLIENT_ORIGIN: 'http://a.com, http://b.com' });
    expect(c.port).toBe(3001);
    expect(c.clientOrigins).toEqual(['http://a.com', 'http://b.com']);
    expect(c.databaseUrl).toBeUndefined();
    expect(c.game).toEqual({});
  });

  it('exige SESSION_SECRET em produção e rejeita segredo curto', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'curto' })).toThrow();
    expect(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'um-segredo-bem-longo-123' }).sessionSecret).toBe('um-segredo-bem-longo-123');
  });

  it('valida a porta e converte ajustes de ritmo do jogo', () => {
    expect(() => loadConfig({ PORT: '99999' })).toThrow();
    const c = loadConfig({ GAME_AUCTION_MS: '2000', GAME_BOT_DELAY_SCALE: '0.5', GAME_INTERMISSION_MS: '0' });
    expect(c.game).toEqual({ auctionDurationMs: 2000, botDelayScale: 0.5, intermissionMs: 0 });
    expect(() => loadConfig({ GAME_AUCTION_MS: '5' })).toThrow();
  });
});

describe('loadDotEnv', () => {
  const touched: string[] = [];
  afterEach(() => {
    for (const k of touched.splice(0)) delete process.env[k];
  });

  it('carrega .env do diretório sem sobrescrever variáveis já definidas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'strikers-env-'));
    writeFileSync(join(dir, '.env'), 'STRIKERS_TEST_A=do-arquivo\nSTRIKERS_TEST_B=tambem-do-arquivo\n');
    process.env.STRIKERS_TEST_A = 'do-ambiente';
    touched.push('STRIKERS_TEST_A', 'STRIKERS_TEST_B');
    expect(loadDotEnv(dir)).toBe(join(dir, '.env'));
    expect(process.env.STRIKERS_TEST_A).toBe('do-ambiente');
    expect(process.env.STRIKERS_TEST_B).toBe('tambem-do-arquivo');
  });

  it('encontra o .env na raiz do monorepo (../../) e devolve null quando não existe', () => {
    const root = mkdtempSync(join(tmpdir(), 'strikers-root-'));
    const sub = join(root, 'apps', 'server');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(root, '.env'), 'STRIKERS_TEST_C=raiz\n');
    touched.push('STRIKERS_TEST_C');
    expect(loadDotEnv(sub)).toBe(join(root, '.env'));
    expect(process.env.STRIKERS_TEST_C).toBe('raiz');
    expect(loadDotEnv(mkdtempSync(join(tmpdir(), 'strikers-vazio-')))).toBeNull();
  });
});
