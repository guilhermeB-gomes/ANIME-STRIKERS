import { useMemo, useState } from 'react';
import { AlertTriangle, Eraser, Save, Sparkles, Swords, Wand2 } from 'lucide-react';
import { FORMATIONS, SLOTS, autoLineup, computeTeamProfile, getCharacter, type Formation } from '@strikers/shared';
import { CharacterCard } from '../components/CharacterCard';
import { Pitch, SLOT_LABEL } from '../components/Pitch';
import { useGame } from '../socket/GameProvider';

type Selection = { type: 'slot'; index: number } | { type: 'card'; id: string } | null;

export function TeamView() {
  const { room, teams, setLineup, startTournament } = useGame();
  const [draft, setDraft] = useState<{ lineup: (string | null)[]; formation: Formation } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);

  const mine = teams.find((t) => t.participantId === room?.youId);
  const current = useMemo(() => draft ?? (mine ? { lineup: mine.lineup, formation: mine.formation } : null), [draft, mine]);
  const profile = useMemo(() => (current ? computeTeamProfile(current.lineup.map((id) => (id ? getCharacter(id) : null)), current.formation) : null), [current]);

  if (!room || !mine || !current || !profile) return null;
  const isHost = room.hostId === room.youId;
  const dirty = draft !== null && (draft.formation !== mine.formation || draft.lineup.some((id, i) => id !== mine.lineup[i]));
  const nameOf = (id: string) => room.participants.find((p) => p.id === id)?.name ?? '?';
  const rosterIds = mine.roster.map((r) => r.characterId);

  const edit = (lineup: (string | null)[], formation = current.formation) => setDraft({ lineup, formation });
  const place = (slotIndex: number, id: string | null) => {
    const next = [...current.lineup];
    if (id) {
      const from = next.indexOf(id);
      if (from >= 0) next[from] = next[slotIndex] ?? null;
    }
    next[slotIndex] = id;
    edit(next);
  };

  const onSlot = (index: number) => {
    if (selection?.type === 'card') {
      place(index, selection.id);
      setSelection(null);
    } else if (selection?.type === 'slot' && selection.index === index) setSelection(null);
    else setSelection({ type: 'slot', index });
  };
  const onCard = (id: string) => {
    if (selection?.type === 'slot') {
      place(selection.index, id);
      setSelection(null);
    } else if (selection?.type === 'card' && selection.id === id) setSelection(null);
    else setSelection({ type: 'card', id });
  };

  const save = async () => {
    setBusy(true);
    const res = await setLineup(current.formation, current.lineup);
    setBusy(false);
    if (res.ok) setDraft(null);
  };

  const selectedSlot = selection?.type === 'slot' ? selection.index : null;
  const helper =
    selection?.type === 'slot'
      ? `Posição selecionada: ${SLOT_LABEL[SLOTS[selection.index] ?? 'ATA']}. Agora escolha um personagem do elenco.`
      : selection?.type === 'card'
        ? `${getCharacter(selection.id).name} selecionado. Agora toque na posição do campo.`
        : 'Toque em uma posição do campo e depois em um personagem (ou o contrário) para escalar.';

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Monte seu time</h1>
          <p className="text-sm text-mist">Leilão encerrado. Defina titulares e formação antes do campeonato.</p>
        </div>
        <p className="rounded-full border border-line bg-ink-800/80 px-3 py-1 text-sm font-bold">
          Sobraram <span className="text-gold">{room.participants.find((p) => p.id === room.youId)?.budget ?? 0} M</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section className="space-y-3" aria-label="Campo">
          <Pitch lineup={current.lineup} selectedSlot={selectedSlot} onSlotClick={onSlot} />
          <p className="min-h-10 text-center text-sm text-mist" role="status" aria-live="polite">
            {helper}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => edit(autoLineup(rosterIds.map(getCharacter)))}>
              <Wand2 className="h-4 w-4" aria-hidden="true" /> Auto-escalar
            </button>
            <button type="button" className="btn btn-ghost" disabled={selectedSlot === null || current.lineup[selectedSlot] === null} onClick={() => selectedSlot !== null && (place(selectedSlot, null), setSelection(null))}>
              <Eraser className="h-4 w-4" aria-hidden="true" /> Esvaziar posição
            </button>
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel space-y-3 p-4" aria-labelledby="formation-title">
            <h2 id="formation-title" className="font-display text-lg font-black">
              Formação
            </h2>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formação">
              {(Object.values(FORMATIONS)).map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={current.formation === f.id} className={`btn ${current.formation === f.id ? 'btn-primary' : 'btn-ghost'} flex-col !gap-0`} onClick={() => edit(current.lineup, f.id)}>
                  <span>{f.name}</span>
                  <span className="text-xs font-semibold opacity-80">{f.label}</span>
                </button>
              ))}
            </div>
            <dl className="grid grid-cols-4 gap-2 text-center text-sm">
              {(
                [
                  ['Ataque', profile.attack],
                  ['Meio', profile.mid],
                  ['Defesa', profile.defense],
                  ['Goleiro', profile.gk],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-black/30 p-2">
                  <dt className="text-xs text-mist">{label}</dt>
                  <dd className="font-display text-xl font-black">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-violet/30 to-neon/20 p-3">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" /> Sinergia {profile.synergyPct >= 0 ? '+' : ''}
                {profile.synergyPct}%
              </span>
              <span className="font-display text-2xl font-black">
                Força <span className="text-gold" data-testid="team-strength">{profile.strength}</span>
              </span>
            </div>
            {profile.warnings.length > 0 ? (
              <ul className="space-y-1" aria-label="Avisos da escalação">
                {profile.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {w.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">Escalação completa e bem posicionada.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
                <Save className="h-4 w-4" aria-hidden="true" /> Salvar escalação
              </button>
              {dirty && (
                <button type="button" className="btn btn-ghost" onClick={() => (setDraft(null), setSelection(null))}>
                  Descartar
                </button>
              )}
              <span className={`text-xs font-bold ${dirty ? 'text-amber-200' : 'text-emerald-300'}`}>{dirty ? 'Alterações não salvas' : 'Escalação salva'}</span>
            </div>
          </section>

          <section className="panel p-4" aria-labelledby="teams-title">
            <h2 id="teams-title" className="mb-2 font-display text-lg font-black">
              Todos os times
            </h2>
            <ul className="space-y-1 text-sm">
              {[...teams]
                .sort((a, b) => b.profile.strength - a.profile.strength)
                .map((t) => (
                  <li key={t.participantId} className="flex justify-between rounded bg-black/20 px-3 py-1.5">
                    <span>
                      {nameOf(t.participantId)} <span className="text-xs text-mist">{FORMATIONS[t.formation].label}</span>
                    </span>
                    <b className="tabular-nums text-gold">{t.profile.strength}</b>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="roster-title">
        <h2 id="roster-title" className="mb-3 font-display text-lg font-black">
          Seu elenco ({mine.roster.length})
        </h2>
        <ul className="flex flex-wrap gap-3">
          {mine.roster.map((r) => {
            const slot = current.lineup.indexOf(r.characterId);
            return (
              <li key={r.characterId}>
                <CharacterCard character={getCharacter(r.characterId)} size="md" price={r.price} badge={slot >= 0 ? `Titular · ${SLOT_LABEL[SLOTS[slot] ?? 'ATA']}` : 'Reserva'} selected={selection?.type === 'card' && selection.id === r.characterId} dim={slot < 0} onClick={() => onCard(r.characterId)} />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col items-center gap-2 border-t border-line/60 pt-4">
        {isHost ? (
          <>
            <button
              type="button"
              className="btn btn-primary !min-h-14 px-10 text-lg"
              disabled={dirty || busy}
              onClick={() => {
                setBusy(true);
                void startTournament().then(() => setBusy(false));
              }}
            >
              <Swords className="h-5 w-5" aria-hidden="true" /> Iniciar campeonato
            </button>
            <p className="text-xs text-mist">{dirty ? 'Salve sua escalação antes de iniciar.' : 'Quando todos estiverem prontos, inicie o campeonato.'}</p>
          </>
        ) : (
          <p className="text-sm text-mist" role="status">
            Aguardando o anfitrião iniciar o campeonato…
          </p>
        )}
      </div>
    </div>
  );
}
