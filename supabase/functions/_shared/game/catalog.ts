// Catálogo real (seções 8A e 18.1): regras dos campos de cada tabela, validação e CSV.
// Módulo puro, usado pela Edge Function catalog-admin (validação oficial) e pelo Editor de Catálogo
// (prévia da importação, formulário e exportação).

import { ERAS } from '../engine/catalog/eras.ts';
import { GENRES } from '../engine/catalog/genres.ts';
import { MARKETS } from '../engine/catalog/markets.ts';

export type CatalogTable = 'catalog_titles' | 'rights_holders' | 'schedule_templates' | 'historical_rights' | 'clubs' | 'club_fanbase';
export type Confidence = 'alta' | 'media' | 'baixa';
export const CONFIDENCES: Confidence[] = ['alta', 'media', 'baixa'];
export const CONFIDENCE_LABEL: Record<Confidence, string> = { alta: 'alta', media: 'média', baixa: 'baixa' };

type FieldType = 'text' | 'longtext' | 'int' | 'numeric' | 'date' | 'month' | 'bool' | 'confidence' | 'json' | 'list';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // valores aceitos (texto ou itens de lista)
  min?: number;
  max?: number;
  hint?: string;
}

export interface TableDef {
  table: CatalogTable;
  label: string;
  keys: string[]; // chave para atualizar/apagar; tabelas com id automático aceitam linha sem id (inserção)
  autoId?: boolean;
  title: (r: Record<string, unknown>) => string; // texto principal na lista
  fields: FieldDef[];
}

const ERA_IDS = Object.keys(ERAS);
const MARKET_CODES = MARKETS.map((m) => m.code);
export const TITLE_KINDS = ['novela', 'serie', 'minisserie', 'filme', 'pacote_filmes', 'desenho', 'formato', 'reality', 'documentario', 'programa'];
export const HOLDER_CATEGORIES = [
  'novela_latina', 'novela_turca', 'asiatico', 'estudio_eua', 'formato', 'futebol_nacional', 'futebol_internacional', 'outros_esportes', 'produtora_br', 'emissora', 'infantil',
];

const review: FieldDef[] = [
  { name: 'confidence', label: 'Confiança', type: 'confidence', required: true, hint: 'alta, media ou baixa. Itens de confiança baixa só entram nas partidas depois de revisados.' },
  { name: 'approved', label: 'Aprovado', type: 'bool', hint: 'Só itens aprovados entram nas partidas.' },
  { name: 'notes', label: 'Notas (fonte da informação)', type: 'longtext' },
  { name: 'batch', label: 'Lote', type: 'text', hint: 'Ex.: 2026-lote1' },
];

