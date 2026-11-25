import { SLOTS, getCharacter, slotOvr, isOutOfPosition, type Slot } from '@strikers/shared';
import { CharacterAvatar } from './CharacterAvatar';

// Posição de cada slot no campo (percentual): ataque em cima, goleiro embaixo.
const COORDS: Record<Slot, { left: string; top: string }> = {
  ATA: { left: '50%', top: '14%' },
  LIVRE: { left: '78%', top: '40%' },
  MEI: { left: '22%', top: '40%' },
  ZAG: { left: '50%', top: '66%' },
  GOL: { left: '50%', top: '88%' },
};
export const SLOT_LABEL: Record<Slot, string> = { GOL: 'Goleiro', ZAG: 'Defesa', MEI: 'Meio-campo', LIVRE: 'Meio/Ataque', ATA: 'Ataque' };

interface Props {
  lineup: (string | null)[];
  selectedSlot?: number | null;
  onSlotClick?: (index: number) => void;
}

/** Time visto em um campo de futebol. Cada slot é um botão quando `onSlotClick` é informado. */
export function Pitch({ lineup, selectedSlot, onSlotClick }: Props) {
  return (
    <div className="pitch mx-auto aspect-[4/5] w-full max-w-md" role="group" aria-label="Escalação no campo">
      <div className="circle" aria-hidden="true" />
      {SLOTS.map((slot, index) => {
        const id = lineup[index] ?? null;
        const c = id ? getCharacter(id) : null;
        const out = c ? isOutOfPosition(c, slot) : false;
        const content = (
          <span className="flex flex-col items-center gap-1">
            <span
              className={`relative block h-14 w-14 overflow-hidden rounded-full border-2 bg-ink-800 sm:h-16 sm:w-16 ${selectedSlot === index ? 'border-neon shadow-[0_0_0_4px_rgb(34_211_238/0.35)]' : out ? 'border-amber-400' : 'border-white/70'}`}
            >
              {c ? <CharacterAvatar character={c} className="h-full w-full" /> : <span className="flex h-full items-center justify-center text-2xl text-white/50">+</span>}
            </span>
            <span className="max-w-[5.5rem] truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">{c ? c.name : SLOT_LABEL[slot]}</span>
            {c && (
              <span className={`rounded px-1.5 text-[10px] font-black ${out ? 'bg-amber-400 text-black' : 'bg-neon text-ink-950'}`}>
                {slot === 'LIVRE' ? 'LIV' : slot} {slotOvr(c, slot)}
              </span>
            )}
          </span>
        );
        const style = { left: COORDS[slot].left, top: COORDS[slot].top, transform: 'translate(-50%, -50%)' };
        const label = `${SLOT_LABEL[slot]}: ${c ? `${c.name}, OVR ${slotOvr(c, slot)}${out ? ', fora de posição' : ''}` : 'vazio'}`;
        return onSlotClick ? (
          <button key={slot} type="button" className="absolute" style={style} onClick={() => onSlotClick(index)} aria-label={label} aria-pressed={selectedSlot === index}>
            {content}
          </button>
        ) : (
          <div key={slot} className="absolute" style={style} aria-label={label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
