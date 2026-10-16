// Catálogo real — era atual (2026), LOTE 2, SUB-LOTE A: novelas, séries, desenhos e documentários (Fase 6.2).
// Revisão do Felipe no Editor de Catálogo. Tudo nasce como não aprovado. Atributos de jogo (qualidade, apelo,
// fadiga) são ESTIMATIVAS para o jogo, nunca audiência oficial. Pessoas reais não aparecem; todo representante
// de empresa é fictício.
//
// Fontes: "Web" = conferido na internet em 18/10/2026 (link na nota); "Memória" = conhecimento geral da IA,
// não conferido na web (confiança média ou baixa). O "br_history" registra emissoras abertas brasileiras
// que exibiram o título; quando a emissora não foi confirmada, o campo fica vazio e a dúvida vai na nota.
// Gere SQL e CSV com: node scripts/gen-catalog-seed.ts

import type { HolderSeed, RightSeed, TitleSeed } from './catalogo_2026_lote1.ts';

export const BATCH = '2026-lote2a';
const FROM = '2026-01-05';

type Conf = 'alta' | 'media' | 'baixa';

// ===== fontes conferidas na web (18/10/2026) =====
const W = {
  turcas2026: 'https://gameoverdrive.com.br/novelas-turcas-record-band-2026/',
  coracaoMae: 'https://gameoverdrive.com.br/coracao-de-mae-ultimo-capitulo-iludida-record/',
  chamasTnh1: 'https://www.tnh1.com.br/noticia/nid/chamas-do-destino-festa-beneficente-vira-tragedia-e-entrelaca-amor-e-violencia/',
  turcasTvAberta: 'https://www.oliberal.com/cultura/novela-turca/conheca-as-novelas-turcas-que-passaram-na-tv-aberta-brasileira-1.1006470',
  turcasBand: 'https://www.meioemensagem.com.br/midia/a-onda-de-sucesso-das-novelas-turcas-entre-o-publico-brasileiro',
  silaBand: 'https://grandesnomesdapropaganda.com.br/?p=34651',
  globoplayTurcas: 'https://diariodopara.com.br/entretenimento/tdb/globo-avalia-exibir-novelas-turcas-na-tv-aberta-entenda/',
  joana: 'https://senalnews.com/es/tv/sbt-estrenara-la-telenovela-mexicana-la-historia-de-juana',
  joanaEstreia: 'https://www.tupi.fm/?p=2380446',
  domenica: 'https://www.tupi.fm/?p=2317336',
  chespiritoSbt: 'https://www.folhavitoria.com.br/cultura/contrato-com-disney-chega-ao-fim-e-sbt-volta-a-contar-com-chaves/',
  chapolinSbt: 'https://www.tupi.fm/?p=2330216',
  sabadoAnimado: 'https://sbtnews.sbt.com.br/noticia/institucional/clima-de-carnaval-toma-conta-do-sabado-animado',
  mashaCultura: 'https://senalnews.com/es/tv/tv-cultura-estrenara-nuevas-producciones-infantiles-',
  belezaFatalBand: 'https://www.band.com.br/entretenimento/novela/noticias/paula-fernandes-lanca-musica-inedita-para-cafe-com-aroma-de-mulher-nova-novela-da-band-ouca-202504281825',
  chrisRecord: 'https://www.omelete.com.br/series-tv/todo-mundo-odeia-o-chris-final-explicado',
  chrisNetflix: 'https://www.tecmundo.com.br/minha-serie/603725-todo-mundo-odeia-o-chris-chega-na-netflix-e-assume-topo-das-series-mais-assistidas-em-um-dia.htm',
};

// ===== players novos (os do lote 1 continuam valendo) =====
const perfil = (estilo: 'duro' | 'relacional' | 'leiloeiro', prioridades: string[]) => ({ estilo, prioridades, calibrar_na_fase: '6.3' });
const rep = (nome: string, cargo: string, estilo: string) => ({ nome, cargo, estilo, ficticio: true });
const h = (id: string, name: string, category: string, profile: Record<string, unknown>, representative: Record<string, unknown>, confidence: Conf, notes: string): HolderSeed =>
  ({ id, name, category, eras: ['now'], profile, representative_seed: representative, confidence, notes });

