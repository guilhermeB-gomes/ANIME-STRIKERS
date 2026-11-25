import { expect, test } from '@playwright/test';
import { budget, enterAs, newPlayer, startSoloLobby } from './helpers';

test.describe('Fluxo A — jogador contra bots', () => {
  test('do leilão ao resultado do campeonato', async ({ page }) => {
    await enterAs(page, 'Ana Solo');
    await startSoloLobby(page, 1);
    await expect(page.getByText('Participantes (2/2)')).toBeVisible();
    await expect(page.getByText(/Bot · Normal/)).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar leilão' }).click();
    await expect(page.getByText(/Leilão \d+ de 14/)).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();

    // Disputa o primeiro leilão com lance real e confere o líder.
    const cover = page.getByRole('button', { name: /^Cobrir \d+ M$/ });
    await expect(cover).toBeEnabled();
    await cover.click();
    await expect(page.getByTestId('leader')).toContainText(/Ana Solo|Kaito Bot/);
    await expect(page.getByTestId('current-bid')).not.toHaveText('—');

    // Continua participando enquanto o leilão corre; garante orçamento sempre >= 0.
    await expect(page.getByRole('heading', { name: 'Monte seu time' })).toBeVisible({ timeout: 120_000 });
    expect(await page.getByText(/Sobraram/).textContent()).toMatch(/\d+ M/);

    // Escalação e formação.
    await expect(page.getByLabel('Escalação no campo')).toBeVisible();
    await page.getByRole('button', { name: 'Auto-escalar' }).click();
    await page.getByRole('radio', { name: /Ofensiva/ }).click();
    await expect(page.getByText('Alterações não salvas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar campeonato' })).toBeDisabled();
    await page.getByRole('button', { name: 'Salvar escalação' }).click();
    await expect(page.getByText('Escalação salva')).toBeVisible();
    expect(Number(await page.getByTestId('team-strength').textContent())).toBeGreaterThan(30);

    // Campeonato e resultado.
    await page.getByRole('button', { name: 'Iniciar campeonato' }).click();
    await expect(page.getByRole('heading', { name: 'Campeonato' })).toBeVisible();
    await expect(page.getByTestId('round-progress')).toContainText('Rodada 0 de 1');
    await page.getByRole('button', { name: 'Simular tudo' }).click();
    await expect(page.getByTestId('champion')).toBeVisible();
    await expect(page.getByTestId('standings').locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: /^Ver partida/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Pular narração' }).click();
    await expect(page.getByRole('table', { name: 'Estatísticas da partida' })).toBeVisible();
    await expect(page.getByTestId('scoreboard')).toContainText(/\d\s*x\s*\d/);
    await page.getByRole('button', { name: 'Fechar partida' }).click();
    await page.getByRole('button', { name: 'Voltar ao início' }).click();
    await expect(page.getByRole('button', { name: 'JOGAR' })).toBeEnabled();
  });
});

