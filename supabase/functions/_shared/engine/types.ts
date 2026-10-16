// Tipos centrais do motor do Prime Time Manager.
// O motor é puro: recebe estado + decisões + semente e devolve novo estado.
// Todo valor em dinheiro dentro do motor está em R$ de 2026; a exibição
// converte para o valor nominal da era (ver money.ts).

export type EraId = '80s' | '90s' | '00s' | '10s' | 'now';
export type Universe = 'real' | 'fictional';
export type Difficulty = 'estagiario' | 'diretor' | 'lenda';
export type ScenarioId =
  | 'lider_ameacada'
  | 'vice_ambiciosa'
  | 'emissora_crise'
  | 'rede_nova'
  | 'canal_pago';
export type Background =
  | 'jornalista'
  | 'publicitario'
  | 'produtor_auditorio'
  | 'herdeiro'
  | 'streaming';

export type BandId =
  | 'madrugada'
  | 'manha_cedo'
  | 'manha'
  | 'meio_dia'
  | 'vespertino'
  | 'pre_nobre'
  | 'nobre'
  | 'pos_nobre';

export type SegmentId =
  | 'criancas'
  | 'jovem_ab'
  | 'jovem_cde'
  | 'adulto_ab'
  | 'adulto_cde'
  | 'maduro_ab'
  | 'maduro_cde';

export type DayType = 'weekday' | 'saturday' | 'sunday';
export type RatingAge = 'L' | '10' | '12' | '14' | '16' | '18';

export type ArchetypeId =
  | 'hegemonica'
  | 'popular_auditorio'
  | 'desafiante'
  | 'jornalistica_esportiva'
  | 'em_crise'
  | 'publica_educativa'
  | 'canal_pago';

export type GenreId =
  | 'novela_18h'
  | 'novela_19h'
  | 'novela_21h'
  | 'novela_juvenil'
  | 'novela_biblica'
  | 'serie_nacional'
  | 'humoristico'
  | 'auditorio'
  | 'game_show'
  | 'reality'
  | 'talk_show'
  | 'telejornal'
  | 'revista_eletronica'
  | 'policial'
  | 'futebol'
  | 'mesa_redonda'
  | 'filme'
  | 'serie_estrangeira'
  | 'infantil'
  | 'religioso'
  | 'televendas'
  | 'documentario'
  | 'feminino'
  | 'musical'
  | 'cobertura_especial'
  | 'talent_show'
  // gêneros internos (não aparecem no mercado)
  | 'janela_local'
  | 'hgpe'
  | 'tapa_buraco';

export type ProgramOrigin =
  | 'own'
  | 'acquired'
  | 'format'
  | 'coprod'
  | 'sports'
  | 'leased'
  | 'archive'
  | 'system';

export type ProgramStatus =
  | 'development'
  | 'ready'
  | 'on_air'
  | 'hiatus'
  | 'ended'
  | 'archive';

export type Profile = Record<SegmentId, number>;

export interface ProgramWeekStat {
  w: number; // week index
  pts: number; // média PNT
  share: number;
  rank: number; // posição na faixa principal
  rev: number; // receita da semana (R$ 2026)
  cost: number; // custo da semana (R$ 2026)
  n: number; // exibições na semana
  fx?: number[]; // fatores médios [q, a, g, b, h, f, t, emissora, ruído, fora]
}

