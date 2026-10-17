// Testes da Mesa de Negociação (Fase 6.3, seção 21): o motor decide, sem IA.
// - 20 negociações: oferta baixa é recusada, oferta justa fecha em poucas rodadas, oferta rival aumenta o preço.
// - Adversarial: só com texto (argumentos e blefes), o jogador não fecha abaixo do piso.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { buildCatalogSnapshot, exclusiveRight } from '../supabase/functions/_shared/engine/catalogWorld.ts';
import {
  acceptCounter, ARGUMENT_TAGS, BLUFF_RELATION_HIT, contractFromDeal, effectiveFloor, evaluateRound, MAX_ARGUMENT_EFFECT, MAX_ROUNDS,
  openNegotiation, processContracts, resolveTender,
} from '../supabase/functions/_shared/engine/negotiation.ts';
import type { NegHidden, NegPublic, OpenResult, RoundInput } from '../supabase/functions/_shared/engine/negotiation.ts';
import { addDays } from '../supabase/functions/_shared/engine/time.ts';
import type { GameState, TermSheet } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1, buildLote2a, buildLote2b, buildLote3 } from '../supabase/seeds/build.ts';

// partida no Brasil real com o catálogo inteiro aprovado (TV Horizonte, fictícia)
function catalogGame(): GameState {
  const all = [buildLote1().rows, buildLote2a().rows, buildLote2b().rows];
  const templates = [...all[0].schedule_templates.filter((g) => g.station_key === 'sbt'), ...buildLote3().rows.schedule_templates];
  const catalog = buildCatalogSnapshot({
    titles: all.flatMap((r) => r.catalog_titles), templates,
    rights: all.flatMap((r) => r.historical_rights), holders: all.flatMap((r) => r.rights_holders),
  })!;
  return newGame({
    universe: 'real', era: 'now', startYear: 2026, scenario: 'emissora_crise', difficulty: 'diretor', seed: 2026,
    player: { name: 'Teste', background: 'jornalista', pronoun: 'o' }, station: { mode: 'fictional', name: 'TV Horizonte' }, catalog,
  }).state;
}

const state = catalogGame();
const ps = state.stations.find((s) => s.isPlayer)!;
const globo = state.stations.find((s) => s.realKey === 'globo')!;

// 20 títulos livres (sem exclusividade de outra emissora), de players variados
const FREE = state.catalog!.titles
  .filter((t) => t.holderId && !exclusiveRight(state, t, state.meta.date) && !state.programs.some((p) => p.catalogTitleId === t.id))
  .sort((a, b) => a.id.localeCompare(b.id))
  .filter((_, i) => i % 7 === 0)
  .slice(0, 20);

function open(titleId: string, key: string): OpenResult {
  const o = openNegotiation(state, { stationId: ps.id, titleId, key });
  if ('error' in o) throw new Error(o.error);
  return o;
}

interface Played { closed: boolean; round: number; price: number; reasons: string[] }

// joga rodadas até fechar ou acabar; next(rodada, contraproposta) devolve o valor ofertado
function play(o: OpenResult, hidden: NegHidden, next: (round: number, counter: number | null, last: number | null) => number, extra: Partial<RoundInput> = {}): Played {
  let h = hidden;
  let pub: NegPublic = o.pub;
  let last: number | null = null;
  let counter: number | null = null;
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const valor = Math.round(next(r, counter, last));
    const res = evaluateRound(state, ps.id, h, pub, { ...extra, offer: { ...o.opening, ...(extra.offer ?? {}), valor } });
    h = res.hidden;
    pub = res.pub;
    last = valor;
    if (res.decision.type === 'aceite') return { closed: true, round: r, price: valor, reasons: res.decision.reasons };
    if (res.decision.type === 'fim' || pub.status !== 'aberta') return { closed: false, round: r, price: 0, reasons: res.decision.reasons };
    counter = res.decision.counter?.valor ?? null;
  }
  return { closed: false, round: MAX_ROUNDS, price: 0, reasons: ['sem_acordo'] };
}

