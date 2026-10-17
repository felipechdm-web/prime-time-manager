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
  assert.equal(built.counts.titulos, 64);
  assert.deepEqual(GRIDS.map((g) => g.station_key).sort(), ['band', 'globo', 'record', 'sbt']);
  for (const x of [...TITLES, ...HOLDERS]) assert.ok(x.notes.length > 10, `${x.id} sem nota de fonte`);
  // representantes das empresas são sempre fictícios
  for (const h of HOLDERS) assert.equal((h.representative_seed as { ficticio?: boolean }).ficticio, true);
  // o CSV gerado volta pela importação do Editor sem erros
  const back = csvToCatalogRows('catalog_titles', built.csv.catalog_titles!);
  assert.equal(back.rows.filter((r) => r.errors.length).length, 0);
  assert.equal(back.rows.length, 64);
});

test('lote 2a de 2026: válido, sem códigos repetidos com o lote 1, fonte em cada item e lote 1 + 2a montam o catálogo da partida', async () => {
  const { buildLote1, buildLote2a } = await import('../supabase/seeds/build.ts');
  const L2A = await import('../supabase/seeds/catalogo_2026_lote2a.ts');
  const { buildCatalogSnapshot } = await import('../supabase/functions/_shared/engine/catalogWorld.ts');
  const built = buildLote2a();
  assert.deepEqual(built.problems, []);
  assert.ok(built.counts.titulos >= 120, `esperava ~125 títulos, veio ${built.counts.titulos}`);
  for (const x of [...L2A.TITLES, ...L2A.HOLDERS, ...L2A.RIGHTS]) assert.ok(x.notes.length > 10, `${x.id} sem nota de fonte`);
  // só enlatados neste sub-lote (filmes e formatos vêm no 2b)
  for (const x of L2A.TITLES) assert.ok(['novela', 'serie', 'minisserie', 'desenho', 'documentario'].includes(x.kind), `${x.id}: tipo ${x.kind}`);
  // o SQL confere que os players do lote 1 já estão no banco
  assert.match(built.sql, /players do lote anterior/);
  const back = csvToCatalogRows('catalog_titles', built.csv.catalog_titles!);
  assert.equal(back.rows.filter((r) => r.errors.length).length, 0);
  // os dois lotes juntos: Chapolin fica travado para quem não é o SBT (direito do Grupo Chespirito)
  const l1 = buildLote1().rows;
  const l2 = built.rows;
  const cat = buildCatalogSnapshot({
    titles: [...l1.catalog_titles, ...l2.catalog_titles], templates: l1.schedule_templates,
    rights: [...l1.historical_rights, ...l2.historical_rights], holders: [...l1.rights_holders, ...l2.rights_holders],
  })!;
  assert.equal(cat.titles.length, 64 + built.counts.titulos);
  assert.ok(cat.rights.some((r) => r.productRef === 'grupo_chespirito' && r.holderStationKey === 'sbt' && r.exclusive));
});

test('lote 2b de 2026: filmes e formatos válidos; com os três lotes o catálogo chega a ~300 títulos e filmes da Globo Filmes travam', async () => {
  const { buildLote1, buildLote2a, buildLote2b } = await import('../supabase/seeds/build.ts');
  const L2B = await import('../supabase/seeds/catalogo_2026_lote2b.ts');
  const { buildCatalogSnapshot, exclusiveRight } = await import('../supabase/functions/_shared/engine/catalogWorld.ts');
  const built = buildLote2b();
  assert.deepEqual(built.problems, []);
  for (const x of [...L2B.TITLES, ...L2B.HOLDERS, ...L2B.RIGHTS]) assert.ok(x.notes.length > 10, `${x.id} sem nota de fonte`);
  for (const x of L2B.TITLES) assert.ok(['filme', 'pacote_filmes', 'formato', 'reality'].includes(x.kind), `${x.id}: tipo ${x.kind}`);
  const back = csvToCatalogRows('catalog_titles', built.csv.catalog_titles!);
  assert.equal(back.rows.filter((r) => r.errors.length).length, 0);
  const all = [buildLote1().rows, buildLote2a().rows, built.rows];
  const cat = buildCatalogSnapshot({
    titles: all.flatMap((r) => r.catalog_titles), templates: all[0].schedule_templates,
    rights: all.flatMap((r) => r.historical_rights), holders: all.flatMap((r) => r.rights_holders),
  })!;
  assert.ok(cat.titles.length >= 280 && cat.titles.length <= 320, `total ${cat.titles.length}`);
  const state = { catalog: cat } as unknown as Parameters<typeof exclusiveRight>[0];
  const auto = cat.titles.find((x) => x.id === 'o_auto_da_compadecida')!;
  assert.equal(exclusiveRight(state, auto, '2026-01-05')?.stationKey, 'globo');
});

