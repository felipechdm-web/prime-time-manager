// Monta o SQL e os CSV de cada lote do catálogo real, validando tudo com as mesmas regras do Editor de Catálogo.
// Usado por scripts/gen-catalog-seed.ts (grava os arquivos) e pelos testes (só valida).

import { GENRES } from '../functions/_shared/engine/catalog/genres.ts';
import { catalogRowsToCSV, normalizeCatalogRow } from '../functions/_shared/game/catalog.ts';
import type { CatalogTable } from '../functions/_shared/game/catalog.ts';
import { BATCH, GRIDS, HOLDERS, REFERENCE_MONTH, RIGHTS, TITLES } from './catalogo_2026_lote1.ts';
import type { GridSeed, HolderSeed, RightSeed, TitleSeed } from './catalogo_2026_lote1.ts';
import * as L2A from './catalogo_2026_lote2a.ts';
import * as L2B from './catalogo_2026_lote2b.ts';
import * as L3 from './catalogo_2026_lote3.ts';
import * as L4 from './catalogo_2026_lote4.ts';
import * as L5 from './catalogo_2026_lote5_esporte.ts';
import { REAL_STATIONS } from '../functions/_shared/engine/catalog/eras.ts';
import { MARKETS } from '../functions/_shared/engine/catalog/markets.ts';
const CATALOG_MARKETS = () => MARKETS.map((m) => m.code);
import { parseDays } from '../functions/_shared/engine/catalogWorld.ts';
import { clockToSlot } from '../functions/_shared/engine/time.ts';

const ERA = 'now';

export interface BuiltSeed {
  problems: string[];
  sql: string;
  csv: Partial<Record<CatalogTable, string>>;
  counts: Record<string, number>;
  rows: Record<'rights_holders' | 'catalog_titles' | 'schedule_templates' | 'historical_rights', Record<string, unknown>[]>;
}

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `array[${v.map((x) => q(x)).join(', ')}]::text[]`;
  if (typeof v === 'object') return `${q(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

function insertSql(table: CatalogTable, rows: Record<string, unknown>[], conflict: string): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => q(r[c])).join(', ')})`).join(',\n');
  // "do nothing": rodar de novo não desfaz correções nem aprovações feitas no Editor
  return `insert into public.${table} (${cols.join(', ')}) values\n${values}\non conflict ${conflict} do nothing;\n`;
}

const CATALOG_GUARD = `-- confere se a migração do catálogo já foi aplicada (senão, para com uma explicação)
do $$
begin
  if to_regclass('public.rights_holders') is null then
    raise exception 'O catálogo ainda não existe neste banco. Cole e rode PRIMEIRO o arquivo supabase/setup_completo.sql da pasta Documentos\\GitHub\\prime-time-manager (passo 1 da Fase 6.2) e depois rode este arquivo de novo.';
  end if;
end $$;`;

// Ajustes de 17/10/2026 para um banco que já tem o lote 1 (aprovado pelo Felipe, menos a grade do SBT):
// grade do SBT em janeiro de 2026, 4 novelas novas (pendentes), nota do The Voice corrigida e direito The Voice → SBT.
// O que já foi aprovado continua aprovado; os itens novos entram pendentes.
export const AJUSTES_TITULOS = ['marisol', 'a_desalmada', 'presente_de_amor', 'amor_valente'];
export const AJUSTES_DIREITOS = [2608];

