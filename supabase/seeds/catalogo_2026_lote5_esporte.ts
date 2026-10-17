// Catálogo real — era atual (2026), LOTE 5 (esporte, Fase 6.4): quem vende os direitos (ligas, CBF, federações,
// Conmebol, UEFA, FIFA, F1), as competições de 2026, quem tinha os direitos de TV aberta na largada (mapa da seção
// 8C.2) e os clássicos entre os clubes do lote 4. A força dos clubes em 2026 já está no lote 4.
//
// Tudo nasce como NÃO aprovado. "Apelo base", força, peso dos clássicos e interesse neutro são ESTIMATIVAS DE JOGO,
// nunca audiência oficial. Atletas reais não aparecem em nenhum campo. Representantes das empresas são fictícios.
// Fontes: "web" = conferido na internet em 17/10/2026 (link na nota); "memória" = não conferido (confiança menor).
// Gere SQL e CSV com: node scripts/gen-catalog-seed.ts

import type { HolderSeed, RightSeed } from './catalogo_2026_lote1.ts';

export const BATCH = '2026-lote5-esporte';

type Conf = 'alta' | 'media' | 'baixa';

export interface CompetitionSeed {
  id: string; name: string; kind: 'liga' | 'copa' | 'evento' | 'gp' | 'luta'; scope: 'estadual' | 'nacional' | 'continental' | 'mundial';
  sport: string; rights_holder_id: string | null; base_appeal: number;
  format: Record<string, unknown>; calendar_rules: Record<string, unknown>; participants: Record<string, string[]>;
  confidence: Conf; notes: string;
}
export interface RivalrySeed { a: string; b: string; weight: number; name: string }

const W = {
  brasileirao: 'https://www.meioemensagem.com.br/midia/brasileirao-2026-onde-assistir-e-patrocinadores',
  onde2026: 'https://www.meioemensagem.com.br/midia/esportes-onde-assistir-as-principais-competicoes-em-2026',
  lance: 'https://www.lance.com.br/lance-negocios/onde-assistir-ao-brasileirao-2026-entenda-divisao-dos-direitos-de-transmissao.html',
  blocos: 'https://www.band.com.br/esportes/brasileirao-veja-como-fica-a-divisao-entre-libra-e-lfu-na-serie-a-em-2026-202512081109',
  palmeirasSai: 'https://www.band.com.br/esportes/libra-e-ffu-saiba-quais-clubes-integram-ligas-apos-saida-do-palmeiras-202605051806',
  recordLfu: 'https://portaldeprefeitura.com.br/esportes/tv-record-acaba-com-o-monopolio-da-globo-e-volta-a-transmitir-jogos-do/579470/',
  calendario: 'https://www.netvasco.com.br/n/370252/cbf-anuncia-calendario-de-2026-com-estaduais-em-11-datas-e-brasileiro-iniciando-em-janeiro-e-terminando-em-dezembro',
  pausaCopa: 'https://www.oliberal.com/esportes/copa-do-mundo/amp/veja-quanto-tempo-o-brasileirao-ficara-paralisado-durante-a-copa-do-mundo-1.1123079',
  serieB: 'https://www.meioemensagem.com.br/midia/redetv-renova-transmissao-da-serie-b-ate-2027',
  serieBOnde: 'https://www.diariodepernambuco.com.br/esportes-dp/sport/2026/03/amp/11710247-serie-b-2026-saiba-onde-assistir-aos-jogos-ao-vivo.html',
  cdbFormato: 'https://oimparcial.com.br/noticias/2026/01/cbf-divulga-datas-e-formato-da-copa-do-brasil-2026/',
  cdbCiclo: 'https://www.meioemensagem.com.br/midia/copa-do-brasil-fica-com-globo-amazon-e-espn',
  cdbDisputa: 'https://oantagonista.com.br/ladooa/entretenimento/globo-sbt-amazon-e-record-disputam-direitos-da-copa-do-brasil-em-negociacao-bilionaria/',
  conmebol: 'https://www.meioemensagem.com.br/midia/onde-assistir-conmebol-libertadores-e-sul-americana-2026',
  sulaSai: 'https://www.meioemensagem.com.br/midia/sul-americana-sai-sbt-e-entra-tnt-sports-na-transmissao',
  libertaClass: 'https://www.band.com.br/esportes/futebol/noticias/veja-clubes-brasileiros-libertadores-2026-202512071442',
  sulaClass: 'https://www.band.com.br/esportes/futebol/noticias/veja-clubes-brasileiros-sul-americana-2026-202512071454',
  champions: 'https://www.meioemensagem.com.br/midia/sbt-mantem-a-uefa-champions-league-na-grade-ate-2027',
  championsRenova: 'https://www.mktesportivo.com/2026/07/sbt-negocia-renovacao-do-acordo-de-sublicenciamento-da-champions-league/',
  warnerUefa: 'https://maquinadoesporte.com.br/midia/warner-e-disney-vencem-disputa-por-direitos-de-tv-de-torneios-de-clubes-da-uefa-no-brasil/',
  copaSbt: 'https://www.opovo.com.br/agencia/jogada10/2025/09/10/sbt-vence-disputa-pelos-direitos-de-transmissao-da-copa-do-mundo-de-2026.html',
  copaGrupo: 'https://www.jornalopcao.com.br/ultimas-noticias/veja-datas-horarios-e-locais-dos-jogos-do-brasil-da-fase-de-grupos-da-copa-772699/',
  f1: 'https://propmark.com.br/?p=122896',
  f1Calendario: 'https://garagem360.com.br/?p=302625',
  paulistao: 'https://trivela.com.br/brasil/paulistao-transmissoes-mudancas-2026-allan-simon/',
  carioca: 'https://www.meioemensagem.com.br/midia/globo-exibira-campeonato-carioca-e-mineiro',
  gauchao: 'https://maquinadoesporte.com.br/futebol/globo-renova-contrato-por-mais-3-anos-e-transmite-gauchao-ate-2027',
};

const EST = 'Apelo base, interesse neutro e forças são estimativas de jogo.';

// ===== quem vende (representantes fictícios) =====
const perfil = (estilo: 'duro' | 'relacional' | 'leiloeiro', prioridades: string[]) => ({ estilo, prioridades });
const rep = (nome: string, cargo: string, estilo: string) => ({ nome, cargo, estilo, ficticio: true });

