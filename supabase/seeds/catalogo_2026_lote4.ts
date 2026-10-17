// Catálogo real — era atual (2026), LOTE 4: clubes das Séries A e B de 2026 e torcida por praça (Fase 6.2).
// As competições, o calendário e a simulação dos jogos ficam para a Fase 6.4.
//
// "Força" (rating_by_season) é uma ESTIMATIVA DE JOGO de 0 a 100 para a temporada de 2026, não é ranking oficial.
// "Torcida por praça" (share) é a fatia estimada da população da praça que torce para o clube. Não achamos pesquisa
// recente por região metropolitana: os números partem das pesquisas nacionais (Ipsos-Ipec, jun/2025; Quaest, 2024;
// AtlasIntel, 2024) e do peso regional de cada clube, por isso todos estão com confiança baixa. O que sobra de cada
// praça é "sem time" ou clubes pequenos que não estão no lote.
// Gere SQL e CSV com: node scripts/gen-catalog-seed.ts

export const BATCH = '2026-lote4';

type Conf = 'alta' | 'media' | 'baixa';

const W = {
  serieA: 'https://diariodopara.com.br/bola/cbf-confirma-clubes-do-brasileirao-2026-serie-d-cresce-e-bate-recorde/',
  rebaixados: 'https://www.dci.com.br/esporte/futebol/confira-quais-foram-os-times-rebaixados-do-brasileirao-2025/',
  serieB: 'https://www.tnh1.com.br/noticia/nid/serie-b-2026-tem-seus-20-participantes-definidos/',
  ipec2025: 'https://www.tupi.fm/esportes/as-maiores-torcidas-do-brasil-em-2025-segundo-nova-pesquisa/',
  quaest2024: 'https://www.gazetasp.com.br/esportes/nova-pesquisa-aponta-sao-paulo-como-3a-maior-torcida-do-brasil/',
  atlas2024: 'https://www.itatiaia.com.br/esportes/o-maior-raio-x-do-torcedor/vasco-ultrapassa-atletico-e-cruzeiro-e-entra-no-top-5-de-maiores-torcidas-do-brasil/',
  nordeste: 'https://portaldeprefeitura.com.br/esportes/com-o-sport-em-segundo-ranking-revela-os-times-nordestinos-com-as/600016/',
  rio: 'https://www.itatiaia.com.br/esportes/flamengo-tem-quatro-vezes-mais-torcedores-que-os-rivais-do-rio-de-janeiro-juntos/',
  minas: 'https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/pesquisa-aponta-clubes-com-maiores-torcidas-do-brasil-veja-ranking/',
};

export interface ClubSeed { id: string; name: string; country: string; rating_by_season: Record<string, number>; confidence: Conf; notes: string }
export interface FanSeed { club_id: string; market_id: string; share: number; confidence: Conf; notes: string }

const A = `Série A em 2026 (lista da CBF: ${W.serieA}).`;
const B = `Série B em 2026 (${W.serieB}).`;
const FORCA = 'Força 2026: estimativa de jogo.';
const c = (id: string, name: string, forca: number, confidence: Conf, notes: string): ClubSeed => ({ id, name, country: 'Brasil', rating_by_season: { '2026': forca }, confidence, notes: `${notes} ${FORCA}` });

