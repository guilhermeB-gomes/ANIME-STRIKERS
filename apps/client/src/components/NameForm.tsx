import { useState, type FormEvent } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { storage } from '../services/storage';
import { useGame } from '../socket/GameProvider';

/** Entrada como convidado: apenas o nome de treinador. Cria uma sessão real no servidor (token assinado). */
export function NameForm({ onDone }: { onDone?: () => void }) {
  const { login } = useGame();
  const [name, setName] = useState(() => storage.getPrefs().lastName);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const invalid = trimmed.length < 2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    const ok = await login(trimmed);
    setBusy(false);
    if (ok) onDone?.();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="panel space-y-3 p-5" aria-labelledby="name-title">
      <h2 id="name-title" className="font-display text-xl font-black">
        Nome de treinador
      </h2>
      <p className="text-sm text-mist">Entre como convidado, sem cadastro. Seu nome aparece para os outros jogadores.</p>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Como devemos te chamar?</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" placeholder="Ex.: Treinador Kaito" aria-describedby="name-help" />
      </label>
      <p id="name-help" className="text-xs text-mist">
        2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.
      </p>
      <button type="submit" className="btn btn-primary w-full" disabled={invalid || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
        Entrar como convidado
      </button>
    </form>
  );
}
