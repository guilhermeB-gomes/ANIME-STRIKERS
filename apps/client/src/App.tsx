import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/HomePage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { JoinByLinkPage } from './pages/JoinByLinkPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RoomPage } from './pages/RoomPage';
import { SettingsPage } from './pages/SettingsPage';
import { GameProvider } from './socket/GameProvider';
import { ToastProvider } from './stores/toasts';

export function App() {
  return (
    <ToastProvider>
      <GameProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="sala" element={<RoomPage />} />
            <Route path="entrar/:code" element={<JoinByLinkPage />} />
            <Route path="como-jogar" element={<HowToPlayPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </GameProvider>
    </ToastProvider>
  );
}
