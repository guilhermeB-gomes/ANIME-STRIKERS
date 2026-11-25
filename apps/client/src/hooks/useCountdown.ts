import { useEffect, useState } from 'react';

/** Milissegundos restantes até `endsAt` (relógio do servidor), corrigindo pelo offset medido. Atualiza a cada 100 ms. */
export function useCountdown(endsAt: number | null, clockOffset: number, active = true): number {
  const compute = () => (endsAt === null ? 0 : Math.max(0, endsAt - (Date.now() + clockOffset)));
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    if (!active || endsAt === null) return;
    const id = window.setInterval(() => setRemaining(compute()), 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, clockOffset, active]);
  return remaining;
}