export interface Program {
  id: string;
  stationId: string;
  title: string;
  genre: GenreId;
  origin: ProgramOrigin;
  quality: number; // 0-100
  appeal: number; // 0-100
  profile: Profile; // afinidade por segmento 0-1
  rating: RatingAge;
  costPerEp: number; // R$ 2026 por exibição (episódio padrão)
  durStd: number; // minutos
  durMin: number;
  durMax: number;
  fatigue: number; // 0-100
  buzz: number; // 0-100
  habitWeeks: number; // 0-8
  habitKey: string; // assinatura do horário usado para contar hábito
  movesRecent: number[]; // semanas em que o programa mudou de horário
  status: ProgramStatus;
  talentIds: string[];
  commercial: number; // potencial comercial 0-100
  episodes: { total: number | null; aired: number; planned: number | null };
  isRerun: boolean;
  merchLevel: number; // 0-3
  promo: number; // nível de chamadas desta semana 0-3
  locked: boolean; // telejornal principal / blocos protegidos
  leaseWeeklyPerHour: number; // receita do arrendamento por hora semanal
  rights: { exhibitionsLeft: number | null; untilWeek: number | null } | null;
  dev: { stage: number; weeksLeft: number; totalWeeks: number; spent: number; formatFee?: number } | null;
  tableMult: number; // ajuste de tabela por programa
  price30s: number; // preço de tabela atual (R$ 2026)
  label?: string; // rótulo de grade (concorrentes no modo real)
  synopsis?: string;
  premiereWeek: number | null;
  createdWeek: number;
  stats: ProgramWeekStat[];
  totals: { revenue: number; cost: number; airings: number; peakPts: number };
  tempMods: { mult: number; untilWeek: number; reason: string }[];
  liveBoost?: number;
  flags: Record<string, boolean | number | string>;
}

export interface Block {
  programId: string;
  start: number; // slot 0..95 (0 = 06h00)
  len: number; // em slots de 15 min
}

export interface Station {
  id: string;
  name: string;
  short: string;
  color: string;
  isPlayer: boolean;
  archetype: ArchetypeId;
  isReal: boolean;
  kind: 'open' | 'pay';
  reach: number; // 1 para TV aberta; fração de domicílios para canal pago
  regional: number[]; // modificador por praça (15)
  power: number; // força estrutural (-1..1)
  brand: number; // 0.8-1.2 (marca junto ao mercado)
  reputation: { critics: number; public: number; market: number };
  cash: number;
  weeklyStructure: number; // custo fixo semanal (R$ 2026)
  ai: {
    pending: PendingRivalMove[];
    lastMoveWeek: number;
    bandHistory: Record<string, number[]>; // share semanal por faixa (últimas 12)
    reserve: string[]; // ids de programas reservados para trocar na grade
  };
  hasNetwork: boolean; // cabeça de rede com afiliadas (janelas locais)
  subscriptionWeekly: number; // receita de assinatura (canal pago)
  footballUntilYear: number | null; // direitos do campeonato
  realKey: string | null;
  closedWeek?: number | null;
  history: { w: number; pts24: number; prime: number; share24: number; primeShare: number; rev: number; cost: number }[];
}

export interface PendingRivalMove {
  dueWeek: number;
  kind: RivalMoveKind;
  band: BandId;
  dayType: DayType;
  targetStationId: string | null;
  programId?: string;
  note: string;
}

export type RivalMoveKind =
  | 'contraprogramar'
  | 'antecipar_estreia'
  | 'esticar_sucesso'
  | 'contratar_talento'
  | 'cortar_custos'
  | 'arrendar_faixa'
  | 'estreia_sazonal'
  | 'substituir_encerrado';

export type NpcRole =
  | 'presidente'
  | 'comercial'
  | 'jornalismo'
  | 'artistico'
  | 'pesquisa'
  | 'assistente'
  | 'promocao'
  | 'juridico'
  | 'talento'
  | 'anunciante'
  | 'colunista'
  | 'investidor';

export interface NpcSheet {
  speech_style: string[];
  catchphrases: string[];
  main_goal: string;
  secret_goal: string;
  red_line: string;
  bio: string;
}

export interface TalentAttrs {
  archetype: string;
  carisma: number; // 0-100
  popularity: number; // 0-100
  prestige: number; // 0-100
  ego: number; // 0-100
  risk: number; // risco de polêmica 0-100
  specialty: GenreId[];
  segmentBias: Partial<Profile>;
  askSalary: number; // salário semanal pedido (R$ 2026)
}

