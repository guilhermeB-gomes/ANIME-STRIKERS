import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega o primeiro arquivo .env encontrado (diretório atual ou raiz do monorepo) usando o suporte nativo do Node.
 * Variáveis que já existem no ambiente NÃO são sobrescritas. Retorna o caminho carregado ou null.
 */
export function loadDotEnv(cwd: string = process.cwd()): string | null {
  const candidates = [resolve(cwd, '.env'), resolve(cwd, '../../.env')];
  const found = candidates.find((file) => existsSync(file));
  if (!found) return null;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Este Node não suporta process.loadEnvFile (use Node 20.12+ ou defina as variáveis no ambiente).');
  }
  process.loadEnvFile(found);
  return found;
}