export const CATALOG_TABLES: Record<CatalogTable, TableDef> = {
  catalog_titles: {
    table: 'catalog_titles', label: 'Títulos', keys: ['id'], title: (r) => String(r.title_br ?? r.id ?? ''),
    fields: [
      { name: 'id', label: 'Código', type: 'text', required: true, hint: 'Único, sem espaços (ex.: marimar_1994)' },
      { name: 'title_br', label: 'Título no Brasil', type: 'text', required: true },
      { name: 'title_original', label: 'Título original', type: 'text' },
      { name: 'kind', label: 'Tipo', type: 'text', required: true, options: TITLE_KINDS },
      { name: 'country', label: 'País de origem', type: 'text' },
      { name: 'rights_holder_id', label: 'Player dono dos direitos', type: 'text', hint: 'Código do player (aba Players)' },
      { name: 'production_year', label: 'Ano de produção', type: 'int', min: 1900, max: 2100 },
      { name: 'episodes', label: 'Capítulos/episódios', type: 'int', min: 1, max: 5000 },
      { name: 'duration_min', label: 'Duração (min)', type: 'int', min: 1, max: 600 },
      { name: 'available_from', label: 'À venda no jogo a partir de', type: 'date' },
      { name: 'available_to', label: 'À venda no jogo até', type: 'date' },
      { name: 'br_history', label: 'Exibição real no Brasil (JSON)', type: 'json', hint: 'Ex.: [{"emissora":"sbt","de":"1996","ate":"1997"}]' },
      { name: 'game_attrs', label: 'Atributos de jogo (JSON, estimativas)', type: 'json', hint: 'Ex.: {"genre":"novela_19h","quality":60,"appeal":75,"fatigue":20}. Gênero = um dos gêneros do jogo. Nunca é audiência oficial.' },
      ...review,
    ],
  },
  rights_holders: {
    table: 'rights_holders', label: 'Players', keys: ['id'], title: (r) => String(r.name ?? r.id ?? ''),
    fields: [
      { name: 'id', label: 'Código', type: 'text', required: true, hint: 'Ex.: televisa' },
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'category', label: 'Categoria', type: 'text', required: true, options: HOLDER_CATEGORIES },
      { name: 'eras', label: 'Eras', type: 'list', required: true, options: ERA_IDS, hint: `Separe por | (ex.: 90s|now). Valores: ${ERA_IDS.join(', ')}` },
      { name: 'profile', label: 'Perfil de negociação (JSON)', type: 'json', hint: 'Estilo, prioridades e pesos (usado na Mesa de Negociação)' },
      { name: 'representative_seed', label: 'Representante fictício (JSON)', type: 'json', hint: 'Ex.: {"nome":"…","cargo":"…","estilo":"…"}. Sempre um personagem inventado.' },
      ...review,
    ],
  },
  schedule_templates: {
    table: 'schedule_templates', label: 'Grades', keys: ['era_id', 'station_key', 'reference_month'], autoId: true,
    title: (r) => `${String(r.station_key ?? '')} · ${String(r.reference_month ?? '')}`,
    fields: [
      { name: 'era_id', label: 'Era', type: 'text', required: true, options: ERA_IDS },
      { name: 'station_key', label: 'Emissora', type: 'text', required: true, hint: 'Ex.: globo, sbt, record, band' },
      { name: 'reference_month', label: 'Mês de referência', type: 'month', required: true, hint: 'AAAA-MM (ex.: 2026-01)' },
      { name: 'slots', label: 'Grade (JSON)', type: 'json', required: true, hint: 'Lista de faixas: [{"dias":"seg-sex","inicio":"21:20","fim":"22:30","titulo":"…","catalog_title_id":"…"}]' },
      ...review,
    ],
  },
  historical_rights: {
    table: 'historical_rights', label: 'Direitos', keys: ['id'], autoId: true,
    title: (r) => `${String(r.product_ref ?? '')} → ${String(r.holder_station_key ?? '')}`,
    fields: [
      { name: 'era_id', label: 'Era', type: 'text', required: true, options: ERA_IDS },
      { name: 'product_ref', label: 'Produto', type: 'text', required: true, hint: 'Código de título, de player ou de competição' },
      { name: 'holder_station_key', label: 'Emissora titular', type: 'text', required: true },
      { name: 'terms', label: 'Termos (JSON)', type: 'json', hint: 'Ex.: {"exclusividade":"tv_aberta","plataformas":["tv_aberta"]}' },
      { name: 'valid_from', label: 'Vale de', type: 'date' },
      { name: 'valid_to', label: 'Vale até', type: 'date' },
      ...review,
    ],
  },
  clubs: {
    table: 'clubs', label: 'Clubes', keys: ['id'], title: (r) => String(r.name ?? r.id ?? ''),
    fields: [
      { name: 'id', label: 'Código', type: 'text', required: true },
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'country', label: 'País', type: 'text' },
      { name: 'rating_by_season', label: 'Força por temporada (JSON, 0-100)', type: 'json', hint: 'Ex.: {"2026":82}' },
      ...review,
    ],
  },
  club_fanbase: {
    table: 'club_fanbase', label: 'Torcidas', keys: ['club_id', 'market_id', 'era_id'],
    title: (r) => `${String(r.club_id ?? '')} · ${String(r.market_id ?? '')}`,
    fields: [
      { name: 'club_id', label: 'Clube', type: 'text', required: true },
      { name: 'market_id', label: 'Praça', type: 'text', required: true, options: MARKET_CODES },
      { name: 'era_id', label: 'Era', type: 'text', required: true, options: ERA_IDS },
      { name: 'share', label: 'Fatia da torcida na praça (0 a 1)', type: 'numeric', required: true, min: 0, max: 1 },
      ...review,
    ],
  },
};