export const CLUBS: ClubSeed[] = [
  // --- Série A 2026 ---
  c('flamengo', 'Flamengo', 90, 'alta', `${A} Maior torcida do país: 21,2% na Ipsos-Ipec de jun/2025 (${W.ipec2025}).`),
  c('palmeiras', 'Palmeiras', 88, 'alta', `${A} 6,5% na Ipsos-Ipec de 2025.`),
  c('corinthians', 'Corinthians', 75, 'alta', `${A} Segunda maior torcida: 11,9% na Ipsos-Ipec de 2025.`),
  c('sao_paulo', 'São Paulo', 77, 'alta', `${A} 6,4% na Ipsos-Ipec de 2025.`),
  c('santos', 'Santos', 71, 'alta', `${A} 2,0% na Ipsos-Ipec de 2025.`),
  c('bragantino', 'Red Bull Bragantino', 72, 'alta', A),
  c('mirassol', 'Mirassol', 70, 'alta', A),
  c('vasco', 'Vasco da Gama', 73, 'alta', `${A} 3,4% na Ipsos-Ipec de 2025.`),
  c('fluminense', 'Fluminense', 78, 'alta', A),
  c('botafogo', 'Botafogo', 80, 'alta', A),
  c('atletico_mg', 'Atlético Mineiro', 78, 'alta', `${A} 2,3% na Ipsos-Ipec de 2025.`),
  c('cruzeiro', 'Cruzeiro', 80, 'alta', `${A} 2,3% na Ipsos-Ipec de 2025.`),
  c('gremio', 'Grêmio', 74, 'alta', `${A} 3,0% na Ipsos-Ipec de 2025.`),
  c('internacional', 'Internacional', 76, 'alta', A),
  c('athletico_pr', 'Athletico Paranaense', 70, 'alta', `${A} Subiu da Série B de 2025.`),
  c('coritiba', 'Coritiba', 66, 'alta', `${A} Subiu da Série B de 2025.`),
  c('chapecoense', 'Chapecoense', 60, 'alta', `${A} Subiu da Série B de 2025.`),
  c('bahia', 'Bahia', 76, 'alta', `${A} 2,2% na Ipsos-Ipec de 2025.`),
  c('vitoria', 'Vitória', 66, 'alta', A),
  c('remo', 'Remo', 61, 'alta', `${A} Subiu da Série B de 2025.`),
  // --- Série B 2026 ---
  c('fortaleza', 'Fortaleza', 66, 'alta', `${B} Caiu da Série A em 2025 (${W.rebaixados}).`),
  c('ceara', 'Ceará', 64, 'alta', `${B} Caiu da Série A em 2025.`),
  c('sport', 'Sport', 63, 'alta', `${B} Caiu da Série A em 2025.`),
  c('juventude', 'Juventude', 60, 'alta', `${B} Caiu da Série A em 2025.`),
  c('goias', 'Goiás', 60, 'alta', B),
  c('atletico_go', 'Atlético Goianiense', 58, 'alta', B),
  c('vila_nova', 'Vila Nova', 56, 'alta', B),
  c('novorizontino', 'Novorizontino', 60, 'alta', B),
  c('america_mg', 'América Mineiro', 60, 'alta', B),
  c('athletic_mg', 'Athletic Club', 52, 'alta', `${B} Clube de São João del-Rei (MG).`),
  c('cuiaba', 'Cuiabá', 59, 'alta', B),
  c('criciuma', 'Criciúma', 58, 'alta', B),
  c('avai', 'Avaí', 56, 'alta', B),
  c('crb', 'CRB', 56, 'alta', B),
  c('operario_pr', 'Operário Ferroviário', 55, 'alta', B),
  c('botafogo_sp', 'Botafogo-SP', 54, 'alta', B),
  c('ponte_preta', 'Ponte Preta', 55, 'alta', `${B} Campeã da Série C de 2025.`),
  c('londrina', 'Londrina', 52, 'alta', `${B} Subiu da Série C de 2025.`),
  c('nautico', 'Náutico', 53, 'alta', `${B} Subiu da Série C de 2025.`),
  c('sao_bernardo', 'São Bernardo', 52, 'alta', `${B} Subiu da Série C de 2025.`),
  // --- fora das Séries A e B, mas com torcida grande em praças do jogo ---
  c('paysandu', 'Paysandu', 50, 'baixa', 'Memória: fora das Séries A e B em 2026 (divisão a conferir); divide Belém com o Remo.'),
  c('santa_cruz', 'Santa Cruz', 45, 'baixa', 'Memória: fora das Séries A e B em 2026 (divisão a conferir); uma das três grandes torcidas do Recife.'),
  c('guarani', 'Guarani', 48, 'baixa', 'Memória: fora das Séries A e B em 2026 (divisão a conferir); divide Campinas com a Ponte Preta.'),
  c('figueirense', 'Figueirense', 47, 'baixa', 'Memória: fora das Séries A e B em 2026 (divisão a conferir); divide Florianópolis com o Avaí.'),
];

