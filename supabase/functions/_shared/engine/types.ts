// Tipos centrais do motor do Prime Time Manager.
// O motor é puro: recebe estado + decisões + semente e devolve novo estado.
// Todo valor em dinheiro dentro do motor está em R$ de 2026; a exibição
// converte para o valor nominal da era (ver money.ts).

export type EraId = 'now'; // v2.1: só a era atual (2026); o tipo segue existindo para o motor ler os parâmetros da era
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
  catalogTitleId?: string; // v2: título real de origem (catalog_titles.id), quando veio do catálogo
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
  programId: string; // vazio nas cotas esportivas, que valem para o direito inteiro (contractId)
  contractId?: string; // cota de um direito esportivo (Fase 6.4)
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
  catalogTitleId?: string; // v2: oferta de um título real do catálogo
  lockedBy?: { stationKey: string; stationName: string; until: string | null }; // exclusivo de outra emissora: visível, sem compra
}

// ===== catálogo real (v2, seção 8A): cópia dos itens aprovados, guardada na partida ao ser criada =====
export interface CatalogTitleSnap {
  id: string;
  titleBr: string;
  titleOriginal: string | null;
  kind: string;
  country: string | null;
  holderId: string | null;
  year: number | null;
  episodes: number | null;
  durationMin: number | null;
  availableFrom: string | null;
  availableTo: string | null;
  attrs: { genre?: string; quality?: number; appeal?: number; fatigue?: number; rating?: string; exibicoes_por_titulo?: number };
  brStations: string[]; // emissoras que exibiram o título na história real (para registrar divergências)
}

export interface CatalogSlotSnap {
  dias: string;
  inicio: string;
  fim: string;
  titulo: string;
  genero: string;
  catalog_title_id?: string;
}

export interface CatalogSnapshot {
  titles: CatalogTitleSnap[];
  grids: { stationKey: string; referenceMonth: string; slots: CatalogSlotSnap[] }[];
  rights: { productRef: string; holderStationKey: string; validFrom: string | null; validTo: string | null; exclusive: boolean; kind?: string; terms?: Record<string, unknown> }[];
  holders: CatalogHolderSnap[];
  sports?: SportsCatalogSnap; // v2 (Fase 6.4): competições, clubes e torcidas aprovados
}

// ===== Esporte (v2, seção 8C) =====
export interface SportsCompetitionSnap {
  id: string;
  name: string;
  kind: 'liga' | 'copa' | 'evento' | 'gp' | 'luta';
  scope: string;
  sport: string;
  holderId: string | null;
  baseAppeal: number; // B da seção 8C.4 (0-100, estimativa)
  format: Record<string, unknown>;
  calendar: Record<string, unknown>; // temporada -> regras; "concorrencias" -> ciclos de direitos
  participants: Record<string, string[]>;
}
export interface SportsClubSnap {
  id: string;
  name: string;
  ratings: Record<string, number>; // temporada -> força 0-100
  rivals: { club: string; weight: number; name?: string }[];
}
export interface SportsCatalogSnap {
  competitions: SportsCompetitionSnap[];
  clubs: SportsClubSnap[];
  fanbase: Record<string, Record<string, number>>; // clube -> praça -> fatia da torcida
}

