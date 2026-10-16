// Catálogo real — era atual (2026), LOTE 2, SUB-LOTE B: filmes, pacotes de filmes e formatos (Fase 6.2).
// Revisão do Felipe no Editor de Catálogo. Tudo nasce como não aprovado. Atributos de jogo (qualidade, apelo,
// fadiga) são ESTIMATIVAS para o jogo, nunca audiência oficial. Pessoas reais não aparecem; todo representante
// de empresa é fictício.
//
// Fontes: "Web" = conferido na internet em 18/10/2026 (link na nota); "Memória" = conhecimento geral da IA,
// não conferido na web (confiança média ou baixa). Em formatos, "episódios" = programas por temporada (estimativa).
// Em pacotes, "episódios" = número de filmes do pacote. Gere SQL e CSV com: node scripts/gen-catalog-seed.ts

import type { HolderSeed, RightSeed, TitleSeed } from './catalogo_2026_lote1.ts';

export const BATCH = '2026-lote2b';
const FROM = '2026-01-05';

type Conf = 'alta' | 'media' | 'baixa';

// ===== fontes conferidas na web (18/10/2026) =====
const W = {
  bakeOff: 'https://www.meioemensagem.com.br/midia/sbt-tera-quatro-marcas-na-12a-temporada-de-bake-off-brasil',
  bakeOffWbd: 'https://abcdoabc.com.br/bake-off-brasil-nova-temporada',
  powerCouple: 'https://en.wikipedia.org/wiki/Power_Couple_(Brazilian_TV_series)_season_7',
  traitorsUniversal: 'https://www.omelete.com.br/series-tv/the-traitors-versao-brasileira-universal',
  traitorsRecord: 'https://atarde.com.br/televisao/apos-fracasso-record-vai-fazer-versao-brasileira-de-reality-gringo-1403126',
  raidCage: 'https://oantagonista.com.br/ladooa/entretenimento/globo-compra-programa-que-motivou-cadeirada-do-datena/',
  fabrica: 'https://senalnews.com/es/etiquetas/sbt?pagina=5',
};

// ===== players novos =====
const perfil = (estilo: 'duro' | 'relacional' | 'leiloeiro', prioridades: string[]) => ({ estilo, prioridades, calibrar_na_fase: '6.3' });
const rep = (nome: string, cargo: string, estilo: string) => ({ nome, cargo, estilo, ficticio: true });
const h = (id: string, name: string, category: string, profile: Record<string, unknown>, representative: Record<string, unknown>, confidence: Conf, notes: string): HolderSeed =>
  ({ id, name, category, eras: ['now'], profile, representative_seed: representative, confidence, notes });

export const HOLDERS: HolderSeed[] = [
  h('love_productions', 'Love Productions (Sky)', 'formato', perfil('duro', ['protecao_de_marca', 'exposicao_tv_aberta']), rep('Charlotte Hayes', 'Diretora de formatos internacionais', 'gentil e rigorosa com a “bíblia” do formato'), 'media', 'Memória: criadora do The Great British Bake Off, hoje no grupo Sky.'),
  h('keshet', 'Keshet International', 'formato', perfil('relacional', ['preco', 'parceria_longa']), rep('Noa Ben-David', 'Vice-presidente de formatos', 'criativa, propõe adaptações locais'), 'baixa', 'Memória: distribuidora israelense de formatos. Aqui ficam formatos israelenses cujo dono atual precisa ser conferido (ver cada título).'),
  h('all3media', 'All3Media International', 'formato', perfil('relacional', ['preco', 'exposicao_tv_aberta']), rep('James Whitfield', 'Diretor de formatos para a América Latina', 'cordial, fala de sucessos premiados'), 'media', 'Memória: grupo britânico dono da IDTV (The Traitors), Studio Lambert (Undercover Boss, Gogglebox) e Optomen (Kitchen Nightmares).'),
  h('fox_entertainment', 'Fox Entertainment Global', 'formato', perfil('leiloeiro', ['preco']), rep('Tyler Grant', 'Executivo de vendas de formatos', 'direto, vende por temporada'), 'baixa', 'Memória: distribui o formato The Masked Singer fora da Coreia (o original é da MBC). Conferir.'),
  h('amazon_mgm', 'Amazon MGM Studios', 'estudio_eua', perfil('duro', ['multiplataforma', 'preco']), rep('Nicole Avery', 'Diretora de licenciamento', 'prioriza o Prime Video'), 'media', 'Memória: dona do acervo MGM, incluindo o formato The Apprentice.'),
  h('formata', 'Formata Produções', 'produtora_br', perfil('relacional', ['parceria_longa', 'exposicao_tv_aberta']), rep('Paula Siqueira', 'Diretora de conteúdo', 'parceira, pensa em temporadas longas'), 'baixa', `Web: produtora do reality Fábrica de Casamentos, que volta ao SBT (resumo de busca, ${W.fabrica}). Demais dados: memória.`),
  h('lionsgate', 'Lionsgate', 'estudio_eua', perfil('leiloeiro', ['preco', 'pacote']), rep('Ryan Mercer', 'Vice-presidente de vendas internacionais', 'negocia franquias inteiras'), 'alta', 'Memória: estúdio de Jogos Vorazes, John Wick e Crepúsculo (via Summit).'),
  h('globo_filmes', 'Globo Filmes', 'emissora', perfil('duro', ['exclusividade', 'janela_propria']), rep('Renato Valadares', 'Gerente de negócios', 'só negocia se a Globo abrir mão'), 'media', 'Memória: braço de cinema da Globo; coproduções da Globo Filmes costumam ter a primeira janela de TV aberta na própria Globo (direito 2633).'),
  h('paris_filmes', 'Paris Filmes', 'produtora_br', perfil('relacional', ['preco', 'pacote']), rep('Eduardo Prado', 'Diretor de vendas para TV', 'experiente, vende comédias nacionais em pacote'), 'media', 'Memória: distribuidora brasileira (comédias nacionais e filmes independentes estrangeiros).'),
  h('imagem_filmes', 'Imagem Filmes', 'produtora_br', perfil('leiloeiro', ['preco']), rep('Sérgio Tavares', 'Gerente comercial', 'aceita preço baixo por volume'), 'baixa', 'Memória: distribuidora brasileira de filmes independentes. Títulos do pacote a definir.'),
];