export interface Npc {
  id: string;
  name: string;
  role: NpcRole;
  title: string; // cargo legível
  stationId: string | null;
  age: number;
  sheet: NpcSheet;
  mood: number; // -100..100
  trust: number; // 0..100
  loyalty: number; // 0..100
  patience: number; // 0..100
  talent: TalentAttrs | null;
  contractId: string | null;
  requests: NpcRequest[];
  lastMetWeek: number | null;
  avatar: string; // emoji/sigla
}

export interface NpcRequest {
  id: string;
  text: string;
  dueWeek: number;
  penalty: { mood: number; trust: number };
  createdWeek: number;
}

export interface Contract {
  id: string;
  npcId: string;
  stationId: string;
  salaryWeekly: number;
  startWeek: number;
  endWeek: number;
  exclusive: boolean;
  guaranteed: { genre?: GenreId; band?: BandId; programId?: string } | null;
  terminationFee: number;
  status: 'active' | 'ended' | 'terminated';
}

export interface AdDeal {
  id: string;
  advertiser: string;
  kind: 'quota' | 'merch';
  programId: string;
  weeklyValue: number;
  guaranteedPoints: number;
  startWeek: number;
  endWeek: number;
  status: 'active' | 'ended' | 'cancelled';
  shortfallWeeks: number;
}

export interface EffectSet {
  cash?: number; // R$ 2026 (negativo = custo)
  cashWeeks?: number; // múltiplo da receita média semanal
  npc?: { target: string; mood?: number; trust?: number; loyalty?: number; patience?: number }[];
  program?: {
    target: string;
    buzz?: number;
    quality?: number;
    appeal?: number;
    fatigue?: number;
    mult?: number;
    weeks?: number;
    endNow?: boolean;
    hiatus?: boolean;
    extendEps?: number;
    commercial?: number;
  };
  reputation?: { critics?: number; public?: number; market?: number };
  salaryPct?: number;
  talentLeaves?: boolean;
  budget?: number; // ajuste na verba anual (R$ 2026)
  flag?: Record<string, boolean | number | string>;
  arcAdvance?: string;
  arcStart?: string;
  arcEnd?: string;
  followup?: { templateId: string; inWeeks: number };
  delayed?: { inWeeks: number; effects: EffectSet; note: string };
  fine?: number;
  agenda?: number;
  priceMult?: number; // ajuste multiplicativo na tabela geral
  occupancy?: { delta: number; weeks: number };
  research?: number; // precisão da pesquisa
  addOffer?: string; // gera oferta específica no mercado
  rivalBoost?: { target: string; mult: number; weeks: number };
  allBuzz?: number;
  tle?: { mult: number; weeks: number };
}

export interface EventOptionState {
  id: string;
  label: string;
  hint: string;
  effects: EffectSet;
}

export type EventSeverity = 'grave' | 'medio' | 'leve';
export type EventTone = 'positivo' | 'negativo' | 'neutro';

export interface GameEvent {
  id: string;
  templateId: string;
  category: string;
  title: string;
  severity: EventSeverity;
  tone: EventTone;
  firedWeek: number;
  deadlineWeek: number;
  blocking: boolean; // precisa ser resolvido antes de "Colocar no ar"
  context: {
    programId?: string;
    npcId?: string;
    rivalId?: string;
    amount?: number;
    vars: Record<string, string | number>;
  };
  scene: string; // texto de fallback (o Mestre pode reescrever)
  narrated: boolean;
  speaker: string | null; // npc id
  options: EventOptionState[];
  defaultOption: string;
  resolved: boolean;
  chosen: string | null;
  outcome: string | null;
}

export interface DelayedEffect {
  dueWeek: number;
  effects: EffectSet;
  note: string;
  context: GameEvent['context'];
}

export interface ArcState {
  key: string;
  stage: number;
  startedWeek: number;
  lastAdvanceWeek: number;
  done: boolean;
  data: Record<string, string | number>;
}

export type OfferKind =
  | 'enlatado'
  | 'filmes'
  | 'formato'
  | 'projeto'
  | 'coproducao'
  | 'esporte'
  | 'arrendamento'
  | 'talento'
  | 'cota'
  | 'leilao';

