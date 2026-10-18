// Mercado de Direitos, Mesa de Negociação e Contratos (v2, seções 8B e 20.1).
// A IA conversa, o motor decide: a tela mostra só o que é público (proposta na mesa, paciência, histórico).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GENRES } from '@engine/catalog/genres.ts';
import { ARGUMENT_TAGS } from '@engine/negotiation.ts';
import type { NegPublic } from '@engine/negotiation.ts';
import { applyIntent } from '@engine/intents.ts';
import type { Intent } from '@engine/intents.ts';
import { sublicenseQuote } from '@engine/sportsTv.ts';
import { formatDate } from '@engine/time.ts';
import type { BandId, GameState, GenreId, RightsContract, TermSheet } from '@engine/types.ts';
import { NEG_AGENDA_COST } from '@game/negotiationHandlers.ts';
import { backendSync } from '../lib/backend.ts';
import { invalidateGameData, queryClient, setGameState, useAction, useRows } from '../lib/queries.ts';
import { go, useRoute } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { moneyEra, fmtPts } from '../lib/format.ts';
import { Badge, Bar, Button, Card, Empty, Field, GenreChip, inputClass, Modal, Spinner, Tabs, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

// ===== tipos das respostas =====
interface BrowseTitle { id: string; titleBr: string; kind: string; genre: GenreId; country: string | null; year: number | null; episodes: number | null; reference: number; locked: string | null; owned: boolean; negotiation: { id: string; status: string } | null; brStations: string[] }
interface BrowseHolder { id: string; name: string; category: string | null; representative: { nome: string; cargo: string } | null; relation: number; distrust: boolean; titles: BrowseTitle[] }
interface Dossier { faixa: BandId; pontosProjetados: [number, number]; receitaPorExibicao: number; exibicoes: number; receitaPotencial: number }
interface BrowseResp { available: boolean; reason?: string; agendaPoints?: number; cost?: number; holders?: BrowseHolder[]; dossier?: Dossier | null }
interface Narr { speaker: string; text: string }
interface NegRow { id: string; product_ref: string; rights_holder_id: string; status: string; round: number; public_state: NegPublic; updated_at?: string; created_at?: string }
interface RoundRow { id: number; round: number; player_text: string | null; player_offer: TermSheet | null; argument_tags: string[]; engine_decision: { type?: string; reasons?: string[]; final?: boolean; bluff?: string | null } | null; holder_counter: TermSheet | null; holder_text: Narr[] | null }

const CATEGORY: Record<string, string> = {
  novela_latina: 'Novelas latinas', novela_turca: 'Novelas turcas', asiatico: 'Ásia', estudio_eua: 'Estúdios americanos', formato: 'Formatos e realities',
  produtora_br: 'Produtoras brasileiras', infantil: 'Infantil', emissora: 'Emissora',
};
const KIND: Record<string, string> = { novela: 'Novela', serie: 'Série', minisserie: 'Minissérie', filme: 'Filme', pacote_filmes: 'Pacote de filmes', desenho: 'Desenho', documentario: 'Documentário', formato: 'Formato', reality: 'Reality' };
const BANDS: { id: BandId; label: string }[] = [
  { id: 'nobre', label: 'Nobre (20h–22h30)' }, { id: 'pre_nobre', label: 'Pré-nobre (18h–20h)' }, { id: 'pos_nobre', label: 'Pós-nobre (22h30–0h)' },
  { id: 'meio_dia', label: 'Meio-dia' }, { id: 'vespertino', label: 'Tarde' }, { id: 'manha', label: 'Manhã' }, { id: 'manha_cedo', label: 'Manhã cedo' }, { id: 'madrugada', label: 'Madrugada' },
];
const DECISION: Record<string, { label: string; tone: 'good' | 'bad' | 'warn' | 'accent' | 'neutral' }> = {
  abertura: { label: 'abertura', tone: 'neutral' }, contraproposta: { label: 'contraproposta', tone: 'warn' }, recusa: { label: 'recusa', tone: 'bad' },
  aceite: { label: 'acordo', tone: 'good' }, fim: { label: 'sem acordo', tone: 'bad' }, pausa: { label: 'vamos pensar', tone: 'accent' }, levantou: { label: 'levantou da mesa', tone: 'bad' },
};
const STATUS: Record<string, { label: string; tone: 'good' | 'bad' | 'warn' | 'accent' | 'neutral' }> = {
  aberta: { label: 'em andamento', tone: 'accent' }, pausada: { label: 'pensando', tone: 'warn' }, fechada: { label: 'acordo', tone: 'good' }, fracassada: { label: 'sem acordo', tone: 'bad' },
};

function termsLine(era: ScreenProps['state']['meta']['era'], t: TermSheet): string {
  const band = BANDS.find((b) => b.id === t.faixa)?.label.split(' (')[0] ?? t.faixa;
  return `${moneyEra(era, t.valor)} · ${t.parcelas === 1 ? 'à vista' : `${t.parcelas} parcelas`} · ${t.anos} ano${t.anos > 1 ? 's' : ''} · ${t.exibicoes} exibições · ${t.exclusividade} · ${t.plataformas === 'tv_aberta_streaming' ? 'TV aberta + streaming' : 'TV aberta'} · ${band}${t.preferencia_renovacao ? ' · preferência de renovação' : ''}`;
}

// ===== tela =====
export function Direitos({ gameId, state }: ScreenProps) {
  const route = useRoute();
  const neg = route.query.get('neg');
  const titleParam = route.query.get('title');
  const tabParam = route.query.get('tab') as 'mercado' | 'negociacoes' | 'contratos' | null;
  const [tab, setTab] = useState<'mercado' | 'negociacoes' | 'contratos'>(tabParam ?? 'mercado');
  // links diretos (?title= vem do Acervo; ?tab= de outras telas) escolhem a aba
  useEffect(() => {
    if (titleParam) setTab('mercado');
    else if (tabParam) setTab(tabParam);
  }, [titleParam, tabParam]);
  if (neg) return <Mesa key={neg} gameId={gameId} state={state} negotiationId={neg} />;
  const ownContracts = (state.rightsContracts ?? []).filter((c) => c.stationId === state.meta.playerStationId);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-black sm:text-2xl">Mercado de Direitos</h1>
        <p className="text-sm text-muted">Reuniões de negócios com os donos dos títulos reais. Cada reunião custa {NEG_AGENDA_COST} pontos de agenda (você tem {state.agenda.points}). O representante conversa; o preço e o aceite seguem as regras do mercado.</p>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'mercado', label: 'Vitrine' }, { id: 'negociacoes', label: 'Negociações' }, { id: 'contratos', label: `Contratos (${ownContracts.filter((c) => c.status === 'ativo').length})` }]} />
      {tab === 'mercado' && <Vitrine gameId={gameId} state={state} autoTitle={titleParam} />}
      {tab === 'negociacoes' && <Negociacoes gameId={gameId} state={state} />}
      {tab === 'contratos' && <Contratos gameId={gameId} state={state} />}
    </div>
  );
}

