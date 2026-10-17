# Prime Time Manager — passo a passo (Supabase + GitHub)

Você vai precisar de: uma conta no **GitHub**, uma conta no **Supabase** e a sua **chave da Claude API** (você já tem).
Nada precisa ser instalado no seu computador além do **GitHub Desktop** (opcional, mas recomendado).

Resumo do que vai acontecer: o **Supabase** guarda o banco de dados, o login e a chave da Claude; o **GitHub**
guarda o código, publica as funções no Supabase e hospeda o site (GitHub Pages) que você abre no PC ou no celular.

> Quer ver o jogo antes de configurar tudo? Depois do passo 6, mesmo sem as variáveis do Supabase, o site abre em
> **modo demonstração** (o motor roda no navegador, sem IA e salvo só naquele aparelho).

---

## 1. Criar o projeto no Supabase
1. Entre em https://supabase.com → **New project**.
2. Nome: `prime-time-manager`. Crie uma senha forte para o banco (guarde-a). Região: **South America (São Paulo)**.
3. Espere o projeto ficar pronto (1–2 minutos).

## 2. Criar as tabelas (uma colada só)
1. No menu lateral, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/setup_completo.sql` deste projeto (no Bloco de Notas, por exemplo), copie **tudo** e cole no editor.
   > Se aparecer um erro de texto cortado (por exemplo, "unterminated dollar-quoted string"), o arquivo era grande demais
   > para colar de uma vez. Nada foi gravado. Use as duas partes, nesta ordem: `supabase/setup_parte1_estrutura.sql`
   > e depois `supabase/setup_parte2_catalogo.sql` (cada uma com Run). O resultado é o mesmo.
3. Clique em **Run**. Deve aparecer "Success". (Pode rodar de novo sem problema: ele atualiza o catálogo e preserva
   as partidas de 2026. O jogo tem só a era atual; partidas antigas de outras eras, se existirem, são apagadas.)
4. Confira em **Table Editor** (schema `public`). O script cria **35 tabelas** — é normal aparecerem todas:
   - **Catálogo do jogo** (já vêm preenchidas): `eras` (1 linha: a era atual, 2026), `era_rules` (8), `genres` (29),
     `event_templates` (77), `markets` (15), `station_archetypes` e `npc_archetypes`. Basta conferir essas contagens.
   - **Catálogo real** (começam vazias e recebem os lotes de títulos reais): `rights_holders`, `catalog_titles`,
     `schedule_templates`, `historical_rights`, `clubs` e `club_fanbase`.
   - **Dados das partidas** (começam **vazias** e se enchem quando você joga): `games`, `reports`, `inbox_messages`,
     `conversations`, `messages`, `npc_memories`, `events_log`, `ratings_slots`, `ratings_minute`, `weekly_stats`,
     `finance_ledger`, `competitor_actions`, `kpi_snapshots`, `campaign_summaries`, `player_intents`, `llm_calls`
     (registra o custo de cada chamada à Claude) e `divergences` (quando a partida se afasta da história real, por
     exemplo ao comprar uma novela que no Brasil passou em outra emissora).
   - **Mesa de Negociação** (também começam vazias): `negotiations` (as reuniões), `negotiation_rounds` (cada rodada),
     `rights_contracts` (contratos de direitos), `holder_relationships` (relacionamento com cada player) e
     `negotiation_secrets`, que guarda o preço mínimo secreto de cada player: essa tabela nunca aparece para o jogador,
     nem para o dono da partida; só as funções do servidor a leem.
   - **Partidas novas no Brasil real usam o catálogo aprovado**: grades reais das emissoras, títulos reais no Mercado e
     exclusividades (ex.: novela da Televisa aparece "exclusivo do SBT até 12/2028", sem botão de compra). Só entra o
     que estiver **aprovado** no Editor de Catálogo; cada partida guarda uma cópia do catálogo do dia em que foi criada.
   - Você não precisa mexer em nenhuma delas. A proteção (cada jogador só vê os próprios dados) é feita pelas
     regras de RLS que o script já criou.

## 3. Configurar o login
1. **Authentication → Sign In / Providers → Email**: deixe ativado.
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://SEU-USUARIO.github.io/prime-time-manager/`
   - *Redirect URLs*: adicione o mesmo endereço.
   (Troque `SEU-USUARIO` pelo seu nome de usuário do GitHub, em minúsculas.)
3. Depois de criar a **sua** conta no jogo (passo 7), volte em **Authentication → Sign In / Providers** e
   **desative "Allow new users to sign up"**. Assim ninguém mais cria conta e gasta os seus créditos da API.

## 4. Guardar a chave da Claude API (só no Supabase)
1. **Edge Functions → Secrets** (ou *Project Settings → Edge Functions → Secrets*).
2. Adicione:
   - `ANTHROPIC_API_KEY` = sua chave (`sk-ant-...`)
   - (recomendado) `ALLOWED_EMAILS` = seu e-mail — só ele poderá jogar.
   - (opcional) `LLM_WEEKLY_CAP` = `30` (chamadas do Mestre por semana de jogo) e `LLM_HOURLY_CAP` = `60`.
   - (opcional) `LLM_PREMIUM` = `on` para usar o Sonnet 5.5 (mais caro) na avaliação com a presidência.
     Sem ele, tudo roda no Haiku 5.5, o modelo mais barato. Os outros ajustes estão no README.
   - Se você criou `MESTRE_MODEL` ou `MESTRE_FAST_MODEL` antes, pode apagar: a versão atual não lê mais esses segredos.
