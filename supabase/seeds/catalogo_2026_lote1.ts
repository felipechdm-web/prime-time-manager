// Catálogo real — era atual (2026), PRIMEIRO LOTE para revisão do Felipe (Fase 6.2, seção 8A).
// Tudo nasce como não aprovado (approved = false). Atributos de jogo (qualidade, apelo, fadiga) são
// ESTIMATIVAS para o jogo, nunca audiência oficial. Pessoas reais aparecem só como nome de programa;
// todo representante de empresa é um personagem fictício.
//
// Fontes: "web" = conferido na internet em 17/10/2026 (link na nota); "memória" = conhecimento geral
// da IA, não conferido na web (por isso confiança média ou baixa). Gere SQL e CSV com:
//   node scripts/gen-catalog-seed.ts

export const BATCH = '2026-lote1';
export const REFERENCE_MONTH = '2026-01';
const FROM = '2026-01-05'; // largada da partida na era atual

type Conf = 'alta' | 'media' | 'baixa';

export interface HolderSeed {
  id: string; name: string; category: string; eras: string[];
  profile: Record<string, unknown>; representative_seed: Record<string, unknown>; confidence: Conf; notes: string;
}
export interface TitleSeed {
  id: string; title_br: string; title_original: string | null; kind: string; country: string; rights_holder_id: string;
  production_year: number | null; episodes: number | null; duration_min: number | null; br_history: unknown[] | null;
  available_from: string; available_to: string | null; game_attrs: Record<string, unknown>; confidence: Conf; notes: string;
}
export interface Slot { dias: string; inicio: string; fim: string; titulo: string; genero: string; catalog_title_id?: string; nota?: string }
export interface GridSeed { station_key: string; reference_month?: string; slots: Slot[]; confidence: Conf; notes: string }
export interface RightSeed {
  id: number; product_ref: string; holder_station_key: string; terms: Record<string, unknown>;
  valid_from: string | null; valid_to: string | null; confidence: Conf; notes: string;
}

// ===== players (perfil de negociação é um ponto de partida; a calibração fica para a Fase 6.3) =====
const perfil = (estilo: 'duro' | 'relacional' | 'leiloeiro', prioridades: string[]) => ({ estilo, prioridades, calibrar_na_fase: '6.3' });
const rep = (nome: string, cargo: string, estilo: string) => ({ nome, cargo, estilo, ficticio: true });