// placar: [gols do mandante, gols do visitante, pênaltis do mandante, pênaltis do visitante, prorrogação (1)]
export type MatchScore = number[];
export interface SportsChange {
  date: string;
  time: string;
  kind: 'horario' | 'adiado';
  reason: string;
  fromDate: string;
  fromTime: string;
}
export interface SeasonSummary {
  champion: string | null;
  runnerUp: string | null;
  table?: string[]; // classificação final (ligas)
}
export interface SportsState {
  results: Record<string, MatchScore>; // código do jogo -> placar (só da temporada em curso)
  changes: Record<string, SportsChange>; // mudanças de horário e adiamentos impostos pela liga
  picks: Record<string, string[]>; // código do jogo -> emissoras que transmitem (Fase 6.4, passo 4)
  done: Record<string, SeasonSummary>; // "competição|temporada" encerrada
  checkedUntil: string; // até que data as mudanças de calendário já foram sorteadas
  windows?: SportsWindow[]; // transmissões da semana corrente (todas as emissoras)
  windowsWeek?: number;
  overrides?: Record<string, string>; // escolhas do jogador na Central: "contrato|rodada" -> código do jogo ('' = não transmitir)
  eventFlags?: Record<string, number>; // eventos esportivos já disparados (chave -> semana)
  lastRedCard?: string; // jogo transmitido pelo jogador com expulsão na semana que passou
  notes?: string[]; // avisos da semana (prorrogação, horário estourado) para a caixa de entrada
}

// player de direitos (Fase 6.3): perfil de negociação e representante fictício vêm do catálogo
export interface CatalogHolderSnap {
  id: string;
  name: string;
  category?: string;
  style?: NegStyle;
  priorities?: string[];
  representative?: { nome: string; cargo: string; estilo: string } | null;
}

// ===== Mesa de Negociação (v2, seção 8B) =====
export type NegStyle = 'duro' | 'relacional' | 'leiloeiro';

// o que está na mesa (term sheet, seção 8B.2). Valores em R$ de 2026.
export interface TermSheet {
  valor: number; // valor total do contrato
  parcelas: number; // 1 a 4
  anos: number; // duração do contrato, 1 a 5
  exibicoes: number; // total de exibições (enlatados e filmes) ou programas (formatos)
  exclusividade: 'exclusivo' | 'compartilhado';
  plataformas: 'tv_aberta' | 'tv_aberta_streaming';
  faixa: BandId; // horário prometido (exposição)
  preferencia_renovacao: boolean;
}

export interface HolderRelation {
  score: number; // 0 a 100
  distrustUntil?: string | null; // blefe descoberto: desconfiança até esta data
  history?: { date: string; delta: number; reason: string }[];
}

export interface ContractPayment { date: string; amount: number; paid: boolean }
export interface ContractObligation { kind: 'faixa'; band: BandId; from: string; met: number; missed: number }

export interface RightsContract {
  id: string;
  stationId: string;
  holderId: string | null;
  productRef: string;
  label: string; // nome do produto para as telas
  origin: 'largada' | 'negociacao' | 'concorrencia';
  terms: Partial<TermSheet> & { escopo?: string };
  startDate: string | null;
  endDate: string | null;
  payments: ContractPayment[];
  obligations: ContractObligation[];
  status: 'ativo' | 'encerrado' | 'rescindido' | 'inadimplente';
  programId?: string | null;
  negotiationId?: string | null;
  sport?: SportContractInfo; // direito esportivo (Fase 6.4)
}

// regras de um direito esportivo: quais jogos a emissora pode transmitir e o que deve cumprir
export interface SportContractInfo {
  comp: string;
  pacote?: string | null; // bloco da liga (libra, lfu) quando o mandante define a plataforma
  mandantes: { kind: 'bloco'; bloco: string } | { kind: 'clubes'; ids: string[] } | { kind: 'resto' } | null;
  perRound: number; // jogos por rodada (ou por dia, em eventos)
  choice: number; // ordem de escolha: 1 escolhe antes de 2
  regional: boolean; // pode passar jogos diferentes em cada praça no mesmo horário
  pracas: string[] | null; // só nessas praças (estaduais)
  exclusive: boolean;
  includeBrazil: boolean; // eventos: os jogos da seleção sempre entram
  gpsLive: number | null; // F1: GPs ao vivo na TV aberta
  platforms: string[];
  sublicensable: boolean; // tem janelas além da TV aberta para revender
  sublicensed: { date: string; value: number } | null;
  entitled: number; // jogos a que a emissora teve direito (escolhidos)
  aired: number; // jogos que foram ao ar
  checkedSeasons: string[]; // temporadas com obrigação já conferida
  cotaSeasons: string[]; // temporadas com cotas de patrocínio já vendidas
  rightsPaid?: boolean; // direitos pagos em parcelas do contrato (concorrência): o jogo custa só a produção
  crew?: 'local' | 'estudio'; // equipe no estádio (padrão) ou narração do estúdio (mais barata, menos qualidade)
  crewRequired?: boolean; // contrato exige equipe própria no local (seção 8B.2)
}