3. **Nunca** coloque a chave no GitHub nem no site. As outras variáveis das funções
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) o próprio Supabase já fornece.
4. No Claude Console (platform.claude.com) → *Billing*: carregue créditos (ex.: US$ 20), deixe a **recarga automática
   desligada** e defina um *spend limit* mensal. Sem saldo, o jogo continua funcionando com textos padrão.

## 5. Subir o código para o GitHub
1. Crie um repositório chamado `prime-time-manager` em https://github.com/new, marcado como **Public**.
   - Por que público? No plano gratuito, o GitHub Pages só publica repositórios públicos. Não há nenhum segredo no
     código: a chave da Claude fica no Supabase, e a URL e a *anon/publishable key* do Supabase são públicas por natureza
     (quem protege os dados é o login + RLS do banco).
   - Prefere privado? Funciona igual se a sua conta for **GitHub Pro**.
2. Com o **GitHub Desktop**: *File → Add local repository* → escolha a pasta `prime-time-manager`
   (se ele avisar que não é um repositório, clique em *create a repository* e confirme) → *Publish repository*.
   A branch deve se chamar **main** (é o padrão).
   - Sem o Desktop: na página do repositório, *Add file → Upload files* e arraste o **conteúdo** da pasta, incluindo a
     pasta `.github`, mas **sem** as pastas `node_modules` e `dist` (dentro de `apps/web`).
3. O arquivo `.gitignore` já impede o envio de `node_modules`, `dist` e arquivos `.env`.

## 6. Publicar as Edge Functions e o site (automático pelo GitHub)
1. No Supabase: clique no seu avatar → **Account preferences → Access Tokens → Generate new token**. Copie o token.
2. Anote o *Project ref* (Project Settings → General; é o código em `https://<ref>.supabase.co`).
3. Anote a *Project URL* e a *Publishable key* (ou *anon key*) em **Project Settings → API Keys / Data API**.
4. No GitHub, no repositório: **Settings → Secrets and variables → Actions**:
   - Aba *Secrets* → *New repository secret*: `SUPABASE_ACCESS_TOKEN` (o token) e `SUPABASE_PROJECT_REF` (o ref).
   - Aba *Variables* → *New repository variable*: `VITE_SUPABASE_URL` (a URL) e `VITE_SUPABASE_ANON_KEY`
     (a publishable/anon key).
5. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
6. Vá em **Actions** → workflow **Deploy** → **Run workflow** (ou faça qualquer commit na `main`). Ele tem duas partes:
   - **Edge Functions (Supabase)**: publica as 13 funções (`create-game`, `apply-intent`, `simulate-week`, `mestre-scene`,
     `resolve-event`, `live-mode`, `interpret-free-action`, `catalog-admin`, do Editor de Catálogo, e as 5 da Mesa de
     Negociação: `catalog-browse`, `negotiation-open`, `negotiation-turn`, `negotiation-close` e `tender-resolve`) com `--no-verify-jwt`
     (o login é conferido dentro de cada função);
   - **Site (GitHub Pages)**: gera o site e publica em `https://SEU-USUARIO.github.io/prime-time-manager/`.
   O outro workflow, **CI**, roda os testes do jogo a cada envio; ele não publica nada.

   Alternativa manual para as funções (no terminal, com Node instalado, dentro da pasta do projeto):
   ```bash
   npx supabase functions deploy --project-ref SEU_REF --no-verify-jwt
   ```

## 7. Jogar
1. Abra o endereço do GitHub Pages no PC ou no celular. O aviso "Supabase ainda não configurado" **não** deve aparecer
   (se aparecer, veja *Problemas comuns*).
2. Aba **Criar conta** → e-mail e senha → confirme pelo e-mail que o Supabase enviar → entre.
3. No celular, use "Adicionar à tela inicial" (Chrome: menu ⋮; Safari: compartilhar) para abrir como aplicativo.
4. Volte ao passo 3 e desative novos cadastros.

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| Site mostra "Supabase ainda não configurado" | As *Variables* `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` faltam ou estão na aba errada (são *Variables*, não *Secrets*). Corrija e rode o **Deploy** de novo. |
| Deploy falha em "Conferir segredos" | Faltam os *Secrets* `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`. |
| Deploy falha em "Site (GitHub Pages)" | Em *Settings → Pages*, a fonte precisa ser **GitHub Actions**; repositório privado exige GitHub Pro. |
| Página 404 no endereço do Pages | O primeiro deploy ainda não terminou, ou o endereço está sem `/prime-time-manager/` no fim. |
| "A função ... não foi encontrada" | A parte *Edge Functions* do Deploy não rodou ou falhou (veja a aba **Actions**). |
| Mestre sempre com texto padrão | `ANTHROPIC_API_KEY` ausente/errada, sem créditos ou limite semanal atingido (a tabela `llm_calls` mostra o erro). |
| Link mágico não entra | Abra o link no mesmo navegador em que pediu, confira as *Redirect URLs* do passo 3, ou use e-mail e senha. |
| "Este e-mail não está autorizado" | Confira `ALLOWED_EMAILS` (o mesmo e-mail da conta do jogo). |

## Conferir custos
No jogo, menu **Custo da IA** (no celular, em *Mais*): gasto por função e por semana de jogo. O valor cobrado de
fato está na tela *Usage* do Claude Console; a tabela `llm_calls` do Supabase guarda cada chamada.

## Atualizar o jogo depois
1. Se o arquivo `supabase/setup_completo.sql` mudou, **primeiro** cole-o outra vez no SQL Editor (passo 2).
   Ele preserva as partidas e só acrescenta o que falta (na v2: as colunas de custo em `llm_calls`).
2. Depois envie as alterações para a `main` (pelo GitHub Desktop: *Commit* → *Push origin*). Isso roda o **Deploy** de novo.