export function buildLote1Ajustes(): { problems: string[]; sql: string } {
  const built = buildLote1();
  const problems = [...built.problems];
  const norm = (table: CatalogTable, label: string, rawRow: Record<string, unknown>) => {
    const n = normalizeCatalogRow(table, { ...rawRow, batch: BATCH });
    for (const e of n.errors) problems.push(`${table} ${label}: ${e}`);
    return n.row;
  };
  const sbt = GRIDS.find((g) => g.station_key === 'sbt');
  if (!sbt) problems.push('grade do SBT não existe no lote');
  const grid = sbt ? norm('schedule_templates', 'sbt', { era_id: ERA, station_key: 'sbt', reference_month: sbt.reference_month ?? REFERENCE_MONTH, slots: sbt.slots, confidence: sbt.confidence, notes: sbt.notes }) : {};
  const titles = AJUSTES_TITULOS.map((id) => {
    const t = TITLES.find((x) => x.id === id);
    if (!t) problems.push(`título ${id} não existe no lote`);
    return t ? norm('catalog_titles', id, { ...t }) : {};
  });
  const voice = TITLES.find((x) => x.id === 'the_voice');
  if (!voice) problems.push('título the_voice não existe no lote');
  const rights = AJUSTES_DIREITOS.map((id) => {
    const r = RIGHTS.find((x) => x.id === id);
    if (!r) problems.push(`direito ${id} não existe no lote`);
    return r ? norm('historical_rights', String(id), { ...r, era_id: ERA }) : {};
  });
  const sql = `-- Prime Time Manager — ajustes do ${BATCH} (17/10/2026).
-- Gerado por scripts/gen-catalog-seed.ts. Cole no SQL Editor do Supabase e clique em Run.
-- 1) Grade do SBT alinhada a janeiro de 2026: apaga a grade do SBT deste lote (a de janeiro antiga e, se você
--    já tiver rodado a correção anterior, a de outubro) e grava a nova, pendente para revisão.
-- 2) Quatro novelas novas, pendentes: Marisol, A Desalmada, Presente de Amor e Amor Valente.
-- 3) Nota do The Voice corrigida (continua aprovado) e direito The Voice → SBT, pendente.
-- Nada do que você já aprovou deixa de estar aprovado. Pode rodar de novo sem problemas.

${CATALOG_GUARD}

begin;

delete from public.schedule_templates
where era_id = '${ERA}' and station_key = 'sbt' and batch = ${q(BATCH)};
${insertSql('schedule_templates', [grid], '(era_id, station_key, reference_month)')}
${insertSql('catalog_titles', titles, '(id)')}
update public.catalog_titles
set notes = ${q(voice?.notes ?? '')}, br_history = ${q(voice?.br_history ?? [])}, updated_at = now()
where id = 'the_voice';

${insertSql('historical_rights', rights, '(id)')}
select setval(pg_get_serial_sequence('public.historical_rights', 'id'), greatest((select max(id) from public.historical_rights), 1));

commit;
`;
  return { problems, sql };
}

export interface BatchSeed {
  batch: string;
  source: string; // arquivo .ts de onde o lote vem (aparece no cabeçalho do SQL)
  holders: HolderSeed[];
  titles: TitleSeed[];
  grids: GridSeed[];
  rights: RightSeed[];
  previous?: BatchSeed[]; // lotes anteriores: players e títulos deles podem ser referenciados, códigos não podem repetir
}

export function buildLote1(): BuiltSeed {
  return buildBatch(LOTE1);
}

export function buildLote2a(): BuiltSeed {
  return buildBatch(LOTE2A);
}

export const LOTE1: BatchSeed = { batch: BATCH, source: 'catalogo_2026_lote1.ts', holders: HOLDERS, titles: TITLES, grids: GRIDS, rights: RIGHTS };
export const LOTE2A: BatchSeed = { batch: L2A.BATCH, source: 'catalogo_2026_lote2a.ts', holders: L2A.HOLDERS, titles: L2A.TITLES, grids: [], rights: L2A.RIGHTS, previous: [LOTE1] };
export const LOTE2B: BatchSeed = { batch: L2B.BATCH, source: 'catalogo_2026_lote2b.ts', holders: L2B.HOLDERS, titles: L2B.TITLES, grids: [], rights: L2B.RIGHTS, previous: [LOTE1, LOTE2A] };

export function buildLote2b(): BuiltSeed {
  return buildBatch(LOTE2B);
}

// Faixas da grade que se sobrepõem no mesmo dia (o dia do jogo vai das 6h às 6h; faixa que passa das 6h é cortada)
export function gridProblems(g: GridSeed): string[] {
  const out: string[] = [];
  const taken: Map<number, string>[] = Array.from({ length: 7 }, () => new Map());
  g.slots.forEach((sl, i) => {
    const start = clockToSlot(sl.inicio);
    const raw = (clockToSlot(sl.fim) - start + 96) % 96;
    if (raw > 96 - start) out.push(`grade ${g.station_key} faixa ${i + 1} (${sl.titulo}): passa das 6h e seria cortada`);
    const len = Math.min(raw, 96 - start);
    if (len <= 0) out.push(`grade ${g.station_key} faixa ${i + 1} (${sl.titulo}): duração zero`);
    const days = parseDays(sl.dias);
    if (!days.length) out.push(`grade ${g.station_key} faixa ${i + 1} (${sl.titulo}): dias "${sl.dias}" inválidos`);
    for (const d of days) for (let k = start; k < start + len; k++) {
      const prev = taken[d].get(k);
      if (prev) { out.push(`grade ${g.station_key} faixa ${i + 1} (${sl.titulo}) se sobrepõe a "${prev}" (dia ${d}, ${sl.inicio})`); return; }
      taken[d].set(k, sl.titulo);
    }
  });
  return out;
}

