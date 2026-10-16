// Mercado de conteúdo (seção 8.3): enlatados, filmes, formatos, projetos, coproduções,
// talentos, cotas, arrendamentos, direitos esportivos e leilões.

import { ERAS } from './catalog/eras.ts';
import { GENRES, genreAvailable } from './catalog/genres.ts';
import { ADVERTISERS, programTitle } from './catalog/names.ts';
import { leaseRate, recomputePrice } from './commercial.ts';
import { money } from './money.ts';
import { clamp, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';
import { genreCost, makeContract, makeCtx, makeProgram, makeTalent } from './setup.ts';
import { avgWeeklyRevenue, getProgram, nextId, npcById, npcByRole, playerStation, pushTimeline, rivals } from './state.ts';
import type { BandId, GameState, GenreId, MarketOffer, Program } from './types.ts';
import { COPAS, monthOf, yearOf } from './time.ts';

const PROJECT_GENRES: GenreId[] = ['novela_18h', 'novela_19h', 'novela_21h', 'serie_nacional', 'humoristico', 'auditorio', 'talk_show', 'revista_eletronica', 'policial', 'feminino', 'musical', 'game_show', 'documentario', 'novela_juvenil', 'novela_biblica', 'infantil'];
const FORMAT_GENRES: GenreId[] = ['reality', 'game_show', 'talent_show'];

function uncertainty(state: GameState): number {
  return Math.round(clamp(16 - state.research.precision / 9, 4, 16));
}

function visRange(state: GameState, rng: Rng, v: number): [number, number] {
  const u = uncertainty(state);
  const center = v + rng.normal(0, u / 3);
  return [clamp(Math.round(center - u), 1, 99), clamp(Math.round(center + u), 1, 99)];
}

function artisticBonus(state: GameState): number {
  const a = npcByRole(state, 'artistico');
  return a ? (a.trust - 50) / 8 + a.mood / 20 : 0;
}

function baseOffer(state: GameState, rng: Rng, kind: MarketOffer['kind'], g: GenreId | null, q: number, a: number): MarketOffer {
  return {
    id: nextId(state, 'of'),
    kind,
    title: '',
    description: '',
    genre: g,
    price: 0,
    costPerEp: 0,
    weeksToAir: 0,
    expiresWeek: state.meta.weekIndex + rng.int(3, 7),
    quality: visRange(state, rng, q),
    appeal: visRange(state, rng, a),
    hidden: { quality: clamp(Math.round(q), 5, 98), appeal: clamp(Math.round(a), 5, 98) },
    episodes: null,
    exhibitions: null,
    durStd: g ? GENRES[g].dur[0] : 60,
    rating: g ? GENRES[g].rating : 'L',
    origin: 'acquired',
  };
}

function titleFor(state: GameState, rng: Rng, g: GenreId): string {
  const ps = playerStation(state);
  return programTitle(rng, g, ps.short, ps.name, yearOf(state.meta.date), new Set(state.programs.map((p) => p.title)));
}

export function makeOffer(state: GameState, kind: MarketOffer['kind'], rng: Rng, opt: { genre?: GenreId; premium?: boolean; programId?: string; npcId?: string } = {}): MarketOffer | null {
  const o = makeOfferRaw(state, kind, rng, opt);
  // canal pago: licenças de catálogo e produções de nicho custam bem menos
  if (o && playerStation(state).kind === 'pay' && !['talento', 'cota', 'arrendamento', 'leilao'].includes(o.kind)) {
    o.costPerEp = Math.round(o.costPerEp * 0.3);
    o.price = Math.round(o.price * 0.3);
  }
  return o;
}

function makeOfferRaw(state: GameState, kind: MarketOffer['kind'], rng: Rng, opt: { genre?: GenreId; premium?: boolean; programId?: string; npcId?: string } = {}): MarketOffer | null {
  const era = state.meta.era;
  const year = yearOf(state.meta.date);
  const avgRev = avgWeeklyRevenue(state);
  switch (kind) {
    case 'enlatado': {
      const g: GenreId = rng.chance(0.2) ? 'novela_18h' : 'serie_estrangeira';
      const q = rng.normal(54, 12);
      const a = rng.normal(60, 12);
      const o = baseOffer(state, rng, kind, g, q, a);
      o.title = g === 'novela_18h' ? `${titleFor(state, rng, 'novela_19h')} (novela importada)` : titleFor(state, rng, g);
      o.description = g === 'novela_18h' ? 'Novela estrangeira dublada, pronta para exibir.' : 'Série estrangeira dublada, temporada completa.';
      o.episodes = g === 'novela_18h' ? rng.int(100, 160) : rng.int(22, 90);
      o.exhibitions = o.episodes * 2;
      o.costPerEp = Math.round(genreCost(era, g, q, GENRES[g].dur[0], 0.6) * 0.25);
      o.durStd = g === 'novela_18h' ? 45 : 45;
      o.weeksToAir = rng.int(0, 2);
      return o;
    }
    case 'filmes': {
      const premium = opt.premium ?? rng.chance(0.25);
      const q = premium ? rng.normal(74, 6) : rng.normal(56, 10);
      const a = premium ? rng.normal(84, 5) : rng.normal(62, 10);
      const o = baseOffer(state, rng, kind, 'filme', q, a);
      o.title = premium ? rng.pick(['Pacote Blockbusters', 'Campeões de Bilheteria', 'Grandes Estreias', 'Lançamentos Exclusivos']) : rng.pick(['Pacote Aventura', 'Comédias da Tarde', 'Clássicos do Cinema', 'Filmes de Família', 'Ação e Suspense', 'Cinema Nacional']);
      o.description = premium ? 'Filmes recentes, campeões de bilheteria, com exclusividade na TV aberta.' : 'Pacote de filmes dublados para sessões da tarde e madrugada.';
      o.exhibitions = premium ? rng.int(16, 30) : rng.int(30, 70);
      o.costPerEp = Math.round(genreCost(era, 'filme', q, 120, premium ? 1 : 0.5) * (premium ? 1.1 : 0.6));
      o.price = premium ? Math.round(o.costPerEp * rng.range(2, 4)) : 0;
      o.durStd = 120;
      o.rating = rng.pick(['L', '10', '12', '14']);
      return o;
    }
    case 'formato': {
      const pool = FORMAT_GENRES.filter((g) => genreAvailable(g, era));
      const g = opt.genre && genreAvailable(opt.genre, era) ? opt.genre : pool.length ? rng.pick(pool) : 'game_show';
      const q = rng.normal(60, 9);
      const a = rng.normal(74, 8);
      const o = baseOffer(state, rng, kind, g, q, a);
      o.title = `${titleFor(state, rng, g)} (formato internacional)`;
      o.description = 'Formato licenciado, sucesso em vários países. A adaptação local define o resultado.';
      o.origin = 'format';
      o.costPerEp = genreCost(era, g, q, GENRES[g].dur[0], 0.85);
      o.price = Math.round(o.costPerEp * rng.range(4, 8));
      o.weeksToAir = rng.int(8, 16);
      o.episodes = GENRES[g].episodes ? rng.int(GENRES[g].episodes![0], GENRES[g].episodes![1]) : null;
      return o;
    }
    case 'projeto':
    case 'coproducao': {
      const pool = PROJECT_GENRES.filter((g) => genreAvailable(g, era) && (g !== 'infantil' || ERAS[era].params.kidsTV >= 0.6));
      const g = opt.genre ?? rng.pick(pool);
      const bonus = artisticBonus(state);
      const q = rng.normal(58 + bonus, 12);
      const a = rng.normal(58 + bonus * 0.5, 12);
      const o = baseOffer(state, rng, kind, g, q, a);
      o.origin = kind === 'coproducao' ? 'coprod' : 'own';
      o.title = titleFor(state, rng, g);
      const isNovela = g.startsWith('novela');
      o.costPerEp = genreCost(era, g, q, GENRES[g].dur[0], 0.85);
      o.price = Math.round(o.costPerEp * (isNovela ? 6 : g === 'serie_nacional' ? 4 : 2) * (kind === 'coproducao' ? 0.5 : 1));
      o.weeksToAir = isNovela ? rng.int(18, 36) : g === 'serie_nacional' ? rng.int(10, 22) : rng.int(3, 10);
      if (kind === 'coproducao') o.weeksToAir = Math.max(6, Math.round(o.weeksToAir * 0.8));
      o.episodes = GENRES[g].episodes ? rng.int(GENRES[g].episodes![0], GENRES[g].episodes![1]) : null;
      o.description = kind === 'coproducao'
        ? 'Coprodução com produtora independente: divide custo e receita.'
        : `Projeto de produção própria de ${GENRES[g].name.toLowerCase()} apresentado pelo núcleo artístico.`;
      o.expiresWeek = state.meta.weekIndex + rng.int(4, 9);
      return o;
    }
    case 'talento': {
      const free = state.npcs.filter((n) => n.role === 'talento' && !n.stationId && n.talent);
      const npc = opt.npcId ? npcById(state, opt.npcId) : free.length ? rng.pick(free) : null;
      if (!npc || !npc.talent) return null;
      const o = baseOffer(state, rng, kind, npc.talent.specialty[0], npc.talent.prestige, npc.talent.popularity);
      o.title = `${npc.name} — ${npc.title}`;
      o.description = `${npc.sheet.bio} Pede ${money(era, npc.talent.askSalary)} por semana, contrato de um ano.`;
      o.talentId = npc.id;
      o.costPerEp = npc.talent.askSalary;
      o.price = npc.talent.askSalary * 4;
      o.quality = [npc.talent.carisma, npc.talent.carisma];
      o.appeal = [npc.talent.popularity, npc.talent.popularity];
      o.origin = 'own';
      return o;
    }
    case 'cota': {
      const ps = playerStation(state);
      const p = opt.programId ? getProgram(state, opt.programId) : rng.pick(state.programs.filter((x) => x.stationId === ps.id && x.status === 'on_air' && x.stats.length > 0 && GENRES[x.genre].commercial > 40 && x.origin !== 'leased')) ?? null;
      if (!p) return null;
      const last = p.stats[p.stats.length - 1];
      if (!last) return null;
      const pool = ADVERTISERS.filter((x) => x.eras.includes(era) && !x.avoids.includes(p.genre));
      const adv = (pool.find((x) => x.likes.includes(p.genre)) && rng.chance(0.6)) ? pool.filter((x) => x.likes.includes(p.genre))[0] : rng.pick(pool);
      const o = baseOffer(state, rng, kind, p.genre, p.quality, p.appeal);
      const premium = opt.premium ? 1.2 : 1;
      o.title = `Cota de patrocínio: ${adv.name} em "${p.title}"`;
      o.advertiser = adv.name;
      o.programId = p.id;
      o.weeklyValue = Math.round(Math.max(last.rev, avgRev * 0.03) * rng.range(0.12, 0.22) * premium);
      o.guaranteedPoints = Math.round(last.pts * (opt.premium ? 0.95 : 0.85) * 10) / 10;
      o.weeksToAir = rng.int(13, 26);
      o.description = `${adv.name} paga ${money(era, o.weeklyValue)} por semana durante ${o.weeksToAir} semanas e exige entrega mínima de ${o.guaranteedPoints.toLocaleString('pt-BR')} pontos. Abaixo disso, a emissora compensa com inserções gratuitas.`;
      o.origin = 'own';
      return o;
    }
    case 'arrendamento': {
      const band: BandId = rng.pick(['madrugada', 'madrugada', 'manha_cedo', 'manha', 'vespertino']);
      const hours = band === 'madrugada' ? rng.int(2, 5) : rng.int(1, 3);
      const g: GenreId = state.meta.era === '80s' || rng.chance(0.6) ? 'religioso' : 'televendas';
      const rate = Math.round(leaseRate(state, band) * rng.range(0.85, 1.25));
      const o = baseOffer(state, rng, kind, g, 25, 18);
      o.title = g === 'religioso' ? `Arrendamento: igreja quer ${hours}h diárias` : `Arrendamento: televendas quer ${hours}h diárias`;
      o.band = band;
      o.hours = hours;
      o.weeklyValue = rate * hours * 7;
      o.costPerEp = rate;
      o.durStd = hours * 60;
      o.origin = 'leased';
      o.description = `Paga ${money(era, rate)} por hora no ar (≈ ${money(era, o.weeklyValue)} por semana se exibido todos os dias). A faixa sai do seu controle e pesa na reputação e na herança de público.`;
      return o;
    }
    case 'esporte': {
      const g: GenreId = 'futebol';
      const sport = rng.pick(year >= 2010 ? ['Torneio de Vôlei', 'Lutas ao Vivo', 'Automobilismo', 'Copa Regional de Futebol'] : ['Torneio de Vôlei', 'Automobilismo', 'Copa Regional de Futebol', 'Basquete Nacional']);
      const q = rng.normal(62, 8);
      const a = rng.normal(sport.includes('Futebol') ? 70 : 52, 8);
      const o = baseOffer(state, rng, kind, g, q, a);
      o.title = `Direitos: ${sport}`;
      o.description = 'Transmissões ao vivo nos fins de semana. Audiência garantida em jogos grandes, mas a grade fica engessada.';
      o.exhibitions = rng.int(10, 24);
      o.costPerEp = Math.round(genreCost(era, g, q, 120, 0.5) * 0.4);
      o.price = Math.round(o.costPerEp * 2);
      o.durStd = 120;
      o.origin = 'sports';
      return o;
    }
    case 'leilao': {
      const o = baseOffer(state, rng, kind, 'futebol', 75, 88);
      const next = year + 1;
      o.title = `Leilão: Campeonato Nacional ${next}`;
      o.description = `Direitos do campeonato de ${next} (quartas e domingos). Lances fechados; vence o maior lance. O pagamento sai na assinatura.`;
      o.price = Math.round(avgRev * 2.2);
      o.costPerEp = Math.round(genreCost(era, 'futebol', 75, 120, 1) * 0.35);
      o.durStd = 120;
      o.origin = 'sports';
      o.expiresWeek = state.meta.weekIndex + 4;
      o.auction = {
        minBid: Math.round(avgRev * 1.6),
        closesWeek: state.meta.weekIndex + 4,
        rivalsInterested: rivals(state).filter((s) => ['hegemonica', 'jornalistica_esportiva', 'desafiante'].includes(s.archetype)).map((s) => s.id),
        playerBid: null,
      };
      return o;
    }
    default:
      return null;
  }
}

export function specialOffer(state: GameState, key: string, programId: string | null, npcId: string | null): MarketOffer | null {
  const rng = rngFor(state.meta.seed, 'special', state.meta.weekIndex, key);
  const year = yearOf(state.meta.date);
  switch (key) {
    case 'cota_context':
      return makeOffer(state, 'cota', rng, { programId: programId ?? undefined });
    case 'cota_context_premium':
      return makeOffer(state, 'cota', rng, { programId: programId ?? undefined, premium: true });
    case 'coproducao':
      return makeOffer(state, 'coproducao', rng);
    case 'filmes_premium':
      return makeOffer(state, 'filmes', rng, { premium: true });
    case 'formato':
      return makeOffer(state, 'formato', rng);
    case 'formato_reality':
      return makeOffer(state, 'formato', rng, { genre: 'reality' });
    case 'talento_rival':
    case 'talento_influenciador': {
      const ctx = makeCtx(state, rng);
      const g: GenreId = key === 'talento_influenciador' ? (genreAvailable('reality', state.meta.era) ? 'reality' : 'talk_show') : rng.pick(['novela_21h', 'auditorio', 'talk_show', 'humoristico'] as GenreId[]);
      const npc = makeTalent(ctx, key === 'talento_influenciador' ? 'apresentador_reality' : null, g, null, 75);
      if (key === 'talento_influenciador' && npc.talent) {
        npc.talent.popularity = Math.min(98, npc.talent.popularity + 15);
        npc.talent.prestige = Math.max(10, npc.talent.prestige - 25);
        npc.talent.segmentBias = { jovem_ab: 0.2, jovem_cde: 0.2 };
        npc.title = 'Influenciador(a) digital';
      }
      return makeOffer(state, 'talento', rng, { npcId: npc.id });
    }
    case 'acervo_rival': {
      const o = makeOffer(state, 'enlatado', rng);
      if (!o) return null;
      o.kind = 'enlatado';
      o.title = `Acervo de novelas da concorrência (${rng.int(2, 3)} títulos)`;
      o.genre = 'novela_19h';
      o.description = 'Novelas antigas compradas a preço de banana; prontas para reprise.';
      o.costPerEp = Math.round(o.costPerEp * 0.3);
      o.episodes = 160;
      o.exhibitions = 400;
      o.origin = 'archive';
      o.hidden.quality = clamp(o.hidden.quality + 8, 5, 95);
      return o;
    }
    case 'copa': {
      if (!COPAS[year]) return null;
      const o = baseOffer(state, rng, 'esporte', 'futebol', 88, 99);
      o.title = `Sublicença da Copa do Mundo ${year}`;
      o.description = 'Transmissão dos jogos do Brasil. Audiência explosiva e cotas que se vendem sozinhas; os jogos entram por cima da grade nos dias de partida.';
      o.price = Math.round(avgWeeklyRevenue(state) * rng.range(1.6, 2.6));
      o.costPerEp = 0;
      o.origin = 'sports';
      o.expiresWeek = state.meta.weekIndex + 10;
      o.durStd = 135;
      o.flagCopa = year;
      return o;
    }
    case 'leilao_futebol':
      return makeOffer(state, 'leilao', rng);
    default:
      return null;
  }
}

export function refreshOffers(state: GameState): void {
  const week = state.meta.weekIndex;
  state.offers = state.offers.filter((o) => o.expiresWeek >= week || (o.auction && o.auction.closesWeek >= week));
  // ofertas especiais pedidas por eventos
  const pend = String(state.flags.pendingOffers ?? '');
  if (pend) {
    for (const item of pend.split(';')) {
      const [key, programId, npcId] = item.split('|');
      const o = specialOffer(state, key, programId || null, npcId || null);
      if (o) {
        o.expiresWeek = Math.max(o.expiresWeek, week + 3);
        o.special = true;
        state.offers.unshift(o);
      }
    }
    state.flags.pendingOffers = '';
  }
  const rng = rngFor(state.meta.seed, 'offers', week);
  const regular = state.offers.filter((o) => !o.special).length;
  const want = 9 - regular;
  const kinds: [MarketOffer['kind'], number][] = [
    ['enlatado', 2],
    ['filmes', 1.2],
    ['formato', state.meta.era === '80s' ? 0 : 0.9],
    ['projeto', 3],
    ['coproducao', 0.8],
    ['talento', 1],
    ['cota', 0.9],
    ['arrendamento', state.meta.scenario === 'emissora_crise' || state.meta.scenario === 'rede_nova' ? 1.2 : 0.5],
    ['esporte', 0.4],
  ];
  for (let i = 0; i < want; i++) {
    const k = rng.weighted(kinds, (x) => x[1]);
    if (!k) break;
    const o = makeOffer(state, k[0], rng);
    if (o) state.offers.push(o);
  }
}

export interface BuyResult {
  ok: boolean;
  message: string;
  programId?: string;
}

function chargeAcquisition(state: GameState, amount: number): void {
  const ps = playerStation(state);
  const e = state.weekProgress.econ[ps.id] ?? [0, 0, 0, 0, 0, 0];
  while (e.length < 6) e.push(0);
  e[5] += amount;
  state.weekProgress.econ[ps.id] = e;
}

function programFromOffer(state: GameState, o: MarketOffer, status: Program['status']): Program {
  const ps = playerStation(state);
  const rng = rngFor(state.meta.seed, 'buy', o.id);
  const ctx = makeCtx(state, rng);
  const g = (o.genre ?? 'filme') as GenreId;
  const p = makeProgram(ctx, ps, g, { minutes: o.durStd, status, title: o.title.replace(' (formato internacional)', '').replace(' (novela importada)', ''), origin: o.origin });
  p.quality = o.hidden.quality;
  p.appeal = o.hidden.appeal;
  if (o.hidden.profile) p.profile = { ...o.hidden.profile };
  p.costPerEp = o.costPerEp;
  p.rating = o.rating;
  p.fatigue = o.origin === 'archive' ? 30 : 0;
  p.isRerun = o.origin === 'archive';
  p.buzz = o.kind === 'formato' ? 25 : 12;
  p.habitWeeks = 0;
  p.habitKey = '';
  p.createdWeek = state.meta.weekIndex;
  p.premiereWeek = null;
  if (o.episodes) p.episodes = { total: o.episodes, aired: 0, planned: o.episodes };
  else p.episodes = { total: null, aired: 0, planned: null };
  if (o.exhibitions) p.rights = { exhibitionsLeft: o.exhibitions, untilWeek: null };
  if (o.kind === 'arrendamento') {
    p.leaseWeeklyPerHour = o.costPerEp;
    p.costPerEp = 0;
    p.quality = 22;
    p.appeal = 16;
  }
  recomputePrice(state, p);
  return p;
}

export function buyOffer(state: GameState, offerId: string, bid?: number): BuyResult {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, message: 'Oferta não encontrada ou expirada.' };
  const era = state.meta.era;
  const ps = playerStation(state);
  switch (o.kind) {
    case 'leilao': {
      if (!o.auction) return { ok: false, message: 'Leilão inválido.' };
      const amount = Math.round(bid ?? 0);
      if (amount < o.auction.minBid) return { ok: false, message: `Lance mínimo: ${money(era, o.auction.minBid)}.` };
      o.auction.playerBid = amount;
      return { ok: true, message: `Lance de ${money(era, amount)} registrado. Resultado na semana ${o.auction.closesWeek + 1}.` };
    }
    case 'talento': {
      const npc = o.talentId ? npcById(state, o.talentId) : undefined;
      if (!npc) return { ok: false, message: 'Talento indisponível.' };
      makeContract(state, npc, ps.id, 52, null, state.meta.weekIndex);
      npc.mood = Math.min(100, npc.mood + 15);
      chargeAcquisition(state, o.price);
      state.offers = state.offers.filter((x) => x.id !== o.id);
      pushTimeline(state, `Contratou ${npc.name} (${npc.title}).`, 'pessoas');
      return { ok: true, message: `${npc.name} contratado(a) por um ano. Escale-o(a) em um programa pela ficha do programa ou na tela Pessoas.` };
    }
    case 'cota': {
      if (!o.programId) return { ok: false, message: 'Cota inválida.' };
      state.deals.push({
        id: nextId(state, 'deal'),
        advertiser: o.advertiser ?? 'Anunciante',
        kind: 'quota',
        programId: o.programId,
        weeklyValue: o.weeklyValue ?? 0,
        guaranteedPoints: o.guaranteedPoints ?? 0,
        startWeek: state.meta.weekIndex,
        endWeek: state.meta.weekIndex + o.weeksToAir,
        status: 'active',
        shortfallWeeks: 0,
      });
      const marta = npcByRole(state, 'comercial');
      if (marta) marta.mood = Math.min(100, marta.mood + 8);
      state.offers = state.offers.filter((x) => x.id !== o.id);
      return { ok: true, message: `Cota fechada com ${o.advertiser}. Atenção à entrega mínima de pontos.` };
    }
    default:
      break;
  }
  if (o.flagCopa) {
    state.flags[`copa_${o.flagCopa}_${ps.id}`] = true;
    chargeAcquisition(state, o.price);
    state.offers = state.offers.filter((x) => x.id !== o.id);
    pushTimeline(state, `Comprou a sublicença da Copa do Mundo ${o.flagCopa}.`, 'mercado');
    return { ok: true, message: 'Direitos da Copa garantidos: os jogos do Brasil entram automaticamente na grade.' };
  }
  const develop = o.kind === 'projeto' || o.kind === 'coproducao' || o.kind === 'formato';
  const p = programFromOffer(state, o, develop ? 'development' : 'ready');
  if (develop) {
    p.dev = { stage: 1, weeksLeft: o.weeksToAir, totalWeeks: o.weeksToAir, spent: o.price };
    const lucia = npcByRole(state, 'artistico');
    if (lucia && o.kind === 'projeto') lucia.mood = Math.min(100, lucia.mood + 8);
  } else if (o.weeksToAir > 0) {
    p.status = 'development';
    p.dev = { stage: 4, weeksLeft: o.weeksToAir, totalWeeks: o.weeksToAir, spent: 0 };
  }
  chargeAcquisition(state, o.price);
  state.offers = state.offers.filter((x) => x.id !== o.id);
  pushTimeline(state, `${develop ? 'Aprovou o projeto' : 'Comprou'} "${p.title}".`, 'mercado');
  const msg = develop
    ? `"${p.title}" entrou em desenvolvimento: estreia possível em ${o.weeksToAir} semanas.`
    : o.weeksToAir > 0
      ? `"${p.title}" chega em ${o.weeksToAir} semana(s).`
      : `"${p.title}" já está no acervo, pronto para entrar na grade.`;
  return { ok: true, message: msg, programId: p.id };
}

