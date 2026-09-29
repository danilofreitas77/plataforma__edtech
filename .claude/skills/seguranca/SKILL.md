---
name: seguranca
description: Regras de segurança obrigatórias deste projeto (Next.js 16 + Supabase + Vercel, multi-tenant, dados de menores). Use SEMPRE que a tarefa mexer em auth, sessão, senha, MFA, RLS, migrations, server actions, route handlers, uploads, dados pessoais, variáveis de ambiente, dependências, headers, CORS, logs, backup ou deploy — e antes de dar qualquer tarefa como concluída.
---

# Segurança — como construir este projeto

Este SaaS guarda redações e dados de **alunos, muitos menores de idade**, de **vários clientes no mesmo banco**. Um vazamento entre tenants ou de dados de menores é o pior cenário possível: jurídico (LGPD), comercial e de reputação. Segurança aqui não é etapa final — é critério de aceite de toda tarefa.

## Como usar esta skill

1. **Antes de implementar:** leia as seções que a tarefa toca (tabela abaixo).
2. **Durante:** siga as regras. Se uma regra impedir o que a spec pede, **pare e pergunte** — não contorne.
3. **Antes de concluir:** rode o checklist de `references/checklist-pr.md` e cole o resultado na descrição do PR.
4. **Incidente ou recuperação:** siga `references/plano-recuperacao.md`.

| A tarefa mexe em…                        | Leia          |
| ---------------------------------------- | ------------- |
| login, cadastro, senha, sessão           | 2, 3, 4, 10   |
| tabela nova, migration, RLS              | 7, 8, 9       |
| server action, route handler, formulário | 5, 6, 9, 12   |
| upload/download de arquivo               | 5, 6, 9       |
| variável de ambiente, integração externa | 11, 12, 15    |
| logs, monitoramento, erros               | 13, 18        |
| deploy, infra, backup                    | 1, 14, 18, 19 |
| dependência nova                         | 16            |

---

## 1. HTTPS e headers