// Lote 4: clubes das Séries A e B de 2026 e torcida por praça.
export function buildLote4(): BuiltSeed & { clubs: Record<string, unknown>[]; fanbase: Record<string, unknown>[] } {
  const problems: string[] = [];
  const check = (table: CatalogTable, label: string, raw: Record<string, unknown>) => {
    const n = normalizeCatalogRow(table, raw);
    for (const e of n.errors) problems.push(`${table} ${label}: ${e}`);
    return n.row;
  };
  const ids = new Set<string>();
  const clubs = L4.CLUBS.map((cl) => {
    if (ids.has(cl.id)) problems.push(`clubs ${cl.id}: código repetido`);
    ids.add(cl.id);
    const f = cl.rating_by_season['2026'];
    if (typeof f !== 'number' || f < 0 || f > 100) problems.push(`clubs ${cl.id}: força de 2026 fora de 0 a 100`);
    return check('clubs', cl.id, { ...cl, batch: L4.BATCH });
  });
  const total = new Map<string, number>();
  const seen = new Set<string>();
  const fanbase = L4.FANBASE.map((fb) => {
    if (!ids.has(fb.club_id)) problems.push(`club_fanbase ${fb.club_id}/${fb.market_id}: clube não existe no lote`);
    const key = `${fb.club_id}|${fb.market_id}`;
    if (seen.has(key)) problems.push(`club_fanbase ${key}: repetido`);
    seen.add(key);
    total.set(fb.market_id, (total.get(fb.market_id) ?? 0) + fb.share);
    return check('club_fanbase', key, { ...fb, era_id: ERA, batch: L4.BATCH });
  });
  for (const [m, s] of total) if (s > 0.95) problems.push(`praça ${m}: as torcidas somam ${Math.round(s * 100)}% (máximo 95%)`);
  for (const m of normalizeCatalogRow('club_fanbase', { club_id: 'x', market_id: 'SP', era_id: ERA, share: 0, confidence: 'baixa' }).errors) problems.push(m);
  const semPraca = (CATALOG_MARKETS() as string[]).filter((m) => !total.has(m));
  if (semPraca.length) problems.push(`praças sem torcida: ${semPraca.join(', ')}`);
  for (const r of [...clubs, ...fanbase]) if ('approved' in r) problems.push('o lote não deve vir aprovado');
  const sql = `-- Prime Time Manager — catálogo real, era atual (2026), ${L4.BATCH}: clubes das Séries A e B e torcida por praça.
-- Gerado por scripts/gen-catalog-seed.ts a partir de supabase/seeds/catalogo_2026_lote4.ts. Não edite à mão.
-- Tudo entra como NÃO aprovado. Força dos clubes e torcida por praça são estimativas de jogo (confiança baixa
-- na torcida). Competições, calendário e jogos ficam para a Fase 6.4. Rodar de novo não desfaz o que você editar.

${CATALOG_GUARD}

begin;

${insertSql('clubs', clubs, '(id)')}
${insertSql('club_fanbase', fanbase, '(club_id, market_id, era_id)')}
commit;
`;
  return {
    problems, sql, clubs, fanbase,
    csv: { clubs: catalogRowsToCSV('clubs', clubs), club_fanbase: catalogRowsToCSV('club_fanbase', fanbase) },
    counts: { clubes: clubs.length, torcidas: fanbase.length, pracas: total.size },
    rows: { rights_holders: [], catalog_titles: [], schedule_templates: [], historical_rights: [] },
  };
}

// Lote 5 (Fase 6.4): players do esporte, competições de 2026, direitos de TV aberta na largada e clássicos.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PARTICIPANT_PREFIX = /^(generico|selecao):[a-z0-9_]+$/;

