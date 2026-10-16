// Editor de Catálogo (seções 8A.4 e 20.1): revisar títulos, players, grades, direitos, clubes e torcidas reais.
// Aprovar, corrigir, apagar, adicionar, importar e exportar CSV, com filtro por confiança.
// Só leitura para quem não está em ALLOWED_EMAILS; toda escrita passa pela Edge Function catalog-admin.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CATALOG_TABLES, CATALOG_TABLE_ORDER, CONFIDENCE_LABEL, catalogKey, catalogRowsToCSV, csvToCatalogRows, normalizeCatalogRow,
} from '@game/catalog.ts';
import type { CatalogTable, CsvImport, FieldDef } from '@game/catalog.ts';
import { backendSync } from '../lib/backend.ts';
import type { Row } from '../lib/backend.ts';
import { queryClient, useRows } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { Badge, Button, Empty, Modal, Spinner, Tabs, inputClass } from '../components/ui.tsx';

type Status = 'todos' | 'pendentes' | 'aprovados';
const CONF_TONE: Record<string, 'good' | 'warn' | 'bad'> = { alta: 'good', media: 'warn', baixa: 'bad' };

async function callAdmin<T>(body: Row): Promise<T> {
  return backendSync().call<T>('catalog-admin', body);
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const keyStr = (table: CatalogTable, r: Row) => JSON.stringify(catalogKey(table, r) ?? { id: r.id });

export function CatalogEditor() {
  const demo = backendSync().mode === 'demo';
  const toast = useUI((s) => s.toast);
  const [table, setTable] = useState<CatalogTable>('catalog_titles');
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [conf, setConf] = useState<'todas' | 'alta' | 'media' | 'baixa'>('todas');
  const [status, setStatus] = useState<Status>('todos');
  const [batch, setBatch] = useState('');
  const [kind, setKind] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const def = CATALOG_TABLES[table];
  const rows = useRows(['catalog', table], table, {}, { limit: 5000 }, !demo);

  useEffect(() => {
    if (demo) return;
    void callAdmin<{ admin: boolean }>({ action: 'status' }).then((r) => setAdmin(!!r.admin)).catch(() => setAdmin(false));
  }, [demo]);

  useEffect(() => {
    setSel(new Set());
    setKind('');
    setBatch('');
  }, [table]);

  const all = rows.data ?? [];
  const batches = useMemo(() => [...new Set(all.map((r) => String(r.batch ?? '')).filter(Boolean))].sort(), [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => conf === 'todas' || r.confidence === conf)
      .filter((r) => status === 'todos' || (status === 'aprovados' ? r.approved === true : r.approved !== true))
      .filter((r) => !batch || r.batch === batch)
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => !needle || JSON.stringify(r).toLowerCase().includes(needle))
      .sort((a, b) => def.title(a).localeCompare(def.title(b), 'pt-BR'));
  }, [all, q, conf, status, batch, kind, def]);
  const selectedRows = list.filter((r) => sel.has(keyStr(table, r)));
  const highPending = list.filter((r) => r.confidence === 'alta' && r.approved !== true);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog', table] });
  const act = async (label: string, body: Row) => {
    setBusy(true);
    try {
      await callAdmin({ table, ...body });
      toast('success', label);
      setSel(new Set());
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const keys = (rs: Row[]) => rs.map((r) => catalogKey(table, r) ?? { id: r.id });

  if (demo) {
    return (
      <Page>
        <Empty title="O Editor de Catálogo precisa do modo nuvem">O catálogo real fica no Supabase. Entre com a sua conta para revisar e editar.</Empty>
      </Page>
    );
  }

  return (
    <Page>
      {admin === false && (
        <div className="rounded-theme border border-warn/40 bg-warn/10 p-3 text-sm">
          <b className="text-warn">Somente leitura.</b> Para editar, o seu e-mail precisa estar no segredo <code>ALLOWED_EMAILS</code> do Supabase.
        </div>
      )}

      <Tabs value={table} onChange={setTable} items={CATALOG_TABLE_ORDER.map((t) => ({ id: t, label: CATALOG_TABLES[t].label }))} />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input className={`${inputClass} lg:col-span-2`} placeholder="Buscar em todos os campos..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputClass} value={conf} onChange={(e) => setConf(e.target.value as typeof conf)} aria-label="Confiança">
          <option value="todas">Confiança: todas</option>
          <option value="alta">Confiança alta</option>
          <option value="media">Confiança média</option>
          <option value="baixa">Confiança baixa</option>
        </select>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Situação">
          <option value="todos">Aprovados e pendentes</option>
          <option value="pendentes">Só pendentes</option>
          <option value="aprovados">Só aprovados</option>
        </select>
        <select className={inputClass} value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Lote">
          <option value="">Todos os lotes</option>
          {batches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {table === 'catalog_titles' && (
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {(def.fields.find((f) => f.name === 'kind')?.options ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{list.length} de {all.length} · {selectedRows.length} selecionado(s)</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => download(`${table}.csv`, catalogRowsToCSV(table, list))} disabled={!list.length}>Exportar CSV</Button>
          {admin && (
            <>
              <Button size="sm" onClick={() => setImporting(true)}>Importar CSV</Button>
              <Button size="sm" variant="primary" onClick={() => setEditing('new')}>+ Adicionar</Button>
            </>
          )}
        </div>
      </div>

      {admin && (selectedRows.length > 0 || highPending.length > 0) && (
        <div className="flex flex-wrap gap-1.5 rounded-theme border border-border bg-surface-2 p-2">
          {selectedRows.length > 0 && (
            <>
              <Button size="sm" busy={busy} onClick={() => act(`${selectedRows.length} aprovado(s)`, { action: 'approve', keys: keys(selectedRows), approved: true })}>Aprovar selecionados</Button>
              <Button size="sm" busy={busy} onClick={() => act(`${selectedRows.length} voltaram a pendente`, { action: 'approve', keys: keys(selectedRows), approved: false })}>Voltar para pendente</Button>
              <Button size="sm" variant="danger" busy={busy} onClick={() => setConfirmDel(true)}>Apagar selecionados</Button>
            </>
          )}
          {highPending.length > 0 && (
            <Button size="sm" busy={busy} onClick={() => act(`${highPending.length} de confiança alta aprovado(s)`, { action: 'approve', keys: keys(highPending), approved: true })}>
              Aprovar os {highPending.length} de confiança alta deste filtro
            </Button>
          )}
        </div>
      )}

      {rows.isLoading ? (
        <div className="flex justify-center p-8 text-muted"><Spinner /></div>
      ) : rows.error ? (
        <Empty title="Não foi possível ler o catálogo">{String((rows.error as Error).message)}. A migração do catálogo foi aplicada no Supabase?</Empty>
      ) : list.length === 0 ? (
        <Empty title={all.length ? 'Nada com esses filtros' : 'Catálogo vazio'}>{all.length ? 'Mude os filtros acima.' : 'Importe um CSV ou cole o lote de seeds no SQL Editor do Supabase.'}</Empty>
      ) : (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 px-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={selectedRows.length === list.length}
              onChange={(e) => setSel(e.target.checked ? new Set(list.map((r) => keyStr(table, r))) : new Set())}
            />
            Selecionar todos do filtro
          </label>
          {list.map((r) => {
            const k = keyStr(table, r);
            return (
              <div key={k} className={`card flex items-start gap-2 p-3 ${sel.has(k) ? 'border-accent' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={`Selecionar ${def.title(r)}`}
                  checked={sel.has(k)}
                  onChange={(e) => setSel((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(k);
                    else n.delete(k);
                    return n;
                  })}
                />
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{def.title(r)}</span>
                    <Badge tone={CONF_TONE[String(r.confidence)] ?? 'neutral'}>confiança {CONFIDENCE_LABEL[r.confidence as 'alta'] ?? String(r.confidence ?? '?')}</Badge>
                    {r.approved === true ? <Badge tone="accent">aprovado</Badge> : <Badge>pendente</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">{subtitle(table, r)}</div>
                  {r.notes ? <div className="mt-0.5 line-clamp-2 text-xs text-muted">{String(r.notes)}</div> : null}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditDialog
          table={table}
          row={editing === 'new' ? null : editing}
          readOnly={!admin}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
          onDelete={editing !== 'new' && admin ? async () => {
            setEditing(null);
            await act('Item apagado', { action: 'delete', keys: keys([editing as Row]) });
          } : undefined}
        />
      )}
      {importing && <ImportDialog table={table} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await refresh(); }} />}
      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Apagar do catálogo?"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDel(false)}>Cancelar</Button>
            <Button variant="danger" busy={busy} onClick={async () => { setConfirmDel(false); await act(`${selectedRows.length} apagado(s)`, { action: 'delete', keys: keys(selectedRows) }); }}>
              Apagar {selectedRows.length}
            </Button>
          </div>
        }
      >
        <p className="text-sm">Isto apaga de vez {selectedRows.length} item(ns) de {def.label.toLowerCase()}. Partidas já criadas não mudam.</p>
      </Modal>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-full max-w-5xl space-y-3 px-3 pb-16 pt-5 safe-top sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Editor de Catálogo</h1>
          <p className="text-sm text-muted">Títulos, empresas e grades reais. Só os itens aprovados entram nas partidas novas.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => go('/')}>← Partidas</Button>
      </header>
      {children}
    </div>
  );
}

function subtitle(table: CatalogTable, r: Row): string {
  const parts: unknown[] = [];
  if (table === 'catalog_titles') parts.push(r.kind, r.country, r.rights_holder_id, r.production_year, r.episodes ? `${r.episodes} cap.` : null);
  if (table === 'rights_holders') parts.push(r.category, Array.isArray(r.eras) ? (r.eras as string[]).join('/') : null);
  if (table === 'schedule_templates') parts.push(r.era_id, Array.isArray(r.slots) ? `${(r.slots as unknown[]).length} faixas` : null);
  if (table === 'historical_rights') parts.push(r.era_id, r.valid_from, r.valid_to);
  if (table === 'clubs') parts.push(r.country);
  if (table === 'club_fanbase') parts.push(r.era_id, typeof r.share === 'number' ? `${Math.round(r.share * 100)}%` : null);
  parts.push(r.batch);
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ');
}

// ===== formulário =====
function toInput(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  if (f.type === 'list') return Array.isArray(v) ? v.join('|') : String(v);
  if (f.type === 'bool') return v ? 'sim' : 'não';
  return String(v);
}

function EditDialog({ table, row, readOnly, onClose, onSaved, onDelete }: { table: CatalogTable; row: Row | null; readOnly: boolean; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  const def = CATALOG_TABLES[table];
  const toast = useUI((s) => s.toast);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(def.fields.map((f) => [f.name, row ? toInput(f, row[f.name]) : f.type === 'confidence' ? 'media' : f.type === 'bool' ? 'não' : ''])));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isKey = (name: string) => !!row && def.keys.includes(name);

  const save = async () => {
    const raw: Row = { ...vals };
    if (def.autoId && row?.id) raw.id = row.id;
    const n = normalizeCatalogRow(table, raw);
    setErrors(n.errors);
    if (n.errors.length) return;
    setBusy(true);
    try {
      const r = await callAdmin<{ ok: boolean; errors: { errors: string[] }[] }>({ action: 'save', table, rows: [raw] });
      if (!r.ok) {
        setErrors(r.errors.flatMap((e) => e.errors));
        return;
      }
      toast('success', row ? 'Item corrigido' : 'Item adicionado');
      onSaved();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={row ? def.title(row) : `Adicionar em ${def.label.toLowerCase()}`}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div>{onDelete && <Button variant="danger" onClick={onDelete}>Apagar</Button>}</div>
          <div className="flex gap-2">
            <Button onClick={onClose}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
            {!readOnly && <Button variant="primary" busy={busy} onClick={save}>Salvar</Button>}
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {def.fields.map((f) => {
          const wide = f.type === 'json' || f.type === 'longtext';
          const common = { id: `f-${f.name}`, disabled: readOnly || isKey(f.name), className: inputClass };
          const set = (v: string) => setVals((s) => ({ ...s, [f.name]: v }));
          return (
            <label key={f.name} className={`block text-sm ${wide ? 'sm:col-span-2' : ''}`} htmlFor={`f-${f.name}`}>
              <span className="mb-1 block text-xs font-semibold text-muted">{f.label}{f.required ? ' *' : ''}</span>
              {f.type === 'confidence' ? (
                <select {...common} value={vals[f.name]} onChange={(e) => set(e.target.value)}>
                  <option value="alta">alta</option>
                  <option value="media">média</option>
                  <option value="baixa">baixa</option>
                </select>
              ) : f.type === 'bool' ? (
                <select {...common} value={vals[f.name]} onChange={(e) => set(e.target.value)}>
                  <option value="não">não</option>
                  <option value="sim">sim</option>
                </select>
              ) : f.options && f.type === 'text' ? (
                <select {...common} value={vals[f.name]} onChange={(e) => set(e.target.value)}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : wide ? (
                <textarea {...common} rows={f.type === 'json' ? 6 : 3} className={`${inputClass} font-mono text-xs`} value={vals[f.name]} onChange={(e) => set(e.target.value)} />
              ) : (
                <input {...common} type={f.type === 'date' ? 'date' : f.type === 'int' || f.type === 'numeric' ? 'number' : 'text'} step={f.type === 'numeric' ? 'any' : undefined} value={vals[f.name]} onChange={(e) => set(e.target.value)} />
              )}
              {f.hint && <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>}
            </label>
          );
        })}
      </div>
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-theme bg-bad/10 p-3 text-sm text-bad">
          {errors.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </Modal>
  );
}

// ===== importação de CSV =====
function ImportDialog({ table, onClose, onDone }: { table: CatalogTable; onClose: () => void; onDone: () => void }) {
  const def = CATALOG_TABLES[table];
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const preview: CsvImport | null = useMemo(() => (text.trim() ? csvToCatalogRows(table, text) : null), [text, table]);
  const valid = preview ? preview.rows.filter((r) => !r.errors.length) : [];
  const invalid = preview ? preview.rows.filter((r) => r.errors.length) : [];

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  const send = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      // envia o texto de cada célula das linhas válidas; o servidor valida tudo de novo antes de gravar
      const r = await callAdmin<{ ok: boolean; saved: number; errors: { index: number; errors: string[] }[] }>({ action: 'save', table, rows: valid.map((v) => v.raw) });
      if (!r.ok) {
        toast('error', `O servidor recusou ${r.errors.length} linha(s): ${r.errors[0]?.errors.join('; ')}`);
        return;
      }
      toast('success', `${r.saved} linha(s) importada(s)${invalid.length ? `; ${invalid.length} com erro ficaram de fora` : ''}`);
      onDone();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Importar CSV em ${def.label.toLowerCase()}`}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => download(`modelo_${table}.csv`, catalogRowsToCSV(table, []))}>Baixar modelo</Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" busy={busy} disabled={!valid.length || !!preview?.headerErrors.length} onClick={send}>Importar {valid.length} linha(s)</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          A primeira linha traz os nomes das colunas (baixe o modelo). Separador ";" (padrão do Excel em português) ou ",".
          Item com o mesmo código é atualizado; sem a coluna <code>approved</code>, a aprovação dos itens existentes não muda.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} className="block w-full text-sm" />
        <textarea className={`${inputClass} font-mono text-xs`} rows={6} placeholder="…ou cole o conteúdo do CSV aqui" value={text} onChange={(e) => setText(e.target.value)} />
        {preview && (
          <div className="space-y-2">
            {preview.headerErrors.map((e) => <p key={e} className="rounded-theme bg-bad/10 p-2 text-bad">{e}</p>)}
            <p><b>{valid.length}</b> linha(s) válida(s) · <b className={invalid.length ? 'text-bad' : ''}>{invalid.length}</b> com erro</p>
            {invalid.length > 0 && (
              <ul className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto rounded-theme bg-bad/10 p-2 text-xs text-bad">
                {invalid.slice(0, 100).map((r) => <li key={r.line}>Linha {r.line}: {r.errors.join('; ')}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