// estratégia "justa": começa no valor justo e, a cada rodada, divide a diferença com a contraproposta
const fair = (vRef: number) => (_r: number, counter: number | null, last: number | null) => (counter && last ? (last + counter) / 2 : vRef);

test('20 negociações: oferta baixa é recusada, oferta justa fecha em poucas rodadas', () => {
  assert.equal(FREE.length, 20, 'precisa de 20 títulos livres no catálogo');
  const rounds: number[] = [];
  for (const [i, t] of FREE.entries()) {
    const o = open(t.id, `teste-${i}`);
    const semRival: NegHidden = { ...o.hidden, rivals: [] };
    // oferta baixa: 60% do valor justo, sempre
    const low = play(o, semRival, () => o.hidden.vRef * 0.6);
    assert.equal(low.closed, false, `${t.id}: oferta de 60% não pode fechar`);
    assert.ok(low.round <= MAX_ROUNDS);
    // oferta justa
    const ok = play(o, semRival, fair(o.hidden.vRef));
    assert.ok(ok.closed, `${t.id} (${o.hidden.style}): oferta justa deveria fechar (${ok.reasons.join(',')})`);
    assert.ok(ok.price >= effectiveFloor(o.hidden) - 1, `${t.id}: fechou abaixo do piso`);
    assert.ok(ok.price <= o.hidden.alvo * 1.001, `${t.id}: fechou acima do alvo`);
    rounds.push(ok.round);
  }
  rounds.sort((a, b) => a - b);
  const median = rounds[Math.floor(rounds.length / 2)];
  assert.ok(median <= 3, `mediana de rodadas ${median} (esperado até 3)`);
  assert.ok(rounds[rounds.length - 1] <= 5, `pior caso ${rounds.at(-1)} rodadas`);
});

test('20 negociações: oferta rival aumenta o preço (e o player não vende abaixo do lance rival)', () => {
  let pairs = 0;
  for (const [i, t] of FREE.entries()) {
    const o = open(t.id, `rival-${i}`);
    const sem: NegHidden = { ...o.hidden, rivals: [] };
    const rivalOffer = Math.round(o.hidden.vRef * 1.25);
    const com: NegHidden = { ...o.hidden, rivals: [{ stationId: globo.id, stationName: globo.name, interest: 0.8, offer: rivalOffer }] };
    const a = play(o, sem, fair(o.hidden.vRef));
    const b = play(o, com, fair(o.hidden.vRef));
    assert.ok(a.closed, `${t.id}: sem rival deveria fechar`);
    if (!b.closed) continue; // com rival o jogador pode não alcançar o preço a tempo: tudo bem, o rival leva
    pairs += 1;
    assert.ok(b.price > a.price, `${t.id}: com rival (${b.price}) deveria custar mais que sem (${a.price})`);
    assert.ok(b.price >= rivalOffer * 0.9, `${t.id}: fechou muito abaixo do lance rival`);
  }
  assert.ok(pairs >= 15, `só ${pairs} de 20 fecharam com rival na mesa`);
});