export function buildLote5(): BuiltSeed & { competitions: Record<string, unknown>[]; rivalries: Record<string, { club: string; weight: number; name: string }[]> } {
  const problems: string[] = [];
  const check = (table: CatalogTable, label: string, raw: Record<string, unknown>) => {
    const n = normalizeCatalogRow(table, raw);
    for (const e of n.errors) problems.push(`${table} ${label}: ${e}`);
    return n.row;
  };
  const prevHolders = new Set([...HOLDERS, ...L2A.HOLDERS, ...L2B.HOLDERS].map((h) => h.id));
  const prevRights = new Set([...RIGHTS, ...L2A.RIGHTS, ...L2B.RIGHTS].map((r) => r.id));
  const clubIds = new Set(L4.CLUBS.map((c) => c.id));
  const stationKeys = new Set(REAL_STATIONS.now.map((s) => s.key));

  const holderIds = new Set<string>();
  const holders = L5.HOLDERS.map((h) => {
    if (holderIds.has(h.id) || prevHolders.has(h.id)) problems.push(`rights_holders ${h.id}: código repetido`);
    holderIds.add(h.id);
    if ((h.representative_seed as { ficticio?: boolean }).ficticio !== true) problems.push(`rights_holders ${h.id}: representante precisa ser fictício`);
    if (!h.notes.trim()) problems.push(`rights_holders ${h.id}: sem nota de fonte`);
    return check('rights_holders', h.id, { ...h, batch: L5.BATCH });
  });
  const allHolders = new Set([...holderIds, ...prevHolders]);
  const oldHoldersUsed = new Set<string>();
  const useHolder = (id: string, label: string) => {
    if (holderIds.has(id)) return;
    if (prevHolders.has(id)) oldHoldersUsed.add(id);
    else problems.push(`${label}: player "${id}" não existe`);
  };

  const compIds = new Set<string>();
  const competitions = L5.COMPETITIONS.map((c) => {
    const label = `sports_competitions ${c.id}`;
    if (compIds.has(c.id)) problems.push(`${label}: código repetido`);
    compIds.add(c.id);
    if (c.rights_holder_id) useHolder(c.rights_holder_id, label);
    if (!c.notes.trim()) problems.push(`${label}: sem nota de fonte`);
    const fmt = c.format as Record<string, unknown>;
    for (const [season, list] of Object.entries(c.participants)) {
      for (const p of list) if (!clubIds.has(p) && !PARTICIPANT_PREFIX.test(p)) problems.push(`${label} ${season}: participante "${p}" não existe (clube do lote 4, generico:faixa ou selecao:pais)`);
      const expected = Number(fmt.clubes ?? fmt.selecoes ?? 0);
      if (expected && list.length !== expected) problems.push(`${label} ${season}: ${list.length} participantes, o formato diz ${expected}`);
      const real = list.filter((p) => clubIds.has(p));
      if (new Set(real).size !== real.length) problems.push(`${label} ${season}: clube repetido`);
    }
    const blocos = fmt.blocos as Record<string, string[]> | undefined;
    if (blocos) {
      for (const h of Object.keys(blocos)) useHolder(h, `${label} bloco`);
      const inBlocks = Object.values(blocos).flat().sort();
      const season = Object.values(c.participants)[0] ?? [];
      if (inBlocks.join() !== [...season].sort().join()) problems.push(`${label}: os blocos não batem com os participantes`);
    }
    for (const [season, rules] of Object.entries(c.calendar_rules)) {
      if (season === 'concorrencias') {
        for (const t of rules as Record<string, unknown>[]) {
          useHolder(String(t.vendedor), `${label} concorrência`);
          for (const k of ['abre', 'decide_ate']) if (!ISO_DAY.test(String(t[k]))) problems.push(`${label} concorrência: ${k} inválido`);
        }
        continue;
      }
      const r = rules as Record<string, unknown>;
      for (const k of ['inicio', 'fim']) if (r[k] !== undefined && !ISO_DAY.test(String(r[k]))) problems.push(`${label} ${season}: ${k} inválido`);
      if (r.inicio && r.fim && String(r.fim) < String(r.inicio)) problems.push(`${label} ${season}: fim antes do início`);
      for (const hr of (r.horarios as { dias: string; hora: string }[] | undefined) ?? []) {
        if (!parseDays(hr.dias).length) problems.push(`${label} ${season}: dias "${hr.dias}" inválidos`);
        if (!HHMM.test(hr.hora)) problems.push(`${label} ${season}: hora "${hr.hora}" inválida`);
      }
      const fases = ((fmt.fases as { id: string }[] | undefined) ?? []).map((f) => f.id);
      for (const [phase, days] of Object.entries((r.datas as Record<string, string[]> | undefined) ?? {})) {
        if (fases.length && !fases.includes(phase)) problems.push(`${label} ${season}: fase "${phase}" não existe no formato`);
        for (const d of days) if (!ISO_DAY.test(d) || Number.isNaN(Date.parse(d))) problems.push(`${label} ${season}: data "${d}" inválida`);
      }
      const gps = r.gps as { data: string; hora: string; tv_aberta?: boolean }[] | undefined;
      if (gps) {
        if (fmt.etapas && gps.length !== Number(fmt.etapas)) problems.push(`${label} ${season}: ${gps.length} GPs, o formato diz ${fmt.etapas}`);
        for (const g of gps) if (!ISO_DAY.test(g.data) || !HHMM.test(g.hora)) problems.push(`${label} ${season}: GP com data ou hora inválida`);
        const sorted = gps.map((g) => g.data);
        if (sorted.join() !== [...sorted].sort().join()) problems.push(`${label} ${season}: GPs fora de ordem`);
      }
    }
    return check('sports_competitions', c.id, { ...c, eras: ['now'], batch: L5.BATCH });
  });

  const rights = L5.RIGHTS.map((r) => {
    const label = `historical_rights ${r.id}`;
    if (prevRights.has(r.id)) problems.push(`${label}: código repetido`);
    if (!compIds.has(r.product_ref)) problems.push(`${label}: competição "${r.product_ref}" não existe`);
    if (!stationKeys.has(r.holder_station_key)) problems.push(`${label}: emissora "${r.holder_station_key}" não existe no jogo`);
    if (r.terms.tipo !== 'esporte') problems.push(`${label}: termos sem tipo "esporte"`);
    const cedente = String(r.terms.cedente ?? '');
    if (cedente !== 'clubes') useHolder(cedente, `${label} cedente`);
    const gps = (L5.COMPETITIONS.find((c) => c.id === r.product_ref)?.calendar_rules['2026'] as { gps?: { tv_aberta?: boolean }[] } | undefined)?.gps;
    if (gps && r.terms.gps_ao_vivo_tv_aberta !== undefined && gps.filter((g) => g.tv_aberta).length !== r.terms.gps_ao_vivo_tv_aberta) problems.push(`${label}: número de GPs na TV aberta não bate com o calendário`);
    return check('historical_rights', String(r.id), { ...r, era_id: ERA, batch: L5.BATCH });
  });
  const rightIds = new Set<number>();
  for (const r of L5.RIGHTS) {
    if (rightIds.has(r.id)) problems.push(`historical_rights ${r.id}: repetido no lote`);
    rightIds.add(r.id);
  }

  // clássicos: cada clube recebe a lista dos seus rivais (os dois lados)
  const rivalries: Record<string, { club: string; weight: number; name: string }[]> = {};
  const pairs = new Set<string>();
  for (const rv of L5.RIVALRIES) {
    for (const id of [rv.a, rv.b]) if (!clubIds.has(id)) problems.push(`clássico ${rv.name}: clube "${id}" não existe no lote 4`);
    if (rv.weight < 1 || rv.weight > 2) problems.push(`clássico ${rv.name}: peso fora de 1 a 2`);
    const key = [rv.a, rv.b].sort().join('|');
    if (pairs.has(key) || rv.a === rv.b) problems.push(`clássico ${rv.name}: repetido`);
    pairs.add(key);
    (rivalries[rv.a] ??= []).push({ club: rv.b, weight: rv.weight, name: rv.name });
    (rivalries[rv.b] ??= []).push({ club: rv.a, weight: rv.weight, name: rv.name });
  }
  for (const [id, list] of Object.entries(rivalries)) {
    const n = normalizeCatalogRow('clubs', { id, name: 'x', rivalries: list, confidence: 'media' });
    for (const e of n.errors) problems.push(`clubs ${id}: ${e}`);
  }
  for (const r of [...holders, ...competitions, ...rights]) if ('approved' in r) problems.push('o lote não deve vir aprovado');

  const oldList = [...oldHoldersUsed].sort();
  const rivalClubs = Object.keys(rivalries).sort();
  const updates = rivalClubs.map((id) =>
    `update public.clubs set rivalries = ${q(rivalries[id])}, approved = false, notes = case when notes like '%Clássicos:%' then notes else concat_ws(' ', notes, ${q(L5.RIVALRY_NOTE)}) end, updated_at = now()\nwhere id = ${q(id)} and rivalries = '[]'::jsonb;`);
  const sql = `-- Prime Time Manager — catálogo real, era atual (2026), ${L5.BATCH}: esporte (Fase 6.4).
-- Gerado por scripts/gen-catalog-seed.ts a partir de supabase/seeds/catalogo_2026_lote5_esporte.ts. Não edite à mão.
-- 1) Players do esporte (ligas, CBF, federações, Conmebol, UEFA, FIFA, F1), com representantes fictícios.
-- 2) Competições de 2026 (Brasileirão A e B, Copa do Brasil, Libertadores, Sul-Americana, Champions, Copa do Mundo,
--    Fórmula 1 e os estaduais de SP, RJ, MG e RS), com formato, calendário e participantes.
-- 3) Quem tinha os direitos de TV aberta na largada (mapa da seção 8C.2).
-- 4) Clássicos nos clubes do lote 4: esses clubes voltam para PENDENTE até você revisar e aprovar de novo.
-- Tudo entra como NÃO aprovado. Apelo, forças e pesos são estimativas de jogo. Nenhum atleta real aparece.
-- Rodar de novo não duplica nada nem desfaz o que você editar no Editor.

${CATALOG_GUARD}

do $$
begin
  if to_regclass('public.sports_competitions') is null then
    raise exception 'A tabela de competições ainda não existe. Rode antes a migração supabase/migrations/20261020000000_esporte.sql (passo 1 da Fase 6.4) e depois este arquivo de novo.';
  end if;
  if (select count(*) from public.rights_holders where id in (${oldList.map((x) => q(x)).join(', ')})) < ${oldList.length} then
    raise exception 'Este lote usa players do lote 1 (${oldList.join(', ')}) que não estão no banco. Rode antes supabase/seeds/catalogo_2026_lote1.sql e depois este de novo.';
  end if;
  if (select count(*) from public.clubs where id in (${rivalClubs.map((x) => q(x)).join(', ')})) < ${rivalClubs.length} then
    raise exception 'Faltam clubes do lote 4 no banco. Rode antes supabase/seeds/catalogo_2026_lote4.sql e depois este de novo.';
  end if;
end $$;

begin;

${insertSql('rights_holders', holders, '(id)')}
${insertSql('sports_competitions', competitions, '(id)')}
${insertSql('historical_rights', rights, '(id)')}
select setval(pg_get_serial_sequence('public.historical_rights', 'id'), greatest((select max(id) from public.historical_rights), 1));

-- clássicos (só onde o clube ainda não tem clássicos: rodar de novo não desfaz o que você editar)
${updates.join('\n')}

commit;
`;
  return {
    problems, sql, competitions, rivalries,
    csv: {
      rights_holders: catalogRowsToCSV('rights_holders', holders),
      sports_competitions: catalogRowsToCSV('sports_competitions', competitions),
      historical_rights: catalogRowsToCSV('historical_rights', rights),
    },
    counts: { players: holders.length, competicoes: competitions.length, direitos: rights.length, classicos: L5.RIVALRIES.length, clubes_com_classicos: rivalClubs.length },
    rows: { rights_holders: holders, catalog_titles: [], schedule_templates: [], historical_rights: rights },
  };
}