export const HOLDERS: HolderSeed[] = [
  { id: 'libra', name: 'Libra (Liga do Futebol Brasileiro)', category: 'futebol_nacional', eras: ['now'], profile: perfil('duro', ['preco', 'alcance_nacional', 'multiplataforma']), representative_seed: rep('Henrique Valadares', 'Diretor comercial de mídia', 'formal, fala em valorização do produto e em pacote fechado'), confidence: 'alta', notes: `Web: bloco de clubes da Série A que vende os jogos em casa dos seus clubes; contrato com o Grupo Globo em todas as plataformas (${W.brasileirao}). Composição de 2026 em ${W.blocos}.` },
  { id: 'lfu', name: 'Liga Forte União (LFU)', category: 'futebol_nacional', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'exposicao_tv_aberta', 'multiplataforma']), representative_seed: rep('Marcela Dutra', 'Head de direitos de transmissão', 'pragmática, gosta de dividir o produto entre vários compradores'), confidence: 'alta', notes: `Web: bloco de clubes das Séries A e B; vende em pacotes separados (Globo, Record, Amazon, CazéTV na Série A; RedeTV! na Série B) (${W.brasileirao}; ${W.serieB}). Em maio de 2026 passou a se chamar Futebol Forte União (${W.palmeirasSai}).` },
  { id: 'cbf', name: 'CBF (Confederação Brasileira de Futebol)', category: 'futebol_nacional', eras: ['now'], profile: perfil('duro', ['preco', 'exposicao_tv_aberta', 'seguranca_pagamento']), representative_seed: rep('Otávio Carvalhais', 'Diretor de competições e mídia', 'cerimonioso, valoriza tradição e alcance da TV aberta'), confidence: 'alta', notes: `Web: dona da Copa do Brasil; vendeu o ciclo 2027–2030 em setembro de 2026 (${W.cdbCiclo}).` },
  { id: 'fpf', name: 'Federação Paulista de Futebol', category: 'futebol_nacional', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Rogério Amaral', 'Diretor de marketing', 'falante, compara propostas abertamente'), confidence: 'alta', notes: `Web: organiza o Paulistão; tirou o campeonato da Globo e levou para a Record em 2022 (${W.paulistao}).` },
  { id: 'ferj', name: 'Federação de Futebol do Estado do Rio de Janeiro', category: 'futebol_nacional', eras: ['now'], profile: perfil('relacional', ['exposicao_tv_aberta', 'relacionamento']), representative_seed: rep('Lúcia Brandão', 'Gerente de comunicação e mídia', 'cordial, preocupada com horário dos jogos grandes'), confidence: 'alta', notes: `Web: organiza o Carioca, exibido pela Globo em 2026 (${W.carioca}).` },
  { id: 'fmf', name: 'Federação Mineira de Futebol', category: 'futebol_nacional', eras: ['now'], profile: perfil('relacional', ['exposicao_tv_aberta', 'relacionamento']), representative_seed: rep('Sérgio Faleiro', 'Diretor de competições', 'tranquilo, negocia com calma e cobra visibilidade no interior'), confidence: 'alta', notes: `Web: organiza o Mineiro, exibido pela Globo só em Minas em 2026 (${W.carioca}).` },
  { id: 'fgf', name: 'Federação Gaúcha de Futebol', category: 'futebol_nacional', eras: ['now'], profile: perfil('relacional', ['relacionamento', 'preco']), representative_seed: rep('Paulo Weber', 'Diretor comercial', 'direto, valoriza parceria longa com a TV local'), confidence: 'alta', notes: `Web: organiza o Gauchão; Globo e RBS com contrato até 2027 (${W.gauchao}).` },
  { id: 'conmebol', name: 'Conmebol', category: 'futebol_internacional', eras: ['now'], profile: perfil('duro', ['preco', 'multiplataforma', 'alcance_nacional']), representative_seed: rep('Ignacio Benítez', 'Diretor comercial para o Brasil', 'negociador experiente, vende Libertadores e Sul-Americana em pacotes'), confidence: 'alta', notes: `Web: dona da Libertadores e da Sul-Americana (${W.conmebol}).` },
  { id: 'uefa', name: 'UEFA', category: 'futebol_internacional', eras: ['now'], profile: perfil('duro', ['preco', 'multiplataforma']), representative_seed: rep('Clara Fontaine', 'Gerente de mídia para as Américas', 'educada e firme: os direitos no Brasil já estão com a Warner'), confidence: 'alta', notes: `Web: dona da Champions League; os direitos no Brasil estão com a Warner Bros. Discovery até 2030/31, e a TV aberta é sublicenciada (${W.warnerUefa}). Quem procura a UEFA nesta era é orientado a falar com a Warner (seção 8B.1).` },
  { id: 'fifa', name: 'FIFA', category: 'futebol_internacional', eras: ['now'], profile: perfil('duro', ['preco', 'alcance_nacional', 'protecao_de_marca']), representative_seed: rep('Martin Kessler', 'Diretor de direitos de mídia para a América do Sul', 'protocolar, rígido com patrocinadores oficiais'), confidence: 'alta', notes: `Web: dona da Copa do Mundo; em 2026, Globo e SBT na TV aberta (${W.onde2026}).` },
  { id: 'liberty_f1', name: 'Formula One Group (Liberty Media)', category: 'outros_esportes', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'exposicao_tv_aberta', 'multiplataforma']), representative_seed: rep('Oliver Grant', 'Diretor de parcerias de mídia', 'rápido e moderno, quer a F1 no streaming e na TV aberta'), confidence: 'alta', notes: `Web: dona da Fórmula 1; Globo de 2026 a 2028 depois de cinco temporadas na Band (${W.f1}).` },
];

