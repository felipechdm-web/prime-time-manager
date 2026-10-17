// Catálogo real dentro da partida (v2, seção 8A): cópia dos itens aprovados, grade de referência por emissora,
// gênero de jogo de cada título, exclusividades e divergências. Funções puras, sem I/O.

import { GENRES } from './catalog/genres.ts';
import type { CatalogHolderSnap, CatalogSlotSnap, CatalogSnapshot, CatalogTitleSnap, Divergence, GameState, GenreId } from './types.ts';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

// Monta a cópia do catálogo a partir das linhas aprovadas do banco (formato das tabelas da seção 18.1).
export function buildCatalogSnapshot(rows: { titles: Row[]; templates: Row[]; rights: Row[]; holders: Row[] }): CatalogSnapshot | null {
  const titles: CatalogTitleSnap[] = rows.titles.map((r) => {
    const attrs = (r.game_attrs && typeof r.game_attrs === 'object' ? r.game_attrs : {}) as CatalogTitleSnap['attrs'];
    const hist = Array.isArray(r.br_history) ? (r.br_history as Row[]) : [];
    return {
      id: String(r.id),
      titleBr: String(r.title_br ?? r.id),
      titleOriginal: str(r.title_original),
      kind: String(r.kind ?? 'serie'),
      country: str(r.country),
      holderId: str(r.rights_holder_id),
      year: num(r.production_year),
      episodes: num(r.episodes),
      durationMin: num(r.duration_min),
      availableFrom: str(r.available_from)?.slice(0, 10) ?? null,
      availableTo: str(r.available_to)?.slice(0, 10) ?? null,
      attrs,
      brStations: [...new Set(hist.map((h) => str(h.emissora)).filter((x): x is string => !!x))],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const grids = rows.templates
    .filter((r) => Array.isArray(r.slots))
    .map((r) => ({ stationKey: String(r.station_key), referenceMonth: String(r.reference_month ?? ''), slots: r.slots as CatalogSlotSnap[] }))
    .sort((a, b) => `${a.stationKey}${a.referenceMonth}`.localeCompare(`${b.stationKey}${b.referenceMonth}`));
  const rights = rows.rights.map((r) => {
    const terms = (r.terms && typeof r.terms === 'object' ? r.terms : {}) as Row;
    return {
      productRef: String(r.product_ref),
      holderStationKey: String(r.holder_station_key),
      validFrom: str(r.valid_from)?.slice(0, 10) ?? null,
      validTo: str(r.valid_to)?.slice(0, 10) ?? null,
      exclusive: !!terms.exclusividade && terms.tipo !== 'relacionamento',
      ...(terms.tipo === 'relacionamento' ? { kind: 'relacionamento' } : {}),
    };
  }).sort((a, b) => `${a.productRef}${a.holderStationKey}`.localeCompare(`${b.productRef}${b.holderStationKey}`));
  const holders = rows.holders.map((r): CatalogHolderSnap => {
    const profile = (r.profile && typeof r.profile === 'object' ? r.profile : {}) as Row;
    const rep = (r.representative_seed && typeof r.representative_seed === 'object' ? r.representative_seed : null) as Row | null;
    const style = ['duro', 'relacional', 'leiloeiro'].includes(String(profile.estilo)) ? profile.estilo as CatalogHolderSnap['style'] : undefined;
    return {
      id: String(r.id), name: String(r.name ?? r.id),
      ...(str(r.category) ? { category: str(r.category)! } : {}),
      ...(style ? { style } : {}),
      ...(Array.isArray(profile.prioridades) ? { priorities: (profile.prioridades as unknown[]).map(String) } : {}),
      ...(rep && str(rep.nome) ? { representative: { nome: String(rep.nome), cargo: String(rep.cargo ?? ''), estilo: String(rep.estilo ?? '') } } : {}),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (!titles.length && !grids.length) return null;
  return { titles, grids, rights, holders };
}

// "seg-sex", "sab", "qua,sex", "seg,qui,sex" -> dias 0..6 (segunda = 0)
const DAY_INDEX: Record<string, number> = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, sáb: 5, dom: 6 };
export function parseDays(dias: string): number[] {
  const out = new Set<number>();
  for (const part of dias.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = part.split('-').map((x) => DAY_INDEX[x.trim()]);
    if (a === undefined) continue;
    if (b === undefined) out.add(a);
    else for (let d = a; d <= b; d++) out.add(d);
  }
  return [...out].sort();
}

// Grade de referência de uma emissora: a do mês da largada, senão a mais recente antes dela, senão a mais antiga.
export function pickGrid(cat: CatalogSnapshot, stationKey: string, startDate: string): CatalogSnapshot['grids'][number] | null {
  const month = startDate.slice(0, 7);
  const list = cat.grids.filter((g) => g.stationKey === stationKey && g.slots.length);
  if (!list.length) return null;
  return list.find((g) => g.referenceMonth === month)
    ?? [...list].filter((g) => g.referenceMonth <= month).sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))[0]
    ?? [...list].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))[0];
}

export function catalogGenre(t: CatalogTitleSnap): GenreId {
  const g = t.attrs.genre;
  if (g && g in GENRES) return g as GenreId;
  switch (t.kind) {
    case 'novela': return 'novela_19h';
    case 'minisserie': return 'serie_nacional';
    case 'filme':
    case 'pacote_filmes': return 'filme';
    case 'desenho': return 'infantil';
    case 'documentario': return 'documentario';
    case 'formato':
    case 'reality': return 'reality';
    default: return 'serie_estrangeira';
  }
}

// artigo da emissora: "do SBT", "no SBT"; "da Globo", "na Band", "da TV Horizonte"
export function stationArticle(name: string): { de: string; em: string } {
  return /^SBT\b/i.test(name.trim()) ? { de: 'do', em: 'no' } : { de: 'da', em: 'na' };
}

// "exclusivo do SBT até 12/2028"
export function lockLabel(l: { stationName: string; until: string | null }): string {
  return `exclusivo ${stationArticle(l.stationName).de} ${l.stationName}${l.until ? ` até ${l.until.slice(5, 7)}/${l.until.slice(0, 4)}` : ''}`;
}

export function titleById(state: GameState, id: string | undefined | null): CatalogTitleSnap | undefined {
  return id ? state.catalog?.titles.find((t) => t.id === id) : undefined;
}

export function holderName(state: GameState, id: string | null): string | null {
  return id ? state.catalog?.holders.find((h) => h.id === id)?.name ?? null : null;
}

export function availableAt(t: CatalogTitleSnap, date: string): boolean {
  return (!t.availableFrom || t.availableFrom <= date) && (!t.availableTo || t.availableTo >= date);
}

// Exclusividade vigente sobre o título (direito do próprio título ou de todo o catálogo do player)
export function exclusiveRight(state: GameState, t: CatalogTitleSnap, date: string): { stationKey: string; until: string | null } | null {
  for (const r of state.catalog?.rights ?? []) {
    if (!r.exclusive) continue;
    if (r.productRef !== t.id && r.productRef !== t.holderId) continue;
    if (r.validFrom && r.validFrom > date) continue;
    if (r.validTo && r.validTo < date) continue;
    return { stationKey: r.holderStationKey, until: r.validTo };
  }
  return null;
}

// Registra que a partida se afastou da história real (aparece para o Mestre e vai para a tabela divergences)
export function recordDivergence(state: GameState, d: Divergence): void {
  state.divergences = [...(state.divergences ?? []), d].slice(-100);
  state.pendingDivergences = [...(state.pendingDivergences ?? []), d];
}
