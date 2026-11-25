// Empacota o servidor em dist/index.js. Dependências de runtime ficam externas (instaladas via npm);
// o pacote workspace @strikers/shared (TypeScript) é embutido no bundle.
import { readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const shared = JSON.parse(readFileSync(new URL('../../../packages/shared/package.json', import.meta.url), 'utf8'));
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(shared.dependencies ?? {})].filter((d) => d !== '@strikers/shared');

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