// ===== títulos =====
const ga = (genre: string, quality: number, appeal: number, fatigue: number, extra: Record<string, unknown> = {}) => ({ genre, quality, appeal, fatigue, estimativa: true, ...extra });
const t = (id: string, title_br: string, title_original: string | null, kind: string, country: string, holder: string, year: number | null, episodes: number | null, duration: number | null, br: unknown[] | null, attrs: Record<string, unknown>, confidence: Conf, notes: string, from = FROM): TitleSeed => ({
  id, title_br, title_original, kind, country, rights_holder_id: holder, production_year: year, episodes, duration_min: duration, br_history: br,
  available_from: from, available_to: null, game_attrs: attrs, confidence, notes,
});
// filme avulso: 3 exibições por padrão
const f = (id: string, title_br: string, title_original: string, country: string, holder: string, year: number, duration: number, quality: number, appeal: number, fatigue: number, rating: string, confidence: Conf, notes: string, br: unknown[] | null = null) =>
  t(id, title_br, title_original, 'filme', country, holder, year, 1, duration, br, ga('filme', quality, appeal, fatigue, { rating, exibicoes_por_titulo: 3 }), confidence, notes);
// pacote de filmes
const p = (id: string, title_br: string, title_original: string | null, country: string, holder: string, year: number | null, films: number, duration: number, quality: number, appeal: number, fatigue: number, rating: string, confidence: Conf, notes: string, br: unknown[] | null = null) =>
  t(id, title_br, title_original, 'pacote_filmes', country, holder, year, films, duration, br, ga('filme', quality, appeal, fatigue, { rating, exibicoes_por_titulo: 3 }), confidence, notes);
const FILME = 'Memória: ano, duração e estúdio; classificação indicativa aproximada. Exibições anteriores na TV aberta não conferidas.';
const PACOTE = 'Memória: filmes da franquia até 2025; classificação indicativa aproximada. Exibições anteriores na TV aberta não conferidas.';
const globo = (periodo: string) => [{ emissora: 'globo', periodo }];

