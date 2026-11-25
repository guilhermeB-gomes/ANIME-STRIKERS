import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra o servidor de PRODUÇÃO (Express servindo o build do cliente), com ritmo de leilão acelerado.
 * Pré-requisito: `npm run build` na raiz. Rode com `npm run test:e2e`.
 *
 * Em ambientes sem acesso ao CDN de navegadores do Playwright, use E2E_USE_SPARTICUZ=1: o Chromium vem
 * empacotado no pacote npm `@sparticuz/chromium` (usado neste projeto para validar os testes).
 */
const PORT = 4300;

let launchOptions: { executablePath?: string; args?: string[] } = {};
if (process.env.E2E_USE_SPARTICUZ === '1') {
  const { default: sparticuz } = await import('@sparticuz/chromium');
  launchOptions = {
    executablePath: await sparticuz.executablePath(),
    args: [...sparticuz.args.filter((a) => a !== '--single-process'), '--no-sandbox'],
  };
}

export default defineConfig({
  testDir: './e2e',
  timeout: 200_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions },
  webServer: {
    command: 'node ../server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      CLIENT_ORIGIN: `http://127.0.0.1:${PORT}`,
      CLIENT_DIST: './dist',
      SESSION_SECRET: 'e2e-secret-with-more-than-16-characters',
      LOG_LEVEL: 'silent',
      GAME_AUCTION_MS: '3000',
      GAME_INTERMISSION_MS: '1000',
      GAME_FIRST_DELAY_MS: '300',
      GAME_SNIPE_WINDOW_MS: '250',
      GAME_SNIPE_EXTENSION_MS: '300',
      GAME_BOT_DELAY_SCALE: '0.05',
    },
  },
  projects: [
    { name: 'desktop', testMatch: /(flows|responsive)\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'tablet', testMatch: /responsive\.spec\.ts/, use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'mobile', testMatch: /responsive\.spec\.ts/, use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
