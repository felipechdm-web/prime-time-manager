// Testes do catálogo real (Fase 6.2): validação dos campos, CSV e a função catalog-admin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import { catalogAdminHandler } from '../supabase/functions/_shared/game/catalogAdmin.ts';
import { catalogRowsToCSV, csvToCatalogRows, normalizeCatalogRow, parseCSV } from '../supabase/functions/_shared/game/catalog.ts';
import { resolveLLMConfig } from '../supabase/functions/_shared/game/llmConfig.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import type { HandlerCtx } from '../supabase/functions/_shared/game/types.ts';

function ctxWith(store: MemoryStore, admin: boolean): HandlerCtx {
  return {
    store, llm: null, userId: 'u', validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60, catalogAdmin: admin },
    now: () => new Date('2026-10-17T12:00:00Z'), uuid: () => 'x',
  };
}

test('validação: converte texto do CSV/formulário e acusa erros por campo', () => {
  const ok = normalizeCatalogRow('catalog_titles', {
    id: 'marimar_1994', title_br: 'Marimar', kind: 'novela', production_year: '1994', episodes: '75',
    available_from: '05/01/2026', game_attrs: '{"genre":"novela_19h","quality":55,"appeal":80}', confidence: 'Média', approved: 'sim',
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.row.production_year, 1994);
  assert.equal(ok.row.available_from, '2026-01-05');
  assert.equal(ok.row.confidence, 'media');
  assert.equal(ok.row.approved, true);
  assert.equal((ok.row.game_attrs as Record<string, unknown>).genre, 'novela_19h');

  const bad = normalizeCatalogRow('catalog_titles', {
    id: 'com espaço', title_br: '', kind: 'novelona', episodes: '-3', game_attrs: '{"genre":"xyz","quality":140}', confidence: 'talvez', extra: '1',
  });
  const msg = bad.errors.join(' | ');
  for (const part of ['Coluna desconhecida: extra', 'Código', 'Título no Brasil: obrigatório', 'Tipo', 'Capítulos', 'gênero "xyz"', 'quality', 'Confiança']) {
    assert.ok(msg.includes(part), `esperava erro sobre ${part}: ${msg}`);
  }
  // colunas ausentes não entram (importação sem "approved" não mexe na aprovação)
  const partial = normalizeCatalogRow('rights_holders', { id: 'televisa', name: 'TelevisaUnivision', category: 'novela_latina', eras: 'now', confidence: 'alta' });
  assert.deepEqual(partial.errors, []);
  assert.equal('approved' in partial.row, false);
  assert.deepEqual(partial.row.eras, ['now']);
  // o jogo tem só a era atual: outras eras são recusadas
  assert.ok(normalizeCatalogRow('rights_holders', { id: 'x', name: 'X', category: 'formato', eras: 'now|90s', confidence: 'alta' }).errors.some((e) => e.includes('90s')));
  assert.ok(normalizeCatalogRow('club_fanbase', { club_id: 'fla', market_id: 'XX', era_id: 'now', share: '1,5', confidence: 'alta' }).errors.length >= 2);
});

test('CSV: separador ";" do Excel, aspas, quebra de linha dentro da célula e BOM', () => {
  const rows = parseCSV('﻿id;title_br;notes\r\na;"Título; com ponto e vírgula";"linha 1\nlinha 2"\r\nb;"Aspas ""duplas""";\r\n\r\n');
  assert.deepEqual(rows, [['id', 'title_br', 'notes'], ['a', 'Título; com ponto e vírgula', 'linha 1\nlinha 2'], ['b', 'Aspas "duplas"', '']]);
  assert.deepEqual(parseCSV('id,name\nx,"a, b"'), [['id', 'name'], ['x', 'a, b']]);
});

test('CSV: exportar e importar de volta dá o mesmo conteúdo; erros apontam a linha', () => {
  const original = [{
    id: 'kara_sevda', title_br: 'Amor Eterno', title_original: 'Kara Sevda', kind: 'novela', country: 'Turquia', rights_holder_id: 'intermedya',
    production_year: 2015, episodes: 74, duration_min: 120, available_from: '2026-01-05', available_to: null,
    br_history: [{ emissora: 'band', de: '2019' }], game_attrs: { genre: 'novela_21h', quality: 70, appeal: 72, fatigue: 30 },
    confidence: 'media', approved: false, notes: 'Exibida pela Band; conferir ano; ok', batch: '2026-lote1',
  }];
  const csv = catalogRowsToCSV('catalog_titles', original);
  const back = csvToCatalogRows('catalog_titles', csv);
  assert.deepEqual(back.headerErrors, []);
  assert.deepEqual(back.rows[0].errors, []);
  for (const [k, v] of Object.entries(original[0])) assert.deepEqual(back.rows[0].row[k], v, k);

  const withErr = csvToCatalogRows('catalog_titles', 'id;title_br;kind;confidence\nok_1;Ok;filme;alta\nruim;;filme;alta\n');
  assert.equal(withErr.rows.filter((r) => !r.errors.length).length, 1);
  assert.equal(withErr.rows.find((r) => r.errors.length)!.line, 3);
  assert.ok(csvToCatalogRows('catalog_titles', 'id;kind\nx;filme').headerErrors.some((e) => e.includes('title_br')));
});

test('lote 1 de 2026: válido pelas regras do Editor, sem aprovação e com fonte em cada item', async () => {
  const { buildLote1 } = await import('../supabase/seeds/build.ts');
  const { TITLES, HOLDERS, GRIDS } = await import('../supabase/seeds/catalogo_2026_lote1.ts');
  const built = buildLote1();
  assert.deepEqual(built.problems, []);
  assert.equal(built.counts.titulos, 60);
  assert.deepEqual(GRIDS.map((g) => g.station_key).sort(), ['band', 'globo', 'record', 'sbt']);
  for (const x of [...TITLES, ...HOLDERS]) assert.ok(x.notes.length > 10, `${x.id} sem nota de fonte`);
  // representantes das empresas são sempre fictícios
  for (const h of HOLDERS) assert.equal((h.representative_seed as { ficticio?: boolean }).ficticio, true);
  // o CSV gerado volta pela importação do Editor sem erros
  const back = csvToCatalogRows('catalog_titles', built.csv.catalog_titles!);
  assert.equal(back.rows.filter((r) => r.errors.length).length, 0);
  assert.equal(back.rows.length, 60);
});

test('catalog-admin: só o dono edita; valida antes de gravar; aprova, corrige e apaga', async () => {
  const store = new MemoryStore();
  const admin = ctxWith(store, true);
  const visitor = ctxWith(store, false);
  assert.deepEqual(await catalogAdminHandler(visitor, { action: 'status' }), { admin: false });
  await assert.rejects(() => catalogAdminHandler(visitor, { action: 'save', table: 'clubs', rows: [{ id: 'fla', name: 'Flamengo', confidence: 'alta' }] }), /ALLOWED_EMAILS/);

  // uma linha com erro barra o lote inteiro
  const r1 = await catalogAdminHandler(admin, { action: 'save', table: 'rights_holders', rows: [
    { id: 'televisa', name: 'TelevisaUnivision', category: 'novela_latina', eras: 'now', confidence: 'alta' },
    { id: 'sem_nome', category: 'formato', eras: 'now', confidence: 'alta' },
  ] }) as { ok: boolean; errors: { index: number }[] };
  assert.equal(r1.ok, false);
  assert.equal(r1.errors[0].index, 1);
  assert.equal((await store.select('rights_holders', {})).length, 0);

  await catalogAdminHandler(admin, { action: 'save', table: 'rights_holders', rows: [{ id: 'televisa', name: 'TelevisaUnivision', category: 'novela_latina', eras: 'now', confidence: 'alta' }] });
  await catalogAdminHandler(admin, { action: 'approve', table: 'rights_holders', keys: [{ id: 'televisa' }], approved: true });
  // corrigir sem a coluna approved mantém a aprovação
  await catalogAdminHandler(admin, { action: 'save', table: 'rights_holders', rows: [{ id: 'televisa', name: 'Televisa', category: 'novela_latina', eras: 'now', confidence: 'alta' }] });
  const [h] = await store.select('rights_holders', { id: 'televisa' });
  assert.equal(h.name, 'Televisa');
  assert.equal(h.approved, true);
  assert.deepEqual(h.eras, ['now']);

  // tabelas de id automático: linha sem id é inserida; com a chave natural, atualizada
  await catalogAdminHandler(admin, { action: 'save', table: 'historical_rights', rows: [{ era_id: 'now', product_ref: 'televisa', holder_station_key: 'sbt', confidence: 'alta' }] });
  await catalogAdminHandler(admin, { action: 'save', table: 'schedule_templates', rows: [{ era_id: 'now', station_key: 'globo', reference_month: '2026-01', slots: '[]', confidence: 'media' }] });
  await catalogAdminHandler(admin, { action: 'save', table: 'schedule_templates', rows: [{ era_id: 'now', station_key: 'globo', reference_month: '2026-01', slots: '[{"titulo":"Jornal Nacional"}]', confidence: 'alta' }] });
  const grades = await store.select('schedule_templates', {});
  assert.equal(grades.length, 1);
  assert.equal(grades[0].confidence, 'alta');
  assert.equal((await store.select('historical_rights', {})).length, 1);

  const del = await catalogAdminHandler(admin, { action: 'delete', table: 'rights_holders', keys: [{ id: 'televisa' }] }) as { removed: number };
  assert.equal(del.removed, 1);
  await assert.rejects(() => catalogAdminHandler(admin, { action: 'delete', table: 'rights_holders', keys: [{}] }), /Chave incompleta/);
  await assert.rejects(() => catalogAdminHandler(admin, { action: 'save', table: 'games', rows: [{}] }), /Tabela de catálogo inválida/);
});