// ===== participantes =====
const SERIE_A = ['flamengo', 'palmeiras', 'corinthians', 'sao_paulo', 'santos', 'bragantino', 'mirassol', 'vasco', 'fluminense', 'botafogo', 'atletico_mg', 'cruzeiro', 'gremio', 'internacional', 'athletico_pr', 'coritiba', 'chapecoense', 'bahia', 'vitoria', 'remo'];
const SERIE_B = ['fortaleza', 'ceara', 'sport', 'juventude', 'goias', 'atletico_go', 'vila_nova', 'novorizontino', 'america_mg', 'athletic_mg', 'cuiaba', 'criciuma', 'avai', 'crb', 'operario_pr', 'botafogo_sp', 'ponte_preta', 'londrina', 'nautico', 'sao_bernardo'];
// Série A 2026 por bloco na largada (antes da saída do Palmeiras da Libra, em maio de 2026)
const LIBRA = ['flamengo', 'palmeiras', 'sao_paulo', 'santos', 'bragantino', 'gremio', 'bahia', 'vitoria', 'atletico_mg', 'remo'];
const LFU_A = ['corinthians', 'botafogo', 'cruzeiro', 'fluminense', 'internacional', 'mirassol', 'vasco', 'athletico_pr', 'coritiba', 'chapecoense'];

// times sem ficha no catálogo: força por faixa, sem torcida nas praças do jogo
const generic = (tier: string, n: number) => Array.from({ length: n }, () => `generico:${tier}`);

// horários padrão (horário de Brasília); "tv_aberta" marca as faixas em que a TV aberta costuma exibir
const H = (dias: string, hora: string, tv_aberta = false) => ({ dias, hora, ...(tv_aberta ? { tv_aberta: true } : {}) });