export const HOLDERS: HolderSeed[] = [
  h('venevision', 'Venevision International (Cisneros Media)', 'novela_latina', perfil('relacional', ['preco', 'exposicao_tv_aberta']), rep('Gabriela Toro', 'Gerente de vendas para o Brasil', 'nostálgica, vende clássicos em pacote'), 'media', 'Memória: braço de distribuição da Venevisión (Venezuela), com acervo de novelas dos anos 80 e 90.'),
  h('rctv', 'RCTV Internacional (acervo)', 'novela_latina', perfil('leiloeiro', ['preco']), rep('Luis Ferrer', 'Representante do acervo', 'pragmático, aceita preço baixo por títulos antigos'), 'baixa', 'Memória: acervo da RCTV (Venezuela), emissora que saiu do ar aberto em 2007. Quem licencia esse acervo em 2026 precisa ser conferido.'),
  h('telefe', 'Telefe', 'novela_latina', perfil('relacional', ['preco', 'coproducao']), rep('Sofía Bianchi', 'Diretora de vendas internacionais', 'simpática, gosta de propor coproduções'), 'media', 'Memória: emissora e produtora argentina. Mudou de controle em 2024–2025; conferir o nome do distribuidor em 2026.'),
  h('atv', 'ATV (distribuição internacional)', 'novela_turca', perfil('leiloeiro', ['preco', 'exposicao_tv_aberta']), rep('Burak Aydın', 'Gerente de vendas para as Américas', 'rápido, oferece pacotes de várias temporadas'), 'media', 'Memória: canal turco com distribuição própria de parte do acervo (Hercai, Kara Para Aşk, Kanatsız Kuşlar). Quais títulos são dela e quais passam por distribuidoras está indicado em cada título.'),
  h('kbs', 'KBS Media', 'asiatico', perfil('duro', ['preco', 'dublagem']), rep('Ji-ho Lee', 'Gerente de vendas internacionais', 'formal, preocupado com dublagem e janelas'), 'media', 'Memória: braço comercial da emissora pública sul-coreana KBS.'),
  h('toei', 'Toei Animation', 'asiatico', perfil('duro', ['preco', 'protecao_de_marca']), rep('Kenji Morita', 'Diretor de licenciamento para a América Latina', 'cerimonioso, exige respeito à obra original'), 'alta', 'Memória: estúdio japonês de Dragon Ball, One Piece e Cavaleiros do Zodíaco.'),
  h('pokemon_company', 'The Pokémon Company International', 'asiatico', perfil('duro', ['protecao_de_marca', 'licenciamento_de_produtos']), rep('Emily Carter', 'Gerente de mídia para a América Latina', 'cuidadosa com marca e horários infantis'), 'alta', 'Memória: dona da marca Pokémon e da série animada.'),
  h('alpha_group', 'Alpha Group', 'infantil', perfil('leiloeiro', ['preco', 'licenciamento_de_produtos']), rep('Wei Zhang', 'Executivo de vendas internacionais', 'vende desenho junto com brinquedo'), 'media', 'Memória: grupo chinês de animação e brinquedos (Super Wings).'),
  h('msp', 'Mauricio de Sousa Produções', 'produtora_br', perfil('relacional', ['protecao_de_marca', 'exposicao_tv_aberta']), rep('Carla Menezes', 'Diretora de licenciamento audiovisual', 'afetuosa e protetora dos personagens'), 'alta', 'Memória: dona da Turma da Mônica.'),
  h('tv_pinguim', 'TV PinGuim', 'produtora_br', perfil('relacional', ['exposicao_tv_aberta', 'preco']), rep('Rafael Lins', 'Diretor comercial', 'entusiasmado, fala em conteúdo educativo'), 'media', 'Memória: produtora brasileira de animação (O Show da Luna, Peixonauta).'),
  h('bromelia', 'Bromelia Produções', 'produtora_br', perfil('relacional', ['multiplataforma', 'preco']), rep('Marina Couto', 'Gerente de negócios', 'fala em números de visualização na internet'), 'media', 'Memória: produtora da Galinha Pintadinha.'),
  h('patati_patata', 'Patati Patatá', 'produtora_br', perfil('relacional', ['exposicao_tv_aberta']), rep('Fábio Rocha', 'Gerente de mídia', 'simples e direto, quer horário fixo'), 'media', 'Web: “Parque Patati Patatá” no Sábado Animado do SBT em 2026 (' + W.sabadoAnimado + '). Empresa detentora: memória, conferir.'),
  h('animaccord', 'Animaccord', 'infantil', perfil('leiloeiro', ['preco', 'multiplataforma']), rep('Olga Petrova', 'Diretora de vendas internacionais', 'objetiva, compara com o YouTube'), 'media', 'Memória: estúdio de Masha e o Urso.'),
  h('hasbro', 'Hasbro (eOne)', 'infantil', perfil('duro', ['licenciamento_de_produtos', 'preco']), rep('Megan Doyle', 'Executiva de vendas de animação', 'firme, liga exibição a produtos'), 'media', 'Memória: dona da Peppa Pig desde a compra da eOne. Conferir se o catálogo infantil mudou de dono em 2026.'),
  h('zag', 'ZAG', 'infantil', perfil('relacional', ['licenciamento_de_produtos', 'exposicao_tv_aberta']), rep('Camille Durand', 'Gerente de vendas', 'animada, fala em fãs'), 'media', 'Memória: estúdio de Miraculous: As Aventuras de Ladybug.'),
  h('mattel', 'Mattel Television', 'infantil', perfil('duro', ['licenciamento_de_produtos']), rep('Ashley Brooks', 'Diretora de distribuição', 'pensa em vitrine para brinquedos'), 'media', 'Web: Barbie Dreamhouse e Polly Pocket no Sábado Animado do SBT em 2026 (' + W.sabadoAnimado + '). Empresa distribuidora: memória.'),
];

// ===== títulos =====
const ga = (genre: string, quality: number, appeal: number, fatigue: number, extra: Record<string, unknown> = {}) => ({ genre, quality, appeal, fatigue, estimativa: true, ...extra });
const t = (id: string, title_br: string, title_original: string | null, kind: string, country: string, holder: string, year: number | null, episodes: number | null, duration: number | null, br: unknown[] | null, attrs: Record<string, unknown>, confidence: Conf, notes: string, from = FROM): TitleSeed => ({
  id, title_br, title_original, kind, country, rights_holder_id: holder, production_year: year, episodes, duration_min: duration, br_history: br,
  available_from: from, available_to: null, game_attrs: attrs, confidence, notes,
});
const MEM = 'Memória (não conferido na web); ano e número de capítulos aproximados.';
const MEM_SBT = 'Memória: exibida pelo SBT (período aproximado); capítulos aproximados, conferir.';
const MEM_SBT_DUV = 'Memória: exibição no SBT provável, mas não confirmada; ano e capítulos a conferir.';
const sbt = (periodo: string) => [{ emissora: 'sbt', periodo }];