export interface MarketOffer {
  id: string;
  kind: OfferKind;
  title: string;
  description: string;
  genre: GenreId | null;
  price: number; // custo de aquisição imediato (R$ 2026)
  costPerEp: number;
  weeksToAir: number;
  expiresWeek: number;
  quality: [number, number]; // faixa estimada visível ao jogador
  appeal: [number, number];
  hidden: { quality: number; appeal: number; profile?: Profile };
  episodes: number | null;
  exhibitions: number | null;
  durStd: number;
  rating: RatingAge;
  talentId?: string | null;
  advertiser?: string;
  weeklyValue?: number; // cotas / arrendamento
  guaranteedPoints?: number;
  programId?: string;
  band?: BandId;
  hours?: number;
  auction?: { minBid: number; closesWeek: number; rivalsInterested: string[]; playerBid: number | null };
  origin: ProgramOrigin;
  special?: boolean;
  flagCopa?: number;
}

export interface FinanceState {
  annualBudget: number; // verba anual de programação
  annualRevenueTarget: number;
  annualMarginTarget: number;
  ytdRevenue: number;
  ytdCost: number; // custo de programação no ano
  ytdStructure: number;
  qtdSpent: number;
  quarterBudget: number;
  tableMult: number; // política de preço (multiplicador da tabela)
  maxDiscount: number; // 0-0.6
  adMinutes: number; // minutos de intervalo por hora (10-15)
  lastWeek: WeekFinance | null;
  weeksOverBudget: number;
  extraBudgetNextYear: number;
  occupancyMods: { delta: number; untilWeek: number }[];
  priceMods: { mult: number; untilWeek: number }[];
}

export interface WeekFinance {
  revenue: number;
  adRevenue: number;
  quota: number;
  merch: number;
  lease: number;
  other: number;
  cost: number;
  production: number;
  rights: number;
  acquisitions: number;
  talent: number;
  promo: number;
  fines: number;
  compensation: number;
  structure: number;
  occupancy: number;
  avgDiscount: number;
  margin: number;
  budgetWeek: number;
}

export interface PlayerProfile {
  name: string;
  background: Background;
  pronoun: 'o' | 'a' | 'e';
  reputation: number; // reputação de carreira 0-100 (herdada em nova partida)
  careerStations: string[];
}

export interface KpiSet {
  aud24: number;
  prime: number;
  primeShare: number;
  bandsOk: number;
  bandsTotal: number;
  revenueVsTarget: number; // razão
  margin: number;
  reputation: number;
  political: number;
  score: number;
}

export interface LiveMoment {
  day: number;
  programId: string;
  stationId: string;
  reason: string;
  startSlot: number;
  len: number;
  done: boolean;
}

export interface WeekProgress {
  day: number; // próximo dia a simular (0..7)
  carry: number[][][] | null; // [praça][estação+fora][segmento]
  stationOrder: string[]; // ordem das estações usada no carry
  progAcc: Record<string, number[]>; // programId -> [somaPts, somaShare, exibições, pico, mínima, ...15 praças]
  bandAcc: Record<string, number[]>; // `${stationId}|${band}|${dayType}` -> [somaPts, somaShare, slots]
  dayAcc: Record<string, number[]>; // stationId -> pts24 por dia (7)
  primeAcc: Record<string, number[]>; // stationId -> pts nobre por dia (7)
  shareAcc: Record<string, number[]>; // stationId -> [share24 soma, share nobre soma]
  marketAcc: Record<string, number[]>; // stationId -> soma pts24 por praça (15)
  marketPrimeAcc: Record<string, number[]>;
  econ: Record<string, number[]>; // stationId -> [publicidade, merchandising, arrendamento, produção, direitos]
  progEcon: Record<string, number[]>; // programId -> [receita, custo]
  occ: Record<string, number[]>; // stationId -> [ocupação, desconto]
  factors: Record<string, number[]>; // programId -> somas de fatores
  liveDecisions: { day: number; programId: string; decisions: string[] }[];
  eventCash: number;
  fines: number;
  notes: string[];
  ratingViolations: string[];
}

