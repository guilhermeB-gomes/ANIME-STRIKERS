import { useEffect, useRef, useState } from 'react';
import { Crown, Gavel, Loader2, Timer, Users } from 'lucide-react';
import { AUCTION_DURATION_MS, MAX_ROSTER, MIN_PRICE, STARTERS, getCharacter } from '@strikers/shared';
import { CharacterCard } from '../components/CharacterCard';
import { Countdown } from '../components/Countdown';
import { useCountdown } from '../hooks/useCountdown';
import { useGame } from '../socket/GameProvider';

export function AuctionView() {
  const { room, auction, teams, clockOffset, bid } = useGame();
  const [pending, setPending] = useState(false);
  const [custom, setCustom] = useState('');
  const [flashKey, setFlashKey] = useState(0);
  const lastBids = useRef(0);

  const bidCount = auction?.bids.length ?? 0;
  useEffect(() => {
    if (bidCount !== lastBids.current) {
      lastBids.current = bidCount;
      setFlashKey((k) => k + 1);
    }
  }, [bidCount, auction?.id]);

  const nextIn = useCountdown(auction?.nextStartsAt ?? null, clockOffset, auction?.status === 'CLOSED');

  if (!room) return null;
  if (!auction) {
    return (
      <div className="flex flex-col items-center gap-3 pt-24 text-mist" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-neon" aria-hidden="true" />
        <p className="font-display text-xl font-black text-white">Preparando o leilão…</p>
        <p className="text-sm">Os primeiros personagens já estão chegando ao palco.</p>
      </div>
    );
  }

  const character = getCharacter(auction.characterId);
  const me = room.participants.find((p) => p.id === room.youId);
  const nameOf = (id: string | null) => room.participants.find((p) => p.id === id)?.name ?? '—';
  const active = auction.status === 'ACTIVE';
  const leading = auction.leaderId === room.youId;
  const rosterSize = me?.roster.length ?? 0;
  const reserve = Math.max(0, STARTERS - (rosterSize + 1)) * MIN_PRICE;
  const maxBid = (me?.budget ?? 0) - reserve;
  const alreadyOwned = room.participants.some((p) => p.roster.includes(auction.characterId));
  const full = rosterSize >= MAX_ROSTER;
  const minNext = auction.minNextBid;

  let blocker: string | null = null;
  if (!active) blocker = 'Leilão encerrado.';
  else if (leading) blocker = 'Você está liderando este leilão.';
  else if (full) blocker = `Elenco completo (${MAX_ROSTER} personagens).`;
  else if (alreadyOwned) blocker = 'Este personagem já foi contratado.';
  else if (minNext > maxBid) blocker = maxBid < minNext && (me?.budget ?? 0) >= minNext ? `Você precisa reservar ${reserve} M para completar seu time.` : 'Orçamento insuficiente para cobrir.';

  const place = async (amount: number) => {
    if (pending) return;
    setPending(true);
    await bid(amount);
    setPending(false);
  };

  const quick = [minNext, minNext + 2, minNext + 4, minNext + 9];
  const customAmount = Number(custom);
  const customValid = Number.isInteger(customAmount) && customAmount >= minNext && customAmount <= maxBid;
  const sortedBids = [...auction.bids].reverse();
  const winner = auction.winnerId;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="rounded-full border border-line bg-ink-800/80 px-3 py-1 text-sm font-bold">
          Leilão <span className="text-neon">{auction.index + 1}</span> de {auction.total}
        </p>
        <p className="text-sm text-mist">
          Seu orçamento: <b className="text-lg text-gold" data-testid="my-budget">{me?.budget ?? 0} M</b> · Elenco {rosterSize}/{MAX_ROSTER}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_1fr_minmax(0,18rem)]">
        <div className="order-2 flex justify-center lg:order-1 lg:justify-start">
          <CharacterCard character={character} size="lg" />
        </div>

        <section className="panel order-1 space-y-4 p-5 lg:order-2" aria-label="Painel de lances">
          <p className="font-display text-lg font-black lg:hidden" data-testid="mobile-character-summary">
            {character.name} <span className="text-neon">{character.position}</span> <span className="text-gold">OVR {character.ovr}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/30 p-3">
              <p className="flex items-center gap-1 text-xs font-bold uppercase text-mist">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Tempo
              </p>
              <Countdown endsAt={auction.endsAt} clockOffset={clockOffset} totalMs={AUCTION_DURATION_MS} active={active} />
            </div>
            <div key={flashKey} className={`rounded-xl bg-black/30 p-3 ${flashKey > 1 && active ? 'flash' : ''}`}>
              <p className="flex items-center gap-1 text-xs font-bold uppercase text-mist">
                <Gavel className="h-3.5 w-3.5" aria-hidden="true" /> Maior lance
              </p>
              <p className="font-display text-5xl font-black text-gold" data-testid="current-bid">
                {auction.currentBid ?? '—'}
                {auction.currentBid !== null && <span className="ml-1 text-xl text-mist">M</span>}
              </p>
              <p className="flex items-center gap-1 truncate text-sm font-bold" data-testid="leader">
                <Crown className="h-4 w-4 text-gold" aria-hidden="true" />
                {auction.leaderId ? nameOf(auction.leaderId) : `Valor inicial ${auction.startingBid} M`}
              </p>
            </div>
          </div>

          {active ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Lances rápidos">
                {quick.map((amount, i) => (
                  <button key={amount} type="button" className={`btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}`} disabled={blocker !== null || pending || amount > maxBid} onClick={() => void place(amount)}>
                    {i === 0 ? `Cobrir ${amount} M` : `${amount} M`}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customValid) void place(customAmount);
                }}
              >
                <label className="sr-only" htmlFor="custom-bid">
                  Valor do lance em milhões
                </label>
                <input id="custom-bid" className="input" inputMode="numeric" placeholder={`Outro valor (${minNext}–${Math.max(minNext, maxBid)})`} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
                <button type="submit" className="btn btn-gold shrink-0" disabled={blocker !== null || pending || !customValid}>
                  Dar lance
                </button>
              </form>
              <p className="min-h-5 text-sm font-semibold text-amber-200" role="status" aria-live="polite" data-testid="bid-blocker">
                {blocker ?? (reserve > 0 ? `Dica: reserve ${reserve} M para as vagas que ainda faltam. Máximo agora: ${Math.max(0, maxBid)} M.` : '')}
              </p>
            </>
          ) : (
            <div className="pop-in rounded-xl border border-gold/50 bg-gold/10 p-4 text-center" role="status" data-testid="auction-result">
              <p className="font-display text-xl font-black text-gold">{winner ? `${nameOf(winner)} contratou ${character.name} por ${auction.finalPrice} M!` : `${character.name} ficou sem lances.`}</p>
              <p className="mt-1 text-sm text-mist">{auction.index + 1 >= auction.total ? 'Último leilão! Preparando as escalações…' : `Próximo leilão em ${Math.ceil(nextIn / 1000)} s…`}</p>
            </div>
          )}

          <div>
            <h3 className="mb-1 text-xs font-bold uppercase text-mist">Histórico de lances</h3>
            {sortedBids.length === 0 ? (
              <p className="text-sm text-mist">Nenhum lance ainda. Seja o primeiro!</p>
            ) : (
              <ol className="max-h-40 space-y-1 overflow-y-auto pr-1 text-sm" aria-label="Histórico de lances">
                {sortedBids.map((b, i) => (
                  <li key={b.id} className={`flex justify-between rounded px-2 py-1 ${i === 0 ? 'bg-neon/15 font-bold' : 'bg-black/20'}`}>
                    <span>{nameOf(b.participantId)}</span>
                    <span className="tabular-nums text-gold">{b.amount} M</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="panel order-3 p-4" aria-labelledby="competitors-title">
          <h2 id="competitors-title" className="mb-2 flex items-center gap-2 font-display text-base font-black">
            <Users className="h-4 w-4 text-magenta" aria-hidden="true" /> Concorrentes
          </h2>
          <ul className="space-y-2">
            {room.participants.map((p) => {
              const team = teams.find((t) => t.participantId === p.id);
              return (
                <li key={p.id} className={`rounded-lg border px-3 py-2 ${p.id === auction.leaderId && active ? 'border-gold/70 bg-gold/10' : 'border-line/60 bg-black/20'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {p.name}
                      {p.id === room.youId && <span className="ml-1 text-xs text-neon">(você)</span>}
                      {p.isBot && <span className="ml-1 text-xs text-violet-300">bot</span>}
                    </span>
                    <span className="font-black tabular-nums text-gold">{p.budget} M</span>
                  </div>
                  <p className="text-xs text-mist">
                    {p.roster.length} contratados
                    {!p.connected && <span className="ml-1 text-amber-300">· desconectado</span>}
                    {team && team.roster.length > 0 && <span> · gasto {team.roster.reduce((s, r) => s + r.price, 0)} M</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          {me && me.roster.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-bold uppercase text-mist">Seu elenco</h3>
              <ul className="flex flex-wrap gap-1.5">
                {me.roster.map((id) => {
                  const c = getCharacter(id);
                  return (
                    <li key={id} className="rounded bg-ink-700 px-2 py-0.5 text-xs font-bold">
                      {c.name} <span className="text-neon">{c.position}</span> {c.ovr}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