// ===== competições de 2026 =====
export const COMPETITIONS: CompetitionSeed[] = [
  {
    id: 'brasileirao_a', name: 'Campeonato Brasileiro Série A', kind: 'liga', scope: 'nacional', sport: 'futebol', rights_holder_id: null, base_appeal: 72,
    format: {
      tipo: 'pontos_corridos', clubes: 20, turnos: 2, rodadas: 38, rebaixados: 4, vagas_libertadores: 6,
      blocos: { libra: LIBRA, lfu: LFU_A }, regra_mandante: 'o mandante define a plataforma do jogo (Lei do Mandante)',
    },
    calendar_rules: {
      '2026': {
        inicio: '2026-01-28', fim: '2026-12-02', pausas: [{ de: '2026-06-01', ate: '2026-07-21', motivo: 'Copa do Mundo' }],
        horarios: [H('qua', '19:00'), H('qua', '21:30', true), H('qui', '19:30'), H('qui', '21:30'), H('sab', '16:00'), H('sab', '18:30'), H('sab', '21:00'), H('dom', '16:00', true), H('dom', '18:30'), H('dom', '20:30', true)],
        nota: 'Três rodadas entre 28/01 e 12/02 intercaladas com estaduais; jogos regulares a partir de 25/02.',
      },
    },
    participants: { '2026': SERIE_A },
    confidence: 'alta',
    notes: `Web: 38 rodadas de 28/01 a 02/12/2026, com pausa de 50 dias na Copa (${W.calendario}; ${W.pausaCopa}). Blocos da largada: Libra e LFU com 10 clubes cada (${W.blocos}); Atlético-MG e Vitória vão para a LFU mas seguem no pacote da Libra até 2029; o Palmeiras deixou a Libra em maio de 2026 (${W.palmeirasSai}). Horários: memória do padrão recente. ${EST}`,
  },
  {
    id: 'brasileirao_b', name: 'Campeonato Brasileiro Série B', kind: 'liga', scope: 'nacional', sport: 'futebol', rights_holder_id: 'lfu', base_appeal: 38,
    format: { tipo: 'pontos_corridos', clubes: 20, turnos: 2, rodadas: 38, promovidos: 4, rebaixados: 4 },
    calendar_rules: {
      '2026': {
        inicio: '2026-03-21', fim: '2026-11-28', pausas: [{ de: '2026-06-11', ate: '2026-07-19', motivo: 'Copa do Mundo (pausa parcial)' }],
        horarios: [H('ter', '19:00'), H('ter', '21:30'), H('sex', '19:00'), H('sex', '21:30', true), H('sab', '16:00'), H('sab', '18:30'), H('dom', '16:00')],
      },
    },
    participants: { '2026': SERIE_B },
    confidence: 'media',
    notes: `Web: temporada começou em março de 2026; na TV aberta, RedeTV! (1 jogo por rodada, mandantes da LFU, até 2027) e Xsports (2 jogos, emissora fora do jogo) (${W.serieB}; ${W.serieBOnde}). Datas de fim e horários: memória, conferir. ${EST}`,
  },
  {
    id: 'copa_do_brasil', name: 'Copa do Brasil', kind: 'copa', scope: 'nacional', sport: 'futebol', rights_holder_id: 'cbf', base_appeal: 68,
    format: {
      tipo: 'mata_mata', clubes: 126,
      fases: [
        { id: 'fase1', nome: '1ª fase', jogos: 1 }, { id: 'fase2', nome: '2ª fase', jogos: 1 }, { id: 'fase3', nome: '3ª fase', jogos: 1 },
        { id: 'fase4', nome: '4ª fase', jogos: 1 }, { id: 'fase5', nome: '5ª fase', jogos: 2, entram: 'clubes da Série A' },
        { id: 'oitavas', nome: 'Oitavas de final', jogos: 2 }, { id: 'quartas', nome: 'Quartas de final', jogos: 2 },
        { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 1 },
      ],
      penaltis: true,
    },
    calendar_rules: {
      '2026': {
        datas: { fase1: ['2026-02-18'], fase2: ['2026-02-25', '2026-03-04'], fase3: ['2026-03-11'], fase4: ['2026-03-18'], fase5: ['2026-04-22', '2026-05-13'], oitavas: ['2026-08-05', '2026-08-12'], quartas: ['2026-08-26', '2026-09-16'], semifinal: ['2026-11-01', '2026-11-08'], final: ['2026-12-06'] },
        horarios: [H('qua', '19:00'), H('qua', '21:30', true), H('qui', '19:00'), H('qui', '21:30'), H('dom', '16:00', true)],
      },
      concorrencias: [{ ciclo: '2027-2030', vendedor: 'cbf', pacote: 'tv_aberta', abre: '2026-01-05', decide_ate: '2026-09-10', nota: 'Na largada o ciclo 2027–2030 está em negociação, com interesse do SBT e da Record. Na história real, Globo, Amazon e ESPN fecharam em setembro de 2026.' }],
    },
    participants: { '2026': [...SERIE_A, ...SERIE_B, 'paysandu', 'santa_cruz', 'guarani', 'figueirense', ...generic('pequeno', 82)] },
    confidence: 'alta',
    notes: `Web: 126 clubes e nove fases; Série A entra na 5ª fase (ida e volta), final em jogo único em 06/12/2026 (${W.cdbFormato}). Ciclo 2027–2030 disputado por Globo, SBT, Amazon e Record (${W.cdbDisputa}) e fechado com Globo, Amazon e ESPN em setembro de 2026 (${W.cdbCiclo}). Datas das oitavas e quartas: aproximadas (agosto e setembro). ${EST}`,
  },
  {
    id: 'libertadores', name: 'Copa Libertadores da América', kind: 'copa', scope: 'continental', sport: 'futebol', rights_holder_id: 'conmebol', base_appeal: 74,
    format: {
      tipo: 'grupos_mata_mata', clubes: 47, grupos: 8, por_grupo: 4, classificam_por_grupo: 2,
      fases: [{ id: 'pre', nome: 'Fase preliminar', jogos: 2 }, { id: 'grupos', nome: 'Fase de grupos', jogos: 6 }, { id: 'oitavas', nome: 'Oitavas de final', jogos: 2 }, { id: 'quartas', nome: 'Quartas de final', jogos: 2 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 1, campo: 'neutro' }],
      estrangeiros: 'forças por faixa (argentinos fortes, demais médios e fracos)',
      diretos_grupos: ['flamengo', 'palmeiras', 'cruzeiro', 'mirassol', 'fluminense', 'corinthians'], preliminar: ['botafogo', 'bahia'],
    },
    calendar_rules: {
      '2026': {
        datas: { pre: ['2026-02-03', '2026-03-12'], grupos: ['2026-04-07', '2026-05-28'], oitavas: ['2026-08-11', '2026-08-20'], quartas: ['2026-09-08', '2026-09-17'], semifinal: ['2026-10-20', '2026-10-29'], final: ['2026-11-28'] },
        horarios: [H('ter', '19:00'), H('ter', '21:30'), H('qua', '19:00'), H('qua', '21:30', true), H('qui', '19:00'), H('qui', '21:30')],
      },
    },
    participants: { '2026': ['flamengo', 'palmeiras', 'cruzeiro', 'mirassol', 'fluminense', 'corinthians', 'botafogo', 'bahia', ...generic('estrangeiro_forte', 8), ...generic('estrangeiro_medio', 16), ...generic('estrangeiro_fraco', 15)] },
    confidence: 'media',
    notes: `Web: oito brasileiros (Flamengo como campeão de 2025, Corinthians pela Copa do Brasil; Botafogo e Bahia na fase preliminar) (${W.libertaClass}); Globo na TV aberta em 2026 (${W.conmebol}). Datas: memória do padrão dos últimos anos, conferir. Estrangeiros entram como times genéricos por faixa. ${EST}`,
  },
  {
    id: 'sul_americana', name: 'Copa Sul-Americana', kind: 'copa', scope: 'continental', sport: 'futebol', rights_holder_id: 'conmebol', base_appeal: 48,
    format: {
      tipo: 'grupos_mata_mata', clubes: 44, grupos: 8, por_grupo: 4, classificam_por_grupo: 1, repescagem: 'segundos colocados contra terceiros da Libertadores',
      fases: [{ id: 'grupos', nome: 'Fase de grupos', jogos: 6 }, { id: 'playoffs', nome: 'Playoffs', jogos: 2 }, { id: 'oitavas', nome: 'Oitavas de final', jogos: 2 }, { id: 'quartas', nome: 'Quartas de final', jogos: 2 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 1, campo: 'neutro' }],
    },
    calendar_rules: {
      '2026': {
        datas: { grupos: ['2026-04-07', '2026-05-28'], playoffs: ['2026-07-14', '2026-07-23'], oitavas: ['2026-08-11', '2026-08-20'], quartas: ['2026-09-08', '2026-09-17'], semifinal: ['2026-10-20', '2026-10-29'], final: ['2026-11-21'] },
        horarios: [H('ter', '19:00'), H('ter', '21:30', true), H('qui', '19:00'), H('qui', '21:30', true)],
      },
    },
    participants: { '2026': ['atletico_mg', 'bragantino', 'gremio', 'santos', 'sao_paulo', 'vasco', ...generic('estrangeiro_medio', 18), ...generic('estrangeiro_fraco', 20)] },
    confidence: 'media',
    notes: `Web: brasileiros garantidos em dez/2025 (Atlético-MG, Bragantino, Grêmio, Santos, São Paulo, Vasco) (${W.sulaClass}); SBT na TV aberta em 2026, última edição do canal (${W.sulaSai}). Datas: memória, conferir. ${EST}`,
  },
  {
    id: 'champions_league', name: 'UEFA Champions League', kind: 'copa', scope: 'continental', sport: 'futebol', rights_holder_id: 'wbd', base_appeal: 52,
    format: {
      tipo: 'liga_mata_mata', clubes: 36, rodadas_liga: 8, temporada: 'europeia (setembro a maio)', interesse_neutro: 0.1,
      fases: [{ id: 'liga', nome: 'Fase de liga', jogos: 8 }, { id: 'playoffs', nome: 'Playoffs', jogos: 2 }, { id: 'oitavas', nome: 'Oitavas de final', jogos: 2 }, { id: 'quartas', nome: 'Quartas de final', jogos: 2 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 1, campo: 'neutro' }],
      sem_clubes_brasileiros: true,
    },
    calendar_rules: {
      '2025/26': {
        datas: { liga: ['2026-01-20', '2026-01-28'], playoffs: ['2026-02-17', '2026-02-25'], oitavas: ['2026-03-10', '2026-03-18'], quartas: ['2026-04-07', '2026-04-15'], semifinal: ['2026-04-28', '2026-05-06'], final: ['2026-05-30'] },
        horarios: [H('ter', '14:45'), H('ter', '17:00', true), H('qua', '14:45'), H('qua', '17:00', true), H('sab', '16:00', true)],
      },
      '2026/27': { datas: { liga: ['2026-09-15', '2027-01-27'] }, horarios: [H('ter', '16:00', true), H('qua', '16:00', true)] },
      concorrencias: [{ ciclo: '2027/28-2030/31', vendedor: 'wbd', pacote: 'sublicenca_tv_aberta', abre: '2026-03-01', decide_ate: '2027-06-30', nota: 'O SBT negocia a renovação; Record e Globo também avaliam (seção 8B.1).' }],
    },
    participants: { '2025/26': [...generic('estrangeiro_forte', 12), ...generic('estrangeiro_medio', 16), ...generic('estrangeiro_fraco', 8)], '2026/27': [...generic('estrangeiro_forte', 12), ...generic('estrangeiro_medio', 16), ...generic('estrangeiro_fraco', 8)] },
    confidence: 'media',
    notes: `Web: no Brasil, direitos com a Warner até 2030/31 e TV aberta sublicenciada ao SBT até 2026/27, um jogo por rodada (${W.champions}; ${W.championsRenova}). Datas da temporada 2025/26 (final em 30/05/2026) e horários: memória, conferir. Sem clubes brasileiros: a audiência vem do "interesse neutro". Vendedor = Warner (a UEFA encaminha para ela). ${EST}`,
  },
  {
    id: 'copa_do_mundo', name: 'Copa do Mundo FIFA', kind: 'evento', scope: 'mundial', sport: 'futebol', rights_holder_id: 'fifa', base_appeal: 96,
    format: {
      tipo: 'grupos_mata_mata', selecoes: 48, grupos: 12, por_grupo: 4, sede: 'EUA, México e Canadá', interesse_neutro: 0.25, torcida_selecao: 0.85,
      fases: [{ id: 'grupos', nome: 'Fase de grupos', jogos: 3 }, { id: '16avos', nome: '16 avos de final', jogos: 1 }, { id: 'oitavas', nome: 'Oitavas de final', jogos: 1 }, { id: 'quartas', nome: 'Quartas de final', jogos: 1 }, { id: 'semifinal', nome: 'Semifinal', jogos: 1 }, { id: 'terceiro', nome: 'Disputa do 3º lugar', jogos: 1 }, { id: 'final', nome: 'Final', jogos: 1 }],
      grupo_brasil: { grupo: 'C', adversarios: ['marrocos', 'haiti', 'escocia'] },
      selecoes_forca: { brasil: 86, marrocos: 78, escocia: 70, haiti: 52 },
    },
    calendar_rules: {
      '2026': {
        inicio: '2026-06-11', fim: '2026-07-19',
        datas: { grupos: ['2026-06-11', '2026-06-27'], '16avos': ['2026-06-28', '2026-07-03'], oitavas: ['2026-07-04', '2026-07-07'], quartas: ['2026-07-09', '2026-07-11'], semifinal: ['2026-07-14', '2026-07-15'], terceiro: ['2026-07-18'], final: ['2026-07-19'] },
        jogos_brasil: [{ data: '2026-06-13', hora: '19:00', adversario: 'marrocos' }, { data: '2026-06-19', hora: '22:00', adversario: 'haiti' }, { data: '2026-06-24', hora: '19:00', adversario: 'escocia' }],
        horarios: [H('seg-dom', '13:00', true), H('seg-dom', '16:00', true), H('seg-dom', '19:00', true), H('seg-dom', '22:00', true)],
      },
    },
    participants: { '2026': ['selecao:brasil', 'selecao:marrocos', 'selecao:escocia', 'selecao:haiti', ...generic('selecao_forte', 12), ...generic('selecao_media', 20), ...generic('selecao_fraca', 12)] },
    confidence: 'alta',
    notes: `Web: 11/06 a 19/07/2026; Brasil no grupo C com Marrocos, Haiti e Escócia, horários de Brasília (${W.copaGrupo}); Globo com 54 jogos nos seus canais e SBT com 32 (um por dia, inclusive os do Brasil) (${W.onde2026}; ${W.copaSbt}). Força das seleções e "torcida da seleção" (fatia de cada praça que acompanha o Brasil) são estimativas de jogo; seleções sem ficha entram por faixa. Só seleções, nenhum atleta.`,
  },
  {
    id: 'formula1', name: 'Fórmula 1', kind: 'gp', scope: 'mundial', sport: 'automobilismo', rights_holder_id: 'liberty_f1', base_appeal: 50,
    format: { tipo: 'gp', etapas: 24, interesse_neutro: 0.12, piloto_brasileiro_no_grid: true },
    calendar_rules: {
      '2026': {
        gps: [
          { id: 'australia', nome: 'GP da Austrália', data: '2026-03-08', hora: '01:00', tv_aberta: true },
          { id: 'china', nome: 'GP da China', data: '2026-03-15', hora: '04:00' },
          { id: 'japao', nome: 'GP do Japão', data: '2026-03-29', hora: '02:00', tv_aberta: true },
          { id: 'bahrein', nome: 'GP do Bahrein', data: '2026-04-12', hora: '12:00' },
          { id: 'arabia', nome: 'GP da Arábia Saudita', data: '2026-04-19', hora: '14:00' },
          { id: 'miami', nome: 'GP de Miami', data: '2026-05-03', hora: '17:00' },
          { id: 'canada', nome: 'GP do Canadá', data: '2026-05-24', hora: '15:00' },
          { id: 'monaco', nome: 'GP de Mônaco', data: '2026-06-07', hora: '10:00', tv_aberta: true },
          { id: 'barcelona', nome: 'GP da Espanha (Barcelona)', data: '2026-06-14', hora: '10:00', tv_aberta: true },
          { id: 'austria', nome: 'GP da Áustria', data: '2026-06-28', hora: '10:00', tv_aberta: true },
          { id: 'inglaterra', nome: 'GP da Inglaterra', data: '2026-07-05', hora: '11:00', tv_aberta: true },
          { id: 'belgica', nome: 'GP da Bélgica', data: '2026-07-19', hora: '10:00', tv_aberta: true },
          { id: 'hungria', nome: 'GP da Hungria', data: '2026-07-26', hora: '10:00', tv_aberta: true },
          { id: 'holanda', nome: 'GP da Holanda', data: '2026-08-23', hora: '10:00', tv_aberta: true },
          { id: 'italia', nome: 'GP da Itália', data: '2026-09-06', hora: '10:00', tv_aberta: true },
          { id: 'madri', nome: 'GP da Espanha (Madri)', data: '2026-09-13', hora: '10:00', tv_aberta: true },
          { id: 'azerbaijao', nome: 'GP do Azerbaijão', data: '2026-09-26', hora: '08:00' },
          { id: 'singapura', nome: 'GP de Singapura', data: '2026-10-11', hora: '09:00', tv_aberta: true },
          { id: 'austin', nome: 'GP dos Estados Unidos', data: '2026-10-25', hora: '16:00' },
          { id: 'mexico', nome: 'GP da Cidade do México', data: '2026-11-01', hora: '17:00' },
          { id: 'sao_paulo', nome: 'GP de São Paulo', data: '2026-11-08', hora: '14:00', tv_aberta: true },
          { id: 'las_vegas', nome: 'GP de Las Vegas', data: '2026-11-21', hora: '01:00', tv_aberta: true },
          { id: 'catar', nome: 'GP do Catar', data: '2026-11-29', hora: '13:00' },
          { id: 'abu_dhabi', nome: 'GP de Abu Dhabi', data: '2026-12-06', hora: '10:00', tv_aberta: true },
        ],
        duracao_min: 120,
      },
      concorrencias: [{ ciclo: '2029-', vendedor: 'liberty_f1', pacote: 'tv_aberta', abre: '2028-01-01', decide_ate: '2028-09-30', nota: 'Contrato da Globo vai até 2028 (seção 8C.2).' }],
    },
    participants: {},
    confidence: 'media',
    notes: `Web: 24 etapas de 08/03 a 06/12/2026; 15 ao vivo na TV Globo, com os horários de Brasília listados; as outras 9 em compacto (${W.f1Calendario}). Datas e horários das 9 corridas fora da TV aberta: memória, conferir. Há um piloto brasileiro titular em 2026 (memória, conferir), o que pesa no interesse; o nome não entra no jogo, que fala em "pilotos" e "equipes" de forma genérica. ${EST}`,
  },
  {
    id: 'paulistao', name: 'Campeonato Paulista', kind: 'liga', scope: 'estadual', sport: 'futebol', rights_holder_id: 'fpf', base_appeal: 55,
    format: { tipo: 'pontos_corridos_mata_mata', clubes: 16, rodadas: 8, fases: [{ id: 'primeira', nome: 'Primeira fase', jogos: 8 }, { id: 'quartas', nome: 'Quartas de final', jogos: 1 }, { id: 'semifinal', nome: 'Semifinal', jogos: 1 }, { id: 'final', nome: 'Final', jogos: 2 }], pracas: ['SP', 'CPS'] },
    calendar_rules: { '2026': { inicio: '2026-01-11', fim: '2026-03-08', datas_totais: 11, horarios: [H('qua', '19:30'), H('qua', '21:30', true), H('sab', '16:00'), H('dom', '16:00'), H('dom', '20:30', true)] } },
    participants: { '2026': ['corinthians', 'palmeiras', 'sao_paulo', 'santos', 'bragantino', 'mirassol', 'novorizontino', 'botafogo_sp', 'sao_bernardo', ...generic('pequeno', 7)] },
    confidence: 'media',
    notes: `Web: Record na TV aberta desde 2022; em 2026, 11 datas e jogos da Record aos domingos às 20h30 (${W.paulistao}; ${W.onde2026}). Formato e lista dos clubes pequenos: memória, conferir. ${EST}`,
  },
  {
    id: 'carioca', name: 'Campeonato Carioca', kind: 'liga', scope: 'estadual', sport: 'futebol', rights_holder_id: 'ferj', base_appeal: 52,
    format: { tipo: 'pontos_corridos_mata_mata', clubes: 12, fases: [{ id: 'primeira', nome: 'Taça Guanabara', jogos: 7 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 2 }], pracas: ['RJ'] },
    calendar_rules: { '2026': { inicio: '2026-01-11', fim: '2026-03-08', horarios: [H('qua', '21:30'), H('sab', '16:00'), H('dom', '18:00', true)] } },
    participants: { '2026': ['flamengo', 'fluminense', 'vasco', 'botafogo', ...generic('pequeno', 8)] },
    confidence: 'media',
    notes: `Web: TV Globo com 1 jogo por rodada, de 11/01 a 08/03/2026; estreia Flamengo x Portuguesa num domingo às 18h (${W.onde2026}; ${W.carioca}). Formato: memória, conferir. ${EST}`,
  },
  {
    id: 'mineiro', name: 'Campeonato Mineiro', kind: 'liga', scope: 'estadual', sport: 'futebol', rights_holder_id: 'fmf', base_appeal: 48,
    format: { tipo: 'grupos_mata_mata', clubes: 12, fases: [{ id: 'primeira', nome: 'Primeira fase', jogos: 8 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 2 }], pracas: ['BH'] },
    calendar_rules: { '2026': { inicio: '2026-01-11', fim: '2026-03-08', horarios: [H('qua', '21:30'), H('sab', '16:00'), H('dom', '16:00', true), H('dom', '18:00')] } },
    participants: { '2026': ['atletico_mg', 'cruzeiro', 'america_mg', 'athletic_mg', ...generic('pequeno', 8)] },
    confidence: 'media',
    notes: `Web: Globo só em Minas, 1 jogo por rodada na primeira fase e os principais das fases decisivas (${W.carioca}; ${W.onde2026}). Formato: memória, conferir. ${EST}`,
  },
  {
    id: 'gauchao', name: 'Campeonato Gaúcho', kind: 'liga', scope: 'estadual', sport: 'futebol', rights_holder_id: 'fgf', base_appeal: 50,
    format: { tipo: 'grupos_mata_mata', clubes: 12, fases: [{ id: 'primeira', nome: 'Primeira fase', jogos: 8 }, { id: 'semifinal', nome: 'Semifinal', jogos: 2 }, { id: 'final', nome: 'Final', jogos: 2 }], pracas: ['POA'] },
    calendar_rules: { '2026': { inicio: '2026-01-11', fim: '2026-03-08', horarios: [H('qua', '21:30', true), H('dom', '18:00', true)] } },
    participants: { '2026': ['gremio', 'internacional', 'juventude', ...generic('pequeno', 9)] },
    confidence: 'media',
    notes: `Web: Globo e RBS com contrato até 2027; jogos aos domingos às 18h e às quartas às 21h30 (${W.gauchao}). Formato: memória, conferir. ${EST}`,
  },
];

