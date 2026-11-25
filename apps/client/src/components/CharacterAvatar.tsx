import { getAnime, hashString, mulberry32, type Character } from '@strikers/shared';

const SKIN = ['#fde1c8', '#f6c9a3', '#e8b48a', '#c98b63', '#a86a47'];
const HAIR = ['#0f172a', '#1e293b', '#7c2d12', '#facc15', '#f8fafc', '#be123c', '#1d4ed8', '#16a34a'];
const HAIR_PATHS = [
  'M58 92 L50 48 L74 66 L82 30 L100 62 L118 30 L126 66 L150 48 L142 92 Q100 68 58 92Z',
  'M58 98 Q58 46 104 44 Q148 48 142 98 Q122 64 90 74 Q68 80 58 98Z',
  'M54 104 Q48 46 100 42 Q152 46 146 104 L146 146 L130 118 Q100 76 70 118 L54 146Z',
  'M60 92 Q62 50 100 48 Q138 50 140 92 Q100 64 60 92Z',
];

/** Arte ORIGINAL em SVG (gerada por código a partir do id do personagem). Não usa nenhuma imagem oficial. */
export function CharacterAvatar({ character, className = '' }: { character: Character; className?: string }) {
  const anime = getAnime(character.animeId);
  const h = hashString(character.id);
  const rng = mulberry32(h);
  const skin = SKIN[h % SKIN.length] ?? '#f6c9a3';
  const hair = HAIR[(h >> 3) % HAIR.length] ?? '#1e293b';
  const hairPath = HAIR_PATHS[(h >> 6) % HAIR_PATHS.length] ?? '';
  const eye = (h >> 9) % 3;
  const gid = `bg-${character.id}`;
  const lines = Array.from({ length: 7 }, (_, i) => ({ x: Math.round(rng() * 200), w: 2 + Math.round(rng() * 5), o: 0.1 + rng() * 0.18, k: i }));

  return (
    <svg viewBox="0 0 200 240" className={className} role="img" aria-label={`Ilustração de ${character.name}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={anime.color} stopOpacity="0.95" />
          <stop offset="1" stopColor="#0a0f22" />
        </linearGradient>
      </defs>
      <rect width="200" height="240" fill={`url(#${gid})`} />
      {lines.map((l) => (
        <rect key={l.k} x={l.x} y="0" width={l.w} height="240" fill="#fff" opacity={l.o} transform="skewX(-18)" />
      ))}
      <circle cx="100" cy="104" r="70" fill="#fff" opacity="0.08" />
      {/* tronco com camisa do universo */}
      <path d="M36 240 Q40 168 100 156 Q160 168 164 240Z" fill={anime.color} />
      <path d="M36 240 Q40 168 100 156 Q160 168 164 240Z" fill="#000" opacity="0.28" />
      <path d="M84 156 L100 182 L116 156Z" fill="#fff" opacity="0.85" />
      <text x="100" y="226" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" opacity="0.9" fontFamily="Arial Black, sans-serif">
        {character.ovr}
      </text>
      {/* pescoço e cabeça */}
      <rect x="88" y="132" width="24" height="30" rx="8" fill={skin} />
      <rect x="88" y="132" width="24" height="30" rx="8" fill="#000" opacity="0.12" />
      <ellipse cx="100" cy="100" rx="38" ry="42" fill={skin} />
      <path d={hairPath} fill={hair} />
      {/* olhos */}
      {[78, 122].map((cx) => (
        <g key={cx}>
          {eye === 0 && <ellipse cx={cx} cy="104" rx="9" ry="7" fill="#fff" />}
          {eye === 1 && <path d={`M${cx - 10} 106 Q${cx} 94 ${cx + 10} 106 Q${cx} 112 ${cx - 10} 106Z`} fill="#fff" />}
          {eye === 2 && <rect x={cx - 9} y="98" width="18" height="12" rx="5" fill="#fff" />}
          <circle cx={cx} cy="105" r="5" fill={anime.color} />
          <circle cx={cx} cy="105" r="2.4" fill="#0a0f22" />
          <circle cx={cx + 1.8} cy="103" r="1.3" fill="#fff" />
        </g>
      ))}
      <path d="M90 124 Q100 130 110 124" stroke="#7c3f2a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
