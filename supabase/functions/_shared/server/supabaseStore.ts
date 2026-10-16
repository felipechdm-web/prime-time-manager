// Persistência no Supabase Postgres (service role: só as Edge Functions escrevem).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import type { GameRow, GameStore, SelectOpts } from '../game/types.ts';

export class SupabaseStore implements GameStore {
  constructor(private db: SupabaseClient) {}

  async getGame(id: string): Promise<GameRow | null> {
    const { data, error } = await this.db.from('games').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`games: ${error.message}`);
    return (data as GameRow) ?? null;
  }

  async insertGame(row: GameRow): Promise<void> {
    const { error } = await this.db.from('games').insert(row);
    if (error) throw new Error(`games insert: ${error.message}`);
  }

  async updateGame(id: string, patch: Partial<GameRow>, expectedVersion: number): Promise<boolean> {
    const { data, error } = await this.db.from('games').update(patch).eq('id', id).eq('version', expectedVersion).select('id');
    if (error) throw new Error(`games update: ${error.message}`);
    return Array.isArray(data) && data.length > 0;
  }

  async insert(table: string, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (!rows.length) return [];
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await this.db.from(table).insert(rows.slice(i, i + 200)).select('id');
      if (error) throw new Error(`${table} insert: ${error.message}`);
      out.push(...((data as Record<string, unknown>[]) ?? []));
    }
    return out;
  }

  async select(table: string, eq: Record<string, unknown>, opts: SelectOpts = {}): Promise<Record<string, unknown>[]> {
    let q = this.db.from(table).select(opts.columns ?? '*');
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as string);
    for (const [k, v] of Object.entries(opts.gte ?? {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(opts.lt ?? {})) q = q.lt(k, v);
    if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(`${table} select: ${error.message}`);
    return (data as unknown as Record<string, unknown>[]) ?? [];
  }

  async upsert(table: string, rows: Record<string, unknown>[], onConflict: string[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 200) {
      // defaultToNull: false -> coluna ausente usa o padrão na inserção e não é sobrescrita na atualização
      const { error } = await this.db.from(table).upsert(rows.slice(i, i + 200), { onConflict: onConflict.join(','), defaultToNull: false });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  }

  async update(table: string, eq: Record<string, unknown>, patch: Record<string, unknown>): Promise<void> {
    let q = this.db.from(table).update(patch);
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as string);
    const { error } = await q;
    if (error) throw new Error(`${table} update: ${error.message}`);
  }

  async remove(table: string, eq: Record<string, unknown>, lt?: Record<string, number>): Promise<void> {
    let q = this.db.from(table).delete();
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as string);
    for (const [k, v] of Object.entries(lt ?? {})) q = q.lt(k, v);
    const { error } = await q;
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }

  async countSince(table: string, eq: Record<string, unknown>, column: string, sinceIso: string): Promise<number> {
    let q = this.db.from(table).select('id', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as string);
    q = q.gte(column, sinceIso);
    const { count, error } = await q;
    if (error) throw new Error(`${table} count: ${error.message}`);
    return count ?? 0;
  }
}