- Produção e staging **só em HTTPS** (a Vercel força). Nunca gere links `http://` em emails, push ou redirects — monte URLs a partir de `NEXT_PUBLIC_ROOT_DOMAIN` com `https://`.
- Headers globais ficam em `next.config.ts` (HSTS com `includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). **Não remova nem afrouxe** sem aprovação.
- **CSP** (etapa 12): gerar nonce por request no `src/proxy.ts`, com `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; `frame-src https://www.youtube-nocookie.com`; `img-src 'self' data: blob: <supabase-url>`; `connect-src 'self' <supabase-url> wss://<supabase-host>`. Consulte `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` antes. Nada de `unsafe-inline` em script.
- Cookies de sessão: `Secure`, `HttpOnly` quando possível, `SameSite=Lax`. O `@supabase/ssr` já faz isso — não sobrescreva opções de cookie.

## 2. Senhas

- **Nunca** armazene, logue ou trafegue senha fora do Supabase Auth. Nenhuma tabela nossa tem coluna de senha ou hash.
- O Supabase Auth guarda com **bcrypt**. Política em `supabase/config.toml`: mínimo 8, letras + dígitos, `secure_password_change = true` (reautenticação recente para trocar).
- Replicar a mesma política no Supabase hospedado (Dashboard → Auth). Quando o plano permitir, ativar **proteção contra senhas vazadas**.
- Validar força também no client (Zod + indicador), mas **a regra que vale é a do servidor**.
- Mensagens de erro genéricas: "email ou senha inválidos". O "esqueci minha senha" responde igual exista ou não o email (não permite enumerar usuários).
- **Migração do PHP:** se os hashes forem bcrypt (`$2y$`/`$2a$`/`$2b$`), importar para `auth.users.encrypted_password`. Se forem md5/sha1/texto, **não importar** — forçar redefinição no primeiro acesso.

## 3. MFA

- TOTP (app autenticador) habilitado em `config.toml`.
- **Obrigatório para `owner`, `teacher` e `platform_admin`** (acessam dados de muitos alunos). Opcional para alunos.
- Enforcement em **duas camadas**:
  - App: depois do login, se o papel exige MFA e `aal` da sessão ≠ `aal2`, redirecionar para cadastro/verificação do fator.
  - Banco: policies de escrita de staff checam `(auth.jwt() ->> 'aal') = 'aal2'` (via função `app.is_staff`), para que um token sem MFA não consiga agir mesmo chamando a API direto.
- Fornecer **códigos de recuperação** ou fluxo de reset de MFA via `platform_admin`, com registro em `audit_logs`.

## 4. Sessão e expiração

- No servidor, decisões de acesso usam **`supabase.auth.getUser()`** (ou `getClaims()`, que valida a assinatura). **Nunca** `getSession()` para autorizar — ele confia no cookie sem validar.
- JWT de acesso: 1h. Refresh token com rotação e detecção de reuso (padrão do `config.toml`).
- Limites de sessão (`[auth.sessions]`): duração máxima de 30 dias e inatividade de 7 dias. No Supabase hospedado exigem plano pago — configurar ao contratar.
- Troca de senha, remoção de MFA ou suspensão de membership ⇒ `signOut({ scope: "others" })` (ou global) para derrubar as outras sessões.
- Logout real: `signOut()` no servidor + limpeza de cookies. Não basta esconder a UI.
- O proxy (`src/proxy.ts`) renova a sessão, mas **não é a única barreira**: cada Server Action/Route Handler verifica usuário, tenant e papel de novo.

## 5. Validação de inputs

- **Toda** entrada externa passa por schema Zod **no servidor**: body de server actions, params de rota, searchParams, headers usados em lógica, payload de webhook, metadados de upload.
- Use `z.strictObject()` (rejeita campos extras — evita mass assignment, ex.: aluno mandando `status` ou `tenant_id`).
- Limites explícitos em todo string e array: `.max()` em textos (redação/observação: 2000; dúvida: 5000; título: 200), número de arquivos, tamanho.
- IDs: `z.uuid()`. Enums: `z.enum([...])`. Datas: parse e compare no servidor.
- `tenant_id` **nunca** vem do client — sai de `getTenant()` (header injetado pelo proxy a partir do host).
- **Uploads:**
  - Tamanho e quantidade validados antes de gerar a signed upload URL.
  - Tipo validado pelos **bytes do arquivo** (magic number), não pela extensão nem pelo `Content-Type` do client. Aceitos: PDF, JPEG, PNG, WEBP, HEIC (redações); logos só PNG/JPEG/WEBP — **nunca SVG** (pode conter script).
  - Nome no storage gerado pelo servidor (`<tenant>/<recurso>/<uuid>.<ext>`). O nome original, se exibido, é tratado como texto não confiável.
  - Downloads com `Content-Disposition: attachment` para tipos que o navegador executaria.

## 6. Sanitização e XSS

- O React escapa texto por padrão. **Proibido `dangerouslySetInnerHTML`** com qualquer dado vindo de usuário.
- Markdown (propostas de tema, comentários): renderizar com `react-markdown` **sem** `rehype-raw`; se precisar de HTML, passar por `rehype-sanitize` com allowlist.
- Links vindos do usuário: aceitar só `https:` (bloquear `javascript:`, `data:`); `rel="noopener noreferrer"` em `target="_blank"`.
- YouTube: guardar só o `video_id` validado (regex `^[A-Za-z0-9_-]{11}$`) e montar a URL de embed no servidor. Nunca embutir URL colada pelo usuário em `iframe`.
- Redirects pós-login: aceitar só caminhos relativos internos (`/^\/(?!\/)/`) — evita open redirect.
- Emails e push: dados do usuário entram como texto (React Email escapa); nada de concatenar HTML.

## 7. SQL injection

- supabase-js/PostgREST parametriza os valores. Os riscos reais são outros:
  - **Filtros em string**: `.or()`, `.filter()` e `.textSearch()` recebem sintaxe do PostgREST. **Nunca interpole input** ali (`.or(\`title.ilike.%${q}%\`)`permite injetar filtros). Use`.ilike("title", \`%${escaped}%\`)` com o input escapado (`%`, `_`, `\`) ou uma função RPC com parâmetro.
  - **SQL dinâmico em plpgsql**: use `format()` com `%L` (literal) e `%I` (identificador), ou `EXECUTE … USING`. Nunca `||` com parâmetro.
  - **Funções `security definer`**: sempre `set search_path = ''`, nomes totalmente qualificados (`public.essays`), checagem de `auth.uid()` e papel **dentro** da função, e `revoke execute … from public, anon` + `grant` só para quem precisa.
- Views em `public` com `security_invoker = true` (senão ignoram RLS).
- O CI roda `supabase db lint`; warnings de segurança devem ser corrigidos, não silenciados.

## 8. Migrations e rollback

- **Toda** mudança de schema é uma migration versionada em `supabase/migrations/`. Nada de alterar schema pelo dashboard de produção.
- **Nunca edite** uma migration já aplicada em staging/produção — crie outra.
- Mudanças destrutivas seguem **expand → migrate → contract**, em deploys separados:
  1. Adiciona coluna/tabela nova (compatível com o código antigo).
  2. Deploy do código que escreve nas duas/lê da nova; backfill.
  3. Só depois remove o antigo.
     Nunca faça `drop`/`rename` de coluna em uso no mesmo deploy do código novo.
- Cada migration traz no topo um bloco de rollback:
  ```sql
  -- rollback:
  -- alter table public.essays drop column late;
  ```
  Se não houver rollback seguro (perda de dados), escreva `-- rollback: IRREVERSÍVEL — exige backup/PITR` e **peça aprovação**.
- Tabela nova ⇒ na mesma migration: `enable row level security`, policies, índices em `tenant_id` e FKs, trigger `app.set_updated_at`, e teste pgTAP em `supabase/tests/`.
- Antes de aplicar em produção: aplicar em staging, rodar `supabase test db` e conferir que existe backup recente.
- **Rollback de app:** "Instant Rollback" da Vercel para o deploy anterior. **Rollback de banco:** migration compensatória; PITR só em último caso (ver plano de recuperação).

## 9. Controle de acesso

- **Default deny.** Tabela sem policy = ninguém acessa (exceto service role). Toda policy é específica por operação (`select`, `insert`, `update`, `delete`) e por papel.
- Isolamento de tenant **no banco** (RLS com `app.is_member(tenant_id)` / `app.is_staff(tenant_id)`). Checagens no código são uma segunda camada, não a primeira.
- Dentro do tenant:
  - Aluno só vê o próprio conteúdo e o que foi publicado para as turmas dele.
  - Teacher só as turmas às quais está vinculado.
  - Aluno `pending`/`suspended` não vê nada além do próprio membership.
  - Correção só visível ao aluno após `published_at`.
- Policies de `update` sempre com `using` **e** `with check` (impede mover a linha para outro tenant/dono).
- Colunas sensíveis que o aluno não pode alterar (`status`, `tenant_id`, `student_id`): use policies + trigger/`with check`, ou `revoke update (coluna)` para `authenticated`.
- **IDOR:** todo acesso por ID (`/redacoes/[id]`) passa por RLS. Nunca busque com o admin client para "facilitar".
- Storage: policies nos buckets espelhando as da tabela (primeiro segmento do path = `tenant_id`; dono via join). Signed URLs com expiração curta (≤ 10 min para visualização).
- Todo teste de RLS cobre: tenant A × tenant B, aluno × outro aluno, aluno pendente, teacher de outra turma, usuário anônimo.

## 10. Rate limit

- **Auth:** limites nativos do Supabase (`[auth.rate_limit]` e `max_frequency = "60s"` para emails). Espelhar no projeto hospedado.
- **Aplicação:** limitar ações caras ou abusáveis, por usuário **e** por IP:
  - envio de redação: 10/hora por aluno;
  - criação de dúvida/resposta: 30/hora;
  - geração de signed URL: 120/min;
  - cadastro por código de turma: 10/hora por IP;
  - envio de push/email de teste: 5/hora.
- Implementação: propor antes de adicionar dependência. Opções: tabela `rate_limits` no Postgres com função atômica (sem dependência nova, suficiente no início) **ou** Upstash Redis + `@upstash/ratelimit` (mais rápido, custo extra). Na borda, considerar regras do firewall da Vercel.
- Resposta ao estourar: HTTP 429 / `{ ok: false, error: "rate_limited" }` com mensagem clara ("Muitas tentativas. Tente de novo em alguns minutos.").

## 11. Segredos

- Segredos só em variáveis de ambiente (Vercel por ambiente; `.env.local` no dev). `.env*` está no `.gitignore` — só `.env.example` (sem valores reais) é versionado.
- **Nunca** prefixe segredo com `NEXT_PUBLIC_` (vai para o bundle do browser).
- `SUPABASE_SERVICE_ROLE_KEY` só em `lib/supabase/admin.ts` (que importa `server-only`), e todo uso tem `// SERVICE_ROLE: <motivo>`.
- Leitura de env validada com Zod (`lib/env.ts`, `lib/env.server.ts`) — falha cedo se faltar.
- O CI roda **gitleaks** em todo o histórico. Segredo commitado ⇒ **rotacionar imediatamente** (apagar do histórico não basta) e seguir o plano de recuperação.
- Chaves VAPID, Resend e similares: uma por ambiente; nunca reutilizar produção em staging/dev.

## 12. CORS e origem

- Server Actions já checam `Origin` contra o host. Os subdomínios de tenant são o próprio host, então **não** adicione `serverActions.allowedOrigins` genéricos.
- Route handlers **não** mandam headers CORS por padrão. Se um endpoint precisar ser chamado de outra origem, use allowlist explícita — **nunca `Access-Control-Allow-Origin: *` com credenciais**.
- A API do Supabase aceita qualquer origem por design; quem protege os dados é o RLS. Por isso o RLS é inegociável.
- Webhooks (pagamento etc.): validar assinatura (HMAC) e timestamp, rejeitar replays, responder rápido e processar idempotente.

## 13. Logs

- Logs estruturados (JSON) com: `level`, `event`, `request_id`, `tenant_id`, `user_id` (UUID), `duration_ms`.
- **Nunca logar:** senhas, tokens, cookies, headers `Authorization`, signed URLs, conteúdo de redação/dúvida, emails, nomes, telefones, payloads completos de formulário.
- Erros: logar a stack no servidor e devolver mensagem genérica + `request_id` para o usuário.
- Eventos de segurança **sempre** registrados (em `audit_logs` e/ou log): login falho repetido, mudança de papel, aprovação/suspensão, reset de senha/MFA, acesso de `platform_admin`, exportação de dados, rate limit estourado.
- `audit_logs` é append-only para a aplicação (sem policy de `update`/`delete`).

## 14. Backup

- Supabase: backups diários (planos pagos) e **PITR** quando o volume justificar.
- **Os backups do Supabase NÃO incluem arquivos do Storage.** É preciso job próprio de cópia dos buckets (ex.: GitHub Action agendada ou cron copiando para um bucket S3/R2 em outra conta, com versionamento e retenção).
- Backup lógico próprio do banco (`supabase db dump` / `pg_dump`) semanal, criptografado, fora do Supabase — protege contra perda da conta/projeto.
- Retenção sugerida: diários 7 dias, semanais 4 semanas, mensais 6 meses.
- **Backup que nunca foi restaurado não existe:** restauração de teste em projeto separado 1×/mês (ou a cada mudança grande de schema), registrando o tempo em `docs/`.

## 15. Criptografia de dados sensíveis

- Em trânsito: TLS em tudo (Vercel, Supabase, Resend). Em repouso: o Supabase criptografa disco e backups.
- **Minimização primeiro:** o melhor dado sensível é o que não é coletado. Não pedir CPF, RG, endereço ou data de nascimento sem necessidade clara na spec.
- Se for inevitável guardar algo sensível (ex.: CPF para nota fiscal, token de integração de um tenant):
  - criptografar na aplicação com **AES-256-GCM**, chave em variável de ambiente (`DATA_ENCRYPTION_KEY`), IV aleatório por valor, guardar `iv + tag + ciphertext`;
  - ou usar o **Supabase Vault** para segredos;
  - nunca criptografia caseira nem ECB.
- Signed URLs curtas para arquivos; buckets privados (exceto `branding`).

## 16. Dependências

- Antes de adicionar: é mantida (commits recentes)? Tem muitos downloads? Tem alternativa já na stack? Justifique no PR.
- `pnpm-lock.yaml` sempre commitado; CI usa `--frozen-lockfile`.
- CI roda `pnpm audit --prod --audit-level high` — vulnerabilidade alta/crítica bloqueia o merge.
- Dependabot abre PRs semanais. PRs de segurança têm prioridade; revisar o changelog em majors.
- Scripts de install (`postinstall`) de pacotes novos: o pnpm bloqueia por padrão — só liberar em `pnpm-workspace.yaml` com motivo.

## 17. Menor privilégio

- **Banco:** a aplicação usa `anon`/`authenticated` com RLS. Service role só nos casos do `CLAUDE.md`. Funções `security definer` com `execute` concedido só a quem precisa.
- **Papéis do produto:** teacher não vê turma que não é dele; só `owner` mexe em configuração, equipe e marca.
- **Infra:** MFA obrigatório nas contas de GitHub, Vercel, Supabase, Resend e registrador de domínio. Acesso ao projeto Supabase de produção só para quem precisa.
- **GitHub:** proteger `main` (PR obrigatório + CI verde), repo privado para o código do produto, secret scanning e push protection ligados.
- **Tokens/API keys:** escopo mínimo e um por ambiente.

## 18. Monitoramento e alertas

- **Erros:** um serviço de error tracking (ex.: Sentry) com scrubbing de dados pessoais ligado — propor na etapa 12.
- **Uptime:** monitor externo em `https://<dominio>/api/health` a cada 1–5 min, alertando por email/WhatsApp.
- **Banco:** Security Advisor e Performance Advisor do Supabase revisados a cada release; alertas de uso (disco, conexões, egress).
- **Alertas mínimos:**
  - site fora do ar;
  - taxa de erro 5xx acima do normal;
  - pico de login falho ou de 429;
  - job de backup falhou;
  - quota de Storage/banco perto do limite;
  - PR de segurança do Dependabot aberto há mais de 7 dias.
- Todo alerta precisa ter um dono e uma ação descrita no plano de recuperação.

## 19. Plano de recuperação

Ver `references/plano-recuperacao.md`: metas de RPO/RTO, runbooks por cenário (deploy quebrado, migration ruim, dados apagados, segredo vazado, conta comprometida, vazamento de dados/LGPD, indisponibilidade do provedor) e o fluxo de comunicação.

---

## Regras de ouro (se esquecer todo o resto)

1. RLS em toda tabela, testado com dois tenants.
2. `tenant_id` nunca vem do client.
3. Zod no servidor em toda entrada.
4. Service role só com comentário justificando.
5. Nenhum segredo no código, nenhum dado pessoal no log.
6. Migration com rollback escrito e teste de RLS.
7. Na dúvida sobre segurança, pare e pergunte.
