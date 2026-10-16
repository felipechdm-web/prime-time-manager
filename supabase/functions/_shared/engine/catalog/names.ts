// Geradores de nomes fictícios: programas, pessoas, emissoras, anunciantes e colunas.
// Tudo inventado; nomes de pessoas reais e títulos famosos foram evitados de propósito.

import type { EraId, GenreId } from '../types.ts';
import type { Rng } from '../rng.ts';

const NOVELA_A = ['Coração', 'Laços', 'Sol', 'Rosa', 'Cidade', 'Flor', 'Sangue', 'Terra', 'Mar', 'Céu', 'Noite', 'Fogo', 'Lua', 'Vento', 'Ouro', 'Rio', 'Caminho', 'Segredo', 'Promessa', 'Destino', 'Jardim', 'Estrada', 'Pele', 'Alma', 'Véu', 'Espelho', 'Sombra'];
const NOVELA_B = ['Pedra', 'Areia', 'Inverno', 'Ferro', 'Vidro', 'Sal', 'Rei', 'Ninguém', 'Cristal', 'Prata', 'Seda', 'Verão', 'Gelo', 'Mel', 'Barro', 'Ouro', 'Outono', 'Neblina', 'Cetim', 'Granito', 'Marfim', 'Algodão', 'Brasa', 'Orvalho'];
const NOVELA_SINGLE = ['A Herdeira', 'O Forasteiro', 'Paixão Proibida', 'Doce Vingança', 'Amor Bandido', 'Herança Maldita', 'Os Inocentes', 'A Dama do Cais', 'O Último Barão', 'Filhos da Serra', 'A Moça do Sobrado', 'Tempestade de Verão', 'Contra a Maré', 'Duas Vidas', 'A Promessa do Coronel', 'Gente Fina', 'O Retorno de Lia', 'Fronteira do Sul', 'Cais do Porto', 'A Noiva do Vale'];
const JUVENIL = ['Turma do Colégio', 'Recreio Geral', 'Geração Verão', 'A Galera', 'Último Ano', 'Intervalo', 'Mochila nas Costas', 'Colégio Esperança', 'Férias Sem Fim', 'Patota'];
const BIBLICA = ['Os Profetas', 'Reis de Judá', 'A Rainha do Deserto', 'Os Juízes', 'O Templo', 'Rute, a Estrangeira', 'Sansão e o Leão', 'A Arca', 'Terra de Canaã', 'Os Doze Filhos'];
const SERIE = ['Plantão Noturno', 'Delegacia 13', 'Família Moreira', 'Cidade Alta', 'Bairro Novo', 'Segunda Chance', 'Prova de Fogo', 'A Vizinhança', 'Contos da Cidade', 'Hospital Geral', 'Os Advogados', 'Rua das Laranjeiras', 'Turno da Noite', 'Confissões'];
const HUMOR = ['Sábado Engraçado', 'Escolinha do Riso', 'Os Trapaceiros', 'Turma da Gargalhada', 'Bar do Zé', 'Pensão Familiar', 'Rir é o Remédio', 'Planeta Piada', 'A Grande Família Silva', 'Os Impagáveis', 'Show do Riso'];
const AUDITORIO = ['Domingo Show', 'Sábado Total', 'Tarde Animada', 'Festa no Auditório', 'Tarde de Prêmios', 'Domingo de Festa', 'Show da Tarde', 'Alegria Geral', 'Clube do Domingo'];
const APELIDOS = ['Tião', 'Zezé', 'Carlão', 'Beto', 'Lalá', 'Juca', 'Nenê', 'Toninho', 'Rosinha', 'Dedé', 'Marlene', 'Biro'];
const GAME = ['Roda da Sorte', 'Quem Arrisca', 'Show do Bilhão', 'Pergunta de Ouro', 'Caixa Misteriosa', 'Jogo da Memória', 'Corrida Maluca', 'Acerte o Preço', 'Tudo ou Nada', 'Casa Cheia'];
const REALITY = ['A Casa', 'Confinados', 'Sobreviventes', 'O Refúgio', 'Paredão', 'Na Mira', 'Ilha Deserta', 'O Sítio', 'Prova Final', 'Vidas Expostas', 'O Desafio'];
const TALK_PRE = ['Conversa Fiada', 'Papo Reto', 'Noite Adentro', 'Sofá Vermelho', 'Fim de Noite', 'Boa Noite, Brasil', 'Madrugada Afora'];
const REVISTA = ['Revista de Domingo', 'Domingo em Foco', 'Panorama', 'Close', 'Em Pauta', 'Raio-X', 'Domingo Espetacular Brasil'];
const POLICIAL = ['Plantão de Polícia', 'Na Mira da Lei', 'Ronda Urbana', 'Sirene', 'Caso de Polícia', 'Alerta Geral', 'Patrulha da Cidade', 'Linha de Frente'];
const MESA = ['Mesa Redonda', 'Grande Área', 'Arquibancada', 'Bola Rolando', 'Debate da Bola', 'Camisa 10', 'Apito Final'];
const FILME = ['Sessão das Três', 'Cine Pipoca', 'Tela Grande', 'Cine Madrugada', 'Cine Sábado', 'Cine Clube', 'Sessão Aventura', 'Grandes Clássicos', 'Cine Família', 'Sessão Premiada'];
const SERIE_EST = ['Agentes da Lei', 'Hospital Central', 'Detetive Particular', 'Família Americana', 'Patrulha Rodoviária', 'Mistérios do Além', 'Garotas da Califórnia', 'Escola de Heróis', 'Os Investigadores', 'Base Lunar', 'Tribunal'];
const INFANTIL_M = ['Pipoca', 'Bolinha', 'Sapeca', 'Cometa', 'Tico', 'Faísca', 'Pirulito'];
const INFANTIL = ['Clube da Criançada', 'Manhã Mágica', 'TV Pirulito', 'Planeta Kids', 'Castelo Encantado', 'Balão Mágico Azul', 'Turminha'];
const RELIGIOSO = ['Hora da Fé', 'Igreja na TV', 'Palavra de Vida', 'Momento de Oração', 'Culto da Família', 'Luz do Amanhecer'];
const TELEVENDAS = ['Shop TV', 'Ofertas da Madrugada', 'Compra Certa', 'Vitrine 24h', 'Tele Ofertas', 'Liquida Já'];
const DOC = ['Brasil Profundo', 'Expedição', 'Planeta Vivo', 'Caminhos do Campo', 'Grandes Histórias', 'Repórter da Natureza', 'Raízes', 'Brasil de Ponta a Ponta'];
const FEMININO = ['Mulher em Foco', 'Receitas da Vovó', 'Bom Dia, Mulher', 'Cozinha Aberta', 'Casa & Cia', 'Manhã Feliz', 'Sabor de Casa', 'Mais Você Mesma'];
const MUSICAL = ['Palco Aberto', 'Som da Terra', 'Noite de Música', 'Clipe Mania', 'Ao Vivo no Teatro', 'Batuque', 'Hit Parade Brasil'];
const TALENT = ['A Grande Voz', 'Estrela Revelação', 'Talento Brasil', 'Canta, Brasil', 'Dança dos Astros', 'Show de Calouros', 'Novos Talentos'];