export const CATALOG_TABLE_ORDER: CatalogTable[] = ['catalog_titles', 'rights_holders', 'schedule_templates', 'historical_rights', 'clubs', 'club_fanbase'];

export function isCatalogTable(t: unknown): t is CatalogTable {
  return typeof t === 'string' && t in CATALOG_TABLES;
}

// ===== validação =====
export interface NormalizeResult {
  row: Record<string, unknown>;
  errors: string[];
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function parseBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'yes', 'x', 'aprovado'].includes(s)) return true;
  if (['false', '0', 'nao', 'não', 'n', 'no', 'pendente'].includes(s)) return false;
  return null;
}

function normConfidence(v: unknown): Confidence | null {
  const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (CONFIDENCES as string[]).includes(s) ? (s as Confidence) : null;
}

function checkGameAttrs(v: unknown, errors: string[]): void {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    errors.push('Atributos de jogo: precisa ser um objeto JSON');
    return;
  }
  const a = v as Record<string, unknown>;
  if (a.genre !== undefined && !(String(a.genre) in GENRES)) errors.push(`Atributos de jogo: gênero "${String(a.genre)}" não existe no jogo`);
  for (const k of ['quality', 'appeal', 'fatigue']) {
    if (a[k] === undefined) continue;
    const n = Number(a[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`Atributos de jogo: ${k} deve ficar entre 0 e 100`);
  }
}

// Converte valores vindos de CSV, formulário ou JSON para o formato do banco. Só devolve as colunas
// presentes na entrada (uma importação sem a coluna "approved" não mexe na aprovação dos itens existentes).
export function normalizeCatalogRow(table: CatalogTable, raw: Record<string, unknown>): NormalizeResult {
  const def = CATALOG_TABLES[table];
  const row: Record<string, unknown> = {};
  const errors: string[] = [];
  const known = new Set(def.fields.map((f) => f.name).concat(def.autoId ? ['id'] : []));
  for (const k of Object.keys(raw)) if (!known.has(k)) errors.push(`Coluna desconhecida: ${k}`);
  if (def.autoId && !blank(raw.id)) {
    const id = Number(raw.id);
    if (Number.isInteger(id) && id > 0) row.id = id;
    else errors.push('id: precisa ser um número inteiro');
  }
  for (const f of def.fields) {
    if (!(f.name in raw)) {
      if (f.required) errors.push(`${f.label}: obrigatório`);
      continue;
    }
    const v = raw[f.name];
    if (blank(v)) {
      if (f.required) errors.push(`${f.label}: obrigatório`);
      else row[f.name] = f.type === 'bool' ? false : null;
      continue;
    }
    switch (f.type) {
      case 'text':
      case 'longtext': {
        const s = String(v).trim();
        if (f.options && !f.options.includes(s)) errors.push(`${f.label}: "${s}" não é aceito (use ${f.options.join(', ')})`);
        if (f.name === 'id' && !/^[a-z0-9_.-]+$/i.test(s)) errors.push('Código: use só letras, números, _ . ou -');
        row[f.name] = f.type === 'text' ? s.slice(0, 300) : s.slice(0, 4000);
        break;
      }
      case 'int':
      case 'numeric': {
        const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
        if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) errors.push(`${f.label}: número inválido`);
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors.push(`${f.label}: deve ficar entre ${f.min} e ${f.max}`);
        else row[f.name] = n;
        break;
      }
      case 'date': {
        const s = String(v).trim();
        const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
        const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : s;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) errors.push(`${f.label}: data inválida (use AAAA-MM-DD ou DD/MM/AAAA)`);
        else row[f.name] = iso;
        break;
      }
      case 'month': {
        const s = String(v).trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) errors.push(`${f.label}: use AAAA-MM`);
        else row[f.name] = s;
        break;
      }
      case 'bool': {
        const b = parseBool(v);
        if (b === null) errors.push(`${f.label}: use sim ou não`);
        else row[f.name] = b;
        break;
      }
      case 'confidence': {
        const c = normConfidence(v);
        if (!c) errors.push(`${f.label}: use alta, media ou baixa`);
        else row[f.name] = c;
        break;
      }
      case 'json': {
        let parsed: unknown = v;
        if (typeof v === 'string') {
          try {
            parsed = JSON.parse(v);
          } catch {
            errors.push(`${f.label}: JSON inválido`);
            break;
          }
        }
        if (parsed === null || typeof parsed !== 'object') {
          errors.push(`${f.label}: precisa ser um objeto ou uma lista JSON`);
          break;
        }
        if (table === 'catalog_titles' && f.name === 'game_attrs') checkGameAttrs(parsed, errors);
        row[f.name] = parsed;
        break;
      }
      case 'list': {
        const items = Array.isArray(v) ? v.map((x) => String(x).trim()) : String(v).split(/[|,;]/).map((x) => x.trim());
        const list = items.filter(Boolean);
        const bad = f.options ? list.filter((x) => !f.options!.includes(x)) : [];
        if (bad.length) errors.push(`${f.label}: valores não aceitos: ${bad.join(', ')}`);
        else if (f.required && !list.length) errors.push(`${f.label}: obrigatório`);
        else row[f.name] = list;
        break;
      }
    }
  }
  const from = row.available_from ?? row.valid_from;
  const to = row.available_to ?? row.valid_to;
  if (typeof from === 'string' && typeof to === 'string' && to < from) errors.push('A data final é anterior à inicial');
  return { row, errors };
}