// ===== quem tinha os direitos de TV aberta na largada (mapa da seção 8C.2) =====
// terms.tipo = 'esporte' separa estes direitos dos de títulos (o motor esportivo os lê a partir do passo 3).
const esp = (t: Record<string, unknown>) => ({ tipo: 'esporte', plataformas: ['tv_aberta'], ...t });

export const RIGHTS: RightSeed[] = [
  { id: 2650, product_ref: 'brasileirao_a', holder_station_key: 'globo', terms: esp({ pacote: 'libra', cedente: 'libra', plataformas: ['tv_aberta', 'tv_paga', 'ppv', 'streaming'], exclusividade: 'exclusivo', jogos_por_rodada: 1, escolha: 1, regionalizado: true, mandantes: 'clubes da Libra' }), valid_from: '2025-01-01', valid_to: '2029-12-31', confidence: 'alta', notes: `Web: Libra com o Grupo Globo em todas as plataformas; 1 jogo por rodada na TV aberta, conforme a praça (${W.brasileirao}; ${W.onde2026}). Prazo até 2029: memória, conferir.` },
  { id: 2651, product_ref: 'brasileirao_a', holder_station_key: 'globo', terms: esp({ pacote: 'lfu', cedente: 'lfu', exclusividade: 'compartilhado', jogos_por_rodada: 1, escolha: 1, regionalizado: true, mandantes: 'clubes da LFU' }), valid_from: '2025-01-01', valid_to: '2029-12-31', confidence: 'media', notes: `Web: Globo e Record dividem a TV aberta dos jogos da LFU, um jogo cada por rodada (${W.lance}). Prazo: memória, conferir.` },
  { id: 2652, product_ref: 'brasileirao_a', holder_station_key: 'record', terms: esp({ pacote: 'lfu', cedente: 'lfu', exclusividade: 'compartilhado', jogos_por_rodada: 1, escolha: 2, coexibicao: 'CazéTV (streaming gratuito)', mandantes: 'clubes da LFU' }), valid_from: '2025-01-01', valid_to: '2027-12-31', confidence: 'alta', notes: `Web: Record com 1 jogo por rodada na TV aberta, o mesmo da CazéTV, contrato até 2027 (${W.recordLfu}; ${W.lance}).` },
  { id: 2653, product_ref: 'brasileirao_b', holder_station_key: 'redetv', terms: esp({ cedente: 'lfu', exclusividade: 'exclusivo', jogos_por_rodada: 1, escolha: 1, mandantes: 'clubes da LFU' }), valid_from: '2025-01-01', valid_to: '2027-12-31', confidence: 'alta', notes: `Web: RedeTV! renovou com o bloco até 2027, 1 jogo por rodada com exclusividade na TV aberta (${W.serieB}).` },
  { id: 2654, product_ref: 'brasileirao_b', holder_station_key: 'globo', terms: esp({ cedente: 'clubes', exclusividade: 'compartilhado', jogos_por_rodada: 1, regionalizado: true, mandantes: 'Náutico e São Bernardo', pracas: ['REC', 'SP'] }), valid_from: '2026-01-01', valid_to: '2026-12-31', confidence: 'media', notes: `Web: Globo fechou com Náutico e São Bernardo, os dois clubes da Série B fora do bloco (${W.serieBOnde}). Praças e prazo: estimativa.` },
  { id: 2655, product_ref: 'copa_do_brasil', holder_station_key: 'globo', terms: esp({ cedente: 'cbf', plataformas: ['tv_aberta', 'tv_paga', 'ppv'], exclusividade: 'exclusivo', escolha: 1, jogos_por_fase: 1 }), valid_from: '2023-01-01', valid_to: '2026-12-31', confidence: 'alta', notes: `Web: Globo na TV aberta em 2026, com Prime Video no streaming (${W.onde2026}). Ciclo 2027–2030 em concorrência na largada (${W.cdbDisputa}).` },
  { id: 2656, product_ref: 'libertadores', holder_station_key: 'globo', terms: esp({ cedente: 'conmebol', exclusividade: 'exclusivo', escolha: 1, jogos_por_rodada: 1, regionalizado: true }), valid_from: '2023-01-01', valid_to: '2026-12-31', confidence: 'alta', notes: `Web: Libertadores na Globo em 2026; ESPN/Disney+ e Paramount+ com o restante (${W.conmebol}). Na história real, a Globo renovou para 2027–2030 durante 2026.` },
  { id: 2657, product_ref: 'sul_americana', holder_station_key: 'sbt', terms: esp({ cedente: 'conmebol', exclusividade: 'exclusivo', escolha: 1, jogos_por_rodada: 1 }), valid_from: '2023-01-01', valid_to: '2026-12-31', confidence: 'alta', notes: `Web: SBT na TV aberta em 2026, última edição do canal; de 2027 a 2030 a TNT Sports leva para o YouTube (${W.sulaSai}).` },
  { id: 2658, product_ref: 'champions_league', holder_station_key: 'sbt', terms: esp({ cedente: 'wbd', sublicenca: true, exclusividade: 'exclusivo', escolha: 1, jogos_por_rodada: 1 }), valid_from: '2024-07-01', valid_to: '2027-06-30', confidence: 'alta', notes: `Web: SBT na TV aberta por sublicenciamento da Warner até 2026/27, um jogo por rodada (${W.champions}; ${W.championsRenova}).` },
  { id: 2659, product_ref: 'copa_do_mundo', holder_station_key: 'globo', terms: esp({ cedente: 'fifa', exclusividade: 'compartilhado', jogos: 54, inclui_brasil: true, escolha: 1 }), valid_from: '2026-01-01', valid_to: '2026-07-31', confidence: 'alta', notes: `Web: Globo com 54 jogos nos seus canais (${W.onde2026}).` },
  { id: 2660, product_ref: 'copa_do_mundo', holder_station_key: 'sbt', terms: esp({ cedente: 'fifa', exclusividade: 'compartilhado', jogos: 32, um_por_dia: true, inclui_brasil: true, escolha: 2 }), valid_from: '2026-01-01', valid_to: '2026-07-31', confidence: 'alta', notes: `Web: SBT com 32 jogos, um por dia, inclusive os do Brasil (${W.onde2026}; ${W.copaSbt}).` },
  { id: 2661, product_ref: 'formula1', holder_station_key: 'globo', terms: esp({ cedente: 'liberty_f1', plataformas: ['tv_aberta', 'tv_paga', 'streaming'], exclusividade: 'exclusivo', gps_ao_vivo_tv_aberta: 15 }), valid_from: '2026-01-01', valid_to: '2028-12-31', confidence: 'alta', notes: `Web: Globo de 2026 a 2028, 15 GPs ao vivo na TV aberta (${W.f1}; ${W.f1Calendario}).` },
  { id: 2662, product_ref: 'paulistao', holder_station_key: 'record', terms: esp({ cedente: 'fpf', exclusividade: 'exclusivo', jogos_por_rodada: 2, pracas: ['SP', 'CPS'] }), valid_from: '2022-01-01', valid_to: '2026-12-31', confidence: 'media', notes: `Web: Record com o Paulistão na TV aberta desde 2022, 2 jogos por rodada em 2026 (${W.paulistao}; ${W.onde2026}). Prazo do contrato: conferir.` },
  { id: 2663, product_ref: 'carioca', holder_station_key: 'globo', terms: esp({ cedente: 'ferj', exclusividade: 'exclusivo', jogos_por_rodada: 1, pracas: ['RJ'] }), valid_from: '2026-01-01', valid_to: '2026-12-31', confidence: 'media', notes: `Web: TV Globo com 1 jogo por rodada do Carioca em 2026 (${W.onde2026}). Prazo: conferir.` },
  { id: 2664, product_ref: 'mineiro', holder_station_key: 'globo', terms: esp({ cedente: 'fmf', exclusividade: 'exclusivo', jogos_por_rodada: 1, pracas: ['BH'] }), valid_from: '2026-01-01', valid_to: '2026-12-31', confidence: 'media', notes: `Web: Globo só em Minas, 1 jogo por rodada na primeira fase (${W.carioca}). Prazo: conferir.` },
  { id: 2665, product_ref: 'gauchao', holder_station_key: 'globo', terms: esp({ cedente: 'fgf', exclusividade: 'exclusivo', jogos_por_rodada: 1, pracas: ['POA'], afiliada: 'RBS TV' }), valid_from: '2025-01-01', valid_to: '2027-12-31', confidence: 'alta', notes: `Web: Globo e RBS até 2027 (${W.gauchao}).` },
];

