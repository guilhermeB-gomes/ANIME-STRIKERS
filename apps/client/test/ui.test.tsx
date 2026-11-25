import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, getCharacter, type MatchResultView } from '@strikers/shared';
import { CharacterAvatar } from '../src/components/CharacterAvatar';
import { CharacterCard } from '../src/components/CharacterCard';
import { Countdown } from '../src/components/Countdown';
import { MatchViewer, ballPosition } from '../src/components/MatchViewer';
import { Pitch } from '../src/components/Pitch';
import { api, ApiError } from '../src/services/api';
import { FRIENDLY } from '../src/services/messages';
import { storage } from '../src/services/storage';
import { ToastProvider, useToast } from '../src/stores/toasts';

const gojo = getCharacter('jujutsu-kaisen-satoru-gojo');
const goku = getCharacter('dragon-ball-son-goku');

describe('CharacterCard', () => {
  it('mostra nome, anime, raridade, posição, OVR, atributos e habilidade com rótulo acessível', () => {
    render(<CharacterCard character={gojo} size="lg" />);
    expect(screen.getByRole('article', { name: `Satoru Gojo, Jujutsu Kaisen, Mítico, Meio-campo, overall ${gojo.ovr}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Satoru Gojo' })).toBeInTheDocument();
    expect(screen.getByText('Mítico')).toBeInTheDocument();
    expect(screen.getByText('★ Visão de Jogo')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Atributos' }).querySelectorAll('li')).toHaveLength(6);
    expect(screen.getByRole('img', { name: 'Ilustração de Satoru Gojo' })).toBeInTheDocument();
  });

  it('raridades lendária/mítica têm efeitos; comuns não', () => {
    const { container, rerender } = render(<CharacterCard character={gojo} />);
    expect(container.querySelector('.rarity-MITICO')).not.toBeNull();
    expect(container.querySelector('.sparkle')).not.toBeNull();
    rerender(<CharacterCard character={getCharacter('dragon-ball-mr-satan')} />);
    expect(container.querySelector('.rarity-COMUM')).not.toBeNull();
    expect(container.querySelector('.sparkle')).toBeNull();
  });

  it('é um botão acessível quando clicável e mostra preço', async () => {
    const onClick = vi.fn();
    render(<CharacterCard character={goku} price={12} onClick={onClick} selected />);
    const button = screen.getByRole('button', { name: /Son Goku/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('12 M')).toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('avatar é determinístico (mesmo personagem, mesma arte) e difere entre personagens', () => {
    const a = render(<CharacterAvatar character={gojo} />).container.innerHTML;
    const b = render(<CharacterAvatar character={gojo} />).container.innerHTML;
    const c = render(<CharacterAvatar character={goku} />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('usa o relógio do servidor (endsAt + offset), não um contador local', () => {
    // O relógio do navegador está 5 s ATRASADO em relação ao servidor (offset +5000).
    render(<Countdown endsAt={1_000_000 + 5000 + 8000} clockOffset={5000} totalMs={15000} active />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Tempo restante: 8 segundos');
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Tempo restante: 5 segundos');
  });

  it('mostra zero quando encerrado e reage à extensão do prazo', () => {
    const { rerender } = render(<Countdown endsAt={1_000_000 + 2000} clockOffset={0} totalMs={15000} active />);
    expect(screen.getByRole('timer').textContent).toContain('2.0');
    rerender(<Countdown endsAt={1_000_000 + 7000} clockOffset={0} totalMs={15000} active />);
    expect(screen.getByRole('timer').textContent).toContain('7.0');
    rerender(<Countdown endsAt={1_000_000} clockOffset={0} totalMs={15000} active={false} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Leilão encerrado');
  });
});

describe('Pitch', () => {
  const ids = ['blue-lock-gagamaru', 'naruto-gaara', 'naruto-kakashi-hatake', 'naruto-rock-lee', 'dragon-ball-son-goku'];

  it('mostra 5 posições e avisa jogador fora de posição', () => {
    render(<Pitch lineup={[ids[3] as string, ids[0] as string, null, null, ids[4] as string]} />);
    const group = screen.getByRole('group', { name: 'Escalação no campo' });
    expect(group.querySelectorAll('[aria-label]').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByLabelText(/Goleiro: Rock Lee.*fora de posição/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Defesa: Gagamaru.*fora de posição/)).toBeInTheDocument();
    expect(screen.getByLabelText('Meio-campo: vazio')).toBeInTheDocument();
  });

  it('cada posição vira botão com seleção quando há handler', async () => {
    const onSlot = vi.fn();
    render(<Pitch lineup={ids} selectedSlot={2} onSlotClick={onSlot} />);
    const slot = screen.getByRole('button', { name: /^Meio-campo: Kakashi/ });
    expect(slot).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(slot);
    expect(onSlot).toHaveBeenCalledWith(2);
  });
});

describe('MatchViewer', () => {
  const match: MatchResultView = {
    id: 'm1',
    round: 1,
    homeId: 'h',
    awayId: 'a',
    homeGoals: 1,
    awayGoals: 1,
    mvpCharacterId: goku.id,
    stats: { home: { possession: 55, shots: 4, onTarget: 2, saves: 1 }, away: { possession: 45, shots: 3, onTarget: 2, saves: 1 } },
    events: [
      { minute: 0, type: 'INICIO', participantId: null, characterId: null, assistCharacterId: null, text: 'Começa a partida!' },
      { minute: 10, type: 'GOL', participantId: 'h', characterId: goku.id, assistCharacterId: gojo.id, text: 'GOOOL! Son Goku balança as redes!' },
      { minute: 70, type: 'GOL', participantId: 'a', characterId: gojo.id, assistCharacterId: null, text: 'É GOL de Satoru Gojo!' },
      { minute: 90, type: 'FIM', participantId: null, characterId: null, assistCharacterId: null, text: 'Fim de jogo: 1 x 1.' },
    ],
  };
  const names = (id: string) => (id === 'h' ? 'Casa' : 'Fora');

  afterEach(() => {
    document.documentElement.dataset.reduceMotion = 'false';
    vi.useRealTimers();
  });

  it('com movimento reduzido mostra tudo de uma vez: placar, narração, estatísticas e MVP', () => {
    document.documentElement.dataset.reduceMotion = 'true';
    render(<MatchViewer match={match} nameOf={names} onClose={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Partida: Casa contra Fora' })).toBeInTheDocument();
    expect(screen.getByTestId('scoreboard').textContent).toMatch(/1\s*x\s*1/);
    expect(screen.getByText('GOOOL! Son Goku balança as redes!')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Estatísticas da partida' })).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText(/assistência de Satoru Gojo/)).toBeInTheDocument();
    expect(screen.getByText('MVP')).toBeInTheDocument();
  });

  it('narra aos poucos e permite pular', () => {
    vi.useFakeTimers();
    render(<MatchViewer match={match} nameOf={names} onClose={() => undefined} />);
    expect(screen.getByTestId('scoreboard').textContent).toMatch(/0\s*x\s*0/);
    act(() => void vi.advanceTimersByTime(800));
    expect(screen.getByText('Começa a partida!')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1200));
    expect(screen.getByTestId('scoreboard').textContent).toMatch(/1\s*x\s*0/);
    fireEvent.click(screen.getByRole('button', { name: 'Pular narração' }));
    expect(screen.getByTestId('scoreboard').textContent).toMatch(/1\s*x\s*1/);
    expect(screen.queryByRole('button', { name: 'Pular narração' })).toBeNull();
  });

  it('bola vai para o gol do atacante no gol e para o gol defendido na defesa', () => {
    const ev = (type: MatchResultView['events'][number]['type'], participantId: string) => ({ minute: 20, type, participantId, characterId: null, assistCharacterId: null, text: 'x' });
    expect(ballPosition(ev('GOL', 'h'), 'h').x).toBeGreaterThan(90);
    expect(ballPosition(ev('GOL', 'a'), 'h').x).toBeLessThan(10);
    expect(ballPosition(ev('DEFESA', 'a'), 'h').x).toBeGreaterThan(80);
    expect(ballPosition(undefined, 'h')).toEqual({ x: 50, y: 50 });
  });
});

describe('toasts', () => {
  function Trigger() {
    const { toast } = useToast();
    return (
      <>
        <button onClick={() => toast('error', 'Orçamento insuficiente.')}>erro</button>
        <button onClick={() => toast('success', 'Contratado!')}>ok</button>
      </>
    );
  }

  it('mostra notificações acessíveis (alert para erro) e permite fechar, sem usar window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('erro'));
    expect(screen.getByRole('alert')).toHaveTextContent('Orçamento insuficiente.');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByText('ok'));
    expect(screen.getByRole('status')).toHaveTextContent('Contratado!');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('serviços', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('há mensagem amigável para todos os códigos de erro', () => {
    for (const code of ERROR_CODES) expect(FRIENDLY[code]?.length).toBeGreaterThan(3);
  });

  it('storage guarda só sessão e preferências e sobrevive a localStorage indisponível', () => {
    storage.setSession({ token: 't.k', playerId: 'p', name: 'Ana' });
    expect(storage.getSession()).toEqual({ token: 't.k', playerId: 'p', name: 'Ana' });
    storage.clearSession();
    expect(storage.getSession()).toBeNull();
    expect(storage.getPrefs()).toEqual({ reduceMotion: false, lastName: '' });
    storage.setPrefs({ reduceMotion: true, lastName: 'Ana' });
    expect(storage.getPrefs().reduceMotion).toBe(true);
    const keys = Object.keys(window.localStorage);
    expect(keys.every((k) => k.startsWith('strikers.'))).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    expect(() => storage.setPrefs({ reduceMotion: false, lastName: '' })).not.toThrow();
    vi.restoreAllMocks();
  });

  it('api converte erros do servidor e falhas de rede em ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' } }) }));
    await expect(api.roomInfo('ZZZZZ')).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND', status: 404, message: 'Sala não encontrada.' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    const err = await api.roomInfo('ABCDE').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK');
  });
});