export interface GameMeta {
  universe: Universe;
  era: EraId;
  startYear: number;
  scenario: ScenarioId;
  difficulty: Difficulty;
  seed: number;
  weekIndex: number;
  date: string; // segunda-feira da semana corrente (ISO)
  playerStationId: string;
  status: 'active' | 'fired' | 'retired' | 'promoted';
  version: number;
  theme?: string;
}

export interface GameState {
  meta: GameMeta;
  player: PlayerProfile;
  stations: Station[];
  programs: Program[];
  schedules: Record<string, Block[][]>; // stationId -> 7 dias
  rivalSnapshot: Record<string, Block[][]>; // grade dos rivais vista com 1 semana de atraso
  npcs: Npc[];
  contracts: Contract[];
  deals: AdDeal[];
  events: GameEvent[];
  delayed: DelayedEffect[];
  arcs: ArcState[];
  offers: MarketOffer[];
  finance: FinanceState;
  agenda: { points: number; meetings: number; weekIndex: number };
  research: { precision: number; analyst: boolean; mbm: boolean };
  flags: Record<string, boolean | number | string>;
  kpis: KpiSet | null;
  targets: {
    aud24: number;
    prime: number;
    rankTarget: number; // posição-meta nas faixas
    revenue: number;
    margin: number;
    description: string;
  };
  evaluations: { year: number; score: number; verdict: string }[];
  records: { key: string; label: string; value: number; week: number; programId?: string }[];
  achievements: { id: string; label: string; week: number }[];
  timeline: { week: number; date: string; text: string; kind: string }[];
  weekProgress: WeekProgress;
  liveMoments: LiveMoment[];
  lastReportWeek: number | null;
  weeksBelowTarget: number;
  llm: { weekCalls: number; weekIndex: number };
  tutorial: { step: number; done: boolean };
  idCounter: number;
  pendingInbox: InboxDraft[];
  alertsAck: string[];
  lastBandRanks: Record<string, number>; // posição do jogador por faixa na última semana
  monthScores: { month: string; score: number }[];
  ytd: { weeks: number; pts24: number; prime: number };
}

export interface InboxDraft {
  fromNpc: string | null;
  subject: string;
  body: string;
  requiresAction: boolean;
  eventId: string | null;
  kind: 'mensagem' | 'evento' | 'alerta' | 'imprensa' | 'pedido' | 'sistema';
}

// ===== Relatórios =====
export interface BandRanking {
  band: BandId;
  dayType: DayType | 'all';
  ranking: { stationId: string; pts: number; share: number }[];
}

export interface ProgramResult {
  programId: string;
  stationId: string;
  title: string;
  genre: GenreId;
  slotLabel: string;
  pts: number;
  share: number;
  rank: number;
  delta4w: number | null;
  airings: number;
  markets: number[]; // pts por praça
}

export interface WeekReport {
  week: number;
  dateFrom: string;
  dateTo: string;
  kind: 'week' | 'day';
  day?: number;
  stations24: { stationId: string; pts: number; share: number }[];
  stationsPrime: { stationId: string; pts: number; share: number }[];
  bands: BandRanking[];
  daily: { day: number; date: string; pts: Record<string, number>; prime: Record<string, number> }[];
  programs: ProgramResult[]; // programas do jogador
  topPrograms: ProgramResult[]; // top 10 geral
  markets: { market: string; pts: Record<string, number>; prime: Record<string, number> }[];
  finance: WeekFinance | null;
  alerts: { level: 'block' | 'warn' | 'info'; text: string }[];
  competitorMoves: { stationId: string; text: string }[];
  records: string[];
  headlines: string[];
  narrative: { speaker: string; text: string }[];
  narrated: boolean;
  liveAvailable: LiveMoment[];
  closings: string[]; // fechamentos de mês/trimestre/ano ocorridos
}
