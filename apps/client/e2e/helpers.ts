import { expect, type Browser, type Page } from '@playwright/test';

export async function enterAs(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Como devemos te chamar?').fill(name);
  await page.getByRole('button', { name: 'Entrar como convidado' }).click();
  await expect(page.getByRole('button', { name: 'JOGAR' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'JOGAR' })).toBeEnabled(); // socket conectado
}

/** Cria partida contra N bots e abre o lobby. */
export async function startSoloLobby(page: Page, opponents = 1): Promise<void> {
  await page.getByLabel('Adversários (1 a 7)').fill(String(opponents));
  await page.getByRole('button', { name: 'Começar contra bots' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

export async function newPlayer(browser: Browser, name: string, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, baseURL: 'http://127.0.0.1:4300' });
  const page = await context.newPage();
  await enterAs(page, name);
  return { context, page };
}

export async function budget(page: Page): Promise<number> {
  const text = (await page.getByTestId('my-budget').textContent()) ?? '';
  return Number(text.replace(/\D/g, ''));
}

/** Sem rolagem horizontal e com todos os botões visíveis dentro da largura da tela. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(overflow.scrollWidth, 'rolagem horizontal inesperada').toBeLessThanOrEqual(overflow.innerWidth + 1);
  const outside = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('button, a.btn, input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > window.innerWidth + 1 || r.left < -1) bad.push(`${el.tagName} "${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 30)}"`);
    }
    return bad;
  });
  expect(outside, 'controles fora da tela').toEqual([]);
}
