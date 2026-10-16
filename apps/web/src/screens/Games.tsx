import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ERAS } from '@engine/catalog/eras.ts';
import { SCENARIOS } from '@engine/setup.ts';
import { formatDate } from '@engine/time.ts';
import type { EraId } from '@engine/types.ts';
import { cloudConfigured } from '../lib/backend.ts';
import type { AuthUser, Backend } from '../lib/backend.ts';
import { go } from '../lib/router.ts';
import { queryClient } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { relativeTime } from '../lib/format.ts';
import { Badge, Button, Empty, Modal, Spinner } from '../components/ui.tsx';

const STATUS: Record<string, { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral' }> = {
  active: { label: 'Em andamento', tone: 'good' },
  fired: { label: 'Demitido', tone: 'bad' },
  retired: { label: 'Carreira encerrada', tone: 'neutral' },
  promoted: { label: 'Promovido', tone: 'good' },
};

export function Games({ backend, user, onSwitchMode }: { backend: Backend; user: AuthUser; onSwitchMode: (demo: boolean) => void }) {
  const toast = useUI((s) => s.toast);
  const games = useQuery({ queryKey: ['games'], queryFn: () => backend.listGames() });
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  document.documentElement.dataset.era = 'now';

  const confirmDelete = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await backend.deleteGame(del);
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      toast('success', 'Partida apagada.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setDel(null);
    }
  };

  return (
    <div className="mx-auto min-h-full max-w-4xl px-4 pb-16 pt-6 safe-top">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">Prime Time Manager</h1>
          <p className="text-sm text-muted">
            {backend.mode === 'demo' ? 'Modo demonstração: tudo fica neste navegador, sem IA.' : `Conectado como ${user.email ?? 'jogador'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => go('ajuda')}>Como jogar</Button>
          {backend.mode === 'cloud' && <Button variant="ghost" size="sm" onClick={() => go('catalogo')}>Editor de Catálogo</Button>}
          {backend.mode === 'demo' && cloudConfigured() && <Button size="sm" onClick={() => onSwitchMode(false)}>Usar modo nuvem</Button>}
          {backend.mode === 'cloud' && <Button size="sm" variant="ghost" onClick={() => onSwitchMode(true)}>Modo demonstração</Button>}
          {backend.mode === 'cloud' && <Button size="sm" onClick={() => backend.signOut()}>Sair</Button>}
        </div>
      </header>

      {!cloudConfigured() && (
        <div className="mb-5 rounded-theme border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-semibold text-warn">Supabase ainda não configurado</p>
          <p className="mt-1 text-muted">
            Você está jogando no modo demonstração (o motor roda no navegador, sem o Mestre de IA e sem salvar na nuvem). Para ativar o modo completo, siga o <b>TUTORIAL.md</b>: crie o projeto no Supabase, publique as funções e cadastre as variáveis no GitHub.
          </p>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Suas partidas</h2>
        <Button variant="primary" onClick={() => go('novo')}>+ Nova partida</Button>
      </div>

      {games.isLoading ? (
        <div className="flex justify-center p-8 text-muted"><Spinner /></div>
      ) : games.error ? (
        <Empty title="Não foi possível carregar as partidas">{String((games.error as Error).message)}</Empty>
      ) : !games.data?.length ? (
        <Empty title="Nenhuma partida ainda">Comece pela entrevista de contratação: escolha universo, emissora e cenário. Toda partida começa em janeiro de 2026.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {games.data.map((g) => {
            const era = ERAS[g.era_id as EraId];
            const st = STATUS[g.status] ?? STATUS.active;
            return (
              <div key={g.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold">{g.station_name}</div>
                    <div className="text-xs text-muted">
                      {era?.name ?? g.era_id} · {SCENARIOS[g.scenario as keyof typeof SCENARIOS]?.name ?? g.scenario} · {g.difficulty === 'estagiario' ? 'Estagiário' : g.difficulty === 'lenda' ? 'Lenda da TV' : 'Diretor'}
                    </div>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <div className="text-sm text-muted">
                  {g.player?.name ? `${g.player.name} · ` : ''}semana de {formatDate(g.game_date)} · {relativeTime(g.updated_at)}
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" onClick={() => go(`g/${g.id}/boletim`)}>{g.status === 'active' ? 'Continuar' : 'Ver carreira'}</Button>
                  <Button variant="ghost" onClick={() => setDel(g.id)} title="Apagar partida">🗑</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title="Apagar partida?"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDel(null)}>Cancelar</Button>
            <Button variant="danger" busy={busy} onClick={confirmDelete}>Apagar de vez</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Isso apaga a partida e todo o histórico (boletins, mensagens, reuniões). Não dá para desfazer.</p>
      </Modal>
    </div>
  );
}