export function resolveAuctions(state: GameState): string[] {
  const notes: string[] = [];
  const week = state.meta.weekIndex;
  const ps = playerStation(state);
  for (const o of [...state.offers]) {
    if (!o.auction || o.auction.closesWeek >= week) continue;
    const rng = rngFor(state.meta.seed, 'auction', o.id);
    let best = { id: '', bid: 0 };
    for (const rid of o.auction.rivalsInterested) {
      const st = state.stations.find((s) => s.id === rid);
      if (!st || st.closedWeek) continue;
      const mult = st.archetype === 'hegemonica' ? rng.range(1.15, 1.6) : st.archetype === 'desafiante' ? rng.range(1.0, 1.55) : rng.range(0.95, 1.3);
      const bid = o.auction.minBid * mult * (st.cash < 0 ? 0.8 : 1);
      if (bid > best.bid) best = { id: rid, bid };
    }
    const pb = o.auction.playerBid ?? 0;
    const nextYear = yearOf(state.meta.date) + 1;
    if (pb > 0 && pb >= best.bid) {
      ps.footballUntilYear = nextYear;
      chargeAcquisition(state, pb);
      let prog = state.programs.find((p) => p.stationId === ps.id && p.genre === 'futebol' && p.origin === 'sports' && p.title.startsWith('Campeonato'));
      if (!prog) {
        prog = programFromOffer(state, { ...o, title: `Campeonato Nacional`, kind: 'esporte' } as MarketOffer, 'ready');
      }
      prog.status = prog.status === 'on_air' ? 'on_air' : 'ready';
      prog.rights = { exhibitionsLeft: 120, untilWeek: null };
      prog.flags.footballYear = nextYear;
      notes.push(`Você venceu o leilão do campeonato de ${nextYear} com ${money(state.meta.era, pb)}.`);
      pushTimeline(state, `Venceu o leilão dos direitos do campeonato de ${nextYear}.`, 'mercado');
    } else {
      const winner = state.stations.find((s) => s.id === best.id);
      if (winner) winner.footballUntilYear = Math.max(winner.footballUntilYear ?? 0, nextYear);
      if (ps.footballUntilYear && ps.footballUntilYear < nextYear) {
        notes.push(`A ${winner?.name ?? 'concorrência'} levou o campeonato de ${nextYear}. Seus direitos acabam no fim do ano.`);
      } else if (pb > 0) {
        notes.push(`Seu lance perdeu: a ${winner?.name ?? 'concorrência'} levou o campeonato de ${nextYear}.`);
      }
    }
    state.offers = state.offers.filter((x) => x.id !== o.id);
  }
  return notes;
}

export function devProgress(state: GameState): { ready: Program[] } {
  const ready: Program[] = [];
  for (const p of state.programs) {
    if (p.status !== 'development' || !p.dev) continue;
    p.dev.weeksLeft -= 1;
    const frac = 1 - p.dev.weeksLeft / Math.max(1, p.dev.totalWeeks);
    p.dev.stage = frac < 0.2 ? 1 : frac < 0.4 ? 2 : frac < 0.65 ? 3 : frac < 1 ? 4 : 5;
    if (p.dev.weeksLeft <= 0) {
      p.status = 'ready';
      p.dev = null;
      ready.push(p);
    }
  }
  return { ready };
}

export const DEV_STAGES = ['Ideia', 'Piloto / sinopse', 'Orçamento aprovado', 'Pré-produção', 'Gravação', 'Pronto para estrear'];

export function monthOfWeek(state: GameState): number {
  return monthOf(state.meta.date);
}
