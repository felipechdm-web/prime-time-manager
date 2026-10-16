// Edge Function catalog-admin (seção 19.7): o Editor de Catálogo aprova, corrige, apaga, adiciona e importa
// títulos, players, grades, direitos, clubes e torcidas. Só o dono do projeto (e-mail em ALLOWED_EMAILS) edita.

import { CATALOG_TABLES, catalogKey, isCatalogTable, normalizeCatalogRow } from './catalog.ts';
import type { CatalogTable } from './catalog.ts';
import { HttpError } from './types.ts';
import type { HandlerCtx } from './types.ts';

const MAX_ROWS = 1000;

function tableOf(body: Record<string, unknown>): CatalogTable {
  if (!isCatalogTable(body.table)) throw new HttpError(400, 'Tabela de catálogo inválida');
  return body.table;
}

function keysOf(table: CatalogTable, body: Record<string, unknown>): Record<string, unknown>[] {
  const list = Array.isArray(body.keys) ? (body.keys as Record<string, unknown>[]) : [];
  if (!list.length) throw new HttpError(400, 'Nenhum item selecionado');
  if (list.length > MAX_ROWS) throw new HttpError(400, `No máximo ${MAX_ROWS} itens por vez`);
  return list.map((k) => {
    const key = k && typeof k === 'object' ? catalogKey(table, k) : null;
    if (!key) throw new HttpError(400, `Chave incompleta (${CATALOG_TABLES[table].keys.join(', ')})`);
    return key;
  });
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/foreign key|violates foreign key/i.test(msg)) return 'Há outros itens ligados a este (ex.: títulos de um player). Apague ou mude esses itens antes.';
  if (/duplicate key|unique/i.test(msg)) return 'Já existe um item com essa chave.';
  return msg;
}

export async function catalogAdminHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  const action = String(body.action ?? '');
  if (action === 'status') return { admin: !!ctx.env.catalogAdmin };
  if (!ctx.env.catalogAdmin) {
    throw new HttpError(403, 'Só o dono do projeto edita o catálogo. Cadastre o seu e-mail no segredo ALLOWED_EMAILS do Supabase.');
  }
  const table = tableOf(body);
  const def = CATALOG_TABLES[table];
  const now = ctx.now().toISOString();

  if (action === 'save') {
    // adicionar, corrigir ou importar: todas as linhas são validadas antes de gravar qualquer uma
    const raw = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
    if (!raw.length) throw new HttpError(400, 'Nada para salvar');
    if (raw.length > MAX_ROWS) throw new HttpError(400, `No máximo ${MAX_ROWS} linhas por vez`);
    const rows: Record<string, unknown>[] = [];
    const errors: { index: number; errors: string[] }[] = [];
    raw.forEach((r, index) => {
      const n = normalizeCatalogRow(table, r && typeof r === 'object' ? r : {});
      if (n.errors.length) errors.push({ index, errors: n.errors });
      else rows.push({ ...n.row, updated_at: now });
    });
    if (errors.length) return { ok: false, saved: 0, errors };
    // linhas sem id nas tabelas de id automático são inserções; as demais, inserção ou atualização pela chave
    const keyed = rows.filter((r) => catalogKey(table, r));
    const fresh = rows.filter((r) => !catalogKey(table, r));
    if (fresh.length && !def.autoId) throw new HttpError(400, `Falta a chave (${def.keys.join(', ')})`);
    try {
      // agrupa por conjunto de colunas: uma gravação em lote exige as mesmas colunas em todas as linhas
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const r of keyed) {
        const sig = Object.keys(r).sort().join(',');
        groups.set(sig, [...(groups.get(sig) ?? []), r]);
      }
      for (const g of groups.values()) await ctx.store.upsert(table, g, def.keys);
      if (fresh.length) await ctx.store.insert(table, fresh);
    } catch (err) {
      throw new HttpError(400, friendly(err));
    }
    return { ok: true, saved: rows.length, errors: [] };
  }

  if (action === 'approve') {
    const keys = keysOf(table, body);
    const approved = body.approved !== false;
    for (const key of keys) await ctx.store.update(table, key, { approved, updated_at: now });
    return { ok: true, updated: keys.length };
  }

  if (action === 'delete') {
    const keys = keysOf(table, body);
    let removed = 0;
    for (const key of keys) {
      try {
        await ctx.store.remove(table, key);
        removed += 1;
      } catch (err) {
        throw new HttpError(400, `${removed} apagado(s); parei em ${JSON.stringify(key)}: ${friendly(err)}`);
      }
    }
    return { ok: true, removed };
  }

  throw new HttpError(400, 'Ação desconhecida');
}
