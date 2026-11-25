import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { enterAs, expectNoOverflow, startSoloLobby } from './helpers';

// Fluxo D — roda nos projetos desktop, tablet e smartphone (viewports no playwright.config.ts).
const SHOTS = join(process.cwd(), '..', '..', 'docs', 'evidencias', 'screenshots');

test('telas principais sem cortes, sem rolagem horizontal e com botões funcionais', async ({ page }, info) => {
  mkdirSync(SHOTS, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${info.project.name}-${name}.png`) });

  // Home (sem sessão e com sessão)
  await page.goto('/');
  await expect(page.getByLabel('Como devemos te chamar?')).toBeVisible();
  await expectNoOverflow(page);
  await shot('01-home-entrada');
  await enterAs(page, `Resp ${info.project.name}`);
  await expectNoOverflow(page);
  await shot('02-home');

  // Páginas estáticas
  await page.getByRole('link', { name: 'Como jogar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Como jogar' })).toBeVisible();
  await expectNoOverflow(page);
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expectNoOverflow(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'JOGAR' })).toBeEnabled();

  // Lobby
  await startSoloLobby(page, 1);
  await expectNoOverflow(page);
  await shot('03-lobby');
  await page.getByRole('button', { name: 'Iniciar leilão' }).click();

  // Leilão: carta legível, controles visíveis e funcionais
  await expect(page.getByText(/Leilão \d+ de 14/)).toBeVisible();
  const cover = page.getByRole('button', { name: /^Cobrir \d+ M$/ });
  await expect(cover).toBeVisible();
  // Os controles de lance devem estar visíveis SEM rolar a página (o rótulo do botão muda a cada lance, então usamos o grupo).
  await expect(page.getByRole('group', { name: 'Lances rápidos' })).toBeInViewport();
  await expect(page.getByRole('timer')).toBeInViewport();
  await expectNoOverflow(page);
  await cover.click();
  await expect(page.getByTestId('current-bid')).not.toHaveText('—');
  await shot('04-leilao');
  const card = page.getByRole('article').first();
  const box = await card.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(120);

  // Escalação
  await expect(page.getByRole('heading', { name: 'Monte seu time' })).toBeVisible({ timeout: 120_000 });
  await expectNoOverflow(page);
  await shot('05-escalacao');
  await page.getByRole('button', { name: 'Iniciar campeonato' }).click();

  // Campeonato e partida
  await expect(page.getByRole('heading', { name: 'Campeonato' })).toBeVisible();
  await page.getByRole('button', { name: 'Simular tudo' }).click();
  await expect(page.getByTestId('champion')).toBeVisible();
  await expectNoOverflow(page);
  await shot('06-campeonato');
  await page.getByRole('button', { name: /^Ver partida/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Pular narração' }).click();
  await expect(page.getByTestId('scoreboard')).toBeVisible();
  await shot('07-partida');
  const dialogBox = await page.getByRole('dialog').boundingBox();
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});