export const FIRST_NAMES_F = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Larissa', 'Mariana', 'Natália', 'Patrícia', 'Renata', 'Sílvia', 'Tânia', 'Vanessa', 'Adriana', 'Cláudia', 'Débora', 'Elaine', 'Flávia', 'Glória', 'Heloísa', 'Irene', 'Joana', 'Márcia', 'Neusa', 'Odete', 'Paula', 'Regina', 'Sandra', 'Teresa', 'Vera', 'Lívia', 'Yara', 'Cecília'];
export const FIRST_NAMES_M = ['Alberto', 'Bruno', 'Carlos', 'Daniel', 'Eduardo', 'Fábio', 'Gustavo', 'Igor', 'João', 'Leonardo', 'Marcelo', 'Nelson', 'Paulo', 'Ricardo', 'Sérgio', 'Tiago', 'Vítor', 'Wagner', 'Antônio', 'Benedito', 'Celso', 'Diego', 'Emanuel', 'Francisco', 'Gilberto', 'Hélio', 'Jorge', 'Luís', 'Mauro', 'Norberto', 'Osvaldo', 'Renato', 'Rogério', 'Augusto', 'Raul', 'Davi', 'Murilo'];
export const LAST_NAMES = ['Albuquerque', 'Barros', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Guimarães', 'Holanda', 'Jardim', 'Leal', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Rezende', 'Sampaio', 'Tavares', 'Uchoa', 'Valença', 'Xavier', 'Brandão', 'Coutinho', 'Dantas', 'Fonseca', 'Gouveia', 'Lacerda', 'Medeiros', 'Novaes', 'Pimentel', 'Rangel', 'Seixas', 'Teixeira', 'Vasconcelos', 'Andrade', 'Bittencourt', 'Campos', 'Moura', 'Amaral', 'Peixoto', 'Arantes'];
const STAGE_NAMES = ['Tião Alegria', 'Carlão do Povo', 'Zezé Show', 'Tia Lalá', 'Juca Bacana', 'Rosinha Sorriso', 'Dedé Folia', 'Biro Biro Show', 'Marlene Furacão', 'Nenê da Praça'];