test('lote 3: grades de janeiro das seis emissoras, sem faixas sobrepostas, 30 a 50 programas e correções pendentes', async () => {
  const { buildLote1, buildLote3, gridProblems, LOTE3_REPLACES } = await import('../supabase/seeds/build.ts');
  const L3 = await import('../supabase/seeds/catalogo_2026_lote3.ts');
  const built = buildLote3();
  assert.deepEqual(built.problems, []);
  const keys = [...L3.GRIDS.map((g) => g.station_key), ...buildLote1().rows.schedule_templates.map((g) => String(g.station_key)).filter((k) => !LOTE3_REPLACES.includes(k))];
  assert.deepEqual([...new Set(keys)].sort(), ['band', 'cultura', 'globo', 'record', 'redetv', 'sbt']);
  for (const g of L3.GRIDS) {
    assert.ok(g.notes.includes('http'), `${g.station_key}: nota sem fonte`);
    assert.equal(g.reference_month, '2026-01');
  }
  // a checagem de sobreposição pega faixas que se cruzam
  const ruim = gridProblems({ station_key: 'x', confidence: 'baixa', notes: '', slots: [
    { dias: 'seg', inicio: '20:00', fim: '21:00', titulo: 'A', genero: 'telejornal' },
    { dias: 'seg-sex', inicio: '20:30', fim: '21:30', titulo: 'B', genero: 'novela_21h' },
    { dias: 'sab', inicio: '05:00', fim: '07:00', titulo: 'C', genero: 'religioso' },
  ] });
  assert.ok(ruim.some((p) => p.includes('se sobrepõe')));
  assert.ok(ruim.some((p) => p.includes('passa das 6h')));
  // correções voltam para pendente; grades do lote 1 substituídas só se ainda forem do lote 1
  assert.match(built.sql, /approved = false/);
  assert.match(built.sql, /station_key in \('globo', 'record', 'band'\) and batch = '2026-lote1'/);
});

test('lote 4: 40 clubes das Séries A e B, torcida em todas as praças e soma de cada praça até 95%', async () => {
  const { buildLote4 } = await import('../supabase/seeds/build.ts');
  const L4 = await import('../supabase/seeds/catalogo_2026_lote4.ts');
  const built = buildLote4();
  assert.deepEqual(built.problems, []);
  const series = L4.CLUBS.filter((x) => /Série [AB] em 2026/.test(x.notes));
  assert.equal(series.length, 40);
  assert.equal(built.counts.pracas, 15);
  for (const fb of L4.FANBASE) assert.equal(fb.confidence, 'baixa', 'torcida por praça é estimativa');
  for (const table of ['clubs', 'club_fanbase'] as const) {
    const back = csvToCatalogRows(table, built.csv[table]!);
    assert.equal(back.rows.filter((r) => r.errors.length).length, 0, table);
  }
});

test('lote 5 (esporte): competições de 2026, mapa de direitos da seção 8C.2, clássicos e nenhum atleta', async () => {
  const { buildLote5 } = await import('../supabase/seeds/build.ts');
  const L5 = await import('../supabase/seeds/catalogo_2026_lote5_esporte.ts');
  const built = buildLote5();
  assert.deepEqual(built.problems, []);
  for (const table of ['rights_holders', 'sports_competitions', 'historical_rights'] as const) {
    const back = csvToCatalogRows(table, built.csv[table]!);
    assert.equal(back.rows.filter((r) => r.errors.length).length, 0, table);
  }
  // mapa da largada (seção 8C.2)
  const holder = (comp: string) => L5.RIGHTS.filter((r) => r.product_ref === comp).map((r) => r.holder_station_key).sort();
  assert.deepEqual(holder('brasileirao_a'), ['globo', 'globo', 'record']);
  assert.equal(L5.RIGHTS.find((r) => r.product_ref === 'brasileirao_a' && r.holder_station_key === 'record')!.valid_to, '2027-12-31');
  assert.deepEqual(holder('formula1'), ['globo']);
  assert.deepEqual(holder('champions_league'), ['sbt']);
  assert.deepEqual(holder('copa_do_mundo'), ['globo', 'sbt']);
  assert.deepEqual(holder('libertadores'), ['globo']);
  assert.deepEqual(holder('sul_americana'), ['sbt']);
  const cdb = L5.COMPETITIONS.find((c) => c.id === 'copa_do_brasil')!;
  const tender = (cdb.calendar_rules.concorrencias as { ciclo: string; abre: string }[])[0];
  assert.equal(tender.ciclo, '2027-2030');
  assert.ok(tender.abre <= '2026-01-05', 'a concorrência da Copa do Brasil está aberta na largada');
  // nenhum atleta: participantes são clubes, seleções ou times genéricos
  for (const c of L5.COMPETITIONS) for (const list of Object.values(c.participants)) for (const p of list) assert.match(p, /^([a-z0-9_]+|generico:[a-z_]+|selecao:[a-z_]+)$/);
  assert.equal(built.counts.competicoes, 12);
  assert.ok(built.rivalries.flamengo.some((r) => r.club === 'fluminense' && r.name === 'Fla-Flu'));
  assert.ok(built.rivalries.fluminense.some((r) => r.club === 'flamengo'), 'clássico vale para os dois lados');
});

test('direitos esportivos no catálogo da partida não viram contrato de título (o motor esportivo cuida deles)', async () => {
  const { buildCatalogSnapshot } = await import('../supabase/functions/_shared/engine/catalogWorld.ts');
  const snap = buildCatalogSnapshot({
    titles: [{ id: 'marimar', title_br: 'Marimar', kind: 'novela', rights_holder_id: 'televisa', game_attrs: {} }], templates: [], holders: [],
    rights: [{ product_ref: 'formula1', holder_station_key: 'globo', terms: { tipo: 'esporte', exclusividade: 'exclusivo' }, valid_from: '2026-01-01', valid_to: '2028-12-31' }],
  })!;
  assert.equal(snap.rights[0].kind, 'esporte');
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