test('adversarial: só com texto (todos os argumentos e blefes) o jogador não fecha abaixo do piso', () => {
  const allTags = Object.keys(ARGUMENT_TAGS);
  for (const [i, t] of FREE.entries()) {
    const o = open(t.id, `adv-${i}`);
    for (const rivals of [[], o.hidden.rivals]) {
      const h: NegHidden = { ...o.hidden, rivals };
      // o melhor que o texto consegue: o piso com o desconto máximo dos argumentos (5%)
      const limit = o.hidden.piso * (1 - MAX_ARGUMENT_EFFECT);
      const termosBons: Partial<TermSheet> = { faixa: 'nobre', parcelas: 1, preferencia_renovacao: false };
      const r = play(o, h, (round) => limit * (0.7 + round * 0.04), {
        tags: allTags,
        claim: { stationId: globo.id, valor: o.hidden.vRef * 3 },
        offer: { ...o.opening, ...termosBons } as TermSheet,
      });
      assert.equal(r.closed, false, `${t.id}: fechou abaixo do piso só com argumentos`);
    }
    // colado no limite: R$ 1 abaixo do piso com desconto máximo, em todas as rodadas, com argumentos sorteados
    for (let k = 0; k < 5; k++) {
      const o2 = open(t.id, `adv-${i}-${k}`);
      const edge = Math.floor(o2.hidden.piso * (1 - MAX_ARGUMENT_EFFECT)) - 1;
      const tags = allTags.filter((_, j) => (j + k + i) % 2 === 0);
      const r = play(o2, o2.hidden, () => edge, { tags, claim: k % 2 ? { stationId: null, valor: null } : { stationId: globo.id, valor: edge * 2 } });
      assert.equal(r.closed, false, `${t.id}/${k}: fechou R$ 1 abaixo do limite`);
    }
    // os argumentos nunca levam o desconto além de 5%, mesmo repetidos em todas as rodadas
    let h = o.hidden;
    let pub = o.pub;
    for (let round = 1; round <= 3 && pub.status === 'aberta'; round++) {
      const res = evaluateRound(state, ps.id, h, pub, { offer: { ...o.opening, valor: o.hidden.vRef }, tags: allTags });
      h = res.hidden;
      pub = res.pub;
      assert.ok(h.argAdj >= -MAX_ARGUMENT_EFFECT - 1e-9 && h.argAdj <= MAX_ARGUMENT_EFFECT + 1e-9);
    }
  }
});

test('blefe: "a Globo ofereceu mais" sem rival de verdade pode ser descoberto e custa relacionamento; com rival real, convence', () => {
  let caught = 0;
  let believed = 0;
  for (const [i, t] of FREE.entries()) {
    const o = open(t.id, `blefe-${i}`);
    const fake = evaluateRound(state, ps.id, { ...o.hidden, rivals: [] }, o.pub, { offer: { ...o.opening, valor: o.hidden.vRef }, tags: ['oferta_rival'], claim: { stationId: globo.id, valor: o.hidden.vRef * 1.5 } });
    if (fake.decision.bluff === 'descoberto') {
      caught += 1;
      assert.equal(fake.decision.relationDelta, BLUFF_RELATION_HIT);
      assert.ok(fake.hidden.patience < o.hidden.patience - 1, 'blefe descoberto derruba a paciência');
    } else assert.equal(fake.decision.bluff, 'desconfiou');
    const real = { ...o.hidden, rivals: [{ stationId: globo.id, stationName: globo.name, interest: 0.8, offer: Math.round(o.hidden.vRef * 1.3) }] };
    const ok = evaluateRound(state, ps.id, real, o.pub, { offer: { ...o.opening, valor: o.hidden.vRef }, tags: ['oferta_rival'], claim: { stationId: globo.id, valor: o.hidden.vRef * 1.2 } });
    if (ok.decision.bluff === 'acreditou') believed += 1;
  }
  assert.ok(caught >= 5, `só ${caught} blefes descobertos em 20`);
  assert.equal(believed, 20, 'alegação verdadeira sempre convence');
});

test('o segredo não vaza: o que vai para o navegador e para a IA não tem piso, alvo, pesos nem lances rivais', () => {
  for (const [i, t] of FREE.slice(0, 5).entries()) {
    const o = open(t.id, `vaza-${i}`);
    const res = evaluateRound(state, ps.id, o.hidden, o.pub, { offer: { ...o.opening, valor: o.hidden.vRef * 0.9 } });
    const json = JSON.stringify({ pub: o.pub, pub2: res.pub, decision: res.decision });
    for (const k of ['piso', 'alvo', 'weights', 'vRef', 'patienceMax', 'argAdj']) assert.ok(!json.includes(`"${k}"`), `campo secreto ${k} vazou`);
    for (const v of [o.hidden.piso, o.hidden.alvo, ...o.hidden.rivals.map((r) => r.offer)]) assert.ok(!json.includes(String(v)), `valor secreto ${v} vazou`);
  }
});