export function personName(rng: Rng, gender?: 'f' | 'm'): { name: string; gender: 'f' | 'm' } {
  const g = gender ?? (rng.chance(0.5) ? 'f' : 'm');
  const first = rng.pick(g === 'f' ? FIRST_NAMES_F : FIRST_NAMES_M);
  const last = rng.pick(LAST_NAMES);
  return { name: `${first} ${last}`, gender: g };
}

export function stageName(rng: Rng): string {
  return rng.pick(STAGE_NAMES);
}

export function programTitle(rng: Rng, genre: GenreId, stationShort: string, stationName: string, year: number, used: Set<string>): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const t = rawTitle(rng, genre, stationShort, stationName, year);
    if (!used.has(t)) {
      used.add(t);
      return t;
    }
  }
  const t = `${rawTitle(rng, genre, stationShort, stationName, year)} ${rng.int(2, 9)}`;
  used.add(t);
  return t;
}

function rawTitle(rng: Rng, genre: GenreId, short: string, stationName: string, year: number): string {
  const base = stationName.replace(/^(TV|Rede|Canal)\s+/i, '');
  switch (genre) {
    case 'novela_18h':
    case 'novela_19h':
    case 'novela_21h':
      return rng.chance(0.6) ? `${rng.pick(NOVELA_A)} de ${rng.pick(NOVELA_B)}` : rng.pick(NOVELA_SINGLE);
    case 'novela_juvenil':
      return rng.pick(JUVENIL);
    case 'novela_biblica':
      return rng.pick(BIBLICA);
    case 'serie_nacional':
      return rng.pick(SERIE);
    case 'humoristico':
      return rng.pick(HUMOR);
    case 'auditorio':
      return rng.chance(0.45) ? `Programa do ${rng.pick(APELIDOS)}` : rng.pick(AUDITORIO);
    case 'game_show':
      return rng.pick(GAME);
    case 'reality':
      return rng.pick(REALITY);
    case 'talk_show':
      return rng.chance(0.4) ? `${rng.pick(LAST_NAMES)} à Noite` : rng.pick(TALK_PRE);
    case 'telejornal':
      return rng.pick([`${base} Notícias`, `Jornal da ${base}`, `${base} Agora`, 'Primeira Edição', 'Edição da Noite', 'Hora da Notícia', `Repórter ${base}`, `${short} Informa`]);
    case 'revista_eletronica':
      return rng.pick(REVISTA);
    case 'policial':
      return rng.pick(POLICIAL);
    case 'futebol':
      return rng.pick([`Futebol ${base}`, 'Bola em Jogo', `Rodada ${base}`, 'Futebol ao Vivo']);
    case 'mesa_redonda':
      return rng.pick(MESA);
    case 'filme':
      return rng.pick(FILME);
    case 'serie_estrangeira':
      return rng.pick(SERIE_EST);
    case 'infantil':
      return rng.chance(0.4) ? `Turma do ${rng.pick(INFANTIL_M)}` : rng.pick(INFANTIL);
    case 'religioso':
      return rng.pick(RELIGIOSO);
    case 'televendas':
      return rng.pick(TELEVENDAS);
    case 'documentario':
      return rng.pick(DOC);
    case 'feminino':
      return rng.pick(FEMININO);
    case 'musical':
      return rng.pick(MUSICAL);
    case 'talent_show':
      return rng.pick(TALENT);
    case 'cobertura_especial':
      return `Especial ${base} ${year}`;
    case 'janela_local':
      return 'Janela local';
    case 'hgpe':
      return 'Horário eleitoral gratuito';
    default:
      return 'Programação de teste';
  }
}

// ===== Emissoras fictícias =====
export const FICTIONAL_STATIONS = [
  { name: 'Rede Atlântico', short: 'ATL', color: '#3b82f6' },
  { name: 'TV Planalto', short: 'PLA', color: '#f59e0b' },
  { name: 'Canal 9 Paulista', short: 'C9P', color: '#ef4444' },
  { name: 'Rede Sul-Americana', short: 'RSA', color: '#10b981' },
  { name: 'TV Guanabara', short: 'GUA', color: '#a855f7' },
  { name: 'Rede Cruzeiro', short: 'CRU', color: '#ec4899' },
  { name: 'TV Capital', short: 'CAP', color: '#14b8a6' },
  { name: 'Rede Aurora', short: 'AUR', color: '#eab308' },
  { name: 'TV Litoral', short: 'LIT', color: '#06b6d4' },
  { name: 'TV Metrópole', short: 'MET', color: '#f97316' },
];

