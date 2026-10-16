// Monta o SQL e os CSV de um lote do catálogo real, validando tudo com as mesmas regras do Editor de Catálogo.
// Usado por scripts/gen-catalog-seed.ts (grava os arquivos) e pelos testes (só valida).

import { GENRES } from '../functions/_shared/engine/catalog/genres.ts';
import { catalogRowsToCSV, normalizeCatalogRow } from '../functions/_shared/game/catalog.ts';
import type { CatalogTable } from '../functions/_shared/game/catalog.ts';
import { BATCH, GRIDS, HOLDERS, REFERENCE_MONTH, RIGHTS, TITLES } from './catalogo_2026_lote1.ts';

const ERA = 'now';

export interface BuiltSeed {
  problems: string[];
  sql: string;
  csv: Partial<Record<CatalogTable, string>>;
  counts: Record<string, number>;
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

export function buildLote1(): BuiltSeed {
  const problems: string[] = [];
  const check = (table: CatalogTable, label: string, raw: Record<string, unknown>) => {
    const n = normalizeCatalogRow(table, raw);
    for (const e of n.errors) problems.push(`${table} ${label}: ${e}`);
    return n.row;
  };

  const holders = HOLDERS.map((h) => check('rights_holders', h.id, { ...h, batch: BATCH }));
  const holderIds = new Set(HOLDERS.map((h) => h.id));
  const titleIds = new Set<string>();
  const titles = TITLES.map((t) => {
    if (titleIds.has(t.id)) problems.push(`catalog_titles ${t.id}: código repetido`);
    titleIds.add(t.id);
    if (!holderIds.has(t.rights_holder_id)) problems.push(`catalog_titles ${t.id}: player "${t.rights_holder_id}" não existe no lote`);
    if (!t.notes.trim()) problems.push(`catalog_titles ${t.id}: sem nota de fonte`);
    return check('catalog_titles', t.id, { ...t, batch: BATCH });
  });
  const grids = GRIDS.map((g) => {
    g.slots.forEach((sl, i) => {
      if (!(sl.genero in GENRES)) problems.push(`grade ${g.station_key} faixa ${i + 1}: gênero "${sl.genero}" não existe`);
      if (sl.catalog_title_id && !titleIds.has(sl.catalog_title_id)) problems.push(`grade ${g.station_key} faixa ${i + 1}: título "${sl.catalog_title_id}" não está no lote`);
      if (!/^\d{2}:\d{2}$/.test(sl.inicio) || !/^\d{2}:\d{2}$/.test(sl.fim)) problems.push(`grade ${g.station_key} faixa ${i + 1}: horário inválido`);
    });
    return check('schedule_templates', g.station_key, { era_id: ERA, station_key: g.station_key, reference_month: REFERENCE_MONTH, slots: g.slots, confidence: g.confidence, notes: g.notes, batch: BATCH });
  });
  const known = new Set([...titleIds, ...holderIds, 'novelas_turcas']);
  const rights = RIGHTS.map((r) => {
    if (!known.has(r.product_ref)) problems.push(`historical_rights ${r.id}: produto "${r.product_ref}" não está no lote`);
    return check('historical_rights', String(r.id), { ...r, era_id: ERA, batch: BATCH });
  });
  for (const [table, rows] of [['rights_holders', holders], ['catalog_titles', titles], ['schedule_templates', grids], ['historical_rights', rights]] as const) {
    for (const r of rows) if ('approved' in r) problems.push(`${table}: o lote não deve vir aprovado`);
  }

  const sql = `-- Prime Time Manager — catálogo real, era atual (2026), ${BATCH}.
-- Gerado por scripts/gen-catalog-seed.ts a partir de supabase/seeds/catalogo_2026_lote1.ts. Não edite à mão.
-- Cole no SQL Editor do Supabase DEPOIS da migração do catálogo. Tudo entra como NÃO aprovado:
-- revise e aprove no Editor de Catálogo. Rodar de novo não apaga nem desfaz correções feitas no Editor.
-- Atributos de jogo são estimativas, nunca audiência oficial. Representantes das empresas são fictícios.

-- confere se a migração do catálogo já foi aplicada (senão, para com uma explicação)
do $$
begin
  if to_regclass('public.rights_holders') is null then
    raise exception 'O catálogo ainda não existe neste banco. Cole e rode PRIMEIRO o arquivo supabase/setup_completo.sql da pasta Documentos\\GitHub\\prime-time-manager (passo 1 da Fase 6.2) e depois rode este arquivo de novo.';
  end if;
end $$;

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
    counts: { players: holders.length, titulos: titles.length, grades: grids.length, faixas: GRIDS.reduce((n, g) => n + g.slots.length, 0), direitos: rights.length },
  };
}
