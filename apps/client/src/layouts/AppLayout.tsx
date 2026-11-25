import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { HelpCircle, Settings } from 'lucide-react';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Logo } from '../components/Logo';
import { applyMotionPreference } from '../hooks/usePrefs';
import { useGame } from '../socket/GameProvider';
import { storage } from '../services/storage';

export function AppLayout() {
  const { connection, session } = useGame();
  const { pathname } = useLocation();

  useEffect(() => applyMotionPreference(storage.getPrefs().reduceMotion), []);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-neon focus:px-3 focus:py-2 focus:text-ink-950">
        Pular para o conteúdo
      </a>
      <ConnectionBanner status={connection} />
      {pathname !== '/' && (
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="Voltar ao início">
            <Logo size="sm" />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-2 text-sm">
            {session && <span className="hidden rounded-full border border-line px-3 py-1 font-semibold text-mist sm:inline">Treinador: {session.name}</span>}
            <Link to="/como-jogar" className="btn btn-ghost !min-h-10 !px-3" aria-label="Como jogar">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Como jogar</span>
            </Link>
            <Link to="/configuracoes" className="btn btn-ghost !min-h-10 !px-3" aria-label="Configurações">
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>
      )}
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10">
        <Outlet />
      </main>
      <footer className="border-t border-line/60 px-4 py-4 text-center text-xs text-mist">
        ANIME STRIKERS v{__APP_VERSION__} · Fan game não oficial, sem fins lucrativos e sem afiliação com as franquias citadas. Todas as ilustrações são arte original gerada por código.
      </footer>
    </div>
  );
}