export const TITLES: TitleSeed[] = [
  // --- formatos ---
  t('bake_off', 'Bake Off (formato)', 'The Great British Bake Off', 'formato', 'Reino Unido', 'love_productions', 2010, 20, 75, [{ emissora: 'sbt', periodo: 'Bake Off Brasil desde 2015; 12ª temporada a partir de 01/08/2026, sábados às 21h15' }], ga('reality', 74, 64, 30), 'media', `Web: 12ª temporada do Bake Off Brasil no SBT a partir de 01/08/2026, às 21h15, com 20 episódios (${W.bakeOff}); coprodução com a Warner Bros. Discovery, que exibe na TV paga e no HBO Max (${W.bakeOffWbd}). Dono do formato (Love Productions) e ano de estreia no SBT: memória.`),
  t('power_couple', 'Power Couple (formato)', 'Power Couple', 'formato', 'Israel', 'keshet', 2016, 60, 75, [{ emissora: 'record', periodo: 'Power Couple Brasil desde 2016; 7ª temporada de abr a jul/2025' }], ga('reality', 60, 70, 35), 'media', `Web: 7ª temporada na Record de 29/04 a 10/07/2025 (${W.powerCouple}). Origem israelense, dono atual do formato e ano de estreia no Brasil: memória, conferir.`),
  t('the_traitors', 'The Traitors (formato)', 'De Verraders', 'formato', 'Holanda', 'all3media', 2021, 12, 60, null, ga('reality', 82, 66, 0), 'media', `Web: versão brasileira anunciada para o Universal+ (NBCUniversal com a All3Media), sem data (${W.traitorsUniversal}); segundo colunista, a Record negocia uma versão para 2027 (${W.traitorsRecord}). Origem holandesa (IDTV): memória.`),
  t('undercover_boss', 'Undercover Boss (formato)', 'Undercover Boss', 'formato', 'Reino Unido', 'all3media', 2009, 12, 45, null, ga('reality', 66, 60, 10), 'baixa', 'Memória: formato da Studio Lambert (All3Media). Versão brasileira e emissora a conferir.'),
  t('gogglebox', 'Gogglebox (formato)', 'Gogglebox', 'formato', 'Reino Unido', 'all3media', 2013, 20, 45, null, ga('reality', 64, 56, 0), 'baixa', 'Memória: formato da Studio Lambert (All3Media). Versão brasileira a conferir.'),
  t('pesadelo_na_cozinha', 'Kitchen Nightmares (formato)', 'Ramsay’s Kitchen Nightmares', 'formato', 'Reino Unido', 'all3media', 2004, 12, 60, [{ emissora: 'band', periodo: 'Pesadelo na Cozinha, anos 2010' }], ga('reality', 66, 62, 25), 'media', 'Memória: “Pesadelo na Cozinha” na Band; formato da Optomen (All3Media). Anos a conferir.'),
  t('quem_quer_ser_um_milionario', 'Quem Quer Ser um Milionário? (formato)', 'Who Wants to Be a Millionaire?', 'formato', 'Reino Unido', 'sony', 1998, 40, 45, [{ emissora: 'globo', periodo: 'quadro de programa de auditório (anos a conferir)' }], ga('game_show', 66, 68, 30), 'media', 'Memória: formato hoje da Sony Pictures Television; adaptado em quadro de auditório na Globo. Anos e licença atual a conferir.'),
  t('roda_da_fortuna', 'Wheel of Fortune (formato)', 'Wheel of Fortune', 'formato', 'EUA', 'sony', 1975, 100, 30, [{ emissora: 'sbt', periodo: 'Roda a Roda (adaptação; licença a conferir)' }], ga('game_show', 56, 62, 40), 'baixa', 'Memória: distribuído internacionalmente pela Sony. Se o “Roda a Roda” do SBT é versão licenciada precisa ser conferido.'),
  t('jeopardy', 'Jeopardy! (formato)', 'Jeopardy!', 'formato', 'EUA', 'sony', 1964, 100, 30, null, ga('game_show', 64, 52, 0), 'baixa', 'Memória: distribuído internacionalmente pela Sony. Versão brasileira não conhecida.'),
  t('family_feud', 'Family Feud (formato)', 'Family Feud', 'formato', 'EUA', 'fremantle', 1976, 80, 30, null, ga('game_show', 58, 64, 20), 'baixa', 'Memória: formato da Fremantle. Versões brasileiras a conferir.'),
  t('x_factor', 'The X Factor (formato)', 'The X Factor', 'formato', 'Reino Unido', 'fremantle', 2004, 15, 120, [{ emissora: 'band', periodo: 'X Factor Brasil, 2016' }], ga('talent_show', 70, 64, 20), 'media', 'Memória: “X Factor Brasil” na Band em 2016; formato da Fremantle (com a Syco). Conferir.'),
  t('fear_factor', 'Fear Factor (formato)', 'Fear Factor', 'formato', 'Holanda', 'banijay', 1998, 15, 60, [{ emissora: 'globo', periodo: 'Hipertensão, anos 2000' }], ga('reality', 62, 64, 25, { rating: '12' }), 'media', 'Memória: no Brasil virou “Hipertensão” (Globo); formato da Endemol, hoje Banijay.'),
  t('wipeout', 'Wipeout (formato)', 'Wipeout', 'formato', 'EUA', 'banijay', 2008, 12, 45, null, ga('game_show', 56, 66, 10), 'baixa', 'Memória: formato da Endemol, hoje Banijay. Versão brasileira a conferir.'),
  t('temptation_island', 'Ilha da Tentação (formato)', 'Temptation Island', 'formato', 'EUA', 'banijay', 2001, 12, 60, null, ga('reality', 56, 66, 0, { rating: '16' }), 'baixa', 'Memória: formato hoje da Banijay. Versões brasileiras (streaming) a conferir; classificação alta limita o horário.'),
  t('show_dos_famosos', 'Your Face Sounds Familiar (formato)', 'Tu cara me suena', 'formato', 'Espanha', 'banijay', 2011, 15, 90, [{ emissora: 'globo', periodo: 'possível base do Show dos Famosos (a conferir)' }], ga('talent_show', 64, 66, 20), 'baixa', 'Memória: formato da Endemol, hoje Banijay. Se o “Show dos Famosos” da Globo é licenciado deste formato precisa ser conferido.'),
  t('lego_masters', 'Lego Masters (formato)', 'Lego Masters', 'formato', 'Reino Unido', 'banijay', 2017, 10, 60, null, ga('reality', 66, 60, 0, { rating: 'L' }), 'baixa', 'Memória: formato da Tuesday’s Child (Banijay). Versão brasileira a conferir.'),
  t('love_island', 'Love Island (formato)', 'Love Island', 'formato', 'Reino Unido', 'itv_studios', 2015, 50, 60, null, ga('reality', 62, 70, 0, { rating: '14' }), 'media', 'Memória: formato da ITV Studios. Versão brasileira em TV aberta não conhecida.'),
  t('the_chase', 'The Chase (formato)', 'The Chase', 'formato', 'Reino Unido', 'itv_studios', 2009, 60, 45, null, ga('game_show', 66, 60, 0), 'media', 'Memória: formato da ITV Studios. Versão brasileira a conferir.'),
  t('the_floor', 'The Floor (formato)', 'The Floor', 'formato', 'Holanda', 'itv_studios', 2020, 12, 60, null, ga('game_show', 64, 62, 0), 'baixa', 'Memória: formato da Talpa (ITV Studios). Versão brasileira a conferir.'),
  t('the_masked_singer', 'The Masked Singer (formato)', 'King of Mask Singer', 'formato', 'Coreia do Sul', 'fox_entertainment', 2015, 12, 75, [{ emissora: 'globo', periodo: 'The Masked Singer Brasil, a partir de 2021 (anos a conferir)' }], ga('talent_show', 66, 70, 25), 'baixa', 'Memória: versão brasileira na Globo a partir de 2021; original da MBC, distribuição internacional pela Fox. Conferir anos e dono atual.'),
  t('o_elo_mais_fraco', 'O Elo Mais Fraco (formato)', 'The Weakest Link', 'formato', 'Reino Unido', 'bbc_studios', 2000, 60, 45, null, ga('game_show', 60, 56, 15), 'baixa', 'Memória: formato da BBC. Versões brasileiras a conferir.'),
  t('top_chef', 'Top Chef (formato)', 'Top Chef', 'formato', 'EUA', 'nbcu', 2006, 15, 75, [{ emissora: 'record', periodo: 'Top Chef Brasil, a partir de 2019 (anos a conferir)' }], ga('reality', 72, 62, 20), 'media', 'Memória: “Top Chef Brasil” na Record; formato da Magical Elves/NBCUniversal. Anos a conferir.'),
  t('supernanny', 'Supernanny (formato)', 'Supernanny', 'formato', 'Reino Unido', 'wbd', 2004, 15, 45, [{ emissora: 'sbt', periodo: 'Supernanny, anos 2000' }], ga('reality', 60, 64, 25), 'media', 'Memória: versão brasileira no SBT; formato da Ricochet, hoje no grupo Warner Bros. Discovery. Conferir.'),
  t('raid_the_cage', 'Raid the Cage (formato)', 'Raid the Cage', 'formato', 'Israel', 'keshet', 2013, 20, 30, [{ emissora: 'band', periodo: 'quadro do Agora é com Datena, 2018' }], ga('game_show', 56, 62, 10), 'baixa', `Web: a Globo comprou os direitos para o Domingão; antes foi quadro do “Agora é com Datena” na Band, em 2018 (${W.raidCage}; a data da compra não está clara na fonte). Dono atual do formato: memória, conferir.`),
  t('fabrica_de_casamentos', 'Fábrica de Casamentos (formato)', 'Fábrica de Casamentos', 'formato', 'Brasil', 'formata', 2014, 20, 75, [{ emissora: 'sbt', periodo: 'desde 2014; volta prevista depois de quatro anos fora' }], ga('reality', 58, 64, 20), 'baixa', `Web: o reality da Formata volta ao SBT depois de quatro anos, com estratégia junto ao Disney+ (resumo de busca, ${W.fabrica}). Ano de estreia: memória.`),
  t('o_aprendiz', 'The Apprentice (formato)', 'The Apprentice', 'formato', 'EUA', 'amazon_mgm', 2004, 15, 60, [{ emissora: 'record', periodo: 'O Aprendiz, anos 2000/2010' }], ga('reality', 62, 60, 25), 'media', 'Memória: “O Aprendiz” na Record; formato da MGM (hoje Amazon). Anos a conferir.'),
  t('celebrity_splash', 'Celebrity Splash (formato)', 'Celebrity Splash', 'formato', 'Holanda', 'wbd', 2012, 10, 60, [{ emissora: 'globo', periodo: 'Saltibum, anos 2010 (a conferir)' }], ga('reality', 56, 60, 15), 'baixa', 'Memória: formato da Eyeworks, hoje no grupo Warner Bros. Discovery. Se o “Saltibum” da Globo é licenciado precisa ser conferido.'),
  t('the_bachelor', 'The Bachelor (formato)', 'The Bachelor', 'formato', 'EUA', 'wbd', 2002, 12, 75, null, ga('reality', 58, 62, 0), 'baixa', 'Memória: formato distribuído pela Warner Bros. Discovery. Versão brasileira a conferir.'),

  // --- filmes: Warner Bros. Discovery ---
  f('barbie_filme', 'Barbie', 'Barbie', 'EUA', 'wbd', 2023, 114, 78, 84, 0, '12', 'media', FILME),
  f('duna', 'Duna', 'Dune', 'EUA', 'wbd', 2021, 155, 86, 70, 0, '14', 'media', FILME),
  f('duna_parte_dois', 'Duna: Parte Dois', 'Dune: Part Two', 'EUA', 'wbd', 2024, 166, 88, 74, 0, '14', 'media', FILME),
  f('coringa', 'Coringa', 'Joker', 'EUA', 'wbd', 2019, 122, 86, 76, 10, '16', 'media', FILME),
  f('the_batman', 'Batman', 'The Batman', 'EUA', 'wbd', 2022, 176, 82, 76, 5, '14', 'media', FILME),
  f('matrix', 'Matrix', 'The Matrix', 'EUA', 'wbd', 1999, 136, 88, 76, 50, '14', 'media', FILME),
  p('senhor_dos_aneis', 'Trilogia O Senhor dos Anéis', 'The Lord of the Rings', 'EUA/Nova Zelândia', 'wbd', 2001, 3, 190, 92, 80, 45, '12', 'media', `${PACOTE} New Line, hoje Warner.`),
  f('aquaman', 'Aquaman', 'Aquaman', 'EUA', 'wbd', 2018, 143, 68, 74, 20, '12', 'media', FILME),
  f('mad_max_estrada_da_furia', 'Mad Max: Estrada da Fúria', 'Mad Max: Fury Road', 'EUA/Austrália', 'wbd', 2015, 120, 90, 70, 10, '16', 'media', FILME),
  f('wonka', 'Wonka', 'Wonka', 'EUA/Reino Unido', 'wbd', 2023, 116, 74, 76, 0, 'L', 'media', FILME),
  f('it_a_coisa', 'It: A Coisa', 'It', 'EUA', 'wbd', 2017, 135, 76, 74, 10, '16', 'media', FILME),
  f('gravidade', 'Gravidade', 'Gravity', 'EUA/Reino Unido', 'wbd', 2013, 91, 86, 68, 20, '12', 'media', FILME),
  f('mulher_maravilha', 'Mulher-Maravilha', 'Wonder Woman', 'EUA', 'wbd', 2017, 141, 76, 76, 15, '12', 'media', FILME),
  p('pacote_terror_warner', 'Pacote de terror Warner (Invocação do Mal e outros)', null, 'EUA', 'wbd', null, 8, 110, 72, 72, 20, '16', 'baixa', 'Pacote genérico de catálogo (ex.: universo Invocação do Mal). Títulos exatos a definir.'),

  // --- filmes: Disney ---
  f('vingadores_ultimato', 'Vingadores: Ultimato', 'Avengers: Endgame', 'EUA', 'disney', 2019, 181, 82, 90, 15, '12', 'media', `${FILME} A Disney prioriza o Disney+ (janela de TV aberta restrita).`),
  f('pantera_negra', 'Pantera Negra', 'Black Panther', 'EUA', 'disney', 2018, 134, 80, 80, 15, '12', 'media', FILME),
  f('frozen_2', 'Frozen II', 'Frozen II', 'EUA', 'disney', 2019, 103, 76, 84, 15, 'L', 'media', FILME),
  f('o_rei_leao_2019', 'O Rei Leão (2019)', 'The Lion King', 'EUA', 'disney', 2019, 118, 72, 84, 15, 'L', 'media', FILME),
  f('divertida_mente_2', 'Divertida Mente 2', 'Inside Out 2', 'EUA', 'disney', 2024, 96, 84, 86, 0, 'L', 'media', FILME),
  f('moana_2', 'Moana 2', 'Moana 2', 'EUA', 'disney', 2024, 100, 70, 82, 0, 'L', 'media', FILME),
  f('avatar_o_caminho_da_agua', 'Avatar: O Caminho da Água', 'Avatar: The Way of Water', 'EUA', 'disney', 2022, 192, 82, 84, 5, '12', 'media', `${FILME} Produção da 20th Century (hoje Disney).`),
  f('titanic', 'Titanic', 'Titanic', 'EUA', 'disney', 1997, 195, 86, 84, 70, '12', 'media', `${FILME} Distribuição internacional da 20th Century (hoje Disney); muito reprisado na TV aberta.`, globo('várias exibições (anos a conferir)')),
  f('esqueceram_de_mim', 'Esqueceram de Mim', 'Home Alone', 'EUA', 'disney', 1990, 103, 74, 88, 92, 'L', 'media', `${FILME} Clássico de fim de ano na TV aberta (fadiga altíssima). 20th Century, hoje Disney.`, globo('reprises de fim de ano (anos a conferir)')),
  p('piratas_do_caribe', 'Piratas do Caribe (5 filmes)', 'Pirates of the Caribbean', 'EUA', 'disney', 2003, 5, 145, 76, 80, 40, '12', 'media', PACOTE),
  f('deadpool_e_wolverine', 'Deadpool & Wolverine', 'Deadpool & Wolverine', 'EUA', 'disney', 2024, 128, 74, 80, 0, '18', 'media', `${FILME} Classificação 18 anos: só depois das 23h.`),
  p('star_wars', 'Star Wars (saga, 9 filmes)', 'Star Wars', 'EUA', 'disney', 1977, 9, 140, 84, 82, 40, '10', 'media', PACOTE),
  f('aladdin_2019', 'Aladdin (2019)', 'Aladdin', 'EUA', 'disney', 2019, 128, 68, 80, 15, 'L', 'media', FILME),

  // --- filmes: NBCUniversal ---
  p('velozes_e_furiosos', 'Velozes e Furiosos (10 filmes)', 'Fast & Furious', 'EUA', 'nbcu', 2001, 10, 130, 66, 86, 55, '14', 'media', PACOTE),
  p('jurassic_park_world', 'Jurassic Park e Jurassic World (6 filmes)', 'Jurassic Park / Jurassic World', 'EUA', 'nbcu', 1993, 6, 125, 78, 84, 45, '12', 'media', PACOTE),
  p('meu_malvado_favorito', 'Meu Malvado Favorito e Minions (6 filmes)', 'Despicable Me / Minions', 'EUA', 'nbcu', 2010, 6, 92, 72, 86, 40, 'L', 'media', `${PACOTE} Illumination, distribuição Universal.`),
  f('oppenheimer', 'Oppenheimer', 'Oppenheimer', 'EUA/Reino Unido', 'nbcu', 2023, 180, 92, 66, 0, '16', 'media', FILME),
  f('wicked', 'Wicked', 'Wicked', 'EUA', 'nbcu', 2024, 160, 78, 74, 0, '10', 'media', FILME),
  f('super_mario_bros_filme', 'Super Mario Bros.: O Filme', 'The Super Mario Bros. Movie', 'EUA/Japão', 'nbcu', 2023, 92, 66, 86, 5, 'L', 'media', FILME),
  p('shrek', 'Shrek (4 filmes)', 'Shrek', 'EUA', 'nbcu', 2001, 4, 90, 80, 86, 60, 'L', 'media', `${PACOTE} DreamWorks Animation, hoje Universal.`),
  p('kung_fu_panda', 'Kung Fu Panda (4 filmes)', 'Kung Fu Panda', 'EUA', 'nbcu', 2008, 4, 92, 74, 80, 40, 'L', 'media', `${PACOTE} DreamWorks Animation, hoje Universal.`),
  p('de_volta_para_o_futuro', 'Trilogia De Volta para o Futuro', 'Back to the Future', 'EUA', 'nbcu', 1985, 3, 116, 86, 80, 60, 'L', 'media', PACOTE),
  f('et_o_extraterrestre', 'E.T.: O Extraterrestre', 'E.T. the Extra-Terrestrial', 'EUA', 'nbcu', 1982, 115, 86, 74, 70, 'L', 'media', FILME),
  f('tubarao', 'Tubarão', 'Jaws', 'EUA', 'nbcu', 1975, 124, 88, 66, 50, '14', 'media', FILME),

  // --- filmes: Sony ---
  f('homem_aranha_sem_volta_para_casa', 'Homem-Aranha: Sem Volta para Casa', 'Spider-Man: No Way Home', 'EUA', 'sony', 2021, 148, 80, 90, 10, '12', 'media', FILME),
  f('aranhaverso', 'Homem-Aranha no Aranhaverso', 'Spider-Man: Into the Spider-Verse', 'EUA', 'sony', 2018, 117, 92, 76, 10, '10', 'media', FILME),
  f('jumanji_bem_vindo_a_selva', 'Jumanji: Bem-Vindo à Selva', 'Jumanji: Welcome to the Jungle', 'EUA', 'sony', 2017, 119, 70, 84, 30, '12', 'media', FILME),
  p('bad_boys', 'Bad Boys (4 filmes)', 'Bad Boys', 'EUA', 'sony', 1995, 4, 120, 64, 78, 40, '16', 'media', PACOTE),
  p('mib_homens_de_preto', 'MIB: Homens de Preto (4 filmes)', 'Men in Black', 'EUA', 'sony', 1997, 4, 100, 70, 80, 55, '12', 'media', PACOTE),
  f('venom', 'Venom', 'Venom', 'EUA', 'sony', 2018, 112, 62, 80, 20, '14', 'media', FILME),
  f('os_caca_fantasmas', 'Os Caça-Fantasmas', 'Ghostbusters', 'EUA', 'sony', 1984, 105, 80, 74, 55, '10', 'media', FILME),
  f('gente_grande', 'Gente Grande', 'Grown Ups', 'EUA', 'sony', 2010, 102, 52, 82, 75, '12', 'media', `${FILME} Muito reprisado nas sessões da tarde (fadiga alta).`),
  f('click', 'Click', 'Click', 'EUA', 'sony', 2006, 107, 60, 80, 70, '12', 'media', `${FILME} Muito reprisado nas sessões da tarde (fadiga alta).`),
  f('uncharted', 'Uncharted: Fora do Mapa', 'Uncharted', 'EUA', 'sony', 2022, 116, 62, 76, 0, '12', 'media', FILME),

  // --- filmes: Paramount ---
  f('top_gun_maverick', 'Top Gun: Maverick', 'Top Gun: Maverick', 'EUA', 'paramount', 2022, 131, 88, 86, 5, '12', 'media', FILME),
  p('missao_impossivel', 'Missão: Impossível (8 filmes)', 'Mission: Impossible', 'EUA', 'paramount', 1996, 8, 140, 80, 84, 40, '14', 'media', PACOTE),
  p('transformers', 'Transformers (7 filmes)', 'Transformers', 'EUA', 'paramount', 2007, 7, 140, 60, 80, 45, '12', 'media', PACOTE),
  p('sonic_o_filme', 'Sonic: O Filme (3 filmes)', 'Sonic the Hedgehog', 'EUA/Japão', 'paramount', 2020, 3, 105, 68, 84, 10, 'L', 'media', PACOTE),
  f('forrest_gump', 'Forrest Gump: O Contador de Histórias', 'Forrest Gump', 'EUA', 'paramount', 1994, 142, 88, 80, 60, '12', 'media', FILME),
  p('o_poderoso_chefao', 'Trilogia O Poderoso Chefão', 'The Godfather', 'EUA', 'paramount', 1972, 3, 175, 96, 66, 40, '16', 'media', PACOTE),
  f('um_lugar_silencioso', 'Um Lugar Silencioso', 'A Quiet Place', 'EUA', 'paramount', 2018, 90, 80, 72, 10, '14', 'media', FILME),
  f('gladiador_2', 'Gladiador II', 'Gladiator II', 'EUA/Reino Unido', 'paramount', 2024, 148, 72, 78, 0, '16', 'media', FILME),
  f('ghost', 'Ghost: Do Outro Lado da Vida', 'Ghost', 'EUA', 'paramount', 1990, 127, 76, 76, 65, '12', 'media', FILME),

  // --- filmes: Lionsgate ---
  p('jogos_vorazes', 'Jogos Vorazes (5 filmes)', 'The Hunger Games', 'EUA', 'lionsgate', 2012, 5, 135, 76, 80, 30, '12', 'media', PACOTE),
  p('john_wick', 'John Wick (4 filmes)', 'John Wick', 'EUA', 'lionsgate', 2014, 4, 125, 78, 80, 20, '16', 'media', PACOTE),
  p('crepusculo', 'Saga Crepúsculo (5 filmes)', 'The Twilight Saga', 'EUA', 'lionsgate', 2008, 5, 120, 58, 76, 45, '12', 'media', `${PACOTE} Summit, hoje Lionsgate.`),
  f('la_la_land', 'La La Land: Cantando Estações', 'La La Land', 'EUA', 'lionsgate', 2016, 128, 88, 64, 15, '12', 'media', FILME),
  f('truque_de_mestre', 'Truque de Mestre', 'Now You See Me', 'EUA', 'lionsgate', 2013, 115, 66, 78, 30, '12', 'media', FILME),

  // --- filmes nacionais (coproduções da Globo Filmes: primeira janela na Globo, direito 2633) ---
  p('minha_mae_e_uma_peca', 'Minha Mãe é uma Peça (3 filmes)', 'Minha Mãe é uma Peça', 'Brasil', 'globo_filmes', 2013, 3, 90, 66, 90, 45, '12', 'media', `${PACOTE} Coprodução da Globo Filmes com distribuição da Downtown/Paris (memória).`, globo('exibições na TV aberta (anos a conferir)')),
  f('o_auto_da_compadecida', 'O Auto da Compadecida', 'O Auto da Compadecida', 'Brasil', 'globo_filmes', 2000, 104, 86, 88, 75, '12', 'media', `${FILME} Nasceu como minissérie da Globo; muito reprisado.`, globo('várias exibições')),
  f('o_auto_da_compadecida_2', 'O Auto da Compadecida 2', 'O Auto da Compadecida 2', 'Brasil', 'globo_filmes', 2024, 104, 74, 82, 0, '12', 'baixa', `${FILME} Participação da Globo Filmes a conferir.`),
  f('cidade_de_deus', 'Cidade de Deus', 'Cidade de Deus', 'Brasil', 'globo_filmes', 2002, 130, 94, 72, 30, '18', 'baixa', `${FILME} Participação da Globo Filmes na coprodução a conferir. Classificação alta: só depois das 23h.`),
  f('se_eu_fosse_voce', 'Se Eu Fosse Você', 'Se Eu Fosse Você', 'Brasil', 'globo_filmes', 2006, 108, 62, 80, 55, '12', 'media', FILME),
  f('tropa_de_elite', 'Tropa de Elite', 'Tropa de Elite', 'Brasil', 'globo_filmes', 2007, 115, 86, 84, 40, '16', 'baixa', `${FILME} Detentor dos direitos de TV (Globo Filmes ou outro) a conferir.`),
  f('ainda_estou_aqui', 'Ainda Estou Aqui', 'Ainda Estou Aqui', 'Brasil', 'globo_filmes', 2024, 137, 92, 76, 0, '14', 'baixa', `${FILME} Vencedor do Oscar de filme internacional (memória); participação do grupo Globo e detentor dos direitos de TV a conferir.`),
  f('os_farofeiros', 'Os Farofeiros', 'Os Farofeiros', 'Brasil', 'globo_filmes', 2018, 104, 52, 76, 30, '12', 'baixa', `${FILME} Participação da Globo Filmes a conferir.`),
  f('nosso_lar', 'Nosso Lar', 'Nosso Lar', 'Brasil', 'globo_filmes', 2010, 102, 62, 74, 30, '10', 'baixa', `${FILME} Detentor dos direitos de TV a conferir.`),
  f('lisbela_e_o_prisioneiro', 'Lisbela e o Prisioneiro', 'Lisbela e o Prisioneiro', 'Brasil', 'globo_filmes', 2003, 106, 76, 72, 40, '12', 'media', FILME),

  // --- pacotes de distribuidoras brasileiras ---
  p('pacote_comedias_nacionais_paris', 'Pacote de comédias nacionais (Paris Filmes)', null, 'Brasil', 'paris_filmes', null, 8, 100, 56, 72, 30, '12', 'baixa', 'Pacote genérico de catálogo; os filmes do pacote serão listados depois. Nenhum filme coproduzido pela Globo Filmes entra aqui.'),
  p('pacote_acao_imagem', 'Pacote de ação independente (Imagem Filmes)', null, 'EUA', 'imagem_filmes', null, 10, 105, 52, 66, 20, '14', 'baixa', 'Pacote genérico de filmes independentes estrangeiros; títulos a definir.'),
];

