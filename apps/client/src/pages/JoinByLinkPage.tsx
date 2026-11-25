import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { NameForm } from '../components/NameForm';
import { useGame } from '../socket/GameProvider';

/** Link de convite: /entrar/ABCDE. Pede o nome (se necessário) e entra na sala automaticamente. */
export function JoinByLinkPage() {
  const { code = '' } = useParams();
  const { session, connection, joinRoom } = useGame();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!session || connection !== 'connected' || attempted.current) return;
    attempted.current = true;
    void joinRoom(code.toUpperCase()).then((res) => {
      if (res.ok) navigate('/sala', { replace: true });
      else setError(res.error.message);
    });
  }, [session, connection, code, joinRoom, navigate]);

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-6">
        <h1 className="font-display text-2xl font-black">Convite para a sala {code.toUpperCase()}</h1>
        <NameForm />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center" role="alert">
        <h1 className="font-display text-2xl font-black">Não foi possível entrar</h1>
        <p className="text-rose-200">{error}</p>
        <Link to="/" className="btn btn-primary">
          Voltar ao início
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-3 pt-16 text-mist" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Entrando na sala {code.toUpperCase()}…
    </div>
  );
}