export const HOLDERS: HolderSeed[] = [
  { id: 'televisa', name: 'TelevisaUnivision', category: 'novela_latina', eras: ['now'], profile: perfil('relacional', ['exclusividade', 'exposicao_tv_aberta', 'parceria_longa']), representative_seed: rep('Rodrigo Salinas', 'Vice-presidente de vendas para a América Latina', 'cordial, fala de "família Televisa" e de parceria histórica'), confidence: 'alta', notes: 'Web: exclusividade de novelas na TV aberta com o SBT, estendida por cinco anos em 2023 (Meio & Mensagem, https://www.meioemensagem.com.br/midia/sbt-e-televisaunivision-estendem-acordo-por-mais-cinco-anos). Representante fictício.' },
  { id: 'grupo_chespirito', name: 'Grupo Chespirito', category: 'novela_latina', eras: ['now'], profile: perfil('duro', ['preco', 'respeito_a_obra']), representative_seed: rep('Martina Ochoa', 'Diretora de licenciamento', 'protetora da obra, desconfia de cortes e reprises demais'), confidence: 'media', notes: 'Memória: dono dos direitos das séries de Chespirito (Chaves, Chapolin); houve disputa com a Televisa que tirou Chaves do ar no Brasil por alguns anos. Conferir a situação dos direitos em 2026.' },
  { id: 'rcn', name: 'RCN Televisión', category: 'novela_latina', eras: ['now'], profile: perfil('relacional', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Catalina Restrepo', 'Gerente de vendas internacionais', 'calorosa e direta, gosta de citar sucessos colombianos'), confidence: 'alta', notes: 'Memória: emissora e produtora colombiana (Betty, a Feia; Café com Aroma de Mulher).' },
  { id: 'caracol', name: 'Caracol Televisión', category: 'novela_latina', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'multiplataforma']), representative_seed: rep('Andrés Mejía', 'Diretor de distribuição internacional', 'negociador frio, compara ofertas de streaming'), confidence: 'alta', notes: 'Memória: emissora e produtora colombiana (O Patrão do Mal).' },
  { id: 'telemundo', name: 'Telemundo Global Studios (NBCUniversal)', category: 'novela_latina', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'multiplataforma']), representative_seed: rep('Valeria Montes', 'Executiva de vendas para o Brasil', 'objetiva, fala em pacotes e janelas'), confidence: 'alta', notes: 'Memória: estúdio de novelas e séries em espanhol do grupo NBCUniversal (A Rainha do Sul).' },
  { id: 'global_agency', name: 'Global Agency', category: 'novela_turca', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Selin Arslan', 'Diretora de vendas para as Américas', 'enérgica, cria senso de urgência com outras emissoras'), confidence: 'alta', notes: 'Memória: distribuidora turca de dramas para o mundo. Quais títulos ela distribui está indicado em cada título.' },
  { id: 'inter_medya', name: 'Inter Medya', category: 'novela_turca', eras: ['now'], profile: perfil('relacional', ['relacionamento', 'preco']), representative_seed: rep('Kerem Yıldız', 'Vice-presidente de vendas', 'paciente, aposta em parcerias de vários títulos'), confidence: 'alta', notes: 'Web: distribuidora turca com Terra Amarga (Bitter Lands) e Deception no catálogo (https://todotvnews.com/en/inter-medya-strikes-new-international-deals-for-its-turkish-dramas/, https://tvbizzmagazine.com/the-turkish-distributors-bring-their-biggest-hits).' },
  { id: 'madd', name: 'MADD Entertainment', category: 'novela_turca', eras: ['now'], profile: perfil('relacional', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Deniz Kaya', 'Gerente de vendas para a América Latina', 'simpático, fala muito de audiência na Turquia'), confidence: 'alta', notes: 'Web: distribuidora turca com vendas internacionais recentes (https://broadcastprome.com/news/ottvideo-streaming/madd-entertainment-secures-multiple-sales-for-turkish-series-across-cee-cis-and-africa). Os títulos ligados a ela estão com confiança baixa: conferir.' },
  { id: 'kanal_d', name: 'Kanal D International', category: 'novela_turca', eras: ['now'], profile: perfil('leiloeiro', ['preco']), representative_seed: rep('Emre Demir', 'Diretor de vendas internacionais', 'pragmático, quer fechar rápido'), confidence: 'media', notes: 'Memória: braço internacional do canal turco Kanal D. Conferir quais títulos do lote ele distribui.' },
  { id: 'eccho_rights', name: 'Eccho Rights', category: 'novela_turca', eras: ['now'], profile: perfil('relacional', ['preco', 'relacionamento']), representative_seed: rep('Ayla Şahin', 'Gerente de contas para as Américas', 'detalhista, discute cada cláusula'), confidence: 'media', notes: 'Memória: distribuidora com forte catálogo turco. Conferir títulos.' },
  { id: 'cj_enm', name: 'CJ ENM', category: 'asiatico', eras: ['now'], profile: perfil('duro', ['preco', 'multiplataforma']), representative_seed: rep('Min-ji Park', 'Diretora de vendas internacionais', 'formal, preocupada com dublagem e janelas de streaming'), confidence: 'alta', notes: 'Memória: grupo sul-coreano dono do canal tvN e do Studio Dragon (doramas).' },
  { id: 'wbd', name: 'Warner Bros. Discovery', category: 'estudio_eua', eras: ['now'], profile: perfil('duro', ['preco', 'pacote', 'multiplataforma']), representative_seed: rep('Laura Bennett', 'Vice-presidente de vendas de conteúdo para o Brasil', 'firme, vende em pacote e cobra por exibição'), confidence: 'alta', notes: 'Memória: estúdio de cinema e TV (Friends, The Big Bang Theory, Harry Potter). Também detém direitos esportivos (Champions League 2027–2031, seção 8B).' },
  { id: 'disney', name: 'The Walt Disney Company', category: 'estudio_eua', eras: ['now'], profile: perfil('duro', ['preco', 'protecao_de_marca', 'multiplataforma']), representative_seed: rep('Mark Holloway', 'Diretor de distribuição para a TV aberta', 'educado e inflexível com horário e classificação'), confidence: 'alta', notes: 'Memória: estúdios Disney, Pixar e ABC Signature (Lost, Grey’s Anatomy). Prioriza o próprio streaming.' },
  { id: 'nbcu', name: 'NBCUniversal', category: 'estudio_eua', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'pacote']), representative_seed: rep('Jenna Marlowe', 'Executiva de vendas internacionais', 'rápida, gosta de pacotes grandes'), confidence: 'alta', notes: 'Memória: Universal Pictures e Universal Television (The Office, Lei & Ordem: SVU).' },
  { id: 'sony', name: 'Sony Pictures Television', category: 'estudio_eua', eras: ['now'], profile: perfil('relacional', ['preco', 'pacote']), representative_seed: rep('Daniel Cortez', 'Vice-presidente para a América Latina', 'cordial, oferece formatos junto com séries'), confidence: 'alta', notes: 'Memória: séries (Breaking Bad, The Good Doctor) e formatos (Shark Tank).' },
  { id: 'paramount', name: 'Paramount', category: 'estudio_eua', eras: ['now'], profile: perfil('leiloeiro', ['preco', 'pacote']), representative_seed: rep('Rachel Stone', 'Diretora de licenciamento internacional', 'objetiva, negocia por temporada'), confidence: 'media', notes: 'Memória: Paramount Pictures e CBS Studios (CSI). A empresa passou por fusão em 2025; conferir o nome usado em 2026.' },
  { id: 'banijay', name: 'Banijay', category: 'formato', eras: ['now'], profile: perfil('relacional', ['relacionamento', 'preco', 'exclusividade']), representative_seed: rep('Sophie Marchand', 'Diretora de formatos para a América Latina', 'protetora do formato, exige seguir a "bíblia"'), confidence: 'alta', notes: 'Memória: dona da Endemol Shine (Big Brother, MasterChef, Survivor, Deal or No Deal).' },
  { id: 'itv_studios', name: 'ITV Studios', category: 'formato', eras: ['now'], profile: perfil('relacional', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Oliver Grant', 'Vice-presidente de formatos', 'entusiasmado, fala em "temporada de estreia"'), confidence: 'alta', notes: 'Memória: dona da Talpa (The Voice) e de Hell’s Kitchen.' },
  { id: 'fremantle', name: 'Fremantle', category: 'formato', eras: ['now'], profile: perfil('relacional', ['preco', 'exposicao_tv_aberta']), representative_seed: rep('Isabella Romano', 'Diretora de vendas de formatos', 'animada, cita sucessos em vários países'), confidence: 'alta', notes: 'Memória: Got Talent, Idols, The Price Is Right.' },
  { id: 'bbc_studios', name: 'BBC Studios', category: 'formato', eras: ['now'], profile: perfil('duro', ['preco', 'protecao_de_marca']), representative_seed: rep('Henry Ashford', 'Diretor de formatos', 'cerimonioso, exige padrão de produção'), confidence: 'alta', notes: 'Memória: Strictly Come Dancing / Dancing with the Stars.' },
];

// ===== títulos (60) =====
const ga = (genre: string, quality: number, appeal: number, fatigue: number, extra: Record<string, unknown> = {}) => ({ genre, quality, appeal, fatigue, estimativa: true, ...extra });
const t = (id: string, title_br: string, title_original: string | null, kind: string, country: string, holder: string, year: number | null, episodes: number | null, duration: number | null, br: unknown[] | null, attrs: Record<string, unknown>, confidence: Conf, notes: string, from = FROM): TitleSeed => ({
  id, title_br, title_original, kind, country, rights_holder_id: holder, production_year: year, episodes, duration_min: duration, br_history: br,
  available_from: from, available_to: null, game_attrs: attrs, confidence, notes,
});
const MEM_EPS = 'Memória (não conferido na web); número de capítulos aproximado, conferir.';

export const TITLES: TitleSeed[] = [
  // --- novelas mexicanas (TelevisaUnivision; na TV aberta, exclusivas do SBT até o fim do acordo) ---
  t('maria_do_bairro', 'Maria do Bairro', 'María la del Barrio', 'novela', 'México', 'televisa', 1995, 73, 45, [{ emissora: 'sbt', periodo: '1997 e várias reprises' }], ga('novela_19h', 58, 82, 80), 'media', `Clássico do SBT, com muitas reprises (fadiga alta). ${MEM_EPS}`),
  t('marimar', 'Marimar', 'Marimar', 'novela', 'México', 'televisa', 1994, 63, 45, [{ emissora: 'sbt', periodo: '1996 e reprises' }], ga('novela_19h', 55, 78, 75), 'media', MEM_EPS),
  t('a_usurpadora', 'A Usurpadora', 'La usurpadora', 'novela', 'México', 'televisa', 1998, 102, 45, [{ emissora: 'sbt', periodo: '1999 e reprises' }], ga('novela_19h', 60, 84, 82), 'media', `Uma das novelas mexicanas mais reprisadas no Brasil. ${MEM_EPS}`),
  t('rubi', 'Rubi', 'Rubí', 'novela', 'México', 'televisa', 2004, 115, 45, [{ emissora: 'sbt', periodo: 'anos 2000' }], ga('novela_21h', 64, 74, 55), 'media', MEM_EPS),
  t('carrossel_1989', 'Carrossel', 'Carrusel', 'novela', 'México', 'televisa', 1989, 366, 30, [{ emissora: 'sbt', periodo: '1991 e reprises' }], ga('novela_juvenil', 52, 62, 75), 'media', `Novela infantil original (o SBT fez a versão brasileira em 2012). ${MEM_EPS}`),
  t('a_madrasta', 'A Madrasta', 'La madrastra', 'novela', 'México', 'televisa', 2005, 135, 45, [{ emissora: 'sbt', periodo: 'anos 2000' }], ga('novela_19h', 60, 72, 55), 'media', MEM_EPS),
  t('teresa_2010', 'Teresa', 'Teresa', 'novela', 'México', 'televisa', 2010, 152, 45, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('novela_21h', 64, 72, 45), 'media', MEM_EPS),
  t('a_que_nao_podia_amar', 'A Que Não Podia Amar', 'La que no podía amar', 'novela', 'México', 'televisa', 2011, 152, 45, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('novela_19h', 62, 70, 45), 'media', MEM_EPS),
  t('abismo_de_paixao', 'Abismo de Paixão', 'Abismo de pasión', 'novela', 'México', 'televisa', 2012, 161, 45, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('novela_19h', 64, 70, 45), 'media', MEM_EPS),
  t('coracao_indomavel', 'Coração Indomável', 'Corazón indomable', 'novela', 'México', 'televisa', 2013, 147, 45, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('novela_19h', 60, 74, 50), 'media', `Remake de Marimar. ${MEM_EPS}`),
  t('o_que_a_vida_me_roubou', 'O Que a Vida Me Roubou', 'Lo que la vida me robó', 'novela', 'México', 'televisa', 2013, 191, 45, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('novela_21h', 70, 76, 45), 'media', MEM_EPS),
  t('chaves', 'Chaves', 'El Chavo del Ocho', 'serie', 'México', 'grupo_chespirito', 1973, 290, 25, [{ emissora: 'sbt', periodo: 'desde 1984, com pausas' }], ga('humoristico', 70, 80, 85, { rating: 'L' }), 'media', 'Memória: série de humor exibida pelo SBT por décadas; ficou fora do ar no Brasil durante uma disputa de direitos. Conferir a situação em 2026 e o número de episódios.'),
  // --- novelas e séries latinas (Colômbia / Telemundo) ---
  t('betty_a_feia', 'Betty, a Feia', 'Yo soy Betty, la fea', 'novela', 'Colômbia', 'rcn', 1999, 335, 45, [{ emissora: 'redetv', periodo: 'anos 2000' }], ga('novela_19h', 80, 80, 50), 'media', `Considerada uma das novelas mais bem-sucedidas do mundo. ${MEM_EPS}`),
  t('cafe_com_aroma_de_mulher', 'Café com Aroma de Mulher', 'Café con aroma de mujer', 'novela', 'Colômbia', 'rcn', 2021, 89, 45, [{ emissora: 'band', periodo: 'até set/2025, às 20h30' }], ga('novela_21h', 72, 74, 35), 'media', 'Web: a Band exibia a novela às 20h30 até a estreia de Cruel Istambul em 08/09/2025 (https://www.band.com.br/band-vale/noticias/novela-turca-cruel-istambul-estreia-na-band-nesta-segunda-feira-8-202509081216). Produtora (RCN, com Telemundo) e capítulos: memória, conferir.'),
  t('o_patrao_do_mal', 'Pablo Escobar: O Patrão do Mal', 'Escobar, el patrón del mal', 'serie', 'Colômbia', 'caracol', 2012, 113, 45, null, ga('serie_estrangeira', 80, 68, 20, { rating: '16' }), 'media', MEM_EPS),
  t('a_rainha_do_sul', 'A Rainha do Sul', 'La Reina del Sur', 'serie', 'EUA/México', 'telemundo', 2011, 63, 45, null, ga('serie_estrangeira', 74, 70, 15, { rating: '16' }), 'media', MEM_EPS),
  t('paixao_de_gavioes', 'Paixão de Gavilanes', 'Pasión de gavilanes', 'novela', 'Colômbia', 'telemundo', 2003, 188, 45, null, ga('novela_21h', 68, 72, 30), 'baixa', 'Memória: produtora e distribuidora (Telemundo/Caracol/RTI) a confirmar; exibição no Brasil a confirmar.'),
  // --- novelas turcas ---
  t('mil_e_uma_noites', 'Mil e Uma Noites', 'Binbir Gece', 'novela', 'Turquia', 'global_agency', 2006, 90, 90, [{ emissora: 'band', periodo: '2015' }], ga('novela_21h', 72, 76, 35), 'media', 'Memória: a primeira novela turca de grande sucesso na TV aberta brasileira (Band). Duração dos capítulos varia conforme a edição; conferir distribuidora.'),
  t('fatmagul', 'Fatmagül', "Fatmagül'ün Suçu Ne?", 'novela', 'Turquia', 'global_agency', 2010, 80, 90, [{ emissora: 'band', periodo: 'anos 2010' }], ga('novela_21h', 78, 74, 35, { rating: '14' }), 'baixa', 'Memória: exibida pela Band; a distribuidora internacional (aqui Global Agency) precisa ser conferida.'),
  t('mae_anne', 'Mãe', 'Anne', 'novela', 'Turquia', 'madd', 2016, 81, 60, [{ emissora: 'record', periodo: 'desde out/2025, às 21h' }], ga('novela_21h', 76, 74, 10), 'media', 'Web: a Record estreou “Mãe” às 21h no lugar de “A Vida de Jó”, contra “Três Graças” (https://istoe.com.br/mae-nova-novela-turca-da-record-chega-para-disputar-com-tres-gracas-da-globo). Distribuidora (MADD) e capítulos: memória, conferir.'),
  t('forca_de_mulher', 'Força de Mulher', 'Kadın', 'novela', 'Turquia', 'madd', 2017, 81, 90, [{ emissora: 'record', periodo: 'anos 2020' }], ga('novela_21h', 76, 74, 25), 'baixa', 'Memória: sucesso turco da Record antes de “Mãe”. Distribuidora e período de exibição a conferir.'),
  t('cruel_istambul', 'Cruel Istambul', 'Zalim İstanbul', 'novela', 'Turquia', 'kanal_d', 2019, 39, 120, [{ emissora: 'band', periodo: 'desde 08/09/2025, às 20h30' }], ga('novela_21h', 70, 70, 10), 'media', 'Web: estreou na Band em 08/09/2025, às 20h30, de segunda a sexta (https://www.band.com.br/band-vale/noticias/novela-turca-cruel-istambul-estreia-na-band-nesta-segunda-feira-8-202509081216; https://senalnews.com/es/contenidos/band-adquirio-los-derechos-del-drama-turco-zalim-istanbul). Distribuidora (Kanal D) e capítulos: memória, conferir.'),
  t('guerra_das_rosas', 'Guerra das Rosas', null, 'novela', 'Turquia', 'kanal_d', null, null, 90, [{ emissora: 'band', periodo: 'desde mar/2026, às 20h30' }], ga('novela_21h', 66, 66, 0), 'baixa', 'Web: a Band estreou “Guerra das Rosas” em março de 2026 (https://gameoverdrive.com.br/novelas-turcas-record-band-2026/). Título original, ano, capítulos e distribuidora não confirmados.'),
  t('terra_amarga', 'Terra Amarga', 'Bir Zamanlar Çukurova', 'novela', 'Turquia', 'inter_medya', 2018, 144, 120, null, ga('novela_21h', 78, 72, 0), 'media', 'Web: distribuída pela Inter Medya como “Bitter Lands”, sucesso na Itália (https://todotvnews.com/en/inter-medya-strikes-new-international-deals-for-its-turkish-dramas/). Exibição na TV aberta brasileira não confirmada; capítulos: memória.'),
  t('kara_sevda', 'Kara Sevda', 'Kara Sevda', 'novela', 'Turquia', 'inter_medya', 2015, 74, 120, null, ga('novela_21h', 80, 74, 0), 'media', 'Memória: drama turco premiado internacionalmente (Endless Love); distribuidora e título no Brasil a conferir.'),
  t('ezel', 'Ezel', 'Ezel', 'novela', 'Turquia', 'eccho_rights', 2009, 71, 90, null, ga('novela_21h', 80, 66, 0, { rating: '14' }), 'baixa', 'Memória: thriller turco de vingança. Distribuidora e capítulos a conferir.'),
  t('doutor_milagre', 'Doutor Milagre', 'Mucize Doktor', 'novela', 'Turquia', 'madd', 2019, 62, 120, null, ga('novela_21h', 74, 70, 0), 'baixa', 'Web: “Doutor Milagre” aparece entre as turcas previstas pela Record para 2026–2027 (https://www.dgabc.com.br/Noticia/4341555/record-define-a-sua-dramaturgia-para-2026-e-2027). Título original, distribuidora e capítulos: memória, conferir.'),
  t('minha_menina', 'Minha Menina', 'Kızım', 'novela', 'Turquia', 'global_agency', 2018, 40, 120, null, ga('novela_21h', 70, 70, 0), 'baixa', 'Web: “My Little Girl” aparece entre as turcas previstas pela Record (https://www.dgabc.com.br/Noticia/4341555/record-define-a-sua-dramaturgia-para-2026-e-2027). Título original, título em português, distribuidora e capítulos: a conferir.'),
  // --- doramas ---
  t('pousando_no_amor', 'Pousando no Amor', 'Sarangui Bulsichak (Crash Landing on You)', 'serie', 'Coreia do Sul', 'cj_enm', 2019, 16, 70, null, ga('serie_estrangeira', 85, 62, 0), 'media', 'Memória: dorama do tvN, popular no Brasil pelo streaming. Direitos de TV aberta no Brasil a conferir.'),
  t('goblin', 'Goblin', 'Dokkaebi', 'serie', 'Coreia do Sul', 'cj_enm', 2016, 16, 70, null, ga('serie_estrangeira', 84, 58, 0), 'media', 'Memória: dorama do tvN. Direitos de TV aberta no Brasil a conferir.'),
  // --- séries americanas ---
  t('friends', 'Friends', 'Friends', 'serie', 'EUA', 'wbd', 1994, 236, 22, null, ga('serie_estrangeira', 85, 76, 60), 'alta', 'Memória: 10 temporadas, 236 episódios; muito reprisada no mundo todo.'),
  t('big_bang_theory', 'The Big Bang Theory', 'The Big Bang Theory', 'serie', 'EUA', 'wbd', 2007, 279, 22, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('serie_estrangeira', 80, 74, 50), 'media', 'Memória: 12 temporadas, 279 episódios. Exibição no SBT a conferir.'),
  t('dois_homens_e_meio', 'Dois Homens e Meio', 'Two and a Half Men', 'serie', 'EUA', 'wbd', 2003, 262, 22, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('serie_estrangeira', 70, 70, 55), 'media', 'Memória: 12 temporadas, 262 episódios. Exibição no SBT a conferir.'),
  t('sobrenatural', 'Sobrenatural', 'Supernatural', 'serie', 'EUA', 'wbd', 2005, 327, 42, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('serie_estrangeira', 72, 62, 45, { rating: '14' }), 'media', 'Memória: 15 temporadas, 327 episódios. Exibição no SBT a conferir.'),
  t('lost', 'Lost', 'Lost', 'serie', 'EUA', 'disney', 2004, 121, 42, [{ emissora: 'globo', periodo: 'anos 2000' }], ga('serie_estrangeira', 85, 66, 40, { rating: '12' }), 'media', 'Memória: 6 temporadas, 121 episódios. Exibição na Globo a conferir.'),
  t('greys_anatomy', 'Grey’s Anatomy', "Grey's Anatomy", 'serie', 'EUA', 'disney', 2005, 440, 42, null, ga('serie_estrangeira', 78, 68, 35, { rating: '14' }), 'media', 'Memória: série ainda em produção; número de episódios aproximado em 2026.'),
  t('donas_de_casa_desesperadas', 'Donas de Casa Desesperadas', 'Desperate Housewives', 'serie', 'EUA', 'disney', 2004, 180, 42, null, ga('serie_estrangeira', 78, 66, 40, { rating: '12' }), 'media', 'Memória: 8 temporadas, 180 episódios. Exibição na TV aberta brasileira a conferir.'),
  t('the_office', 'The Office', 'The Office', 'serie', 'EUA', 'nbcu', 2005, 201, 22, null, ga('serie_estrangeira', 84, 58, 20), 'alta', 'Memória: versão americana, 9 temporadas, 201 episódios.'),
  t('lei_e_ordem_svu', 'Lei & Ordem: Unidade de Vítimas Especiais', 'Law & Order: Special Victims Unit', 'serie', 'EUA', 'nbcu', 1999, 560, 42, null, ga('serie_estrangeira', 74, 60, 30, { rating: '14' }), 'media', 'Memória: série ainda em produção; número de episódios aproximado.'),
  t('csi', 'CSI: Investigação Criminal', 'CSI: Crime Scene Investigation', 'serie', 'EUA', 'paramount', 2000, 337, 42, [{ emissora: 'record', periodo: 'anos 2000' }], ga('serie_estrangeira', 76, 66, 40, { rating: '14' }), 'media', 'Memória: 15 temporadas, 337 episódios. Exibição na Record a conferir.'),
  t('the_good_doctor', 'The Good Doctor: O Bom Doutor', 'The Good Doctor', 'serie', 'EUA', 'sony', 2017, 126, 42, [{ emissora: 'globo', periodo: 'anos 2010/2020' }], ga('serie_estrangeira', 78, 70, 30), 'media', 'Memória: 7 temporadas, 126 episódios. Exibição na Globo a conferir.'),
  t('breaking_bad', 'Breaking Bad', 'Breaking Bad', 'serie', 'EUA', 'sony', 2008, 62, 47, null, ga('serie_estrangeira', 95, 56, 10, { rating: '16' }), 'alta', 'Memória: 5 temporadas, 62 episódios. Classificação alta limita o horário na TV aberta.'),
  // --- filmes ---
  t('pacote_warner', 'Pacote de filmes Warner', null, 'pacote_filmes', 'EUA', 'wbd', null, 20, 110, null, ga('filme', 72, 70, 30, { exibicoes_por_titulo: 3 }), 'media', 'Pacote genérico de catálogo; os filmes do pacote serão listados num lote futuro.'),
  t('saga_harry_potter', 'Saga Harry Potter (8 filmes)', 'Harry Potter', 'pacote_filmes', 'Reino Unido/EUA', 'wbd', 2001, 8, 150, [{ emissora: 'globo', periodo: 'anos 2000/2010' }], ga('filme', 85, 84, 45, { exibicoes_por_titulo: 3 }), 'media', 'Memória: oito filmes (2001–2011). Exibições anteriores na TV aberta a conferir.'),
  t('pacote_disney_animacoes', 'Pacote de animações Disney e Pixar', null, 'pacote_filmes', 'EUA', 'disney', null, 15, 100, null, ga('filme', 82, 80, 30, { exibicoes_por_titulo: 3, rating: 'L' }), 'media', 'Pacote genérico de catálogo; a Disney prioriza o próprio streaming (janela de TV aberta restrita).'),
  t('pacote_universal_acao', 'Pacote de ação Universal', null, 'pacote_filmes', 'EUA', 'nbcu', null, 15, 120, null, ga('filme', 72, 76, 35, { exibicoes_por_titulo: 3, rating: '14' }), 'media', 'Pacote genérico de catálogo (ex.: franquias de ação do estúdio).'),
  t('pacote_sony', 'Pacote de sucessos Sony', null, 'pacote_filmes', 'EUA', 'sony', null, 15, 115, null, ga('filme', 72, 74, 30, { exibicoes_por_titulo: 3 }), 'media', 'Pacote genérico de catálogo.'),
  t('pacote_paramount', 'Pacote de filmes Paramount', null, 'pacote_filmes', 'EUA', 'paramount', null, 15, 115, null, ga('filme', 72, 72, 30, { exibicoes_por_titulo: 3 }), 'media', 'Pacote genérico de catálogo.'),
  // --- formatos ---
  t('big_brother', 'Big Brother (formato)', 'Big Brother', 'formato', 'Holanda', 'banijay', 1999, 100, 60, [{ emissora: 'globo', periodo: 'desde 2002 (BBB); BBB 26 estreou em 12/01/2026' }], ga('reality', 80, 88, 30), 'alta', 'Web: BBB 26 estreou em 12/01/2026, depois da novela das nove (https://www.bnewssaopaulo.com.br/noticias/entretenimento/que-horas-comeca-o-bbb-26-hoje-segunda-feira-12.html). Formato da Endemol, hoje Banijay (memória). Episódios = programas por temporada (estimativa).'),
  t('masterchef', 'MasterChef (formato)', 'MasterChef', 'formato', 'Reino Unido', 'banijay', 1990, 20, 120, [{ emissora: 'band', periodo: 'desde 2014' }], ga('reality', 78, 72, 30), 'alta', 'Memória: MasterChef Brasil na Band desde 2014; formato hoje da Banijay (via Endemol Shine). Episódios = programas por temporada (estimativa).'),
  t('a_fazenda', 'A Fazenda (formato The Farm)', 'The Farm', 'formato', 'Suécia', 'banijay', 2001, 90, 75, [{ emissora: 'record', periodo: 'desde 2009' }], ga('reality', 66, 74, 35), 'media', 'Memória: A Fazenda na Record desde 2009, baseada no formato sueco The Farm (Strix, hoje no grupo Banijay). Conferir o licenciador atual.'),
  t('survivor', 'Survivor (formato)', 'Survivor', 'formato', 'Reino Unido', 'banijay', 1997, 20, 75, [{ emissora: 'globo', periodo: 'No Limite, desde 2000' }], ga('reality', 74, 66, 25), 'media', 'Memória: no Brasil virou “No Limite” (Globo). Formato Castaway, hoje Banijay; conferir.'),
  t('topa_ou_nao_topa', 'Deal or No Deal (formato)', 'Deal or No Deal', 'formato', 'Holanda', 'banijay', 2002, 40, 60, [{ emissora: 'sbt', periodo: 'Topa ou Não Topa, anos 2000' }], ga('game_show', 62, 66, 30), 'media', 'Memória: “Topa ou Não Topa” no SBT. Formato da Endemol, hoje Banijay.'),
  t('the_voice', 'The Voice (formato)', 'The Voice', 'formato', 'Holanda', 'itv_studios', 2010, 15, 120, [{ emissora: 'globo', periodo: 'The Voice Brasil, desde 2012' }], ga('talent_show', 78, 70, 40), 'media', 'Memória: formato da Talpa (ITV Studios). The Voice Brasil estreou na Globo em 2012; conferir quem tinha o formato em 2026.'),
  t('hells_kitchen', 'Hell’s Kitchen (formato)', "Hell's Kitchen", 'formato', 'Reino Unido', 'itv_studios', 2004, 15, 90, [{ emissora: 'sbt', periodo: 'anos 2010' }], ga('reality', 70, 64, 25), 'media', 'Memória: versão brasileira exibida pelo SBT; conferir o ano.'),
  t('got_talent', 'Got Talent (formato)', "Got Talent", 'formato', 'Reino Unido', 'fremantle', 2006, 15, 120, [{ emissora: 'record', periodo: 'anos 2010' }], ga('talent_show', 74, 70, 25), 'media', 'Memória: versão brasileira exibida pela Record; conferir.'),
  t('idols', 'Idols (formato)', 'Idols', 'formato', 'Reino Unido', 'fremantle', 2001, 20, 90, [{ emissora: 'sbt', periodo: 'Ídolos, 2006' }, { emissora: 'record', periodo: 'Ídolos, 2008–2012' }], ga('talent_show', 70, 66, 30), 'media', 'Memória: “Ídolos” no SBT e depois na Record.'),
  t('o_preco_certo', 'The Price Is Right (formato)', 'The Price Is Right', 'formato', 'EUA', 'fremantle', 1972, 100, 45, null, ga('game_show', 62, 64, 20), 'baixa', 'Memória: game show clássico; versões brasileiras e licenciamento a conferir.'),
  t('shark_tank', 'Shark Tank (formato)', 'Shark Tank / Dragons’ Den', 'formato', 'Japão', 'sony', 2001, 15, 60, null, ga('reality', 70, 58, 20), 'media', 'Memória: formato distribuído pela Sony; “Shark Tank Brasil” teve exibição na TV paga e aberta, conferir.'),
  t('dancing_with_the_stars', 'Dancing with the Stars (formato)', 'Strictly Come Dancing', 'formato', 'Reino Unido', 'bbc_studios', 2004, 15, 120, null, ga('talent_show', 74, 68, 30), 'baixa', 'Memória: formato da BBC. No Brasil existem competições de dança em programas de auditório; licenciamento a conferir.'),
];

// ===== grades típicas de janeiro de 2026 (a partir de 12/01). Horários aproximados (precisão de faixa) =====
const s = (dias: string, inicio: string, fim: string, titulo: string, genero: string, extra: Partial<Slot> = {}): Slot => ({ dias, inicio, fim, titulo, genero, ...extra });

export const GRIDS: GridSeed[] = [
  {
    station_key: 'globo', confidence: 'media',
    notes: 'Web: “Êta Mundo Melhor!” às 18h até 13/03/2026 (https://www.bnewssaopaulo.com.br/noticias/entretenimento/globo-define-datas-veja-quando-termina-eta-mundo-melhor-e-estreia-a-nobreza-do-amor.html); “Coração Acelerado” às 19h40 desde 12/01/2026 (https://istoe.com.br/coracao-acelerado-estreia-com-homenagem-a-marilia-mendonca); “Três Graças” às 21h20 até 15/05/2026 (https://www.opovo.com.br/vidaearte/2026/05/15/tres-gracas-termina-como-o-grande-acerto-da-teledramaturgia-na-decada.html); BBB 26 depois da novela das nove desde 12/01/2026. Demais faixas: memória, horários aproximados.',
    slots: [
      s('seg-sex', '04:00', '06:00', 'Hora 1', 'telejornal'),
      s('seg-sex', '06:00', '08:30', 'Bom Dia Praça (local)', 'janela_local'),
      s('seg-sex', '08:30', '09:30', 'Bom Dia Brasil', 'telejornal'),
      s('seg-sex', '09:30', '10:45', 'Mais Você', 'feminino'),
      s('seg-sex', '10:45', '12:00', 'Encontro', 'revista_eletronica'),
      s('seg-sex', '12:00', '12:45', 'Praça TV 1ª edição (local)', 'janela_local'),
      s('seg-sex', '12:45', '13:20', 'Globo Esporte', 'mesa_redonda'),
      s('seg-sex', '13:20', '14:00', 'Jornal Hoje', 'telejornal'),
      s('seg-sex', '14:00', '15:00', 'Edição Especial (reprise de novela)', 'novela_18h', { nota: 'ordem e título da reprise a conferir' }),
      s('seg-sex', '15:00', '16:30', 'Vale a Pena Ver de Novo', 'novela_19h', { nota: 'título da reprise em jan/2026 não confirmado; “A Viagem” saiu em nov/2025 (https://oantagonista.com.br/ladooa/entretenimento/qual-sera-a-proxima-novela-do-vale-a-pena-ver-de-novo/)' }),
      s('seg-sex', '16:30', '18:00', 'Sessão da Tarde', 'filme'),
      s('seg-sex', '18:00', '18:25', 'Praça TV (local)', 'janela_local', { nota: 'faixa aproximada' }),
      s('seg-sex', '18:25', '19:10', 'Êta Mundo Melhor!', 'novela_18h'),
      s('seg-sex', '19:10', '19:40', 'Praça TV 2ª edição (local)', 'janela_local'),
      s('seg-sex', '19:40', '20:30', 'Coração Acelerado', 'novela_19h'),
      s('seg-sex', '20:30', '21:20', 'Jornal Nacional', 'telejornal'),
      s('seg-sex', '21:20', '22:25', 'Três Graças', 'novela_21h'),
      s('seg-sex', '22:25', '23:40', 'Big Brother Brasil 26', 'reality', { catalog_title_id: 'big_brother' }),
      s('seg-sex', '23:40', '00:30', 'Jornal da Globo', 'telejornal'),
      s('seg-sex', '00:30', '04:00', 'Filmes da madrugada', 'filme'),
      s('sab', '14:30', '17:30', 'Caldeirão com Mion', 'auditorio'),
      s('sab', '22:25', '23:30', 'Big Brother Brasil 26', 'reality', { catalog_title_id: 'big_brother' }),
      s('sab', '23:30', '01:00', 'Altas Horas', 'talk_show'),
      s('dom', '08:00', '11:00', 'Esporte Espetacular', 'mesa_redonda'),
      s('dom', '13:00', '15:00', 'Temperatura Máxima', 'filme'),
      s('dom', '15:00', '20:00', 'Domingão com Huck', 'auditorio', { nota: 'horário aproximado' }),
      s('dom', '20:00', '22:45', 'Fantástico', 'revista_eletronica'),
      s('dom', '22:45', '23:50', 'Big Brother Brasil 26', 'reality', { catalog_title_id: 'big_brother' }),
    ],
  },
  {
    station_key: 'sbt', reference_month: '2026-10', confidence: 'alta',
    notes: 'Web: programação oficial do SBT (https://tv.sbt.com.br/programacao), semana de 12 a 18/10/2026, consultada em 16/10/2026. Diferente das outras três grades (jan/2026), esta é de OUTUBRO de 2026: em janeiro o SBT ainda exibia outra novela às 20h45 (“Presente de Amor”). O Horário Eleitoral (13h e 20h30, que corta o SBT Brasil em outubro) foi deixado fora: o jogo o aplica sozinho em anos de eleição. Futebol de terça (Champions e Sul-Americana) muda conforme a rodada.',
    slots: [
      s('seg-sex', '06:00', '08:30', 'Se Liga, Brasil', 'revista_eletronica'),
      s('seg-sex', '08:30', '12:40', 'Primeiro Impacto', 'telejornal'),
      s('seg-sex', '12:40', '13:45', 'Chaves', 'humoristico', { catalog_title_id: 'chaves' }),
      s('seg-sex', '13:45', '14:30', 'Marisol', 'novela_18h', { nota: 'novela mexicana em reprise; ainda não está no catálogo; às terças vai até 14h15' }),
      s('seg-sex', '14:30', '15:30', 'A Desalmada', 'novela_19h', { nota: 'novela mexicana; ainda não está no catálogo; às terças 14h15–15h' }),
      s('seg-sex', '15:30', '17:00', 'Fofocalizando', 'revista_eletronica', { nota: 'às terças 15h–15h45' }),
      s('seg-sex', '17:00', '18:15', 'O Que a Vida Me Roubou', 'novela_21h', { catalog_title_id: 'o_que_a_vida_me_roubou', nota: 'às terças dá lugar à Champions League' }),
      s('seg-sex', '18:15', '19:45', 'SBT Cidades (local)', 'janela_local', { nota: 'às terças a partir das 18h' }),
      s('seg-sex', '19:45', '20:55', 'SBT Brasil', 'telejornal'),
      s('seg-sex', '20:55', '21:45', 'Amor Valente', 'novela_21h', { nota: 'novela mexicana; ainda não está no catálogo; termina entre 21h15 e 22h conforme o dia' }),
      s('ter', '15:45', '18:00', 'UEFA Champions League', 'futebol', { nota: 'em semana de rodada; direitos sublicenciados da Warner (seção 8C.2)' }),
      s('ter', '21:15', '23:15', 'Copa Sul-Americana', 'futebol', { nota: 'em semana de rodada' }),
      s('qua,sex', '21:30', '22:00', 'Sessão +SBT', 'filme', { nota: 'quarta 21h45–22h15' }),
      s('seg,qui,sex', '22:00', '23:15', 'Programa do Ratinho', 'auditorio', { nota: 'segunda até 23h; quarta 22h15–23h45; terça depois do futebol' }),
      s('seg', '23:00', '00:00', 'Galvão F.C.', 'mesa_redonda'),
      s('qui', '23:15', '00:45', 'A Praça é Nossa', 'humoristico'),
      s('sex', '23:15', '00:15', 'Discovery Apresenta', 'documentario'),
      s('seg-sex', '00:00', '01:00', 'The Noite com Danilo Gentili', 'talk_show', { nota: 'começa entre 23h45 e 00h45 conforme o dia' }),
      s('seg,qua,sex', '01:00', '01:45', 'Operação Mesquita', 'documentario', { nota: 'gênero a conferir' }),
      s('seg-sex', '01:45', '02:30', 'SBT Notícias', 'telejornal'),
      s('sab', '07:00', '11:00', 'Sábado Animado', 'infantil'),
      s('sab', '11:00', '12:40', 'SBT Notícias', 'telejornal'),
      s('sab', '12:40', '14:00', 'Clube do Chaves', 'humoristico', { catalog_title_id: 'chaves' }),
      s('sab', '14:00', '15:00', 'Eita Lucas!', 'auditorio'),
      s('sab', '15:00', '17:45', 'Sessão +SBT Show', 'filme'),
      s('sab', '17:45', '19:20', 'Sabadão de Todos', 'auditorio'),
      s('sab', '19:20', '19:45', 'SBT Cidades (local)', 'janela_local'),
      s('sab', '19:45', '20:55', 'SBT Brasil', 'telejornal'),
      s('sab', '20:55', '21:15', 'Sessão +SBT', 'filme'),
      s('sab', '21:15', '22:30', 'Bake Off Brasil - Mão na Massa', 'reality'),
      s('sab', '22:30', '00:45', 'Viva a Noite', 'auditorio'),
      s('dom', '07:00', '07:30', 'Pé na Estrada', 'revista_eletronica'),
      s('dom', '07:30', '08:30', 'SBT Sports', 'mesa_redonda'),
      s('dom', '08:30', '09:30', 'Webmotors e Box Aberto', 'revista_eletronica'),
      s('dom', '09:30', '10:10', 'Chaves', 'humoristico', { catalog_title_id: 'chaves' }),
      s('dom', '10:10', '11:00', 'Notícias Impressionantes', 'revista_eletronica'),
      s('dom', '11:00', '11:15', 'Telesena', 'game_show'),
      s('dom', '11:15', '18:00', 'Domingo Legal', 'auditorio'),
      s('dom', '18:00', '19:00', 'The Voice Brasil', 'talent_show', { catalog_title_id: 'the_voice' }),
      s('dom', '19:00', '00:00', 'Programa Silvio Santos', 'auditorio'),
      s('dom', '00:00', '01:00', 'Comédia SBT', 'humoristico'),
    ],
  },
  {
    station_key: 'record', confidence: 'media',
    notes: 'Web: “Mãe” (turca) às 21h, no lugar de “A Vida de Jó”, desde out/2025 (https://istoe.com.br/mae-nova-novela-turca-da-record-chega-para-disputar-com-tres-gracas-da-globo); bíblicas e turcas são os pilares da dramaturgia em 2026 (https://www.dgabc.com.br/Noticia/4341555/record-define-a-sua-dramaturgia-para-2026-e-2027). Demais faixas: memória, horários aproximados.',
    slots: [
      s('seg-sex', '05:00', '06:00', 'Fala Brasil', 'telejornal', { nota: 'horário a conferir' }),
      s('seg-sex', '06:00', '08:30', 'Balanço Geral Manhã (local)', 'janela_local'),
      s('seg-sex', '08:30', '12:00', 'Hoje em Dia', 'revista_eletronica'),
      s('seg-sex', '12:00', '15:00', 'Balanço Geral (local)', 'janela_local'),
      s('seg-sex', '15:00', '16:45', 'Reprise de novela / filme', 'novela_biblica', { nota: 'título não confirmado' }),
      s('seg-sex', '16:45', '19:45', 'Cidade Alerta', 'policial'),
      s('seg-sex', '19:45', '21:00', 'Jornal da Record', 'telejornal'),
      s('seg-sex', '21:00', '22:00', 'Mãe', 'novela_21h', { catalog_title_id: 'mae_anne' }),
      s('seg-sex', '22:00', '23:30', 'Séries e filmes', 'serie_estrangeira', { nota: 'faixa não confirmada' }),
      s('dom', '19:30', '22:30', 'Domingo Espetacular', 'revista_eletronica'),
    ],
  },
  {
    station_key: 'band', confidence: 'media',
    notes: 'Web: “Cruel Istambul” às 20h30, de segunda a sexta, desde 08/09/2025, depois do Jornal da Band (https://www.band.com.br/band-vale/noticias/novela-turca-cruel-istambul-estreia-na-band-nesta-segunda-feira-8-202509081216); pré-grade de 2026 com jornais, esportivos diários e “Melhor da Tarde” (https://www.bemparana.com.br/publicacao/colunas/tv-canal-1/band-se-reorganiza-e-tenta-se-reinventar-para-2026/). Horários das demais faixas: memória.',
    slots: [
      s('seg-sex', '06:00', '07:30', 'Primeiro Jornal', 'telejornal'),
      s('seg-sex', '07:30', '10:00', 'Bora Brasil', 'revista_eletronica', { nota: 'conferir' }),
      s('seg-sex', '10:00', '12:00', 'Jogo Aberto', 'mesa_redonda'),
      s('seg-sex', '12:00', '13:00', 'Jornal local', 'janela_local'),
      s('seg-sex', '13:00', '14:00', 'Os Donos da Bola', 'mesa_redonda'),
      s('seg-sex', '14:00', '16:45', 'Melhor da Tarde', 'revista_eletronica'),
      s('seg-sex', '16:45', '19:20', 'Brasil Urgente', 'policial'),
      s('seg-sex', '19:20', '20:30', 'Jornal da Band', 'telejornal'),
      s('seg-sex', '20:30', '21:30', 'Cruel Istambul', 'novela_21h', { catalog_title_id: 'cruel_istambul' }),
      s('seg', '22:30', '23:45', 'CQC', 'humoristico', { nota: 'previsto na pré-grade de nov/2025; estreia não confirmada' }),
      s('dom', '10:00', '13:00', 'Show do Esporte', 'mesa_redonda', { nota: 'conferir' }),
    ],
  },
];

// ===== direitos e exclusividades na largada (seção 8A.6) =====
export const RIGHTS: RightSeed[] = [
  { id: 2601, product_ref: 'televisa', holder_station_key: 'sbt', terms: { escopo: 'novelas da TelevisaUnivision', exclusividade: 'tv_aberta', renovacao: 'preferencial' }, valid_from: '2023-01-01', valid_to: '2028-12-31', confidence: 'media', notes: 'Web: acordo estendido por cinco anos em 2023 (Meio & Mensagem). Datas de início e fim aproximadas; conferir.' },
  { id: 2602, product_ref: 'mae_anne', holder_station_key: 'record', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2025-10-01', valid_to: null, confidence: 'media', notes: 'Web: em exibição na Record às 21h desde out/2025. Termos do contrato: estimativa.' },
  { id: 2603, product_ref: 'cruel_istambul', holder_station_key: 'band', terms: { exclusividade: 'tv_aberta', plataformas: ['tv_aberta'] }, valid_from: '2025-09-08', valid_to: null, confidence: 'media', notes: 'Web: a Band comprou os direitos de Zalim İstanbul (Señal News) e estreou em 08/09/2025. Termos: estimativa.' },
  { id: 2604, product_ref: 'big_brother', holder_station_key: 'globo', terms: { exclusividade: 'formato_brasil', plataformas: ['tv_aberta', 'streaming_proprio'] }, valid_from: '2002-01-01', valid_to: null, confidence: 'alta', notes: 'Web: BBB 26 na Globo desde 12/01/2026. Duração do contrato: estimativa.' },
  { id: 2605, product_ref: 'masterchef', holder_station_key: 'band', terms: { exclusividade: 'formato_brasil' }, valid_from: '2014-01-01', valid_to: null, confidence: 'media', notes: 'Memória: MasterChef Brasil na Band desde 2014.' },
  { id: 2606, product_ref: 'a_fazenda', holder_station_key: 'record', terms: { exclusividade: 'formato_brasil' }, valid_from: '2009-01-01', valid_to: null, confidence: 'media', notes: 'Memória: A Fazenda na Record desde 2009.' },
  { id: 2607, product_ref: 'novelas_turcas', holder_station_key: 'record', terms: { tipo: 'relacionamento', descricao: 'as distribuidoras turcas têm relação forte com a Record, mas vendem títulos avulsos a quem pagar' }, valid_from: null, valid_to: null, confidence: 'media', notes: 'Documento-mestre, seção 8A.6 (Diário do Grande ABC). Não é contrato: é a relação de mercado que a Fase 6.3 usa no relacionamento inicial.' },
];
