# Prime Time Manager

Simulador de Diretor de Programação de TV aberta no Brasil, feito a partir do *Documento-Mestre*.
Você monta a grade, responde a crises, negocia com a diretoria e com anunciantes, enfrenta os rivais
e é avaliado(a) pela presidência. A partida começa em janeiro de 2026, no mercado de TV de hoje, e segue
pelos anos seguintes. Joga-se no navegador, no PC e no celular.

> **Para colocar no ar com Supabase + GitHub, siga o [TUTORIAL.md](TUTORIAL.md).**

## Como funciona

**Os números saem do motor; a narrativa sai do Mestre.**

| Camada | Onde | O que faz |
|---|---|---|
| Motor | `supabase/functions/_shared/engine/` | TypeScript puro e determinístico (semente por partida). Audiência por faixa de 15 min em 15 praças (PNT), 7 segmentos de público, herança, hábito, buzz, fadiga, fuga para o digital; comercial (CPP, ocupação, descontos, cotas, merchandising, arrendamento); rivais com arquétipos; baralho de 77 eventos com arcos; KPIs, fechamentos e carreira. |
| Mestre | `supabase/functions/_shared/game/` | Chama a Claude API (saída estruturada em JSON, validada com Zod e com uma tentativa de correção). Remove frases com números inventados, limita efeitos propostos (humor ±15, confiança ±10, buzz ±10, reputação ±3) e trata o texto livre do jogador como dado. Sem chave ou sem crédito, usa textos padrão e o jogo continua. |
| Funções | `supabase/functions/<nome>/` | 13 Edge Functions (Deno): `create-game`, `apply-intent`, `simulate-week`, `mestre-scene`, `resolve-event`, `live-mode`, `interpret-free-action`, `catalog-admin` (Editor de Catálogo) e as da Mesa de Negociação: `catalog-browse`, `negotiation-open`, `negotiation-turn`, `negotiation-close` e `tender-resolve` (só estrutura até a Fase 6.4). Conferem o login, carregam o estado, rodam o motor, gravam com trava de versão e devolvem só o que mudou. |
| Banco | `supabase/setup_completo.sql` | Postgres com RLS: cada jogador só lê as próprias partidas; o site só **lê** as tabelas do jogo e toda escrita passa pelas funções. |
| Site | `apps/web/` | React 19 + Vite + Tailwind. Navegação lateral no PC e inferior no celular; grade com arrastar e soltar (PC) e toque no horário (celular); Editor de Catálogo para os títulos reais. Instalável na tela inicial (PWA). |

A chave da Claude API fica **só** nos Secrets das Edge Functions do Supabase. Ela nunca vai para o GitHub nem para o site.

### Modo demonstração
Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, o site abre em modo demonstração: o mesmo motor roda no
navegador, a partida fica salva só naquele aparelho (IndexedDB) e o Mestre usa os textos padrão (sem IA).
É útil para testar antes de configurar o Supabase.

## Rodar no seu computador (opcional)

Precisa do Node 24 ou mais novo.

```bash
npm run web:install
```

```bash
npm run dev
```

Abra http://localhost:5173. Para apontar para o seu Supabase, copie `apps/web/.env.example` para
`apps/web/.env.local` e preencha a URL e a publishable/anon key.

Outros comandos (na pasta raiz):

| Comando | Para quê |
|---|---|
| `npm test` | Testes do motor e das funções (sem IA, com banco em memória). |
| `npm run typecheck` | Checagem de tipos do site. |
| `npm run build` | Gera o site em `apps/web/dist`. |
| `npm run calibrate` | Simula várias temporadas de 2026 e confere as faixas de audiência e receita. |
| `npm run events-stats` | Frequência e tom dos eventos ao longo de anos simulados. |
| `npm run custo` | Custo da IA numa semana-padrão de jogo, v1 x v2 (sem chamar a API). |
| `npm run gen-seed` | Regenera `supabase/seed.sql` e `supabase/setup_completo.sql` a partir dos catálogos. |

## Estrutura

```
prime-time-manager/
├─ apps/web/                  site (React)
├─ supabase/
│  ├─ functions/              Edge Functions + _shared (motor, Mestre, servidor)
│  ├─ migrations/             esquema do banco
│  ├─ seed.sql                catálogos (era atual, gêneros, praças, eventos)
│  ├─ seeds/                  lotes do catálogo real (títulos, players, grades, direitos)
│  ├─ setup_completo.sql      esquema + catálogos numa colada só (gerado)
│  └─ config.toml             deploy das funções (verify_jwt desligado: o login é conferido no código)
├─ prompts/mestre.v1.md       prompt de sistema do Mestre
├─ scripts/                   calibração, estatísticas de eventos, geração do seed
├─ tests/                     testes do motor e das funções
└─ .github/workflows/         CI (testes + build) e Deploy (funções + GitHub Pages)
```

## Decisões de implementação