export const PLAYER_DEFAULT_STATION = { name: 'TV Horizonte', short: 'HOR', color: '#facc15' };

// ===== Anunciantes fictícios (20+) =====
export interface AdvertiserDef {
  name: string;
  sector: string;
  eras: EraId[];
  likes: GenreId[];
  avoids: GenreId[];
}

const ALL: EraId[] = ['now'];

export const ADVERTISERS: AdvertiserDef[] = [
  { name: 'Supermercados Boa Compra', sector: 'varejo', eras: ALL, likes: ['novela_21h', 'auditorio', 'futebol'], avoids: [] },
  { name: 'Montadora Veloz', sector: 'automotivo', eras: ALL, likes: ['futebol', 'revista_eletronica', 'telejornal'], avoids: ['infantil'] },
  { name: 'Banco Atlântida', sector: 'financeiro', eras: ALL, likes: ['telejornal', 'serie_nacional', 'revista_eletronica'], avoids: ['policial', 'reality'] },
  { name: 'Cervejaria Trópico', sector: 'bebidas', eras: ALL, likes: ['futebol', 'humoristico', 'reality'], avoids: ['infantil', 'religioso'] },
  { name: 'Refrigerantes Fizz', sector: 'bebidas', eras: ALL, likes: ['novela_19h', 'game_show', 'musical'], avoids: [] },
  { name: 'Magazine Lar Feliz', sector: 'varejo', eras: ALL, likes: ['auditorio', 'novela_18h', 'feminino'], avoids: [] },
  { name: 'Cosméticos Belíssima', sector: 'beleza', eras: ALL, likes: ['novela_21h', 'feminino', 'reality'], avoids: ['policial'] },
  { name: 'Laticínios Vale Verde', sector: 'alimentos', eras: ALL, likes: ['infantil', 'feminino', 'novela_18h'], avoids: ['policial'] },
  { name: 'Telefonia Conecta', sector: 'telecom', eras: ALL, likes: ['reality', 'novela_19h', 'futebol'], avoids: [] },
  { name: 'Farmácias Saúde Mais', sector: 'farma', eras: ALL, likes: ['telejornal', 'feminino', 'novela_18h'], avoids: [] },
  { name: 'Construtora Alicerce', sector: 'imobiliário', eras: ALL, likes: ['telejornal', 'revista_eletronica'], avoids: ['policial'] },
  { name: 'Seguradora Amparo', sector: 'seguros', eras: ALL, likes: ['telejornal', 'futebol'], avoids: [] },
  { name: 'Margarina Dourada', sector: 'alimentos', eras: ALL, likes: ['feminino', 'novela_18h', 'auditorio'], avoids: [] },
  { name: 'Sabão Brilho', sector: 'limpeza', eras: ALL, likes: ['novela_18h', 'novela_19h', 'feminino'], avoids: [] },
  { name: 'Calçados Passo Firme', sector: 'vestuário', eras: ALL, likes: ['futebol', 'novela_juvenil', 'musical'], avoids: [] },
  { name: 'Céu Azul Linhas Aéreas', sector: 'turismo', eras: ALL, likes: ['revista_eletronica', 'documentario', 'serie_nacional'], avoids: ['policial'] },
  { name: 'Lanchonetes Brasa', sector: 'alimentação', eras: ALL, likes: ['reality', 'futebol', 'humoristico'], avoids: [] },
  { name: 'Cartões Credmais', sector: 'financeiro', eras: ALL, likes: ['novela_21h', 'futebol'], avoids: [] },
  { name: 'Loja Virtual Clique', sector: 'e-commerce', eras: ALL, likes: ['reality', 'talent_show', 'novela_21h'], avoids: [] },
  { name: 'App Entrega Já', sector: 'digital', eras: ALL, likes: ['reality', 'futebol', 'humoristico'], avoids: [] },
  { name: 'Brinquedos Pirilampo', sector: 'brinquedos', eras: ALL, likes: ['infantil', 'novela_juvenil'], avoids: ['policial', 'reality'] },
  { name: 'Eletrodomésticos Polar', sector: 'eletro', eras: ALL, likes: ['novela_21h', 'auditorio', 'game_show'], avoids: [] },
];

export const COLUMNS = [
  { column: 'Coluna TV & Bastidor', author: 'Nelson Arantes' },
  { column: 'Telinha em Foco', author: 'Regina Peixoto' },
  { column: 'Controle Remoto', author: 'Davi Seixas' },
  { column: 'Zapping', author: 'Cecília Amaral' },
];