test('o jogador pode aceitar a contraproposta na mesa; mesma semente, mesma negociação', () => {
  const t = FREE[3];
  const a = open(t.id, 'det');
  const b = open(t.id, 'det');
  assert.deepEqual(a, b);
  const r1 = evaluateRound(state, ps.id, a.hidden, a.pub, { offer: { ...a.opening, valor: a.hidden.vRef * 0.95 } });
  assert.equal(r1.decision.type === 'contraproposta' || r1.decision.type === 'aceite', true);
  if (r1.decision.type === 'contraproposta') {
    const acc = acceptCounter(r1.hidden, r1.pub);
    assert.ok(!('error' in acc));
    if (!('error' in acc)) assert.ok(acc.terms.valor >= effectiveFloor(a.hidden));
  }
});

test('produto com exclusividade de outra emissora: só reunião de relacionamento, nunca venda', () => {
  const o = open('maria_do_bairro', 'travado');
  assert.equal(o.pub.kind, 'relacionamento');
  assert.equal(o.pub.locked, 'exclusivo do SBT até 12/2028');
  let h = o.hidden;
  let pub = o.pub;
  for (let r = 0; r < MAX_ROUNDS && pub.status === 'aberta'; r++) {
    const res = evaluateRound(state, ps.id, h, pub, { offer: { ...o.opening, valor: o.hidden.vRef * 5 } });
    assert.notEqual(res.decision.type, 'aceite');
    h = res.hidden;
    pub = res.pub;
  }
});

test('contratos: exclusividades da largada, parcelas debitadas no prazo e multa fora do horário prometido', () => {
  const televisa = state.rightsContracts!.find((c) => c.holderId === 'televisa');
  assert.ok(televisa, 'contrato Televisa × SBT na largada');
  assert.equal(state.stations.find((s) => s.id === televisa!.stationId)?.realKey, 'sbt');
  assert.equal(televisa!.endDate, '2028-12-31');

  const s2: GameState = structuredClone(state);
  const terms: TermSheet = { valor: 1_000_000, parcelas: 4, anos: 2, exibicoes: 100, exclusividade: 'exclusivo', plataformas: 'tv_aberta', faixa: 'nobre', preferencia_renovacao: false };
  const prog = s2.programs.find((p) => p.stationId === ps.id && p.status === 'on_air')!;
  const c = contractFromDeal(s2, { stationId: ps.id, holderId: 'wbd', titleId: 'friends', label: 'Friends', terms, programId: prog.id });
  assert.equal(c.payments.reduce((n, p) => n + p.amount, 0), 1_000_000);
  assert.deepEqual(c.payments.map((p) => p.date), [0, 91, 182, 273].map((d) => addDays(s2.meta.date, d)));
  s2.rightsContracts = [c];
  s2.meta.date = addDays(s2.meta.date, 100);
  const before = s2.weekProgress.econ[ps.id]?.[5] ?? 0;
  const r = processContracts(s2);
  assert.equal(r.paid, 500_000, 'duas parcelas vencidas');
  // o programa da obrigação está no ar, mas fora do nobre? então gera multa; se está no nobre, cumpre
  const inPrime = s2.schedules[ps.id].some((d) => d.some((b) => b.programId === prog.id && b.start >= 56 && b.start < 66));
  if (!inPrime) assert.ok(r.fines > 0);
  assert.equal((s2.weekProgress.econ[ps.id]?.[5] ?? 0) - before, r.paid + r.fines);
  // vencido o contrato, ele encerra
  s2.meta.date = addDays(s2.meta.date, 800);
  processContracts(s2);
  assert.equal(c.status, 'encerrado');
});

test('concorrência fechada (estrutura): lance abaixo da reserva não vale; exposição e relacionamento contam', () => {
  const r = resolveTender([
    { stationId: 'a', value: 100, exposure: 0.4, relation: 40 },
    { stationId: 'b', value: 95, exposure: 1, relation: 80 },
    { stationId: 'c', value: 50, exposure: 1, relation: 100 },
  ], { p: 0.6, e: 0.25, r: 0.15 }, 60);
  assert.equal(r.winner?.stationId, 'b');
  assert.deepEqual(r.ranking.map((x) => x.stationId), ['b', 'a']);
});
