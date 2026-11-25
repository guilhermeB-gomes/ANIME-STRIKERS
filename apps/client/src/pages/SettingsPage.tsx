import { useNavigate } from 'react-router-dom';
import { usePrefs } from '../hooks/usePrefs';
import { useGame } from '../socket/GameProvider';

export function SettingsPage() {
  const [prefs, update] = usePrefs();
  const { session, logout, room } = useGame();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-4">
      <h1 className="font-display text-3xl font-black">Configurações</h1>

      <section className="panel space-y-3 p-5" aria-labelledby="motion-title">
        <h2 id="motion-title" className="font-display text-lg font-black">
          Acessibilidade e desempenho
        </h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-cyan-400" checked={prefs.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
          <span>
            <span className="block font-bold">Reduzir animações</span>
            <span className="text-sm text-mist">Desliga brilhos, partículas e bordas animadas das cartas. O sistema também respeita a preferência de movimento reduzido do seu aparelho.</span>
          </span>
        </label>
      </section>

      <section className="panel space-y-3 p-5" aria-labelledby="session-title">
        <h2 id="session-title" className="font-display text-lg font-black">
          Sessão de convidado
        </h2>
        {session ? (
          <>
            <p className="text-sm text-mist">
              Você está jogando como <b className="text-white">{session.name}</b>. A identidade fica neste navegador; o estado do jogo fica no servidor.
            </p>
            <button
              type="button"
              className="btn btn-danger"
              disabled={room !== null && room.status !== 'FINISHED'}
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Sair e trocar de treinador
            </button>
            {room && room.status !== 'FINISHED' && <p className="text-xs text-amber-200">Saia da partida em andamento antes de trocar de treinador.</p>}
          </>
        ) : (
          <p className="text-sm text-mist">Você ainda não entrou. Volte ao início e escolha um nome de treinador.</p>
        )}
      </section>

      <section className="panel p-5 text-sm text-mist" aria-labelledby="about-title">
        <h2 id="about-title" className="mb-2 font-display text-lg font-black text-white">
          Sobre
        </h2>
        <p>ANIME STRIKERS versão {__APP_VERSION__}. Fan game não oficial, sem afiliação com as franquias citadas. Os nomes pertencem aos seus respectivos detentores; as ilustrações são arte original gerada por código.</p>
      </section>
    </div>
  );
}
