import { useEffect, useState } from 'react';
import { cloudConfigured, getBackend, resetBackend } from './lib/backend.ts';
import type { AuthUser, Backend } from './lib/backend.ts';
import { go, useRoute } from './lib/router.ts';
import { queryClient } from './lib/queries.ts';
import { Spinner, Toasts } from './components/ui.tsx';
import { Login } from './screens/Login.tsx';
import { Games } from './screens/Games.tsx';
import { NewGame } from './screens/NewGame.tsx';
import { GameShell } from './screens/GameShell.tsx';
import { HelpPage } from './screens/Ajuda.tsx';

function readDemoPref(): boolean {
  try {
    return localStorage.getItem('ptm.demo') === '1';
  } catch {
    return false;
  }
}

export function setDemoPref(v: boolean): void {
  try {
    if (v) localStorage.setItem('ptm.demo', '1');
    else localStorage.removeItem('ptm.demo');
  } catch {
    // ignora
  }
}

export function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const route = useRoute();

  useEffect(() => {
    let unsub = () => undefined as void;
    (async () => {
      const b = await getBackend(readDemoPref() || !cloudConfigured());
      setBackend(b);
      setUser(await b.getUser());
      unsub = b.onAuth((u) => {
        setUser(u);
        if (!u) queryClient.clear();
      });
      setReady(true);
    })();
    return () => unsub();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.era = document.documentElement.dataset.era || 'now';
  }, []);

  const switchMode = async (demo: boolean) => {
    setDemoPref(demo);
    resetBackend();
    queryClient.clear();
    setReady(false);
    const b = await getBackend(demo);
    setBackend(b);
    setUser(await b.getUser());
    setReady(true);
    go('/');
  };

  if (!ready || !backend) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  let page;
  const [root, id, screen] = route.path;
  if (!user) page = <Login backend={backend} onDemo={() => switchMode(true)} />;
  else if (root === 'novo') page = <NewGame />;
  else if (root === 'ajuda') page = <HelpPage />;
  else if (root === 'g' && id) page = <GameShell gameId={id} screen={screen ?? 'boletim'} />;
  else page = <Games backend={backend} user={user} onSwitchMode={switchMode} />;

  return (
    <>
      {page}
      <Toasts />
    </>
  );
}