// ===== torcida por praça (estimativas, confiança baixa) =====
const NOTA_PRACA: Record<string, string> = {
  SP: `Estimativa a partir das pesquisas nacionais (Ipsos-Ipec 2025: ${W.ipec2025}; Quaest 2024: ${W.quaest2024}), com o peso do Sudeste na torcida dos paulistas.`,
  RJ: `Estimativa ajustada de um Datafolha estadual sem data confirmada (Flamengo 46%, Vasco 16%, Botafogo e Fluminense 9%) e da Quaest 2023 (${W.rio}).`,
  BH: `Estimativa: pesquisas estaduais antigas dão vantagem ao Cruzeiro, as nacionais recentes empatam os dois (${W.minas}; ${W.atlas2024}).`,
  POA: 'Estimativa: dupla Gre-Nal dominante na Grande Porto Alegre; memória.',
  REC: `Estimativa a partir dos recortes do Nordeste da Ipsos-Ipec 2025 (${W.nordeste}) e do trio Sport, Santa Cruz e Náutico.`,
  SSA: `Estimativa a partir dos recortes do Nordeste (${W.nordeste}).`,
  FOR: `Estimativa a partir dos recortes do Nordeste (${W.nordeste}).`,
  CWB: 'Estimativa: Athletico e Coritiba dominantes, com muitos torcedores de clubes paulistas; memória.',
  GYN: 'Estimativa: Goiás, Vila Nova e Atlético-GO, com muita torcida do Flamengo; memória.',
  DF: 'Estimativa: torcida dividida entre clubes do Rio e de São Paulo, com o Flamengo à frente; memória.',
  CPS: 'Estimativa: clubes da capital paulista à frente de Ponte Preta e Guarani; memória.',
  BEL: 'Estimativa: Remo e Paysandu divididos, com o Flamengo forte; memória.',
  VIX: 'Estimativa: torcida concentrada em clubes do Rio; memória.',
  MAO: 'Estimativa: torcida concentrada em clubes do Rio, sobretudo o Flamengo; memória.',
  FLN: 'Estimativa: Avaí e Figueirense à frente, com muitos torcedores de Grêmio e Internacional; memória.',
};
const PRACAS: Record<string, [string, number][]> = {
  SP: [['corinthians', 0.27], ['palmeiras', 0.15], ['sao_paulo', 0.15], ['santos', 0.05], ['flamengo', 0.05], ['vasco', 0.01]],
  RJ: [['flamengo', 0.42], ['vasco', 0.14], ['fluminense', 0.08], ['botafogo', 0.08]],
  BH: [['cruzeiro', 0.30], ['atletico_mg', 0.30], ['america_mg', 0.03], ['flamengo', 0.05], ['corinthians', 0.01]],
  POA: [['gremio', 0.42], ['internacional', 0.40], ['flamengo', 0.02], ['juventude', 0.01]],
  REC: [['sport', 0.30], ['santa_cruz', 0.15], ['nautico', 0.10], ['flamengo', 0.08], ['corinthians', 0.02], ['vasco', 0.02]],
  SSA: [['bahia', 0.38], ['vitoria', 0.25], ['flamengo', 0.07], ['corinthians', 0.02], ['sao_paulo', 0.02]],
  FOR: [['fortaleza', 0.30], ['ceara', 0.28], ['flamengo', 0.10], ['corinthians', 0.03], ['vasco', 0.03], ['sao_paulo', 0.02]],
  CWB: [['athletico_pr', 0.27], ['coritiba', 0.22], ['corinthians', 0.06], ['flamengo', 0.05], ['sao_paulo', 0.04], ['palmeiras', 0.04]],
  GYN: [['goias', 0.22], ['vila_nova', 0.12], ['atletico_go', 0.07], ['flamengo', 0.15], ['sao_paulo', 0.05], ['corinthians', 0.04], ['palmeiras', 0.04], ['vasco', 0.03]],
  DF: [['flamengo', 0.30], ['corinthians', 0.06], ['vasco', 0.06], ['sao_paulo', 0.05], ['palmeiras', 0.05], ['fluminense', 0.02], ['botafogo', 0.02], ['cruzeiro', 0.02], ['atletico_mg', 0.02]],
  CPS: [['corinthians', 0.20], ['palmeiras', 0.14], ['sao_paulo', 0.13], ['ponte_preta', 0.07], ['guarani', 0.06], ['santos', 0.04], ['flamengo', 0.04]],
  BEL: [['remo', 0.30], ['paysandu', 0.30], ['flamengo', 0.12], ['vasco', 0.04], ['corinthians', 0.02]],
  VIX: [['flamengo', 0.28], ['vasco', 0.10], ['botafogo', 0.04], ['fluminense', 0.04], ['corinthians', 0.04], ['sao_paulo', 0.03], ['palmeiras', 0.03]],
  MAO: [['flamengo', 0.35], ['vasco', 0.10], ['corinthians', 0.04], ['sao_paulo', 0.03], ['palmeiras', 0.03], ['fluminense', 0.02], ['botafogo', 0.02]],
  FLN: [['avai', 0.18], ['figueirense', 0.15], ['gremio', 0.08], ['internacional', 0.06], ['flamengo', 0.06], ['corinthians', 0.05], ['sao_paulo', 0.04], ['palmeiras', 0.04], ['criciuma', 0.03], ['chapecoense', 0.02]],
};

export const FANBASE: FanSeed[] = Object.entries(PRACAS).flatMap(([market, list]) =>
  list.map(([club, share]) => ({ club_id: club, market_id: market, share, confidence: 'baixa' as Conf, notes: NOTA_PRACA[market] })));
