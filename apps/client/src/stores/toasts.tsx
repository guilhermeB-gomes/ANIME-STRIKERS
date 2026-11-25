import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;
const COLORS: Record<ToastKind, string> = {
  info: 'border-neon/60 text-cyan-100',
  success: 'border-emerald-400/70 text-emerald-100',
  warning: 'border-gold/70 text-amber-100',
  error: 'border-rose-400/70 text-rose-100',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-1), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3" role="region" aria-label="Notificações" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto pop-in flex w-full max-w-md items-start gap-3 rounded-xl border bg-ink-800/95 px-3 py-2 shadow-xl backdrop-blur ${COLORS[t.kind]}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button type="button" aria-label="Fechar notificação" className="rounded p-1 text-mist hover:text-white" onClick={() => dismiss(t.id)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