test.describe('Fluxos B e C — multiplayer e persistência', () => {
  test('dois jogadores: lobby, leilão sincronizado, recarregar a página e campeonato', async ({ browser }) => {
    const host = await newPlayer(browser, 'Host Hana');
    const guest = await newPlayer(browser, 'Guest Gil');
    const h = host.page;
    const g = guest.page;

    // Host cria a sala com 2 participantes humanos.
    await h.getByLabel('Participantes (2 a 8)').fill('2');
    await h.getByRole('button', { name: 'Criar sala' }).click();
    const code = ((await h.getByTestId('room-code').textContent()) ?? '').trim();
    expect(code).toMatch(/^[A-Z2-9]{5}$/);

    // Código inválido e inexistente mostram mensagens amigáveis.
    await g.getByLabel('Código da sala').fill('ZZZZZ');
    await g.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(g.locator('#code-error')).toHaveText('Sala não encontrada. Confira o código.');
    await g.getByLabel('Código da sala').fill('AB');
    await g.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(g.getByText('O código tem 5 caracteres.')).toBeVisible();

    // Convidado entra com o código; ambos veem o mesmo lobby.
    await g.getByLabel('Código da sala').fill(code);
    await g.getByRole('button', { name: 'Entrar', exact: true }).click();
    for (const p of [h, g]) {
      await expect(p.getByText('Participantes (2/2)')).toBeVisible();
      await expect(p.getByText('Host Hana', { exact: true })).toBeVisible();
      await expect(p.getByText('Guest Gil', { exact: true })).toBeVisible();
      await expect(p.getByTestId('room-code')).toHaveText(code);
    }
    await expect(g.getByRole('button', { name: 'Iniciar leilão' })).toHaveCount(0);
    await expect(g.getByText('Aguardando o anfitrião iniciar a partida')).toBeVisible();

    // Anfitrião inicia: os dois disputam o MESMO leilão.
    await h.getByRole('button', { name: 'Iniciar leilão' }).click();
    await expect(h.getByText(/Leilão 1 de 14/)).toBeVisible();
    await expect(g.getByText(/Leilão 1 de 14/)).toBeVisible();
    const nameH = await h.getByRole('article').first().getAttribute('aria-label');
    const nameG = await g.getByRole('article').first().getAttribute('aria-label');
    expect(nameH).toBe(nameG);
    const character = (nameH ?? '').split(',')[0] ?? '';
    expect(character.length).toBeGreaterThan(2);

    // Lances sincronizados nos dois sentidos.
    await h.getByRole('button', { name: /^Cobrir \d+ M$/ }).click();
    await expect(g.getByTestId('leader')).toContainText('Host Hana');
    const bidSeenByGuest = await g.getByTestId('current-bid').textContent();
    expect(await h.getByTestId('current-bid').textContent()).toBe(bidSeenByGuest);
    await g.getByRole('button', { name: /^Cobrir \d+ M$/ }).click();
    await expect(h.getByTestId('leader')).toContainText('Guest Gil');
    await expect(g.getByText('Você está liderando este leilão.')).toBeVisible();

    // Fim do leilão: o vencedor é Guest Gil, com orçamento descontado igual nas duas telas.
    await expect(g.getByTestId('auction-result')).toContainText(`Guest Gil contratou ${character}`, { timeout: 15_000 });
    await expect(h.getByTestId('auction-result')).toContainText(`Guest Gil contratou ${character}`);
    const paid = Number(((await g.getByTestId('auction-result').textContent()) ?? '').match(/por (\d+) M/)?.[1]);
    expect(paid).toBeGreaterThan(0);
    await expect(g.getByTestId('my-budget')).toHaveText(`${100 - paid} M`);
    expect(await budget(h)).toBe(100);

    // Fluxo C — atualizar o navegador não corrompe o estado e a sessão reconecta sozinha.
    await g.reload();
    await expect(g.getByText(/Leilão \d+ de 14/)).toBeVisible({ timeout: 15_000 });
    await expect(g.getByTestId('my-budget')).toHaveText(`${100 - paid} M`);
    await expect(g.getByText('Elenco 1/7')).toBeVisible();
    await h.reload();
    await expect(h.getByText(/Leilão \d+ de 14/)).toBeVisible({ timeout: 15_000 });
    await expect(h.getByTestId('my-budget')).toHaveText('100 M');

    // Leilões seguintes correm sem intervenção; ambos chegam à montagem do time.
    await expect(h.getByRole('heading', { name: 'Monte seu time' })).toBeVisible({ timeout: 120_000 });
    await expect(g.getByRole('heading', { name: 'Monte seu time' })).toBeVisible();
    await expect(g.getByText('Aguardando o anfitrião iniciar o campeonato')).toBeVisible();
    await expect(g.getByTestId('team-strength')).toBeVisible();

    await h.getByRole('button', { name: 'Iniciar campeonato' }).click();
    for (const p of [h, g]) await expect(p.getByRole('heading', { name: 'Campeonato' })).toBeVisible();
    await expect(g.getByRole('button', { name: 'Simular próxima rodada' })).toHaveCount(0);
    await h.getByRole('button', { name: 'Simular tudo' }).click();

    // Resultados sincronizados: mesma tabela e mesmo campeão nas duas telas.
    for (const p of [h, g]) await expect(p.getByTestId('champion')).toBeVisible();
    const tableH = await h.getByTestId('standings').innerText();
    const tableG = await g.getByTestId('standings').innerText();
    const plain = (t: string) => t.replace(/\(você\)/g, '');
    expect(plain(tableG)).toBe(plain(tableH));
    expect(await g.getByTestId('champion').innerText()).toBe(await h.getByTestId('champion').innerText());

    // Reconexão no fim: recarregar volta ao resultado.
    await g.reload();
    await expect(g.getByTestId('champion')).toBeVisible({ timeout: 15_000 });

    await host.context.close();
    await guest.context.close();
  });
});
