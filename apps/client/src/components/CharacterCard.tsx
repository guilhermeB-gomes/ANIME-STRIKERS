import { getAbility, getAnime, type AttributeKey, type Character, type Rarity } from '@strikers/shared';
import { CharacterAvatar } from './CharacterAvatar';

export const RARITY_LABEL: Record<Rarity, string> = { COMUM: 'Comum', RARO: 'Raro', EPICO: 'Épico', LENDARIO: 'Lendário', MITICO: 'Mítico' };
const POSITION_LABEL = { GOL: 'Goleiro', ZAG: 'Defensor', MEI: 'Meio-campo', ATA: 'Atacante' } as const;
const ATTR_LABEL: Record<AttributeKey, string> = {
  velocidade: 'VEL',
  finalizacao: 'FIN',
  passe: 'PAS',
  drible: 'DRI',
  defesa: 'DEF',
  fisico: 'FIS',
  controle: 'CTR',
  visao: 'VIS',
  reflexos: 'REF',
  posicionamento: 'POS',
};
const ATTRS_BY_POSITION: Record<Character['position'], AttributeKey[]> = {
  ATA: ['finalizacao', 'velocidade', 'drible', 'controle', 'passe', 'fisico'],
  MEI: ['passe', 'controle', 'drible', 'visao', 'velocidade', 'fisico'],
  ZAG: ['defesa', 'fisico', 'velocidade', 'controle', 'passe', 'drible'],
  GOL: ['reflexos', 'posicionamento', 'defesa', 'fisico', 'controle', 'passe'],
};

const SIZES = { sm: 'w-32', md: 'w-44', lg: 'w-full max-w-[18rem]' } as const;

function barColor(v: number): string {
  if (v >= 85) return 'bg-gold';
  if (v >= 70) return 'bg-neon';
  if (v >= 50) return 'bg-violet';
  return 'bg-slate-500';
}

interface Props {
  character: Character;
  size?: 'sm' | 'md' | 'lg';
  price?: number;
  selected?: boolean;
  dim?: boolean;
  badge?: string;
  onClick?: () => void;
}

export function CharacterCard({ character, size = 'md', price, selected, dim, badge, onClick }: Props) {
  const anime = getAnime(character.animeId);
  const ability = getAbility(character.abilityId);
  const special = character.rarity === 'LENDARIO' || character.rarity === 'MITICO';
  const label = `${character.name}, ${anime.name}, ${RARITY_LABEL[character.rarity]}, ${POSITION_LABEL[character.position]}, overall ${character.ovr}`;

  const body = (
    <div className={`card-frame rarity-${character.rarity} ${SIZES[size]} ${dim ? 'opacity-50' : ''} ${selected ? 'ring-2 ring-neon ring-offset-2 ring-offset-ink-900' : ''}`}>
      <div className={`card-body ${special ? 'shine' : ''} text-left`}>
        {special && (
          <>
            <span className="sparkle" style={{ left: '14%', top: '22%', animationDelay: '0s' }} aria-hidden="true" />
            <span className="sparkle" style={{ left: '82%', top: '14%', animationDelay: '0.9s' }} aria-hidden="true" />
            <span className="sparkle" style={{ left: '70%', top: '46%', animationDelay: '1.7s' }} aria-hidden="true" />
          </>
        )}
        <div className="relative aspect-[5/4] overflow-hidden">
          <CharacterAvatar character={character} className="h-full w-full" />
          <div className="absolute left-2 top-2 rounded-lg bg-black/55 px-2 py-1 text-center backdrop-blur">
            <div className={`font-display font-black leading-none ${size === 'sm' ? 'text-lg' : 'text-2xl'} text-white`}>{character.ovr}</div>
            <div className="text-[10px] font-bold tracking-widest text-neon">{character.position}</div>
          </div>
          <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold backdrop-blur">{RARITY_LABEL[character.rarity]}</div>
          {badge && <div className="absolute bottom-2 left-2 rounded bg-neon px-2 py-0.5 text-[10px] font-black text-ink-950">{badge}</div>}
          {price !== undefined && <div className="absolute bottom-2 right-2 rounded bg-gold px-2 py-0.5 text-xs font-black text-ink-950">{price} M</div>}
        </div>
        <div className="space-y-1.5 p-2.5">
          <div>
            <h3 className={`font-display font-black leading-tight text-white ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{character.name}</h3>
            <p className="text-[11px] font-semibold" style={{ color: anime.color }}>
              {anime.name}
            </p>
          </div>
          {size !== 'sm' && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Atributos">
              {ATTRS_BY_POSITION[character.position].slice(0, size === 'lg' ? 6 : 4).map((key) => {
                const value = character.attributes[key];
                return (
                  <li key={key} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-7 font-bold text-mist">{ATTR_LABEL[key]}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50" aria-hidden="true">
                      <span className={`block h-full ${barColor(value)}`} style={{ width: `${value}%` }} />
                    </span>
                    <span className="w-6 text-right font-black tabular-nums text-white">{value}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {size !== 'sm' && (
            <p className="rounded-md bg-black/35 px-2 py-1 text-[11px] leading-snug text-amber-100">
              <span className="font-black text-gold">★ {ability.name}</span>
              {size === 'lg' && <span className="block text-mist">{ability.description}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (!onClick) return <article aria-label={label}>{body}</article>;
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={selected} className="block rounded-2xl text-left transition-transform hover:-translate-y-0.5">
      {body}
    </button>
  );
}
