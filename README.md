# Prime Time Manager

Simulador de Diretor de Programação de TV aberta no Brasil, feito a partir do *Documento-Mestre*.
Você monta a grade, responde a crises, negocia com a diretoria e com anunciantes, enfrenta os rivais
e é avaliado(a) pela presidência — dos anos 80 até hoje. Joga-se no navegador, no PC e no celular.

> **Para colocar no ar com Supabase + GitHub, siga o [TUTORIAL.md](TUTORIAL.md).**

## Como funciona

**Os números saem do motor; a narrativa sai do Mestre.**

| Camada | Onde | O que faz |
|---|---|---|
| Motor | `supabase/functions/_shared/engine/` | TypeScript puro e determinístico (semente por partida). Audiência por faixa de 15 min em 15 praças (PNT), 7 segmentos de público, herança, hábito, buzz, fadiga, fuga para o digital; comercial (CPP, ocupação, descontos, cotas, merchandising, arrendamento); rivais com arquétipos; baralho de 95 eventos com arcos; KPIs, fechamentos e carreira. |
| Mestre | `supabase/functions/_shared/game/` | Chama a Claude API (saída estruturada em JSON, validada com Zod e com uma tentativa de correção). Remove frases com números inventados, limita efeitos propostos (humor ±15, confiança ±10, buzz ±10, reputação ±3) e trata o texto livre do jogador como dado. Sem chave ou sem crédito, usa textos padrão e o jogo continua. |
| Funções | `supabase/functions/<nome>/` | 7 Edge Functions (Deno): `create-game`, `apply-intent`, `simulate-week`, `mestre-scene`, `resolve-event`, `live-mode`, `interpret-free-action`. Conferem o login, carregam o estado, rodam o motor, gravam com trava de versão e devolvem só o que mudou. |
| Banco | `supabase/setup_completo.sql` | Postgres com RLS: cada jogador só lê as próprias partidas; o site só **lê** as tabelas do jogo e toda escrita passa pelas funções. |
| Site | `apps/web/` | React 19 + Vite + Tailwind. Navegação lateral no PC e inferior no celular; grade com arrastar e soltar (PC) e toque no horário (celular); visual que muda com a era. Instalável na tela inicial (PWA). |

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
| `npm run calibrate` | Simula várias temporadas por era e confere as faixas de audiência e receita. |
| `npm run events-stats` | Frequência e tom dos eventos ao longo de anos simulados. |
| `npm run gen-seed` | Regenera `supabase/seed.sql` e `supabase/setup_completo.sql` a partir dos catálogos. |

## Estrutura

```
prime-time-manager/
├─ apps/web/                  site (React)
├─ supabase/
│  ├─ functions/              Edge Functions + _shared (motor, Mestre, servidor)
│  ├─ migrations/             esquema do banco
│  ├─ seed.sql                catálogos (eras, gêneros, praças, eventos)
│  ├─ setup_completo.sql      esquema + catálogos numa colada só (gerado)
│  └─ config.toml             deploy das funções (verify_jwt desligado: o login é conferido no código)
├─ prompts/mestre.v1.md       prompt de sistema do Mestre
├─ scripts/                   calibração, estatísticas de eventos, geração do seed
├─ tests/                     testes do motor e das funções
└─ .github/workflows/         CI (testes + build) e Deploy (funções + GitHub Pages)
```

## Decisões de implementação

- **Dinheiro**: o motor guarda valores em R$ de 2026 e a tela converte pela inflação de cada era, para que os
  valores pareçam da época sem distorcer a matemática entre eras.
- **Modelos**: cenas e reuniões usam `claude-sonnet-5-5`; tarefas curtas (interpretar ação livre, resumo de
  campanha) usam `claude-haiku-5-5`. Dá para trocar pelos Secrets `MESTRE_MODEL` e `MESTRE_FAST_MODEL`.
  O controle de profundidade é o `effort` (`MESTRE_EFFORT`, padrão `low`).
- **Custos sob controle**: no máximo 30 chamadas ao Mestre por semana de jogo e 60 por hora
  (`LLM_WEEKLY_CAP`, `LLM_HOURLY_CAP`); cada chamada fica registrada em `llm_calls`.
- **Login**: e-mail e senha ou link mágico. `ALLOWED_EMAILS` restringe quem joga; depois de criar a sua conta,
  desligue novos cadastros no Supabase (passo 3 do tutorial).
- **Funções com `verify_jwt = false`**: o token do jogador é conferido dentro de cada função
  (`auth.getUser`), o que funciona tanto com as chaves antigas (anon) quanto com as novas (publishable).