export function catalogKey(table: CatalogTable, row: Record<string, unknown>): Record<string, unknown> | null {
  const def = CATALOG_TABLES[table];
  const key: Record<string, unknown> = {};
  for (const k of def.keys) {
    if (blank(row[k])) return null;
    key[k] = row[k];
  }
  return key;
}

// ===== CSV (padrão do Excel em português: separador ";"; também aceita "," e tabulação) =====
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export interface CsvImport {
  // raw: texto de cada célula (é o que vai para o servidor, que valida de novo); row: valores já convertidos
  rows: { line: number; raw: Record<string, string>; row: Record<string, unknown>; errors: string[] }[];
  headerErrors: string[];
}

export function csvToCatalogRows(table: CatalogTable, text: string): CsvImport {
  const cells = parseCSV(text);
  if (!cells.length) return { rows: [], headerErrors: ['Arquivo vazio'] };
  const header = cells[0].map((h) => h.trim());
  const headerErrors: string[] = [];
  const def = CATALOG_TABLES[table];
  for (const f of def.fields) if (f.required && !header.includes(f.name)) headerErrors.push(`Falta a coluna obrigatória "${f.name}"`);
  const rows = cells.slice(1).map((line, i) => {
    const raw: Record<string, string> = {};
    header.forEach((h, j) => {
      if (h) raw[h] = line[j] ?? '';
    });
    const n = normalizeCatalogRow(table, raw);
    return { line: i + 2, raw, row: n.row, errors: n.errors };
  });
  return { rows, headerErrors };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) && v.every((x) => typeof x !== 'object') ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Exporta no mesmo formato que a importação aceita (abre direto no Excel em português)
export function catalogRowsToCSV(table: CatalogTable, rows: Record<string, unknown>[]): string {
  const def = CATALOG_TABLES[table];
  const cols = (def.autoId ? ['id'] : []).concat(def.fields.map((f) => f.name));
  const lines = [cols.join(';'), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(';'))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