export const LOTE3_REPLACES = ['globo', 'record', 'band']; // grades do lote 1 substituídas pelas do lote 3

// Lote 3: grades de janeiro de 2026 das seis emissoras (SBT segue com a do lote 1) e correções de itens do lote 1.
export function buildLote3(): BuiltSeed {
  const base = buildBatch({ batch: L3.BATCH, source: 'catalogo_2026_lote3.ts', holders: [], titles: [], grids: L3.GRIDS, rights: [], previous: [LOTE1, LOTE2A, LOTE2B] });
  const problems = [...base.problems, ...L3.GRIDS.flatMap(gridProblems)];
  for (const g of L3.GRIDS) {
    const n = new Set(g.slots.map((s) => s.titulo)).size;
    if (n < 30 || n > 50) problems.push(`grade ${g.station_key}: ${n} programas (o combinado é de 30 a 50)`);
  }
  const allTitles = new Set([...TITLES, ...L2A.TITLES, ...L2B.TITLES].map((t) => t.id));
  const fixTitles = L3.CORRECOES.titles.map((c) => {
    if (!allTitles.has(c.id)) problems.push(`correção: título ${c.id} não existe`);
    const n = normalizeCatalogRow('catalog_titles', { ...c, title_br: 'x', kind: 'novela', confidence: c.confidence ?? 'media' });
    for (const e of n.errors) problems.push(`correção ${c.id}: ${e}`);
    const sets = Object.entries(c).filter(([k]) => k !== 'id').map(([k, v]) => `${k} = ${q(v)}`);
    return `update public.catalog_titles set ${sets.join(', ')}, approved = false, batch = ${q(L3.BATCH)}, updated_at = now() where id = ${q(c.id)};`;
  });
  const fixRights = L3.CORRECOES.rights.map((c) => {
    if (!RIGHTS.some((r) => r.id === c.id)) problems.push(`correção: direito ${c.id} não existe`);
    return `update public.historical_rights set valid_to = ${q(c.valid_to)}, notes = ${q(c.notes)}, approved = false, batch = ${q(L3.BATCH)}, updated_at = now() where id = ${c.id};`;
  });
  const grids = base.rows.schedule_templates;
  const sql = `-- Prime Time Manager — catálogo real, era atual (2026), ${L3.BATCH}: grades de janeiro de 2026.
-- Gerado por scripts/gen-catalog-seed.ts a partir de supabase/seeds/catalogo_2026_lote3.ts. Não edite à mão.
-- 1) Substitui as grades de janeiro do lote 1 da Globo, da Record e da Band (as do lote 1 eram curtas) e inclui
--    RedeTV! e Cultura. A grade do SBT do lote 1 continua valendo. Tudo entra como NÃO aprovado.
--    Atenção: até você aprovar as grades novas, partidas novas usam a grade genérica nessas cinco emissoras.
-- 2) Correções em itens do lote 1 (Mãe, Guerra das Rosas, Força de Mulher e o direito de Mãe): voltam para pendente.
-- Rodar de novo não duplica nada (as correções são reaplicadas e continuam pendentes até você aprovar).

${CATALOG_GUARD}

begin;

delete from public.schedule_templates
where era_id = '${ERA}' and reference_month = '2026-01' and station_key in (${LOTE3_REPLACES.map((x) => q(x)).join(', ')}) and batch = ${q(BATCH)};
${insertSql('schedule_templates', grids, '(era_id, station_key, reference_month)')}
${fixTitles.join('\n')}
${fixRights.join('\n')}

commit;
`;
  return {
    problems, sql,
    csv: { schedule_templates: catalogRowsToCSV('schedule_templates', grids) },
    counts: { grades: grids.length, faixas: L3.GRIDS.reduce((n, g) => n + g.slots.length, 0), programas: L3.GRIDS.reduce((n, g) => n + new Set(g.slots.map((s) => s.titulo)).size, 0), correcoes: fixTitles.length + fixRights.length },
    rows: { rights_holders: [], catalog_titles: [], schedule_templates: grids, historical_rights: [] },
  };
}