- **Uma era só (v2.1, 17/10/2026)**: o jogo tem apenas a era atual. As eras de 1983 a 2019 foram retiradas
  (catálogo, eventos, temas visuais e a transição entre eras); o motor continua lendo os parâmetros da era, agora
  com um único conjunto. Os números de 2026 ficaram idênticos aos de antes da mudança. Valores em R$ de 2026.
- **Catálogo real na partida (v2, seção 8A)**: `create-game` copia o que está aprovado no catálogo para dentro da
  partida (`state.catalog`); edições posteriores no Editor só valem para partidas novas. Com a cópia, as emissoras
  reais começam com a grade de referência do mês (o modelo genérico só preenche as lacunas; jogos de futebol ficam
  para a Fase 6.4), quem assume uma emissora real recebe o acervo dela, e uma emissora fictícia recebe três
  enlatados reais baratos. O Mercado oferece primeiro títulos reais livres e completa com ofertas fictícias;
  títulos com exclusividade de outra emissora aparecem travados. Comprar um título que na história passou em
  outra emissora registra uma divergência (`divergences`), que o Mestre pode comentar. Sem catálogo aprovado, no
  Brasil fictício e no modo demonstração, o mundo é gerado exatamente como antes (mesma semente, mesmos números).
  Atributos de jogo dos títulos são estimativas, nunca audiência oficial.
- **Mesa de Negociação (v2, seção 8B)**: títulos reais não têm compra direta; o preço sai de uma reunião com o
  player (tela Mercado de Direitos). O motor (`engine/negotiation.ts`) calcula o valor justo, sorteia preço mínimo e
  alvo por estilo do player, decide aceite, recusa ou contraproposta pela utilidade e cede a cada rodada; argumentos
  mexem no máximo 5% no mínimo e blefes são testados contra o interesse real dos rivais. A IA (Haiku, esforço baixo)
  só lê a fala do jogador e dá voz à decisão; o segredo do player fica em `negotiation_secrets`, que o navegador não
  lê. Exclusividades reais da largada viram contratos ativos (tela Contratos).
- **Esporte real (v2, seção 8C, em construção na Fase 6.4)**: com competições aprovadas no catálogo, a partida ganha
  o motor esportivo (`engine/sports.ts`). O calendário (datas e horários da era, pausa da Copa, estaduais no fim de
  semana) sai da semente da partida; o estado guarda só placares, mudanças de horário e adiamentos impostos pela liga.
  Resultados por modelo de gols (Poisson: força, mando e fase), classificação, mata-mata com prorrogação e pênaltis,
  acesso e rebaixamento entre temporadas. A audiência de um jogo usa a fórmula da seção 8C.4 com a torcida de cada
  praça; jogos da seleção e finais aumentam a TV ligada. Atletas reais não aparecem: os lances falam em "o camisa 9".
- **Modelos (v2, seção 17.5)**: todas as funções usam `claude-haiku-5-5` com esforço baixo e raciocínio desligado;
  cada função tem o seu `max_tokens` (`supabase/functions/_shared/game/llmConfig.ts`). O Sonnet 5.5 fica como
  modo premium desligado (`LLM_PREMIUM=on` liga, só na avaliação com a presidência). Tudo pode ser trocado por
  Secrets do Supabase: `LLM_MODEL`, `LLM_EFFORT`, `LLM_THINKING=on` e, por função, `LLM_<FUNCAO>_MODEL`,
  `LLM_<FUNCAO>_EFFORT` e `LLM_<FUNCAO>_MAX_TOKENS` (ex.: `LLM_REUNIAO_MAX_TOKENS`). Resposta cortada no limite
  ganha uma nova tentativa com o dobro e fica marcada em `llm_calls.truncated`.
- **Sem IA onde não precisa**: boletim diário, e-mails de rotina e eventos leves usam textos-modelo do motor; o
  desfecho de evento escrito pela IA fica só para os graves.
- **Custos sob controle**: no máximo 30 chamadas ao Mestre por semana de jogo e 60 por hora
  (`LLM_WEEKLY_CAP`, `LLM_HOURLY_CAP`). Cada chamada fica em `llm_calls` com tokens (inclusive escrita e leitura do
  cache), semana de jogo e custo estimado, e aparece na tela **Custo da IA** do jogo. `npm run custo` compara a
  v1 com a v2 numa semana-padrão sem gastar nada (resultado de 16/10/2026: US$ 0,17 → US$ 0,006 por semana, 96% menos).
- **Login**: e-mail e senha ou link mágico. `ALLOWED_EMAILS` restringe quem joga; depois de criar a sua conta,
  desligue novos cadastros no Supabase (passo 3 do tutorial).
- **Funções com `verify_jwt = false`**: o token do jogador é conferido dentro de cada função
  (`auth.getUser`), o que funciona tanto com as chaves antigas (anon) quanto com as novas (publishable).
