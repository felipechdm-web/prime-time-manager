// Roteador por hash (#/g/<id>/grade): funciona no GitHub Pages sem configuração de servidor.

import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  return { path: p ? p.split('/').filter(Boolean) : [], query: new URLSearchParams(q ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const h = () => setRoute(parse());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}

export function go(path: string): void {
  const target = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function gamePath(gameId: string, screen: string, extra = ''): string {
  return `g/${gameId}/${screen}${extra ? `/${extra}` : ''}`;
}