export function buildBatch(seed: BatchSeed): BuiltSeed {
  const BATCH = seed.batch;
  const problems: string[] = [];
  const check = (table: CatalogTable, label: string, raw: Record<string, unknown>) => {
    const n = normalizeCatalogRow(table, raw);
    for (const e of n.errors) problems.push(`${table} ${label}: ${e}`);
    return n.row;
  };
  const prevHolders = new Set((seed.previous ?? []).flatMap((p) => p.holders.map((h) => h.id)));
  const prevTitles = new Set((seed.previous ?? []).flatMap((p) => p.titles.map((t) => t.id)));
  const prevRights = new Set((seed.previous ?? []).flatMap((p) => p.rights.map((r) => r.id)));

  const holderIds = new Set<string>();
  const holders = seed.holders.map((h) => {
    if (holderIds.has(h.id) || prevHolders.has(h.id)) problems.push(`rights_holders ${h.id}: código repetido`);
    holderIds.add(h.id);
    if ((h.representative_seed as { ficticio?: boolean }).ficticio !== true) problems.push(`rights_holders ${h.id}: representante precisa ser fictício`);
    return check('rights_holders', h.id, { ...h, batch: BATCH });
  });
  const titleIds = new Set<string>();
  const usedOldHolders = new Set<string>();
  const titles = seed.titles.map((t) => {
    if (titleIds.has(t.id) || prevTitles.has(t.id)) problems.push(`catalog_titles ${t.id}: código repetido`);
    titleIds.add(t.id);
    if (!holderIds.has(t.rights_holder_id)) {
      if (prevHolders.has(t.rights_holder_id)) usedOldHolders.add(t.rights_holder_id);
      else problems.push(`catalog_titles ${t.id}: player "${t.rights_holder_id}" não existe`);
    }
    if (!t.notes.trim()) problems.push(`catalog_titles ${t.id}: sem nota de fonte`);
    return check('catalog_titles', t.id, { ...t, batch: BATCH });
  });
  const allTitles = new Set([...titleIds, ...prevTitles]);
  const grids = seed.grids.map((g) => {
    g.slots.forEach((sl, i) => {
      if (!(sl.genero in GENRES)) problems.push(`grade ${g.station_key} faixa ${i + 1}: gênero "${sl.genero}" não existe`);
      if (sl.catalog_title_id && !allTitles.has(sl.catalog_title_id)) problems.push(`grade ${g.station_key} faixa ${i + 1}: título "${sl.catalog_title_id}" não existe`);
      if (!/^\d{2}:\d{2}$/.test(sl.inicio) || !/^\d{2}:\d{2}$/.test(sl.fim)) problems.push(`grade ${g.station_key} faixa ${i + 1}: horário inválido`);
    });
    return check('schedule_templates', g.station_key, { era_id: ERA, station_key: g.station_key, reference_month: g.reference_month ?? REFERENCE_MONTH, slots: g.slots, confidence: g.confidence, notes: g.notes, batch: BATCH });
  });
  const known = new Set([...allTitles, ...holderIds, ...prevHolders, 'novelas_turcas']);
  const rights = seed.rights.map((r) => {
    if (prevRights.has(r.id)) problems.push(`historical_rights ${r.id}: código repetido`);
    if (!known.has(r.product_ref)) problems.push(`historical_rights ${r.id}: produto "${r.product_ref}" não existe`);
    return check('historical_rights', String(r.id), { ...r, era_id: ERA, batch: BATCH });
  });
  for (const [table, rows] of [['rights_holders', holders], ['catalog_titles', titles], ['schedule_templates', grids], ['historical_rights', rights]] as const) {
    for (const r of rows) if ('approved' in r) problems.push(`${table}: o lote não deve vir aprovado`);
  }

  // lotes seguintes dependem dos players dos lotes anteriores: confere antes de gravar
  const oldList = [...usedOldHolders].sort();
  const needFiles = (seed.previous ?? []).filter((p) => p.holders.some((x) => usedOldHolders.has(x.id))).map((p) => `supabase/seeds/${p.source.replace('.ts', '.sql')}`);
  const prevGuard = oldList.length ? `
do $$
begin
  if (select count(*) from public.rights_holders where id in (${oldList.map((x) => q(x)).join(', ')})) < ${oldList.length} then
    raise exception 'Este lote usa players do lote anterior que não estão no banco. Rode antes ${needFiles.length > 1 ? 'os arquivos' : 'o arquivo'} ${needFiles.join(' e ')} e depois este de novo.';
  end if;
end $$;` : '';

  const sql = `-- Prime Time Manager — catálogo real, era atual (2026), ${BATCH}.
-- Gerado por scripts/gen-catalog-seed.ts a partir de supabase/seeds/${seed.source}. Não edite à mão.
-- Cole no SQL Editor do Supabase DEPOIS da migração do catálogo. Tudo entra como NÃO aprovado:
-- revise e aprove no Editor de Catálogo. Rodar de novo não apaga nem desfaz correções feitas no Editor.
-- Atributos de jogo são estimativas, nunca audiência oficial. Representantes das empresas são fictícios.

${CATALOG_GUARD}
${prevGuard}

begin;

${insertSql('rights_holders', holders, '(id)')}
${insertSql('catalog_titles', titles, '(id)')}
${insertSql('schedule_templates', grids, '(era_id, station_key, reference_month)')}
${insertSql('historical_rights', rights, '(id)')}
-- ids fixos do lote em historical_rights: avança o contador para as próximas inclusões pelo Editor
select setval(pg_get_serial_sequence('public.historical_rights', 'id'), greatest((select max(id) from public.historical_rights), 1));

commit;
`;
  return {
    problems,
    sql,
    csv: {
      rights_holders: catalogRowsToCSV('rights_holders', holders),
      catalog_titles: catalogRowsToCSV('catalog_titles', titles),
      schedule_templates: catalogRowsToCSV('schedule_templates', grids),
      historical_rights: catalogRowsToCSV('historical_rights', rights),
    },
    counts: { players: holders.length, titulos: titles.length, grades: grids.length, faixas: seed.grids.reduce((n, g) => n + g.slots.length, 0), direitos: rights.length },
    rows: { rights_holders: holders, catalog_titles: titles, schedule_templates: grids, historical_rights: rights },
  };
}