// ===== clássicos (o R da fórmula da seção 8C.4; o peso é estimativa de jogo) =====
export const RIVALRIES: RivalrySeed[] = [
  { a: 'flamengo', b: 'vasco', weight: 1.6, name: 'Clássico dos Milhões' },
  { a: 'flamengo', b: 'fluminense', weight: 1.5, name: 'Fla-Flu' },
  { a: 'flamengo', b: 'botafogo', weight: 1.35, name: 'Clássico da Rivalidade' },
  { a: 'vasco', b: 'fluminense', weight: 1.3, name: 'Clássico dos Gigantes' },
  { a: 'vasco', b: 'botafogo', weight: 1.3, name: 'Clássico da Amizade' },
  { a: 'fluminense', b: 'botafogo', weight: 1.25, name: 'Clássico Vovô' },
  { a: 'corinthians', b: 'palmeiras', weight: 1.6, name: 'Derby' },
  { a: 'corinthians', b: 'sao_paulo', weight: 1.45, name: 'Majestoso' },
  { a: 'palmeiras', b: 'sao_paulo', weight: 1.4, name: 'Choque-Rei' },
  { a: 'santos', b: 'corinthians', weight: 1.3, name: 'Clássico Alvinegro' },
  { a: 'santos', b: 'palmeiras', weight: 1.25, name: 'Clássico da Saudade' },
  { a: 'santos', b: 'sao_paulo', weight: 1.25, name: 'San-São' },
  { a: 'gremio', b: 'internacional', weight: 1.7, name: 'Gre-Nal' },
  { a: 'atletico_mg', b: 'cruzeiro', weight: 1.6, name: 'Clássico Mineiro' },
  { a: 'america_mg', b: 'atletico_mg', weight: 1.15, name: 'Clássico das Multidões' },
  { a: 'america_mg', b: 'cruzeiro', weight: 1.15, name: 'Clássico das Américas' },
  { a: 'athletico_pr', b: 'coritiba', weight: 1.5, name: 'Atletiba' },
  { a: 'bahia', b: 'vitoria', weight: 1.6, name: 'Ba-Vi' },
  { a: 'sport', b: 'santa_cruz', weight: 1.35, name: 'Clássico das Multidões (PE)' },
  { a: 'sport', b: 'nautico', weight: 1.35, name: 'Clássico dos Clássicos' },
  { a: 'nautico', b: 'santa_cruz', weight: 1.25, name: 'Clássico das Emoções' },
  { a: 'fortaleza', b: 'ceara', weight: 1.5, name: 'Clássico-Rei' },
  { a: 'remo', b: 'paysandu', weight: 1.6, name: 'Re-Pa' },
  { a: 'goias', b: 'vila_nova', weight: 1.35, name: 'Clássico Goiano' },
  { a: 'goias', b: 'atletico_go', weight: 1.2, name: 'Clássico Goiás x Atlético' },
  { a: 'avai', b: 'figueirense', weight: 1.4, name: 'Clássico da Ilha' },
  { a: 'ponte_preta', b: 'guarani', weight: 1.4, name: 'Dérbi Campineiro' },
  { a: 'flamengo', b: 'corinthians', weight: 1.2, name: 'Clássico do Povo' },
  { a: 'flamengo', b: 'palmeiras', weight: 1.2, name: 'rivalidade recente' },
];

export const RIVALRY_NOTE = 'Clássicos: memória (rivalidades tradicionais e conhecidas); o peso de cada clássico na audiência é estimativa de jogo.';