// ===== direitos e exclusividades =====
export const RIGHTS: RightSeed[] = [
  { id: 2630, product_ref: 'bake_off', holder_station_key: 'sbt', terms: { exclusividade: 'formato_brasil', coproducao: 'Warner Bros. Discovery (TV paga e streaming)' }, valid_from: '2015-01-01', valid_to: null, confidence: 'media', notes: `Web: 12ª temporada no SBT em 2026, coproduzida com a Warner Bros. Discovery (${W.bakeOff}; ${W.bakeOffWbd}). Início do contrato (2015): memória.` },
  { id: 2631, product_ref: 'power_couple', holder_station_key: 'record', terms: { exclusividade: 'formato_brasil' }, valid_from: '2016-01-01', valid_to: null, confidence: 'media', notes: `Web: 7ª temporada na Record em 2025 (${W.powerCouple}). Início em 2016 e renovação para 2026: memória, conferir.` },
  { id: 2632, product_ref: 'raid_the_cage', holder_station_key: 'globo', terms: { exclusividade: 'formato_brasil' }, valid_from: '2026-01-01', valid_to: null, confidence: 'baixa', notes: `Web: a Globo comprou os direitos do formato para o Domingão (${W.raidCage}). Data da compra e início em 2026: estimativa.` },
  { id: 2633, product_ref: 'globo_filmes', holder_station_key: 'globo', terms: { escopo: 'coproduções da Globo Filmes', exclusividade: 'tv_aberta', tipo_janela: 'primeira janela de TV aberta' }, valid_from: null, valid_to: null, confidence: 'media', notes: 'Memória: coproduções da Globo Filmes estreiam na TV aberta pela Globo. Na prática, os filmes nacionais deste lote aparecem travados para as outras emissoras.' },
  { id: 2634, product_ref: 'fabrica_de_casamentos', holder_station_key: 'sbt', terms: { exclusividade: 'formato_brasil', parceria: 'Disney+ (multiplataforma)' }, valid_from: null, valid_to: null, confidence: 'baixa', notes: `Web: o reality da Formata volta ao SBT com estratégia junto ao Disney+ (resumo de busca, ${W.fabrica}). Datas e termos: estimativa.` },
];