export const TITLES: TitleSeed[] = [
  // --- TelevisaUnivision (na TV aberta, exclusivas do SBT até o fim do acordo — direito 2601 do lote 1) ---
  t('maria_mercedes', 'Maria Mercedes', 'María Mercedes', 'novela', 'México', 'televisa', 1992, 87, 45, sbt('anos 1990 e reprises'), ga('novela_19h', 54, 76, 75), 'media', `Primeira da “trilogia das Marias”. ${MEM_SBT}`),
  t('esmeralda_1997', 'Esmeralda', 'Esmeralda', 'novela', 'México', 'televisa', 1997, 123, 45, sbt('anos 1990 e reprises'), ga('novela_19h', 58, 76, 70), 'media', MEM_SBT),
  t('rosalinda', 'Rosalinda', 'Rosalinda', 'novela', 'México', 'televisa', 1999, 80, 45, sbt('anos 2000'), ga('novela_19h', 54, 72, 65), 'media', MEM_SBT),
  t('amor_real', 'Amor Real', 'Amor real', 'novela', 'México', 'televisa', 2003, 95, 45, sbt('anos 2000'), ga('novela_19h', 66, 70, 50), 'media', `Novela de época. ${MEM_SBT}`),
  t('a_feia_mais_bela', 'A Feia Mais Bela', 'La fea más bella', 'novela', 'México', 'televisa', 2006, 300, 45, sbt('anos 2000 e reprises'), ga('novela_19h', 62, 76, 60), 'media', `Versão mexicana de Betty, a Feia. ${MEM_SBT}`),
  t('mundo_de_feras', 'Mundo de Feras', 'Mundo de fieras', 'novela', 'México', 'televisa', 2006, 145, 45, sbt('anos 2000'), ga('novela_21h', 60, 68, 45), 'baixa', MEM_SBT_DUV),
  t('cuidado_com_o_anjo', 'Cuidado com o Anjo', 'Cuidado con el ángel', 'novela', 'México', 'televisa', 2008, 284, 45, sbt('anos 2000/2010 e reprises'), ga('novela_19h', 60, 74, 55), 'media', MEM_SBT),
  t('sortilegio', 'Sortilégio', 'Sortilegio', 'novela', 'México', 'televisa', 2009, 85, 45, null, ga('novela_21h', 64, 70, 30), 'baixa', MEM_SBT_DUV),
  t('querida_inimiga', 'Querida Inimiga', 'Querida enemiga', 'novela', 'México', 'televisa', 2008, 120, 45, null, ga('novela_18h', 56, 64, 30), 'baixa', MEM_SBT_DUV),
  t('destilando_amor', 'Destilando Amor', 'Destilando amor', 'novela', 'México', 'televisa', 2007, 171, 45, null, ga('novela_19h', 62, 70, 35), 'baixa', MEM_SBT_DUV),
  t('quando_me_apaixono', 'Quando Me Apaixono', 'Cuando me enamoro', 'novela', 'México', 'televisa', 2010, 205, 45, sbt('anos 2010'), ga('novela_19h', 60, 70, 45), 'media', MEM_SBT),
  t('triunfo_do_amor', 'Triunfo do Amor', 'Triunfo del amor', 'novela', 'México', 'televisa', 2010, 176, 45, sbt('anos 2010'), ga('novela_19h', 62, 72, 45), 'media', MEM_SBT),
  t('amores_verdadeiros', 'Amores Verdadeiros', 'Amores verdaderos', 'novela', 'México', 'televisa', 2012, 225, 45, sbt('anos 2010'), ga('novela_21h', 66, 72, 40), 'media', MEM_SBT),
  t('meu_coracao_e_teu', 'Meu Coração é Teu', 'Mi corazón es tuyo', 'novela', 'México', 'televisa', 2014, 145, 45, sbt('anos 2010'), ga('novela_19h', 62, 74, 40), 'media', MEM_SBT),
  t('a_gata_2014', 'A Gata', 'La gata', 'novela', 'México', 'televisa', 2014, 125, 45, sbt('anos 2010'), ga('novela_19h', 62, 70, 40), 'media', MEM_SBT),
  t('rebelde_2004', 'Rebelde', 'Rebelde', 'novela', 'México', 'televisa', 2004, 440, 45, sbt('2005–2006 e reprises'), ga('novela_juvenil', 60, 78, 60), 'media', `Grande sucesso juvenil do SBT. ${MEM_SBT}`),
  t('a_rosa_de_guadalupe', 'A Rosa de Guadalupe', 'La rosa de Guadalupe', 'serie', 'México', 'televisa', 2008, 1000, 45, sbt('anos 2010'), ga('serie_estrangeira', 48, 66, 55), 'media', 'Memória: série de episódios independentes, ainda em produção; exibida pelo SBT. Número de episódios bem aproximado.'),
  t('como_diz_o_ditado', 'Como Diz o Ditado', 'Como dice el dicho', 'serie', 'México', 'televisa', 2011, 700, 45, sbt('anos 2010'), ga('serie_estrangeira', 48, 62, 50), 'media', 'Memória: série de episódios independentes, exibida pelo SBT. Número de episódios bem aproximado.'),
  t('coracao_selvagem_1993', 'Coração Selvagem', 'Corazón salvaje', 'novela', 'México', 'televisa', 1993, 105, 45, null, ga('novela_19h', 60, 70, 40), 'baixa', MEM_SBT_DUV),
  t('picara_sonhadora', 'Pícara Sonhadora', 'Pícara soñadora', 'novela', 'México', 'televisa', 1991, 160, 45, null, ga('novela_18h', 50, 64, 40), 'baixa', MEM_SBT_DUV),
  t('a_dona_1995', 'A Dona', 'La dueña', 'novela', 'México', 'televisa', 1995, 100, 45, null, ga('novela_19h', 56, 66, 35), 'baixa', MEM_SBT_DUV),
  t('por_ela_sou_eva', 'Por Ela... Sou Eva', 'Por ella soy Eva', 'novela', 'México', 'televisa', 2012, 160, 45, null, ga('novela_19h', 58, 66, 30), 'baixa', MEM_SBT_DUV),
  t('carinha_de_anjo_2000', 'Carinha de Anjo (original mexicana)', 'Carita de ángel', 'novela', 'México', 'televisa', 2000, 175, 45, null, ga('novela_juvenil', 52, 62, 35), 'baixa', `O SBT fez a versão brasileira em 2016. ${MEM_SBT_DUV}`),
  t('te_dou_a_vida', 'Te Dou a Vida', 'Te doy la vida', 'novela', 'México', 'televisa', 2020, 105, 45, null, ga('novela_19h', 62, 66, 20), 'baixa', MEM_SBT_DUV),
  t('domenica_montero', 'Doménica Montero', 'Doménica Montero', 'novela', 'México', 'televisa', null, null, 45, [{ emissora: 'sbt', periodo: 'abr–mai/2026, às 20h45' }], ga('novela_21h', 64, 66, 0), 'media', `Web: novela da TelevisaUnivision que substituiu Presente de Amor às 20h45 e foi substituída por A História de Joana em 27/05/2026 (${W.domenica}; ${W.joana}). Ano e capítulos a conferir.`),
  t('a_historia_de_joana', 'A História de Joana', 'La historia de Juana', 'novela', 'México', 'televisa', 2024, null, 45, [{ emissora: 'sbt', periodo: 'desde 27/05/2026, às 20h45' }], ga('novela_21h', 64, 66, 0), 'media', `Web: produção da W Studios para a TelevisaUnivision (2024), baseada em “Juana, la virgen”; estreou no SBT em 27/05/2026 (${W.joana}; ${W.joanaEstreia}). Capítulos a conferir.`),
  t('chapolin', 'Chapolin', 'El Chapulín Colorado', 'serie', 'México', 'grupo_chespirito', 1973, 260, 25, [{ emissora: 'sbt', periodo: 'décadas de reprises; de volta em 2026' }], ga('humoristico', 66, 74, 80, { rating: 'L' }), 'media', `Web: Chaves e Chapolin voltaram ao SBT depois do fim de um contrato da Disney (${W.chespiritoSbt}; ${W.chapolinSbt}). Número de episódios: memória.`),

  // --- outras latinas ---
  t('ecomoda', 'Ecomoda', 'Ecomoda', 'novela', 'Colômbia', 'rcn', 2001, 170, 45, null, ga('novela_19h', 66, 62, 10), 'baixa', `Continuação de Betty, a Feia. ${MEM} Exibição no Brasil a conferir.`),
  t('pedro_o_escamoso', 'Pedro, o Escamoso', 'Pedro el escamoso', 'novela', 'Colômbia', 'caracol', 2001, 300, 45, null, ga('novela_19h', 64, 64, 0), 'baixa', `${MEM} Exibição no Brasil a conferir.`),
  t('sem_seios_nao_ha_paraiso', 'Sem Seios Não Há Paraíso', 'Sin senos no hay paraíso', 'serie', 'Colômbia', 'caracol', 2006, 23, 45, null, ga('serie_estrangeira', 70, 62, 0, { rating: '16' }), 'baixa', `${MEM} Título no Brasil e exibição a conferir.`),
  t('a_escrava_branca', 'A Escrava Branca', 'La esclava blanca', 'novela', 'Colômbia', 'caracol', 2016, 62, 45, null, ga('novela_21h', 70, 66, 0, { rating: '14' }), 'baixa', `${MEM} Título no Brasil e exibição a conferir.`),
  t('o_senhor_dos_ceus', 'O Senhor dos Céus', 'El Señor de los Cielos', 'serie', 'EUA/México', 'telemundo', 2013, null, 45, null, ga('serie_estrangeira', 70, 66, 0, { rating: '16' }), 'baixa', 'Memória: série de narcotráfico com muitas temporadas (número de episódios não informado de propósito). Título no Brasil a conferir.'),
  t('la_dona', 'La Doña', 'La Doña', 'serie', 'EUA/México', 'telemundo', 2016, 120, 45, null, ga('serie_estrangeira', 66, 62, 0, { rating: '16' }), 'baixa', `${MEM} Exibição no Brasil a conferir.`),
  t('senora_acero', 'Senhora Acero', 'Señora Acero', 'serie', 'EUA/México', 'telemundo', 2014, null, 45, null, ga('serie_estrangeira', 66, 62, 0, { rating: '16' }), 'baixa', 'Memória: várias temporadas (episódios a conferir). Título no Brasil a conferir.'),
  t('paixao_de_gavioes_2', 'Paixão de Gavilanes 2', 'Pasión de gavilanes 2', 'novela', 'Colômbia', 'telemundo', 2022, 87, 45, null, ga('novela_21h', 66, 66, 0), 'baixa', `Continuação da novela de 2003 (lote 1). ${MEM}`),
  t('betty_em_nova_york', 'Betty em Nova York', 'Betty en NY', 'novela', 'EUA', 'telemundo', 2019, 123, 45, null, ga('novela_19h', 60, 64, 0), 'baixa', `Nova versão de Betty, a Feia. ${MEM} Exibição no Brasil a conferir.`),
  t('floricienta', 'Floricienta', 'Floricienta', 'novela', 'Argentina', 'telefe', 2004, 300, 45, null, ga('novela_juvenil', 60, 64, 0), 'baixa', 'Memória: a Band fez a versão brasileira (Floribella, 2005); o original argentino na TV aberta brasileira não foi confirmado. Distribuidor (Telefe ou Cris Morena Group) a conferir.'),
  t('educando_a_nina', 'Educando a Nina', 'Educando a Nina', 'novela', 'Argentina', 'telefe', 2016, 160, 45, null, ga('novela_19h', 60, 62, 0), 'baixa', `${MEM} Exibição no Brasil a conferir.`),
  t('amar_depois_de_amar', 'Amar Depois de Amar', 'Amar después de amar', 'novela', 'Argentina', 'telefe', 2017, 80, 45, null, ga('novela_21h', 66, 60, 0, { rating: '14' }), 'baixa', `${MEM} Exibição no Brasil a conferir.`),
  t('topazio', 'Topázio', 'Topacio', 'novela', 'Venezuela', 'venevision', 1985, 160, 45, null, ga('novela_19h', 50, 60, 30), 'baixa', 'Memória: clássico venezuelano; exibição no SBT nos anos 80/90 provável, não confirmada. Capítulos aproximados.'),
  t('kassandra', 'Kassandra', 'Kassandra', 'novela', 'Venezuela', 'rctv', 1992, 150, 45, null, ga('novela_19h', 52, 64, 30), 'baixa', 'Memória: novela venezuelana de grande alcance internacional; exibição no Brasil e detentor atual do acervo a conferir.'),
  t('cristal', 'Cristal', 'Cristal', 'novela', 'Venezuela', 'rctv', 1985, 246, 45, null, ga('novela_19h', 52, 60, 30), 'baixa', 'Memória: clássico venezuelano; exibição no Brasil e detentor atual do acervo a conferir.'),
  t('beleza_fatal', 'Beleza Fatal', 'Beleza Fatal', 'novela', 'Brasil', 'wbd', 2025, 40, 45, [{ emissora: 'band', periodo: 'até 07/05/2025, às 20h30 (depois do streaming Max)' }], ga('novela_21h', 74, 74, 25, { rating: '16' }), 'media', `Web: a Band exibia “Beleza Fatal” às 20h30 até a estreia de Café com Aroma de Mulher em 08/05/2025 (${W.belezaFatalBand}). Produção original da Max (memória); 40 capítulos (memória, conferir).`),

  // --- turcas ---
  t('coracao_de_mae', 'Coração de Mãe', 'Sandık Kokusu', 'novela', 'Turquia', 'global_agency', 2023, 50, 120, [{ emissora: 'record', periodo: '24/02 a 24/08/2026, às 21h' }], ga('novela_21h', 72, 72, 0), 'media', `Web: exibida pela Show TV na Turquia (50 episódios longos); na Record de 24/02 a 24/08/2026, às 21h, no lugar de “Mãe” (${W.coracaoMae}). Distribuidora internacional (aqui Global Agency) e ano: não confirmados.`),
  t('iludida', 'Iludida', 'Sadakatsiz', 'novela', 'Turquia', 'kanal_d', 2020, 149, 45, [{ emissora: 'record', periodo: 'desde 25/08/2026, às 21h' }], ga('novela_21h', 74, 72, 0, { rating: '14' }), 'media', `Web: Kanal D (2020–2022), 149 capítulos na montagem internacional; adaptação da série britânica “Doctor Foster”; estreou na Record em 25/08/2026 (${W.coracaoMae}; ${W.turcas2026}). Distribuidora (Kanal D): memória.`),
  t('chamas_do_destino', 'Chamas do Destino', 'Alev Alev', 'novela', 'Turquia', 'global_agency', 2020, null, 120, [{ emissora: 'record', periodo: 'em exibição em jan/2026; fim em abr/2026' }], ga('novela_21h', 70, 66, 0, { rating: '14' }), 'media', `Web: em exibição na Record em 06/01/2026 (${W.chamasTnh1}); fim em 24/04/2026 segundo ${W.turcas2026} (outra fonte indica fim antes; conferir). Distribuidora internacional e capítulos não confirmados.`),
  t('sila', 'Sila: Prisioneira do Amor', 'Sıla', 'novela', 'Turquia', 'atv', 2006, null, 90, [{ emissora: 'band', periodo: 'segunda a sábado, 20h20 (ano a conferir)' }], ga('novela_21h', 68, 70, 20), 'media', `Web: a Band exibiu “Sila – Prisioneira do Amor” de segunda a sábado às 20h20, depois do Jornal da Band (${W.silaBand}; o texto não traz o ano). Distribuidora (ATV) e capítulos: memória, conferir.`),
  t('amor_proibido', 'Amor Proibido', 'Aşk-ı Memnu', 'novela', 'Turquia', 'kanal_d', 2008, null, 90, null, ga('novela_21h', 76, 70, 15, { rating: '14' }), 'baixa', `Web: listada entre as turcas que passaram na TV aberta brasileira, sem dizer a emissora (${W.turcasTvAberta}). Emissora, distribuidora e capítulos a conferir.`),
  t('asas_do_amor', 'Asas do Amor', 'Kanatsız Kuşlar', 'novela', 'Turquia', 'atv', 2017, null, 90, null, ga('novela_21h', 66, 64, 10), 'baixa', `Web: listada entre as turcas que passaram na TV aberta brasileira, sem dizer a emissora (${W.turcasTvAberta}). Emissora, distribuidora e capítulos a conferir.`),
  t('minha_vida', 'Minha Vida', 'O Hayat Benim', 'novela', 'Turquia', 'eccho_rights', 2014, null, 90, [{ emissora: 'band', periodo: 'até 2019 (última turca da Band no horário nobre)' }], ga('novela_21h', 64, 64, 20), 'media', `Web: a Band manteve novelas turcas de 2015 a 2019, e “Minha Vida” foi a última no horário nobre (${W.turcasBand}; ${W.turcasTvAberta}). Distribuidora (aqui Eccho Rights) e capítulos: não confirmados.`),
  t('o_segredo_de_feriha', 'O Segredo de Feriha', 'Adını Feriha Koydum', 'novela', 'Turquia', 'global_agency', 2011, null, 90, null, ga('novela_19h', 70, 70, 10), 'media', `Web: exibida no canal Globoplay Novelas (TV paga), não na TV aberta (${W.globoplayTurcas}). Distribuidora (Global Agency) e capítulos: memória.`),
  t('hercai', 'Hercai: Amor e Vingança', 'Hercai', 'novela', 'Turquia', 'atv', 2019, null, 120, null, ga('novela_21h', 74, 70, 10, { rating: '14' }), 'media', `Web: exibida no canal Globoplay Novelas (TV paga), não na TV aberta (${W.globoplayTurcas}). Distribuidora (ATV) e capítulos: memória.`),
  t('seculo_magnifico', 'O Século Magnífico', 'Muhteşem Yüzyıl', 'novela', 'Turquia', 'global_agency', 2011, 139, 120, null, ga('novela_21h', 82, 68, 0, { rating: '14' }), 'baixa', 'Memória: drama de época sobre o Império Otomano, distribuído pela Global Agency. Título no Brasil e exibição a conferir.'),
  t('o_amor_esta_no_ar', 'O Amor Está no Ar', 'Sen Çal Kapımı', 'novela', 'Turquia', 'madd', 2020, null, 120, null, ga('novela_19h', 66, 72, 0), 'baixa', 'Memória: comédia romântica (internacionalmente “Love Is in the Air”). Título no Brasil, distribuidora (MADD) e capítulos a conferir.'),
  t('segredos_de_familia', 'Segredos de Família', 'Yargı', 'novela', 'Turquia', 'kanal_d', 2021, null, 120, null, ga('novela_21h', 80, 68, 0, { rating: '14' }), 'baixa', 'Memória: drama jurídico do Kanal D (internacionalmente “Family Secrets”). Título no Brasil e capítulos a conferir.'),
  t('amor_e_dinheiro', 'Amor e Dinheiro', 'Kara Para Aşk', 'novela', 'Turquia', 'atv', 2014, null, 120, null, ga('novela_21h', 70, 68, 0, { rating: '14' }), 'baixa', 'Memória: suspense romântico (internacionalmente “Black Money Love”). Título no Brasil, distribuidora e capítulos a conferir.'),
  t('traicao_aldatmak', 'Traição', 'Aldatmak', 'novela', 'Turquia', 'inter_medya', 2022, null, 120, null, ga('novela_21h', 72, 68, 0, { rating: '14' }), 'baixa', 'Web: “Deception” aparece no catálogo da Inter Medya (fonte na nota do player). Título original (Aldatmak), título no Brasil e capítulos: memória, conferir.'),

  // --- asiáticos ---
  t('reply_1988', 'Reply 1988', 'Reply 1988', 'serie', 'Coreia do Sul', 'cj_enm', 2015, 20, 90, null, ga('serie_estrangeira', 86, 56, 0), 'media', 'Memória: dorama do tvN. Nenhuma exibição em TV aberta brasileira encontrada na busca de 18/10/2026.'),
  t('hospital_playlist', 'Hospital Playlist', 'Hospital Playlist', 'serie', 'Coreia do Sul', 'cj_enm', 2020, 24, 90, null, ga('serie_estrangeira', 84, 56, 0), 'media', 'Memória: dorama do tvN. Direitos de TV aberta no Brasil a conferir.'),
  t('rainha_das_lagrimas', 'Rainha das Lágrimas', 'Queen of Tears', 'serie', 'Coreia do Sul', 'cj_enm', 2024, 16, 80, null, ga('serie_estrangeira', 84, 62, 0), 'media', 'Memória: dorama do tvN, sucesso no streaming. Direitos de TV aberta no Brasil a conferir.'),
  t('vincenzo', 'Vincenzo', 'Vincenzo', 'serie', 'Coreia do Sul', 'cj_enm', 2021, 20, 80, null, ga('serie_estrangeira', 82, 60, 0, { rating: '14' }), 'media', 'Memória: dorama do tvN. Direitos de TV aberta no Brasil a conferir.'),
  t('descendentes_do_sol', 'Descendentes do Sol', 'Descendants of the Sun', 'serie', 'Coreia do Sul', 'kbs', 2016, 16, 60, null, ga('serie_estrangeira', 78, 62, 0), 'media', 'Memória: dorama da KBS. Direitos de TV aberta no Brasil a conferir.'),
  t('dragon_ball_z', 'Dragon Ball Z', 'Dragon Ball Z', 'desenho', 'Japão', 'toei', 1989, 291, 22, null, ga('infantil', 72, 76, 60, { rating: '10' }), 'media', 'Memória: 291 episódios; exibido na TV aberta brasileira (emissoras e anos a conferir).'),
  t('one_piece', 'One Piece', 'One Piece', 'desenho', 'Japão', 'toei', 1999, 1150, 22, null, ga('infantil', 74, 66, 20, { rating: '10' }), 'baixa', 'Memória: ainda em produção; número de episódios aproximado em 2026. Exibição na TV aberta a conferir.'),
  t('cavaleiros_do_zodiaco', 'Os Cavaleiros do Zodíaco', 'Saint Seiya', 'desenho', 'Japão', 'toei', 1986, 114, 22, null, ga('infantil', 68, 70, 55, { rating: '10' }), 'media', 'Memória: fenômeno na extinta Manchete nos anos 90 (emissora que não existe mais); outras exibições a conferir.'),
  t('pokemon', 'Pokémon', 'Pocket Monsters', 'desenho', 'Japão', 'pokemon_company', 1997, 1200, 22, null, ga('infantil', 66, 72, 45, { rating: 'L' }), 'baixa', 'Memória: série com muitas temporadas (episódios aproximados); exibida na TV aberta brasileira (emissoras a conferir).'),
  t('super_wings', 'Super Wings', 'Super Wings', 'desenho', 'Coreia do Sul/China', 'alpha_group', 2015, 300, 11, sbt('Sábado Animado em 2026'), ga('infantil', 56, 64, 30, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Número de episódios: memória.`),

  // --- séries americanas ---
  t('o_mentalista', 'O Mentalista', 'The Mentalist', 'serie', 'EUA', 'wbd', 2008, 151, 42, null, ga('serie_estrangeira', 78, 66, 30, { rating: '14' }), 'media', 'Memória: 7 temporadas, 151 episódios. Exibição na TV aberta a conferir.'),
  t('gilmore_girls', 'Gilmore Girls: Tal Mãe, Tal Filha', 'Gilmore Girls', 'serie', 'EUA', 'wbd', 2000, 153, 42, null, ga('serie_estrangeira', 80, 60, 25), 'media', 'Memória: 7 temporadas, 153 episódios.'),
  t('smallville', 'Smallville: As Aventuras do Superboy', 'Smallville', 'serie', 'EUA', 'wbd', 2001, 217, 42, null, ga('serie_estrangeira', 70, 66, 40, { rating: '12' }), 'media', 'Memória: 10 temporadas, 217 episódios; exibida na TV aberta brasileira (emissora a conferir).'),
  t('the_flash', 'The Flash', 'The Flash', 'serie', 'EUA', 'wbd', 2014, 184, 42, null, ga('serie_estrangeira', 68, 66, 30, { rating: '12' }), 'media', 'Memória: 9 temporadas, 184 episódios. Exibição na TV aberta a conferir.'),
  t('plantao_medico', 'Plantão Médico', 'ER', 'serie', 'EUA', 'wbd', 1994, 331, 42, null, ga('serie_estrangeira', 84, 58, 30, { rating: '14' }), 'media', 'Memória: 15 temporadas, 331 episódios.'),
  t('jovem_sheldon', 'Jovem Sheldon', 'Young Sheldon', 'serie', 'EUA', 'wbd', 2017, 141, 22, null, ga('serie_estrangeira', 76, 66, 15), 'media', 'Memória: 7 temporadas, 141 episódios; derivada de The Big Bang Theory (lote 1).'),
  t('um_maluco_no_pedaco', 'Um Maluco no Pedaço', 'The Fresh Prince of Bel-Air', 'serie', 'EUA', 'wbd', 1990, 148, 22, null, ga('serie_estrangeira', 72, 74, 70), 'media', 'Memória: 6 temporadas, 148 episódios; muito reprisada na TV aberta brasileira (emissoras a conferir). Distribuição pela Warner: memória.'),
  t('pretty_little_liars', 'Pretty Little Liars', 'Pretty Little Liars', 'serie', 'EUA', 'wbd', 2010, 160, 42, null, ga('serie_estrangeira', 66, 62, 20, { rating: '14' }), 'media', 'Memória: 7 temporadas, 160 episódios.'),
  t('os_simpsons', 'Os Simpsons', 'The Simpsons', 'serie', 'EUA', 'disney', 1989, 790, 22, null, ga('humoristico', 80, 72, 60, { rating: '12' }), 'media', 'Memória: ainda em produção (episódios aproximados em 2026); exibida na TV aberta brasileira (emissoras e anos a conferir). A Disney prioriza o próprio streaming.'),
  t('how_i_met_your_mother', 'How I Met Your Mother', 'How I Met Your Mother', 'serie', 'EUA', 'disney', 2005, 208, 22, null, ga('serie_estrangeira', 78, 64, 30), 'media', 'Memória: 9 temporadas, 208 episódios.'),
  t('modern_family', 'Modern Family', 'Modern Family', 'serie', 'EUA', 'disney', 2009, 250, 22, null, ga('serie_estrangeira', 82, 62, 25), 'media', 'Memória: 11 temporadas, 250 episódios.'),
  t('arquivo_x', 'Arquivo X', 'The X-Files', 'serie', 'EUA', 'disney', 1993, 218, 42, null, ga('serie_estrangeira', 82, 62, 40, { rating: '14' }), 'media', 'Memória: 11 temporadas, 218 episódios; exibida na TV aberta brasileira nos anos 90 (emissora a conferir).'),
  t('bones', 'Bones', 'Bones', 'serie', 'EUA', 'disney', 2005, 246, 42, null, ga('serie_estrangeira', 74, 64, 30, { rating: '14' }), 'media', 'Memória: 12 temporadas, 246 episódios.'),
  t('nine_one_one', '9-1-1', '9-1-1', 'serie', 'EUA', 'disney', 2018, 120, 42, null, ga('serie_estrangeira', 74, 68, 10, { rating: '14' }), 'baixa', 'Memória: ainda em produção; episódios aproximados em 2026. Distribuidor (Disney/20th Television) a conferir.'),
  t('eu_a_patroa_e_as_criancas', 'Eu, a Patroa e as Crianças', 'My Wife and Kids', 'serie', 'EUA', 'disney', 2001, 123, 22, [{ emissora: 'sbt', periodo: 'anos 2000 e reprises' }], ga('serie_estrangeira', 66, 72, 70), 'media', 'Memória: 5 temporadas, 123 episódios; muito reprisada no SBT.'),
  t('hannah_montana', 'Hannah Montana', 'Hannah Montana', 'serie', 'EUA', 'disney', 2006, 98, 22, null, ga('serie_estrangeira', 58, 62, 30, { rating: 'L' }), 'baixa', 'Memória: 4 temporadas, 98 episódios. Exibição na TV aberta a conferir.'),
  t('suits', 'Suits', 'Suits', 'serie', 'EUA', 'nbcu', 2011, 134, 42, null, ga('serie_estrangeira', 80, 62, 15, { rating: '12' }), 'media', 'Memória: 9 temporadas, 134 episódios; voltou à moda no streaming em 2023.'),
  t('house', 'House', 'House, M.D.', 'serie', 'EUA', 'nbcu', 2004, 177, 42, null, ga('serie_estrangeira', 86, 64, 35, { rating: '12' }), 'media', 'Memória: 8 temporadas, 177 episódios; exibida na TV aberta brasileira (emissora a conferir).'),
  t('chicago_fire', 'Chicago Fire', 'Chicago Fire', 'serie', 'EUA', 'nbcu', 2012, 250, 42, null, ga('serie_estrangeira', 72, 64, 10, { rating: '12' }), 'baixa', 'Memória: ainda em produção; episódios aproximados em 2026.'),
  t('brooklyn_nine_nine', 'Brooklyn Nine-Nine', 'Brooklyn Nine-Nine', 'serie', 'EUA', 'nbcu', 2013, 153, 22, null, ga('serie_estrangeira', 80, 60, 15), 'media', 'Memória: 8 temporadas, 153 episódios.'),
  t('monk', 'Monk: Um Detetive Diferente', 'Monk', 'serie', 'EUA', 'nbcu', 2002, 125, 42, null, ga('serie_estrangeira', 76, 60, 25), 'media', 'Memória: 8 temporadas, 125 episódios.'),
  t('pica_pau', 'Pica-Pau (curtas clássicos)', 'Woody Woodpecker', 'desenho', 'EUA', 'nbcu', 1940, 200, 30, [{ emissora: 'record', periodo: 'décadas de exibição' }], ga('infantil', 60, 76, 85, { rating: 'L' }), 'media', 'Memória: curtas da Universal (Walter Lantz), exibidos pela Record por décadas (fadiga alta). “Episódios” = blocos de meia hora, número aproximado.'),
  t('a_lista_negra', 'Lista Negra', 'The Blacklist', 'serie', 'EUA', 'sony', 2013, 218, 42, null, ga('serie_estrangeira', 78, 64, 20, { rating: '14' }), 'media', 'Memória: 10 temporadas, 218 episódios.'),
  t('seinfeld', 'Seinfeld', 'Seinfeld', 'serie', 'EUA', 'sony', 1989, 180, 22, null, ga('serie_estrangeira', 88, 52, 20), 'alta', 'Memória: 9 temporadas, 180 episódios.'),
  t('better_call_saul', 'Better Call Saul', 'Better Call Saul', 'serie', 'EUA', 'sony', 2015, 63, 47, null, ga('serie_estrangeira', 92, 50, 0, { rating: '16' }), 'alta', 'Memória: 6 temporadas, 63 episódios; derivada de Breaking Bad (lote 1). Classificação alta limita o horário.'),
  t('swat', 'S.W.A.T.: Força de Intervenção', 'S.W.A.T.', 'serie', 'EUA', 'sony', 2017, 160, 42, null, ga('serie_estrangeira', 68, 66, 10, { rating: '14' }), 'baixa', 'Memória: 8 temporadas; episódios aproximados.'),
  t('the_nanny', 'The Nanny', 'The Nanny', 'serie', 'EUA', 'sony', 1993, 146, 22, [{ emissora: 'sbt', periodo: 'anos 1990/2000' }], ga('serie_estrangeira', 68, 66, 45), 'baixa', 'Memória: 6 temporadas, 146 episódios; exibição no SBT provável, não confirmada.'),
  t('ncis', 'NCIS: Investigações Criminais', 'NCIS', 'serie', 'EUA', 'paramount', 2003, 470, 42, null, ga('serie_estrangeira', 74, 64, 25, { rating: '14' }), 'baixa', 'Memória: ainda em produção; episódios aproximados em 2026.'),
  t('criminal_minds', 'Criminal Minds', 'Criminal Minds', 'serie', 'EUA', 'paramount', 2005, 340, 42, null, ga('serie_estrangeira', 76, 64, 30, { rating: '16' }), 'baixa', 'Memória: episódios aproximados (com a continuação Evolution).'),
  t('todo_mundo_odeia_o_chris', 'Todo Mundo Odeia o Chris', 'Everybody Hates Chris', 'serie', 'EUA', 'paramount', 2005, 88, 22, [{ emissora: 'record', periodo: '2005–2009 e muitas reprises' }], ga('serie_estrangeira', 76, 80, 80), 'media', `Web: exibida pela Record desde a estreia e reprisada muitas vezes (${W.chrisRecord}); em abril de 2026 chegou à Netflix e liderou o ranking no Brasil (${W.chrisNetflix}). 4 temporadas, 88 episódios e distribuição pela Paramount (CBS Studios): memória.`),

  // --- desenhos ---
  t('looney_tunes', 'Looney Tunes (clássicos)', 'Looney Tunes', 'desenho', 'EUA', 'wbd', 1930, 300, 30, null, ga('infantil', 70, 70, 70, { rating: 'L' }), 'media', 'Memória: curtas clássicos da Warner (Pernalonga, Patolino). “Episódios” = blocos de meia hora, número aproximado.'),
  t('scooby_doo', 'Scooby-Doo (séries clássicas)', 'Scooby-Doo', 'desenho', 'EUA', 'wbd', 1969, 150, 22, null, ga('infantil', 64, 68, 65, { rating: 'L' }), 'media', 'Memória: acervo Hanna-Barbera da Warner; episódios aproximados.'),
  t('o_show_do_tom_e_jerry', 'O Show do Tom & Jerry', 'The Tom and Jerry Show', 'desenho', 'EUA', 'wbd', 2014, 120, 22, sbt('Sábado Animado em 2026'), ga('infantil', 60, 68, 40, { rating: 'L' }), 'media', 'Web: no Sábado Animado do SBT em jan/2026 (resumo de busca de 18/10/2026; a fonte exata não foi aberta). Episódios: memória.'),
  t('jovens_titas_em_acao', 'Os Jovens Titãs em Ação', 'Teen Titans Go!', 'desenho', 'EUA', 'wbd', 2013, 400, 11, sbt('Sábado Animado em 2026'), ga('infantil', 58, 66, 40, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Episódios: memória.`),
  t('batwheels', 'Batwheels', 'Batwheels', 'desenho', 'EUA', 'wbd', 2022, 50, 11, sbt('Sábado Animado em 2026'), ga('infantil', 56, 60, 15, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Episódios: memória.`),
  t('irmao_do_jorel', 'Irmão do Jorel', 'Irmão do Jorel', 'desenho', 'Brasil', 'wbd', 2014, 80, 11, null, ga('infantil', 72, 62, 10, { rating: 'L' }), 'baixa', 'Memória: animação brasileira (Copa Studio) do Cartoon Network, hoje Warner Bros. Discovery. Episódios e exibição na TV aberta a conferir.'),
  t('bob_esponja', 'Bob Esponja Calça Quadrada', 'SpongeBob SquarePants', 'desenho', 'EUA', 'paramount', 1999, 300, 22, null, ga('infantil', 72, 74, 45, { rating: 'L' }), 'media', 'Memória: Nickelodeon (Paramount); episódios aproximados. Exibição na TV aberta a conferir.'),
  t('patrulha_canina', 'Patrulha Canina', 'PAW Patrol', 'desenho', 'Canadá', 'paramount', 2013, 250, 22, null, ga('infantil', 62, 72, 25, { rating: 'L' }), 'baixa', 'Memória: criação da Spin Master, distribuída pela Nickelodeon (Paramount); conferir quem licencia para a TV aberta.'),
  t('os_padrinhos_magicos', 'Os Padrinhos Mágicos', 'The Fairly OddParents', 'desenho', 'EUA', 'paramount', 2001, 172, 22, null, ga('infantil', 64, 64, 35, { rating: 'L' }), 'media', 'Memória: Nickelodeon (Paramount); 10 temporadas.'),
  t('phineas_e_ferb', 'Phineas e Ferb', 'Phineas and Ferb', 'desenho', 'EUA', 'disney', 2007, 129, 22, null, ga('infantil', 72, 64, 25, { rating: 'L' }), 'media', 'Memória: Disney; episódios aproximados (com a temporada nova de 2025).'),
  t('bluey', 'Bluey', 'Bluey', 'desenho', 'Austrália', 'bbc_studios', 2018, 150, 8, null, ga('infantil', 86, 70, 10, { rating: 'L' }), 'baixa', 'Memória: Ludo Studio com distribuição da BBC Studios; a Disney tem os direitos em muitos países. Janela de TV aberta no Brasil a conferir.'),
  t('turma_da_monica_desenho', 'Turma da Mônica (desenho)', 'Turma da Mônica', 'desenho', 'Brasil', 'msp', 1976, null, 11, sbt('Sábado Animado em 2026'), ga('infantil', 68, 72, 50, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Ano e número de episódios: não informados (acervo de várias épocas).`),
  t('o_show_da_luna', 'O Show da Luna!', 'O Show da Luna!', 'desenho', 'Brasil', 'tv_pinguim', 2014, 150, 11, null, ga('infantil', 76, 62, 20, { rating: 'L' }), 'baixa', 'Memória: animação educativa brasileira; episódios e exibição na TV aberta a conferir.'),
  t('peixonauta', 'Peixonauta', 'Peixonauta', 'desenho', 'Brasil', 'tv_pinguim', 2009, 104, 11, null, ga('infantil', 72, 58, 30, { rating: 'L' }), 'baixa', 'Memória: animação brasileira; episódios e exibição na TV aberta a conferir.'),
  t('galinha_pintadinha', 'Galinha Pintadinha', 'Galinha Pintadinha', 'desenho', 'Brasil', 'bromelia', 2006, null, 11, null, ga('infantil', 60, 70, 40, { rating: 'L' }), 'baixa', 'Memória: fenômeno de vídeos musicais infantis na internet; formato de série para TV a conferir.'),
  t('parque_patati_patata', 'Parque Patati Patatá', 'Parque Patati Patatá', 'desenho', 'Brasil', 'patati_patata', null, null, 11, sbt('Sábado Animado em 2026'), ga('infantil', 54, 64, 30, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Ano, formato (desenho ou programa) e episódios a conferir.`),
  t('masha_e_o_urso', 'Masha e o Urso', 'Masha i Medved', 'desenho', 'Rússia', 'animaccord', 2009, 100, 7, [{ emissora: 'cultura', periodo: 'nova temporada em jun/2026' }], ga('infantil', 72, 70, 30, { rating: 'L' }), 'media', `Web: nova temporada na TV Cultura a partir de 29/06/2026 (${W.mashaCultura}). Episódios: memória.`),
  t('peppa_pig', 'Peppa Pig', 'Peppa Pig', 'desenho', 'Reino Unido', 'hasbro', 2004, 350, 5, null, ga('infantil', 70, 70, 35, { rating: 'L' }), 'baixa', 'Memória: muito popular na TV paga e no streaming; exibição na TV aberta a conferir.'),
  t('miraculous', 'Miraculous: As Aventuras de Ladybug', 'Miraculous: Tales of Ladybug & Cat Noir', 'desenho', 'França', 'zag', 2015, 150, 22, null, ga('infantil', 68, 70, 20, { rating: 'L' }), 'baixa', 'Memória: episódios aproximados; exibição na TV aberta a conferir.'),
  t('barbie_dreamhouse', 'Barbie Dreamhouse: Aventuras', 'Barbie Dreamhouse Adventures', 'desenho', 'EUA', 'mattel', 2018, 52, 22, sbt('Sábado Animado em 2026'), ga('infantil', 54, 64, 20, { rating: 'L' }), 'media', `Web: “Barbie Dreamhouse” no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Título exato da série e episódios: memória.`),
  t('polly_pocket', 'Polly Pocket', 'Polly Pocket', 'desenho', 'EUA', 'mattel', 2018, 100, 22, sbt('Sábado Animado em 2026'), ga('infantil', 52, 60, 20, { rating: 'L' }), 'media', `Web: no Sábado Animado do SBT em 2026 (${W.sabadoAnimado}). Ano e episódios: memória.`),

  // --- documentários e minisséries ---
  t('planeta_terra_ii', 'Planeta Terra II', 'Planet Earth II', 'documentario', 'Reino Unido', 'bbc_studios', 2016, 6, 50, null, ga('documentario', 95, 56, 0, { rating: 'L' }), 'alta', 'Memória: série documental da BBC, 6 episódios.'),
  t('planeta_azul_ii', 'Planeta Azul II', 'Blue Planet II', 'documentario', 'Reino Unido', 'bbc_studios', 2017, 7, 50, null, ga('documentario', 95, 54, 0, { rating: 'L' }), 'alta', 'Memória: série documental da BBC, 7 episódios.'),
  t('cosmos_2014', 'Cosmos: Uma Odisseia do Espaço-Tempo', 'Cosmos: A Spacetime Odyssey', 'documentario', 'EUA', 'disney', 2014, 13, 44, null, ga('documentario', 90, 52, 0, { rating: 'L' }), 'media', 'Memória: 13 episódios (Fox/National Geographic, hoje Disney). Exibição na TV aberta brasileira a conferir.'),
  t('cacadores_de_mitos', 'Caçadores de Mitos', 'MythBusters', 'documentario', 'EUA', 'wbd', 2003, 280, 44, null, ga('documentario', 74, 60, 30, { rating: 'L' }), 'media', 'Memória: Discovery (Warner Bros. Discovery); episódios aproximados.'),
  t('chernobyl', 'Chernobyl', 'Chernobyl', 'minisserie', 'EUA/Reino Unido', 'wbd', 2019, 5, 60, null, ga('serie_estrangeira', 95, 56, 0, { rating: '16' }), 'alta', 'Memória: minissérie da HBO, 5 episódios. Classificação alta limita o horário.'),
  t('band_of_brothers', 'Band of Brothers', 'Band of Brothers', 'minisserie', 'EUA/Reino Unido', 'wbd', 2001, 10, 60, null, ga('serie_estrangeira', 92, 54, 10, { rating: '16' }), 'alta', 'Memória: minissérie da HBO, 10 episódios.'),
];

// ===== direitos e exclusividades ligados aos títulos acima =====
export const RIGHTS: RightSeed[] = [
  { id: 2620, product_ref: 'coracao_de_mae', holder_station_key: 'record', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2026-02-24', valid_to: null, confidence: 'media', notes: `Web: na Record a partir de 24/02/2026 (${W.coracaoMae}). Data de assinatura desconhecida: o jogo trava o título só a partir da estreia; antes disso, quem comprar muda a história (divergência).` },
  { id: 2621, product_ref: 'iludida', holder_station_key: 'record', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2026-08-25', valid_to: null, confidence: 'media', notes: `Web: na Record a partir de 25/08/2026 (${W.coracaoMae}). Mesma regra de data do direito 2620.` },
  { id: 2622, product_ref: 'chamas_do_destino', holder_station_key: 'record', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2025-01-01', valid_to: '2026-04-24', confidence: 'baixa', notes: `Web: em exibição na Record em jan/2026 (${W.chamasTnh1}); fim em 24/04/2026 segundo ${W.turcas2026}. Início do contrato: estimativa.` },
  { id: 2623, product_ref: 'guerra_das_rosas', holder_station_key: 'band', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2026-03-16', valid_to: null, confidence: 'media', notes: `Web: título original Güllerin Savaşı; estreou na Band em 16/03/2026 (${W.turcas2026}). O título é do lote 1; data de assinatura desconhecida.` },
  { id: 2624, product_ref: 'grupo_chespirito', holder_station_key: 'sbt', terms: { escopo: 'séries de Chespirito (Chaves, Chapolin)', exclusividade: 'tv_aberta' }, valid_from: null, valid_to: null, confidence: 'media', notes: `Web: Chaves e Chapolin de volta ao SBT depois do fim de um contrato da Disney (${W.chespiritoSbt}; ${W.chapolinSbt}). Datas e termos: estimativa.` },
];