// uma transmissão da semana: horário na grade, jogo principal e o jogo de cada praça (transmissão regionalizada)
export interface SportsWindow {
  station: string;
  contract: string;
  date: string; // dia de TV (das 6h às 6h)
  day: number; // 0 = segunda da semana corrente
  start: number; // slot do início do jogo
  main: string; // código do jogo principal
  byMarket: string[]; // código do jogo em cada praça (mesma ordem de MARKETS)
  unit?: string; // rodada ou fase da escolha (para a Central de Esportes)
  skipped?: boolean; // o jogador abriu mão da transmissão (conta na obrigação do contrato)
}

export interface Divergence {
  date: string;
  description: string;
  productRef: string;
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
  sport?: boolean; // transmissão esportiva do jogador (Fase 6.4)
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
  catalog?: CatalogSnapshot; // v2: catálogo real aprovado no momento da criação (só no modo real com Supabase)
  divergences?: Divergence[]; // v2: onde a partida se afastou da história real
  pendingDivergences?: Divergence[]; // gravadas na tabela divergences pelo servidor, como a caixa de saída
  rightsContracts?: RightsContract[]; // v2: contratos de direitos (largada e negociados); espelhados em rights_contracts
  holderRel?: Record<string, Record<string, HolderRelation>>; // v2: relacionamento player -> emissora (0 a 100)
  sports?: SportsState; // v2 (Fase 6.4): resultados, mudanças de calendário e transmissões do esporte real
  tenders?: TenderPublic[]; // v2 (Fase 6.4): concorrências de direitos esportivos (só a parte pública)
}

// ===== concorrência de direitos esportivos (seções 8B.3, item 6, e 19.7) =====
// envelope: valor total do ciclo e o projeto de transmissão (o que pesa além do dinheiro)
export interface TenderOffer {
  valor: number;
  jogos: number; // jogos por rodada na TV aberta (1 ou 2)
  faixa: 'nobre' | 'tarde' | 'qualquer'; // horário prometido para os jogos principais
  streaming: boolean; // também no streaming próprio
  parcelas: number; // 1 a 4 (uma por ano do ciclo)
}
export interface TenderResult {
  winner: string | null; // emissora vencedora
  winnerName: string;
  winningValue: number;
  ranking: { stationId: string; name: string; score: number; valid: boolean }[];
  playerValid: boolean | null; // o envelope do jogador passou do mínimo? (null: não entregou)
  note: string;
}
export interface TenderPublic {
  id: string;
  comp: string;
  compName: string;
  pacote: string | null; // pacote do direito (ex.: lfu) ou null
  cycle: string; // ex.: 2027-2030
  seller: string; // player que vende (cbf, wbd...)
  sellerName: string;
  kind: 'concorrencia' | 'renovacao';
  opens: string;
  closes: string; // prazo para entregar o envelope
  startDate: string; // início do contrato
  endDate: string;
  seasons: number;
  incumbent: string | null; // emissora com o contrato que está acabando
  interested: string[]; // emissoras que o mercado comenta que vão disputar (boato, não lance)
  reference: number; // valor de referência aproximado (com a imprecisão da Pesquisa)
  status: 'aberta' | 'a_resolver' | 'encerrada';
  playerBid: (TenderOffer & { submittedOn: string; exposure: number }) | null;
  planBonus: number; // projeto de transmissão apresentado na reunião (0 a 0,1)
  met: boolean; // o jogador já se reuniu com quem vende
  result?: TenderResult;
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
