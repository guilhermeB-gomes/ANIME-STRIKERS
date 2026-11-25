import { useCountdown } from '../hooks/useCountdown';

interface Props {
  endsAt: number;
  clockOffset: number;
  totalMs: number;
  active: boolean;
}

/** Cronômetro do leilão. O tempo vem do relógio do servidor (endsAt), nunca de um contador local. */
export function Countdown({ endsAt, clockOffset, totalMs, active }: Props) {
  const remaining = useCountdown(endsAt, clockOffset, active);
  const seconds = remaining / 1000;
  const urgent = active && seconds <= 3;
  const shown = seconds >= 10 ? Math.ceil(seconds).toString() : seconds.toFixed(1);
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  return (
    <div className="w-full" role="timer" aria-label={active ? `Tempo restante: ${Math.ceil(seconds)} segundos` : 'Leilão encerrado'}>
      <div className={`font-display text-5xl font-black tabular-nums ${urgent ? 'text-rose-400' : 'text-white'}`}>
        {active ? shown : '0.0'}
        <span className="ml-1 text-xl text-mist">s</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/50" aria-hidden="true">
        <div className={`h-full rounded-full transition-[width] duration-100 ${urgent ? 'bg-rose-500' : 'bg-gradient-to-r from-neon to-magenta'}`} style={{ width: `${active ? pct : 0}%` }} />
      </div>
    </div>
  );
}
