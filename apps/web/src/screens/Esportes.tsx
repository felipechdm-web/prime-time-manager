// Central de Esportes (v2, seção 20.1): competições, tabela, próximos jogos com projeção de audiência por praça,
// cotas vendidas; escolher os jogos de cada rodada, definir a equipe e abrir o modo ao vivo.

import { useMemo, useState } from 'react';
import { computeDay } from '@engine/audience.ts';
import { MARKETS } from '@engine/catalog/markets.ts';
import { applyIntent } from '@engine/intents.ts';
import type { Intent } from '@engine/intents.ts';
import { fixtureByCode, matchTitle, seasonAt, seasonFixtures, standings, teamName } from '@engine/sports.ts';
import type { Fixture } from '@engine/sports.ts';
import { playerPickUnits, sportsProgramIds } from '@engine/sportsTv.ts';
import { DAY_SHORT, formatDate, slotLabel } from '@engine/time.ts';
import type { GameState } from '@engine/types.ts';
import { queryClient, setGameState, useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Button, Card, Empty, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

const selectClass = 'w-full rounded-theme border border-border bg-surface-2 px-2 py-1.5 text-sm disabled:opacity-60';

export function Esportes({ gameId, state }: ScreenProps) {
  const ps = state.stations.find((s) => s.isPlayer)!;
  const toast = useUI((s) => s.toast);
  const setLiveDay = useUI((s) => s.setLiveDay);
  const { run, busy } = useAction(gameId);
  const sp = state.catalog?.sports;
  const comps = sp?.competitions ?? [];
  const mine = (state.rightsContracts ?? []).filter((c) => c.sport && c.stationId === ps.id && c.status === 'ativo');
  const [compId, setCompId] = useState<string>(() => mine[0]?.sport?.comp ?? comps.find((c) => c.id === 'brasileirao_a')?.id ?? comps[0]?.id ?? '');
  const units = useMemo(() => playerPickUnits(state), [state]);
  const windows = (state.sports?.windowsWeek === state.meta.weekIndex ? state.sports.windows ?? [] : []).filter((w) => w.station === ps.id);
  const era = state.meta.era;

  // projeção por praça das transmissões que ainda vão ao ar (mesmo motor, sem ruído)
  const projections = useMemo(() => {
    const out = new Map<string, { code: string; pts: number; share: number }[]>();
    const byDay = new Map<number, ReturnType<typeof computeDay>>();
    for (const w of windows) {
      if (w.skipped || w.day < state.weekProgress.day) continue;
      const res = byDay.get(w.day) ?? computeDay(state, w.day, { carry: null, noNoise: true });
      byDay.set(w.day, res);
      const c = res.stationIds.indexOf(ps.id);
      const f = fixtureByCode(state, w.main);
      const len = f?.slots ?? 8;
      // só as praças que recebem o jogo (nas outras a emissora segue a grade normal)
      out.set(w.main, MARKETS.map((m, i) => {
        if (!w.byMarket[i]) return null;
        let pts = 0;
        let tle = 0;
        for (let k = w.start; k < Math.min(96, w.start + len); k++) { pts += res.marketPts[i][c][k]; tle += res.marketTle[i][k]; }
        return { code: m.code, pts: pts / len, share: tle > 0 ? (pts / tle) * 100 : 0 };
      }).filter((x): x is { code: string; pts: number; share: number } => !!x).sort((a, b) => b.pts - a.pts));
    }
    return out;
  }, [state]);

  const doIntent = async (intent: Intent) => {
    const local: GameState = structuredClone(state);
    const r = applyIntent(local, intent);
    if (!r.ok) {
      toast('error', r.message);
      return;
    }
    setGameState(gameId, local);
    const res = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent });
    if (!res || !res.result.ok) {
      if (res) toast('error', res.result.message);
      await queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    } else toast('success', r.message);
  };

  if (!state.sports || !sp) return <div className="p-4 lg:p-6"><Empty title="Sem esporte real nesta partida">A Central de Esportes aparece nas partidas do Brasil real criadas com competições aprovadas no Editor de Catálogo.</Empty></div>;

  const comp = comps.find((c) => c.id === compId) ?? comps[0];
  const season = seasonAt(state, comp.id, state.meta.date);
  const fixtures = seasonFixtures(state, comp.id, season);
  const done = state.sports.done[`${comp.id}|${season}`];
  const stationShort = (id: string) => state.stations.find((s) => s.id === id)?.short ?? '';
  const cotas = state.deals.filter((d) => d.contractId && d.status === 'active' && d.endWeek >= state.meta.weekIndex);
  const live = state.liveMoments.filter((m) => m.sport && m.day === state.weekProgress.day);

  return (
    <div className="space-y-4 p-3 lg:p-6">
      <header>
        <h1 className="text-xl font-black sm:text-2xl">⚽ Central de Esportes</h1>
        <p className="text-sm text-muted">Direitos da {ps.name}, transmissões da semana, tabelas e cotas. Audiência projetada é estimativa do jogo, não medição oficial.</p>
      </header>

      <Card title="Transmissões desta semana">
        {windows.length === 0 ? <p className="text-sm text-muted">Nenhum jogo seu nesta semana.</p> : (
          <div className="space-y-2">
            {windows.map((w) => {
              const f = fixtureByCode(state, w.main);
              const proj = projections.get(w.main);
              const regional = new Set(w.byMarket.filter(Boolean)).size > 1;
              const past = w.day < state.weekProgress.day;
              const isLive = live.some((m) => m.programId === sportsProgramIds(ps.id, w.main).match);
              return (
                <div key={`${w.date}-${w.start}`} className="rounded-theme bg-surface-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-bold">{DAY_SHORT[w.day]} {slotLabel(w.start)}</span>
                    <span className="min-w-0 flex-1 font-semibold">{f ? matchTitle(state, f) : w.main}</span>
                    {w.skipped && <Badge tone="warn">sem transmissão</Badge>}
                    {past && !w.skipped && <Badge>{f?.score ? `${f.score[0]} x ${f.score[1]}` : 'no ar'}</Badge>}
                    {isLive && <Button size="sm" variant="primary" onClick={() => setLiveDay(w.day)}>🎬 Abrir ao vivo</Button>}
                  </div>
                  {regional && <div className="mt-1 text-xs text-muted">Transmissão regionalizada: {MARKETS.map((m, i) => w.byMarket[i] ? `${m.code} ${teamName(state, fixtureByCode(state, w.byMarket[i])?.home ?? '')}` : null).filter(Boolean).slice(0, 6).join(' · ')}</div>}
                  {proj && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <Tip text="Projeção do motor para a sua emissora nas praças, durante o jogo (pontos e share). Muda se a grade dos rivais mudar.">Projeção:</Tip>
                      {proj.slice(0, 6).map((p) => <span key={p.code} className="rounded bg-surface-3 px-1.5 py-0.5 tabular">{p.code} {fmtPts(p.pts)} pts · {fmtPts(p.share, 0)}%</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {units.length > 0 && (
        <Card title={<Tip text="Quem tem 1ª escolha escolhe antes. Abrir mão de um jogo conta contra a obrigação mínima de 80% do contrato.">Escolha dos jogos por rodada</Tip>}>
          <div className="grid gap-2 md:grid-cols-2">
            {units.map((u) => (
              <label key={`${u.contractId}|${u.unit}`} className="space-y-1 rounded-theme bg-surface-2 p-3 text-sm">
                <span className="block font-semibold">{u.label}</span>
                <select
                  className={selectClass}
                  disabled={u.locked || busy}
                  value={u.skipped ? '' : u.chosen ?? ''}
                  onChange={(e) => void doIntent({ type: 'sports_pick', contractId: u.contractId, unit: u.unit, code: e.target.value || null })}
                >
                  {u.chosen && !u.options.some((o) => o.code === u.chosen) && <option value={u.chosen}>{fixtureByCode(state, u.chosen) ? matchTitle(state, fixtureByCode(state, u.chosen)!) : u.chosen}</option>}
                  {u.options.map((o) => <option key={o.code} value={o.code}>{o.title} · {formatDate(o.date).slice(0, 5)} {o.time} · interesse {fmtPts(o.projected)}</option>)}
                  <option value="">Não transmitir</option>
                </select>
                {u.locked && <span className="text-xs text-muted">Já foi ao ar.</span>}
              </label>
            ))}
          </div>
        </Card>
      )}

      {mine.length > 0 && (
        <Card title={<Tip text="Equipe no estádio é o padrão. Narração do estúdio custa 35% menos por jogo, mas a transmissão perde qualidade. Contratos com exclusividade exigem equipe própria no local.">Equipe de transmissão</Tip>}>
          <div className="grid gap-2 md:grid-cols-2">
            {mine.map((c) => (
              <label key={c.id} className="space-y-1 rounded-theme bg-surface-2 p-3 text-sm">
                <span className="block font-semibold">{c.label}</span>
                <select className={selectClass} disabled={busy || c.sport!.crewRequired} value={c.sport!.crew ?? 'local'} onChange={(e) => void doIntent({ type: 'sports_crew', contractId: c.id, crew: e.target.value === 'estudio' ? 'estudio' : 'local' })}>
                  <option value="local">Equipe completa no estádio</option>
                  <option value="estudio">Narração do estúdio (mais barata)</option>
                </select>
                {c.sport!.crewRequired && <span className="text-xs text-muted">O contrato exige equipe própria no local.</span>}
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card title="Competições">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {comps.map((c) => {
            const own = mine.some((x) => x.sport!.comp === c.id);
            return (
              <button key={c.id} onClick={() => setCompId(c.id)} className={`rounded-theme px-2.5 py-1 text-xs font-semibold ${c.id === comp.id ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-muted'}`}>
                {own ? '★ ' : ''}{c.name}
              </button>
            );
          })}
        </div>
        <CompetitionView state={state} fixtures={fixtures} compKind={comp.kind} done={done} season={season} stationShort={stationShort} />
      </Card>

      <Card title="Cotas esportivas vendidas">
        {cotas.length === 0 ? <p className="text-sm text-muted">Nenhuma cota esportiva ativa. O comercial vende as cotas na primeira transmissão de cada temporada.</p> : (
          <div className="space-y-1.5">
            {cotas.map((d) => (
              <div key={d.id} className="flex flex-wrap justify-between gap-2 rounded-theme bg-surface-2 px-3 py-1.5 text-sm">
                <span>{d.advertiser}</span>
                <span className="tabular text-muted">{moneyEra(era, d.weeklyValue)}/semana até a semana {d.endWeek + 1}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CompetitionView({ state, fixtures, compKind, done, season, stationShort }: { state: GameState; fixtures: Fixture[]; compKind: string; done?: { champion: string | null; runnerUp: string | null; table?: string[] }; season: string; stationShort: (id: string) => string }) {
  if (done && !fixtures.length) {
    return (
      <div className="space-y-2 text-sm">
        <p>Temporada {season} encerrada{done.champion ? <>: <b>{teamName(state, done.champion)}</b> campeão{done.runnerUp ? `, ${teamName(state, done.runnerUp)} vice` : ''}.</> : '.'}</p>
        {done.table && <ol className="grid list-decimal gap-x-6 pl-5 text-xs sm:grid-cols-2">{done.table.map((t) => <li key={t}>{teamName(state, t)}</li>)}</ol>}
      </div>
    );
  }
  if (!fixtures.length) return <p className="text-sm text-muted">Sem jogos nesta temporada.</p>;
  const today = state.meta.date;
  const next = fixtures.filter((f) => !f.score && f.date >= today).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 10);
  const last = fixtures.filter((f) => f.score).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 10);
  const leaguePhase = fixtures.filter((f) => ['liga', 'primeira'].includes(f.phase));
  const groupPhase = fixtures.filter((f) => f.phase === 'grupos' && f.group !== undefined);
  const groups = [...new Set(groupPhase.map((f) => f.group!))].sort((a, b) => a - b);
  const tableOf = (list: Fixture[]) => standings(list, [...new Set(list.flatMap((f) => [f.home, f.away!]))]);
  const showGroups = groups.filter((g) => groupPhase.some((f) => f.group === g && !f.home.startsWith('generico:') || f.group === g && !(f.away ?? '').startsWith('generico:'))).slice(0, 4);
  const line = (f: Fixture) => (
    <div key={f.code} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1 text-xs">
      <span className="tabular text-muted">{formatDate(f.date).slice(0, 5)} {f.time}</span>
      <span className="min-w-0 flex-1">{f.away ? `${teamName(state, f.home)} ${f.score ? `${f.score[0]} x ${f.score[1]}` : 'x'} ${teamName(state, f.away)}` : f.label}{f.score && f.score.length >= 4 && f.score[2] >= 0 ? ` (pên. ${f.score[2]} x ${f.score[3]})` : ''}</span>
      <span className="text-muted">{f.phaseName}{['liga', 'primeira', 'grupos'].includes(f.phase) ? ` ${f.round}` : ''}{f.change ? ` · ${f.change.kind === 'adiado' ? 'adiado' : 'novo horário'}` : ''}</span>
      {(state.sports!.picks[f.code] ?? []).map((sid) => <Badge key={sid} tone="accent">{stationShort(sid)}</Badge>)}
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {compKind !== 'gp' && leaguePhase.length > 0 && <Table title="Classificação" rows={tableOf(leaguePhase)} state={state} />}
        {showGroups.map((g) => <Table key={g} title={`Grupo ${String.fromCharCode(65 + g)}`} rows={tableOf(groupPhase.filter((f) => f.group === g))} state={state} />)}
        {compKind === 'gp' && <p className="text-xs text-muted">Fórmula 1: só as datas e as transmissões (sem pilotos no jogo).</p>}
      </div>
      <div className="space-y-3">
        <div className="space-y-1"><h3 className="text-xs font-bold uppercase tracking-wide text-muted">Próximos jogos</h3>{next.length ? next.map(line) : <p className="text-xs text-muted">—</p>}</div>
        <div className="space-y-1"><h3 className="text-xs font-bold uppercase tracking-wide text-muted">Últimos resultados</h3>{last.length ? last.map(line) : <p className="text-xs text-muted">—</p>}</div>
      </div>
    </div>
  );
}

function Table({ title, rows, state }: { title: string; rows: ReturnType<typeof standings>; state: GameState }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <table className="w-full text-xs">
        <thead className="text-muted"><tr><th className="text-left">#</th><th className="text-left">Time</th><th>P</th><th>J</th><th>V</th><th>SG</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className="border-t border-border/50">
              <td className="py-0.5">{i + 1}</td>
              <td className="truncate">{teamName(state, r.team)}</td>
              <td className="text-center font-semibold tabular">{r.pts}</td>
              <td className="text-center tabular">{r.w + r.d + r.l}</td>
              <td className="text-center tabular">{r.w}</td>
              <td className="text-center tabular">{r.gf - r.ga}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
