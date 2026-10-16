// Implementação em memória do GameStore: usada nos testes e no modo demo do navegador
// (que a persiste no IndexedDB). Mesmo contrato do SupabaseStore.

import type { GameRow, GameStore, SelectOpts } from './types.ts';

type Row = Record<string, unknown>;

export class MemoryStore implements GameStore {
  tables: Map<string, Row[]> = new Map();
  seq: Map<string, number> = new Map();
  dirty: Set<string> = new Set();

  private t(name: string): Row[] {
    let arr = this.tables.get(name);
    if (!arr) {
      arr = [];
      this.tables.set(name, arr);
    }
    return arr;
  }

  private nextId(table: string): number {
    const n = (this.seq.get(table) ?? 0) + 1;
    this.seq.set(table, n);
    return n;
  }

  load(table: string, rows: Row[]): void {
    this.tables.set(table, rows);
    let max = 0;
    for (const r of rows) if (typeof r.id === 'number' && r.id > max) max = r.id;
    this.seq.set(table, max);
  }

  async getGame(id: string): Promise<GameRow | null> {
    const g = this.t('games').find((r) => r.id === id);
    return g ? (structuredClone(g) as unknown as GameRow) : null;
  }

  async insertGame(row: GameRow): Promise<void> {
    this.t('games').push(structuredClone(row) as unknown as Row);
    this.dirty.add('games');
  }

  async updateGame(id: string, patch: Partial<GameRow>, expectedVersion: number): Promise<boolean> {
    const g = this.t('games').find((r) => r.id === id);
    if (!g || g.version !== expectedVersion) return false;
    Object.assign(g, structuredClone(patch));
    this.dirty.add('games');
    return true;
  }

  async insert(table: string, rows: Row[]): Promise<Row[]> {
    const arr = this.t(table);
    const out: Row[] = [];
    for (const r of rows) {
      const copy = structuredClone(r);
      if (copy.id === undefined || copy.id === null) copy.id = this.nextId(table);
      if (copy.created_at === undefined) copy.created_at = new Date().toISOString();
      arr.push(copy);
      out.push({ id: copy.id });
    }
    this.dirty.add(table);
    return out;
  }

  private match(r: Row, eq: Record<string, unknown>, opts: SelectOpts): boolean {
    for (const [k, v] of Object.entries(eq)) if (r[k] !== v) return false;
    for (const [k, v] of Object.entries(opts.gte ?? {})) if (!((r[k] as number | string) >= v)) return false;
    for (const [k, v] of Object.entries(opts.lt ?? {})) if (!((r[k] as number | string) < v)) return false;
    return true;
  }

  async select(table: string, eq: Record<string, unknown>, opts: SelectOpts = {}): Promise<Row[]> {
    let rows = this.t(table).filter((r) => this.match(r, eq, opts));
    if (opts.order) {
      const k = opts.order;
      const asc = opts.ascending ?? true;
      rows = [...rows].sort((a, b) => {
        const x = a[k] as number | string;
        const y = b[k] as number | string;
        if (x === y) return 0;
        return (x < y ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return structuredClone(rows);
  }

  async update(table: string, eq: Record<string, unknown>, patch: Row): Promise<void> {
    for (const r of this.t(table)) if (this.match(r, eq, {})) Object.assign(r, structuredClone(patch));
    this.dirty.add(table);
  }

  async remove(table: string, eq: Record<string, unknown>, lt?: Record<string, number>): Promise<void> {
    const arr = this.t(table);
    const keep = arr.filter((r) => !this.match(r, eq, { lt }));
    if (keep.length !== arr.length) {
      this.tables.set(table, keep);
      this.dirty.add(table);
    }
  }

  async countSince(table: string, eq: Record<string, unknown>, column: string, sinceIso: string): Promise<number> {
    return this.t(table).filter((r) => this.match(r, eq, { gte: { [column]: sinceIso } })).length;
  }

  // apaga uma partida e tudo que pertence a ela
  async deleteGame(id: string): Promise<void> {
    for (const [name, rows] of this.tables) {
      const keep = name === 'games' ? rows.filter((r) => r.id !== id) : rows.filter((r) => r.game_id !== id);
      if (keep.length !== rows.length) {
        this.tables.set(name, keep);
        this.dirty.add(name);
      }
    }
    const convIds = new Set((this.tables.get('conversations') ?? []).map((c) => c.id));
    const msgs = this.tables.get('messages') ?? [];
    const keepMsgs = msgs.filter((m) => convIds.has(m.conversation_id));
    if (keepMsgs.length !== msgs.length) {
      this.tables.set('messages', keepMsgs);
      this.dirty.add('messages');
    }
  }
}