// ===== vitrine =====
function useBrowse(gameId: string, week: number, extra: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: ['rights', gameId, week, JSON.stringify(extra)],
    queryFn: () => backendSync().call<BrowseResp>('catalog-browse', { gameId, ...extra }),
    enabled,
    staleTime: 30_000,
  });
}

function Vitrine({ gameId, state, autoTitle }: ScreenProps & { autoTitle: string | null }) {
  const browse = useBrowse(gameId, state.meta.weekIndex);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('todas');
  const [onlyFree, setOnlyFree] = useState(false);
  const [confirm, setConfirm] = useState<{ title: BrowseTitle; holder: BrowseHolder } | null>(null);
  const [dossierOf, setDossierOf] = useState<{ title: BrowseTitle; holder: BrowseHolder } | null>(null);
  const holders = browse.data?.holders ?? [];

  useEffect(() => {
    if (!autoTitle || !holders.length) return;
    for (const h of holders) {
      const t = h.titles.find((x) => x.id === autoTitle);
      if (t) {
        if (t.negotiation?.status === 'aberta') go(`g/${gameId}/direitos?neg=${t.negotiation.id}`);
        else setConfirm({ title: t, holder: h });
        break;
      }
    }
  }, [autoTitle, holders.length]);

  if (browse.isLoading) return <div className="p-6 text-center text-muted"><Spinner /></div>;
  if (browse.error) return <Empty title="Não foi possível abrir a vitrine">{String((browse.error as Error).message)}</Empty>;
  if (!browse.data?.available) return <Empty title="Mercado de Direitos indisponível nesta partida">{browse.data?.reason}</Empty>;

  const cats = [...new Set(holders.map((h) => h.category ?? 'outros'))];
  const ql = q.trim().toLowerCase();
  const shown = holders
    .filter((h) => cat === 'todas' || (h.category ?? 'outros') === cat)
    .map((h) => ({ ...h, titles: h.titles.filter((t) => (!ql || t.titleBr.toLowerCase().includes(ql) || h.name.toLowerCase().includes(ql)) && (!onlyFree || (!t.locked && !t.owned))) }))
    .filter((h) => h.titles.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} sm:max-w-xs`} placeholder="Buscar título ou player..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputClass} sm:max-w-[220px]`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="todas">Todas as categorias</option>
          {cats.map((c) => <option key={c} value={c}>{CATEGORY[c] ?? c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Só disponíveis</label>
      </div>
      {shown.length === 0 && <Empty title="Nada encontrado">Mude a busca ou os filtros.</Empty>}
      <div className="grid gap-3 xl:grid-cols-2">
        {shown.map((h) => (
          <Card key={h.id} title={<span className="normal-case tracking-normal text-text">{h.name}</span>} action={<Badge>{CATEGORY[h.category ?? ''] ?? h.category ?? 'player'}</Badge>}>
            <div className="mb-3 flex items-center gap-3 text-xs">
              <span className="text-muted">{h.representative ? `${h.representative.nome} · ${h.representative.cargo}` : 'Representante'}</span>
              <span className="ml-auto flex w-36 items-center gap-2">
                <Tip text="Relacionamento da sua emissora com este player (0 a 100). Sobe com contratos cumpridos e reuniões cordiais; cai com blefes descobertos, multas e reuniões abandonadas. Relacionamento bom baixa o preço mínimo do player.">Relação</Tip>
                <Bar value={h.relation} tone={h.relation >= 60 ? 'good' : h.relation < 40 ? 'bad' : 'warn'} />
                <span className="tabular w-6 text-right">{h.relation}</span>
              </span>
            </div>
            {h.distrust && <p className="mb-2 text-xs text-bad">Desconfiança: um blefe seu foi descoberto. Este player cobra mais e tem menos paciência por um tempo.</p>}
            <ul className="divide-y divide-border">
              {h.titles.map((t) => (
                <li key={t.id} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-snug">{t.titleBr}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <GenreChip genre={t.genre} small />
                        <span>{KIND[t.kind] ?? t.kind}{t.country ? ` · ${t.country}` : ''}{t.year ? ` · ${t.year}` : ''}{t.episodes ? ` · ${t.episodes} ${t.kind === 'pacote_filmes' ? 'filmes' : 'ep.'}` : ''}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="text-muted">referência</div>
                      <div className="tabular font-semibold">{moneyEra(state.meta.era, t.reference)}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                    {t.owned && <Badge tone="good">no seu acervo</Badge>}
                    {t.locked && <Badge tone="warn">🔒 {t.locked}</Badge>}
                    {t.negotiation && <Badge tone={STATUS[t.negotiation.status]?.tone ?? 'neutral'}>{STATUS[t.negotiation.status]?.label}</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => setDossierOf({ title: t, holder: h })}>Dossiê</Button>
                    {!t.owned && (t.negotiation?.status === 'aberta'
                      ? <Button size="sm" variant="primary" onClick={() => go(`g/${gameId}/direitos?neg=${t.negotiation!.id}`)}>Voltar à mesa</Button>
                      : <Button size="sm" variant={t.locked ? 'secondary' : 'primary'} disabled={state.meta.status !== 'active'} onClick={() => setConfirm({ title: t, holder: h })}>{t.locked ? 'Reunião de relacionamento' : t.negotiation?.status === 'pausada' ? 'Retomar' : 'Marcar reunião'}</Button>)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <OpenDialog gameId={gameId} state={state} target={confirm} onClose={() => setConfirm(null)} />
      <DossierDialog gameId={gameId} state={state} target={dossierOf} onClose={() => setDossierOf(null)} />
    </div>
  );
}

function OpenDialog({ gameId, state, target, onClose }: ScreenProps & { target: { title: BrowseTitle; holder: BrowseHolder } | null; onClose: () => void }) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const enough = state.agenda.points >= NEG_AGENDA_COST;
  const open = async () => {
    if (!target) return;
    const r = await run<{ negotiationId: string; note?: string; sniped?: boolean }>('negotiation-open', { titleId: target.title.id }, { invalidate: ['rights', 'negotiations', 'negrounds', 'inbox'] });
    if (!r) return;
    if (r.note) toast('info', r.note);
    if (r.sniped) toast('warn', 'Um rival fechou o título enquanto você pensava.');
    onClose();
    go(`g/${gameId}/direitos?neg=${r.negotiationId}`);
  };
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Reunião com ${target.holder.name}` : ''} footer={
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" busy={busy} disabled={!enough} onClick={open}>Marcar ({NEG_AGENDA_COST} pts de agenda)</Button>
      </div>
    }>
      {target && (
        <div className="space-y-2 text-sm">
          <p>Produto: <b>{target.title.titleBr}</b>. Preço de referência da Pesquisa: <b>{moneyEra(state.meta.era, target.title.reference)}</b> (aproximado).</p>
          {target.title.locked && <p className="text-warn">Este título está {target.title.locked}. A reunião serve para plantar relacionamento e preferência para a renovação; não há venda agora.</p>}
          {target.title.negotiation?.status === 'pausada' && <p className="text-warn">Você pediu tempo nesta negociação. Voltar à mesa custa outra reunião, e um rival pode ter fechado antes.</p>}
          <p className="text-muted">Até 6 rodadas. Propostas muito baixas gastam a paciência do representante; blefes descobertos derrubam o relacionamento por dois anos de jogo.</p>
          {!enough && <p className="text-bad">Faltam pontos de agenda nesta semana.</p>}
        </div>
      )}
    </Modal>
  );
}

function DossierDialog({ gameId, state, target, onClose }: ScreenProps & { target: { title: BrowseTitle; holder: BrowseHolder } | null; onClose: () => void }) {
  const [band, setBand] = useState<BandId | ''>('');
  useEffect(() => setBand(''), [target?.title.id]);
  const q = useBrowse(gameId, state.meta.weekIndex, { titleId: target?.title.id, ...(band ? { band } : {}) }, !!target);
  const d = q.data?.dossier;
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Dossiê da Pesquisa: ${target.title.titleBr}` : ''}>
      {target && (
        <div className="space-y-3 text-sm">
          <Field label="Horário pretendido">
            <select className={inputClass} value={band || d?.faixa || ''} onChange={(e) => setBand(e.target.value as BandId)}>
              {BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          {q.isLoading || !d ? <Spinner /> : (
            <div className="grid grid-cols-2 gap-2">
              <div className="card px-3 py-2"><div className="text-[11px] uppercase text-muted">Pontos projetados</div><div className="tabular font-bold">{fmtPts(d.pontosProjetados[0])} a {fmtPts(d.pontosProjetados[1])}</div></div>
              <div className="card px-3 py-2"><div className="text-[11px] uppercase text-muted">Receita por exibição</div><div className="tabular font-bold">{moneyEra(state.meta.era, d.receitaPorExibicao)}</div></div>
              <div className="card px-3 py-2"><div className="text-[11px] uppercase text-muted">Exibições do pacote padrão</div><div className="tabular font-bold">{d.exibicoes}</div></div>
              <div className="card px-3 py-2"><div className="text-[11px] uppercase text-muted">Receita potencial</div><div className="tabular font-bold">{moneyEra(state.meta.era, d.receitaPotencial)}</div></div>
            </div>
          )}
          <p className="text-xs text-muted">Projeção com a precisão atual da Pesquisa ({state.research.precision}%). É estimativa de jogo, não audiência oficial. Receita de publicidade com ocupação e desconto típicos da sua emissora.</p>
        </div>
      )}
    </Modal>
  );
}

// ===== lista de negociações =====
function Negociacoes({ gameId, state }: ScreenProps) {
  const rows = useRows(['negotiations', gameId], 'negotiations', { game_id: gameId }, { order: 'updated_at', ascending: false, limit: 60 });
  const list = (rows.data ?? []) as unknown as NegRow[];
  if (rows.isLoading) return <div className="p-6 text-center"><Spinner /></div>;
  if (!list.length) return <Empty title="Nenhuma negociação ainda">Marque uma reunião na vitrine.</Empty>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {list.map((n) => (
        <button key={n.id} onClick={() => go(`g/${gameId}/direitos?neg=${n.id}`)} className="card flex items-center gap-3 p-3 text-left hover:border-accent">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{n.public_state.label}</div>
            <div className="text-xs text-muted">{n.public_state.holderName} · rodada {n.round}/{n.public_state.maxRounds}{n.public_state.onTable ? ` · na mesa: ${moneyEra(state.meta.era, n.public_state.onTable.valor)}` : ''}</div>
          </div>
          <Badge tone={STATUS[n.status]?.tone ?? 'neutral'}>{STATUS[n.status]?.label ?? n.status}</Badge>
        </button>
      ))}
    </div>
  );
}

// ===== Mesa de Negociação =====
function Mesa({ gameId, state, negotiationId }: ScreenProps & { negotiationId: string }) {
  const negQ = useRows(['negotiations', gameId, negotiationId], 'negotiations', { id: negotiationId });
  const roundsQ = useRows(['negrounds', gameId, negotiationId], 'negotiation_rounds', { negotiation_id: negotiationId }, { order: 'round', ascending: true, limit: 40 });
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const openProgram = useUI((s) => s.openProgram);
  const n = (negQ.data?.[0] ?? null) as unknown as NegRow | null;
  const pub = n?.public_state ?? null;
  const rounds = (roundsQ.data ?? []) as unknown as RoundRow[];
  const [text, setText] = useState('');
  const [terms, setTerms] = useState<TermSheet | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const contract = (state.rightsContracts ?? []).find((c) => c.negotiationId === negotiationId);
  const llm = backendSync().mode === 'cloud';
  const era = state.meta.era;

  // o formulário começa com a última proposta na mesa (do player) ou a sua última
  useEffect(() => {
    if (pub && !terms) setTerms(pub.playerLast ?? pub.onTable ?? null);
  }, [pub?.round, pub?.status]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [rounds.length]);

  const refresh = () => invalidateGameData(gameId, ['negotiations', 'negrounds', 'rights']);
  const turn = async (body: Record<string, unknown>) => {
    const r = await run<{ notes?: string[]; decision?: { type: string } }>('negotiation-turn', { negotiationId, ...body });
    if (r) {
      setText('');
      setTags([]);
      setTerms(null);
      for (const note of r.notes ?? []) toast('info', note);
      if (r.decision?.type === 'aceite') toast('success', 'Acordo! Assine o contrato para o título entrar no acervo.');
      refresh();
    }
  };
  const sign = async () => {
    const r = await run<{ message: string; programId?: string }>('negotiation-close', { negotiationId }, { invalidate: ['inbox', 'rights', 'negotiations'] });
    if (r) {
      toast('success', r.message);
      refresh();
    }
  };

  if (negQ.isLoading) return <div className="p-6 text-center"><Spinner /></div>;
  if (!pub || !n) return <div className="p-6"><Empty title="Negociação não encontrada"><Button onClick={() => go(`g/${gameId}/direitos`)}>Voltar</Button></Empty></div>;
  const open = pub.status === 'aberta' && state.meta.status === 'active';
  const relation = pub.kind === 'relacionamento';
  const patienceTone = pub.patiencePct > 66 ? 'good' : pub.patiencePct > 33 ? 'warn' : 'bad';
  const set = <K extends keyof TermSheet>(k: K, v: TermSheet[K]) => setTerms((t) => (t ? { ...t, [k]: v } : t));

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 sm:p-4 lg:p-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => go(`g/${gameId}/direitos`)}>← Mercado de Direitos</Button>
          <Badge tone={STATUS[pub.status]?.tone ?? 'neutral'}>{STATUS[pub.status]?.label ?? pub.status}</Badge>
        </div>
        <h1 className="text-lg font-black leading-tight sm:text-xl">{pub.label}</h1>
        <p className="text-xs text-muted">{pub.holderName}{pub.representative ? ` · ${pub.representative.nome}, ${pub.representative.cargo}` : ''}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        {/* chat */}
        <div className="card flex max-h-[calc(100dvh-220px)] min-h-[320px] flex-col">
          <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
            {roundsQ.isLoading && <Spinner />}
            {rounds.map((r) => (
              <div key={r.id} className="space-y-2">
                {(r.player_text || r.player_offer) && (
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/20 px-3 py-2 text-sm">
                    {r.player_text && <p>{r.player_text}</p>}
                    {r.player_offer && (relation
                      ? !r.player_text && <p className="text-sm">Você propõe uma parceria futura.</p>
                      : <p className="mt-1 text-xs text-muted">Sua proposta: {termsLine(era, r.player_offer)}</p>)}
                    {r.argument_tags?.length > 0 && <p className="mt-1 text-[11px] text-muted">Argumentos: {r.argument_tags.map((t) => ARGUMENT_TAGS[t] ?? t).join('; ')}</p>}
                  </div>
                )}
                {(r.holder_text ?? []).map((l, i) => l.speaker === 'narrador' ? (
                  <p key={i} className="fade-in text-sm italic text-muted">{l.text}</p>
                ) : (
                  <div key={i} className="fade-in flex gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-base">💼</span>
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2">
                      <div className="text-xs font-bold text-accent">{pub.representative?.nome ?? 'Representante'}<span className="ml-1 font-normal text-muted">· {pub.holderName}</span></div>
                      <p className="mt-0.5 whitespace-pre-line text-sm">{l.text}</p>
                    </div>
                  </div>
                ))}
                {r.engine_decision?.type && r.round > 0 && (
                  <div className="flex justify-center"><Badge tone={DECISION[r.engine_decision.type]?.tone ?? 'neutral'}>Rodada {r.round}: {DECISION[r.engine_decision.type]?.label ?? r.engine_decision.type}{r.engine_decision.final ? ' · última oferta' : ''}</Badge></div>
                )}
              </div>
            ))}
            {pub.status === 'fechada' && !contract && <div className="rounded-theme border border-good/50 bg-good/10 p-3 text-sm">Acordo fechado: {pub.onTable ? termsLine(era, pub.onTable) : ''}. <Button size="sm" variant="primary" busy={busy} onClick={sign} className="ml-2">Assinar contrato</Button></div>}
            {contract && (
              <div className="rounded-theme border border-good/50 bg-good/10 p-3 text-sm">
                Contrato assinado. {contract.programId && <button className="underline" onClick={() => openProgram(contract.programId!)}>Abrir a ficha do programa</button>}
              </div>
            )}
            {pub.status === 'fracassada' && <p className="text-center text-xs text-muted">Reunião encerrada sem acordo.</p>}
            {pub.status === 'pausada' && <p className="text-center text-xs text-warn">Você pediu tempo. Volte pela vitrine (custa outra reunião); um rival pode fechar antes.</p>}
            <div ref={endRef} />
          </div>
          {open && (
            <form className="safe-bottom flex gap-2 border-t border-border p-3 pr-16 lg:pr-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void turn({ text: text.trim(), terms: showForm && terms ? terms : undefined, tags }); }}>
              <input className={inputClass} value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder={llm ? (relation ? 'Converse com o representante...' : 'Ex.: "Pago 3 milhões em 2 parcelas, com exibição no nobre"') : 'Modo demonstração: use o formulário de proposta'} disabled={!llm && !relation} />
              <Button type="submit" variant="primary" busy={busy} disabled={!text.trim()}>Falar</Button>
            </form>
          )}
        </div>

        {/* term sheet vivo */}
        <div className="space-y-3">
          <Card title="Paciência do representante">
            <div className="flex items-center gap-2"><Bar value={pub.patiencePct} tone={patienceTone} /><span className="tabular w-10 text-right text-sm">{pub.patiencePct}%</span></div>
            <p className="mt-2 text-xs text-muted">Rodada {pub.round} de {pub.maxRounds}. Propostas muito baixas gastam o dobro.</p>
            {pub.rivalMentions.length > 0 && <p className="mt-2 text-xs text-warn">Concorrência na mesa: {pub.rivalMentions.join(', ')}.</p>}
            {pub.locked && <p className="mt-2 text-xs text-warn">Produto {pub.locked}: reunião só de relacionamento.</p>}
          </Card>
          {!relation && (
            <Card title="Na mesa (proposta do player)">
              {pub.onTable ? <p className="text-sm">{termsLine(era, pub.onTable)}</p> : <p className="text-sm text-muted">—</p>}
              <p className="mt-2 text-xs text-muted">Preço de referência da Pesquisa: {moneyEra(era, pub.reference)}. {pub.flexible.length ? `O player pode flexibilizar: ${pub.flexible.map((f) => ({ valor: 'valor', parcelas: 'parcelas', anos: 'duração', exibicoes: 'exibições' } as Record<string, string>)[f] ?? f).join(', ')}.` : ''}</p>
              {open && pub.onTable && <Button className="mt-3" full variant="primary" busy={busy} onClick={() => void turn({ action: 'aceitar' })}>Aceitar esta proposta</Button>}
            </Card>
          )}
          {open && !relation && terms && (
            <Card title="Sua proposta" action={<button className="text-xs text-muted lg:hidden" onClick={() => setShowForm((v) => !v)}>{showForm ? 'ocultar' : 'mostrar'}</button>}>
              <div className={`${showForm ? '' : 'hidden'} space-y-2 lg:block`}>
                <Field label="Valor total (R$ milhões)" hint={moneyEra(era, terms.valor)}>
                  <input className={inputClass} inputMode="decimal" value={(terms.valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} onChange={(e) => { const v = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')); if (isFinite(v)) set('valor', Math.round(v * 1e6)); }} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Parcelas"><select className={inputClass} value={terms.parcelas} onChange={(e) => set('parcelas', Number(e.target.value))}>{[1, 2, 3, 4].map((x) => <option key={x} value={x}>{x === 1 ? 'à vista' : x}</option>)}</select></Field>
                  <Field label="Duração (anos)"><select className={inputClass} value={terms.anos} onChange={(e) => set('anos', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
                  <Field label="Exibições"><input className={inputClass} inputMode="numeric" value={terms.exibicoes} onChange={(e) => { const v = parseInt(e.target.value, 10); if (isFinite(v)) set('exibicoes', v); }} /></Field>
                  <Field label="Exclusividade"><select className={inputClass} value={terms.exclusividade} onChange={(e) => set('exclusividade', e.target.value as TermSheet['exclusividade'])}><option value="exclusivo">exclusivo</option><option value="compartilhado">compartilhado</option></select></Field>
                </div>
                <Field label="Plataformas"><select className={inputClass} value={terms.plataformas} onChange={(e) => set('plataformas', e.target.value as TermSheet['plataformas'])}><option value="tv_aberta">só TV aberta</option><option value="tv_aberta_streaming">TV aberta + streaming próprio</option></select></Field>
                <Field label="Horário prometido" hint="Vira obrigação no contrato: fora dele, há multa e o relacionamento cai."><select className={inputClass} value={terms.faixa} onChange={(e) => set('faixa', e.target.value as BandId)}>{BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={terms.preferencia_renovacao} onChange={(e) => set('preferencia_renovacao', e.target.checked)} /> Preferência de renovação</label>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Argumentos</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(ARGUMENT_TAGS).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))} className={`rounded-full border px-2 py-0.5 text-[11px] ${tags.includes(k) ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted'}`}>{label}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">Argumentos ajudam pouco (até 5% no preço mínimo). "Tenho proposta melhor" sem rival de verdade pode ser descoberto.</p>
                </div>
                <Button full variant="primary" busy={busy} onClick={() => void turn({ terms, tags, text: text.trim() || undefined })}>Propor estes termos</Button>
              </div>
            </Card>
          )}
          {open && relation && <Button full busy={busy} onClick={() => void turn({ terms: { valor: 0 }, tags: ['parceria_longa'] })}>Propor parceria futura</Button>}
          {open && (
            <div className="grid grid-cols-2 gap-2">
              {!relation && <Button busy={busy} onClick={() => void turn({ action: 'pensar' })}>Vamos pensar</Button>}
              <Button variant="danger" busy={busy} onClick={() => void turn({ action: 'levantar' })} className={relation ? 'col-span-2' : ''}>Levantar da mesa</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== contratos =====
function Contratos({ gameId, state }: ScreenProps) {
  const openProgram = useUI((s) => s.openProgram);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const all = state.rightsContracts ?? [];
  const mine = all.filter((c) => c.stationId === ps.id);
  const others = all.filter((c) => c.stationId !== ps.id && c.status === 'ativo');
  const holderName = (id: string | null) => state.catalog?.holders.find((h) => h.id === id)?.name ?? id ?? '—';
  const era = state.meta.era;
  const toast = useUI((s) => s.toast);
  const { run, busy } = useAction(gameId);
  // sublicenciamento (seção 8C.6): aplica no navegador e confirma no servidor, como as mudanças da grade
  const sublicense = async (contractId: string, label: string, value: number) => {
    if (!window.confirm(`Revender as janelas de TV paga e streaming de ${label} por ${moneyEra(era, value)}? Só dá para fazer uma vez por contrato; a TV aberta continua com você.`)) return;
    const intent: Intent = { type: 'sublicense_sport', contractId };
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
  if (!all.length) return <Empty title="Nenhum contrato de direitos">Nas partidas do Brasil real, as exclusividades reais da largada aparecem aqui, junto com os contratos que você assinar.</Empty>;

  const ContractCard = ({ c, own }: { c: RightsContract; own: boolean }) => {
    const paid = c.payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
    const total = c.payments.reduce((s, p) => s + p.amount, 0);
    const next = c.payments.find((p) => !p.paid);
    const prog = c.programId ? state.programs.find((p) => p.id === c.programId) : null;
    const station = state.stations.find((s) => s.id === c.stationId);
    return (
      <div className="card space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{c.label}</div>
            <div className="text-xs text-muted">{holderName(c.holderId)}{!own && station ? ` · ${station.name}` : ''}</div>
          </div>
          <Badge tone={c.origin === 'largada' ? 'neutral' : 'accent'}>{c.origin === 'largada' ? 'largada' : 'negociado'}</Badge>
          <Badge tone={c.status === 'ativo' ? 'good' : c.status === 'inadimplente' ? 'bad' : 'neutral'}>{c.status}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted">Vigência</span><span className="text-right">{c.startDate ? formatDate(c.startDate) : '—'} a {c.endDate ? formatDate(c.endDate) : 'sem data'}</span>
          {c.terms.valor !== undefined && (<><span className="text-muted">Valor</span><span className="tabular text-right">{moneyEra(era, c.terms.valor)}</span></>)}
          {c.terms.escopo && (<><span className="text-muted">Escopo</span><span className="text-right">{c.terms.escopo}</span></>)}
          {c.terms.exclusividade && (<><span className="text-muted">Exclusividade</span><span className="text-right">{c.terms.exclusividade}{c.terms.plataformas === 'tv_aberta_streaming' ? ' · TV aberta + streaming' : ' · TV aberta'}</span></>)}
          {own && total > 0 && (<><span className="text-muted">Pago</span><span className="tabular text-right">{moneyEra(era, paid)} de {moneyEra(era, total)}</span></>)}
          {own && next && (<><span className="text-muted">Próxima parcela</span><span className="tabular text-right">{moneyEra(era, next.amount)} em {formatDate(next.date)}</span></>)}
          {own && prog?.rights && (<><span className="text-muted">Exibições restantes</span><span className="tabular text-right">{prog.rights.exhibitionsLeft}</span></>)}
          {own && c.obligations.map((o, i) => (
            <span key={i} className="col-span-2 flex justify-between"><span className="text-muted">Horário prometido: {BANDS.find((b) => b.id === o.band)?.label.split(' (')[0] ?? o.band}</span><span className={o.missed ? 'text-bad' : 'text-good'}>{o.met} semana(s) cumprida(s){o.missed ? ` · ${o.missed} fora (multa)` : ''}</span></span>
          ))}
        </div>
        {c.sport && own && (
          <div className="space-y-1.5 border-t border-border pt-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">Jogos nesta temporada</span><span className="tabular">{c.sport.aired} exibido(s) de {c.sport.entitled} escolhido(s)</span></div>
            {c.sport.sublicensed ? (
              <div className="text-muted">TV paga e streaming revendidos em {formatDate(c.sport.sublicensed.date)} por {moneyEra(era, c.sport.sublicensed.value)}.</div>
            ) : (() => {
              const q = sublicenseQuote(state, c.id);
              return q.ok ? (
                <Button size="sm" variant="ghost" busy={busy} onClick={() => void sublicense(c.id, c.label, q.value)}>Sublicenciar TV paga e streaming ({moneyEra(era, q.value)})</Button>
              ) : <div className="text-muted">Sublicenciamento: {q.reason}</div>;
            })()}
          </div>
        )}
        {own && prog && <Button size="sm" variant="ghost" onClick={() => openProgram(prog.id)}>Abrir a ficha de "{prog.title}"</Button>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Seus contratos</h2>
        {mine.length ? <div className="grid gap-2 md:grid-cols-2">{mine.map((c) => <ContractCard key={c.id} c={c} own />)}</div> : <Empty title="Nenhum contrato seu ainda">Feche um acordo na Mesa de Negociação.</Empty>}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Exclusividades das outras emissoras</h2>
        <p className="text-xs text-muted">Enquanto valerem, esses produtos ficam travados para você. Perto do vencimento, uma reunião de relacionamento com o player ajuda na renovação.</p>
        <div className="grid gap-2 md:grid-cols-2">{others.map((c) => <ContractCard key={c.id} c={c} own={false} />)}</div>
      </section>
    </div>
  );
}
