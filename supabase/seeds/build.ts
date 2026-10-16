// Monta o SQL e os CSV de cada lote do catálogo real, validando tudo com as mesmas regras do Editor de Catálogo.
// Usado por scripts/gen-catalog-seed.ts (grava os arquivos) e pelos testes (só valida).

import { GENRES } from '../functions/_shared/engine/catalog/genres.ts';
import { catalogRowsToCSV, normalizeCatalogRow } from '../functions/_shared/game/catalog.ts';
import type { CatalogTable } from '../functions/_shared/game/catalog.ts';
import { BATCH, GRIDS, HOLDERS, REFERENCE_MONTH, RIGHTS, TITLES } from './catalogo_2026_lote1.ts';
import type { GridSeed, HolderSeed, RightSeed, TitleSeed } from './catalogo_2026_lote1.ts';
import * as L2A from './catalogo_2026_lote2a.ts';
import * as L2B from './catalogo_2026_lote2b.ts';

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
