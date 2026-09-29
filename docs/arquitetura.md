# Arquitetura

## Visão geral

```
Aluno/Professor (PWA no celular ou desktop)
        │
        ▼
Vercel — Next.js (App Router)
  ├─ proxy.ts: resolve tenant pelo subdomínio
  ├─ Server Components / Server Actions
  └─ Route handlers (push, webhooks)
        │
        ▼
Supabase
  ├─ Postgres + RLS (isolamento por tenant)
  ├─ Auth (email/senha, reset, confirmação)
  └─ Storage (redações, materiais, logos)
        │
        ├─ Resend (email)
        └─ Web Push (VAPID)
```

## Multi-tenancy

**Modelo:** banco único, coluna `tenant_id` em toda tabela de domínio, isolamento via RLS.

**Resolução do tenant:**

- `professora.dominio.com.br` → `tenants.slug = 'professora'`.
- O `src/proxy.ts` lê o host, busca o tenant (com cache) e injeta `x-tenant-id` nos headers da request.
- Domínio raiz → site de marketing e cadastro de novos tenants.
- Subdomínio inexistente → 404.
- Dev local: usar `<slug>.localhost:3000`.
- Futuro: domínio próprio do cliente (coluna `custom_domain`).

**Identidade × vínculo:**

- Um `auth.users` pode ter vínculo com mais de um tenant (ex.: aluno de dois professores).
- O vínculo fica em `memberships` (`user_id`, `tenant_id`, `role`, `status`).
- O papel é sempre **por tenant**, nunca global (exceto admin da plataforma).

## Papéis

| Papel            | Escopo | Pode                                                            |
| ---------------- | ------ | --------------------------------------------------------------- |
| `platform_admin` | global | Gerenciar tenants (suporte). Acesso via service role, auditado. |
| `owner`          | tenant | Tudo no tenant: configurações, marca, equipe, turmas, correção  |
| `teacher`        | tenant | Turmas atribuídas: temas, correção, dúvidas, materiais, aulas   |
| `student`        | tenant | Seu próprio conteúdo + conteúdo publicado das suas turmas       |

Status de membership: `pending` → `approved` \| `rejected` \| `suspended`. Só `approved` acessa conteúdo.

**MFA:** `owner`, `teacher` e `platform_admin` precisam de MFA (TOTP). Sem sessão `aal2`, o app redireciona para o cadastro/verificação do fator e o RLS não concede acesso de staff. Alunos: opcional.

## Modelo de dados

> Todas as tabelas têm `id uuid pk default gen_random_uuid()`, `created_at` e `updated_at`, exceto onde indicado.
> `tenant_id` sempre com FK e índice.

### tenants

| coluna        | tipo             | nota                                                                         |
| ------------- | ---------------- | ---------------------------------------------------------------------------- |
| name          | text             |                                                                              |
| slug          | text unique      | subdomínio; `^[a-z0-9-]{3,40}$`; lista de reservados (www, app, api, admin…) |
| logo_path     | text null        | bucket `branding`                                                            |
| primary_color | text             | hex                                                                          |
| custom_domain | text unique null | futuro                                                                       |
| plan          | text             | `trial`, `basic`, `pro` (cobrança fica para fase 2)                          |
| status        | text             | `active`, `suspended`                                                        |

### profiles (1:1 com auth.users, global)

| coluna      | tipo      | nota            |
| ----------- | --------- | --------------- |
| id          | uuid pk   | = auth.users.id |
| full_name   | text      |                 |
| avatar_path | text null |                 |

Sem `tenant_id`: o perfil é da pessoa. Dados por tenant ficam em `memberships`.

### memberships

| coluna      | tipo             | nota                                           |
| ----------- | ---------------- | ---------------------------------------------- |
| tenant_id   | uuid             |                                                |
| user_id     | uuid             | FK auth.users                                  |
| role        | text             | `owner`, `teacher`, `student`                  |
| status      | text             | `pending`, `approved`, `rejected`, `suspended` |
| approved_by | uuid null        |                                                |
| approved_at | timestamptz null |                                                |

`unique (tenant_id, user_id)`

### classes (turmas)

| coluna       | tipo             | nota                                             |
| ------------ | ---------------- | ------------------------------------------------ |
| tenant_id    | uuid             |                                                  |
| name         | text             | ex.: "Extensivo 2027 — Noite"                    |
| join_code    | text             | código de convite, único por tenant, regenerável |
| join_enabled | boolean          | desliga novos cadastros                          |
| archived_at  | timestamptz null |                                                  |

### class_members

| coluna    | tipo | nota                 |
| --------- | ---- | -------------------- |
| tenant_id | uuid |                      |
| class_id  | uuid |                      |
| user_id   | uuid |                      |
| role      | text | `teacher`, `student` |

`unique (class_id, user_id)`

### themes (temas de redação)

| coluna           | tipo      | nota                                         |
| ---------------- | --------- | -------------------------------------------- |
| tenant_id        | uuid      |                                              |
| title            | text      |                                              |
| prompt           | text      | proposta, em markdown                        |
| motivating_texts | jsonb     | textos motivadores `[{title, body, source}]` |
| attachment_path  | text null | PDF opcional da proposta                     |
| created_by       | uuid      |                                              |

### theme_assignments (tema publicado para turma)

| coluna    | tipo             | nota |
| --------- | ---------------- | ---- |
| tenant_id | uuid             |      |
| theme_id  | uuid             |      |
| class_id  | uuid             |      |
| opens_at  | timestamptz      |      |
| due_at    | timestamptz null |      |

`unique (theme_id, class_id)`. Um tema pode ser reutilizado em várias turmas e anos.

### essays (redações)

| coluna        | tipo        | nota                                              |
| ------------- | ----------- | ------------------------------------------------- |
| tenant_id     | uuid        |                                                   |
| student_id    | uuid        |                                                   |
| assignment_id | uuid null   | null = redação livre, se o tenant permitir        |
| class_id      | uuid        | desnormalizado para RLS/consultas                 |
| status        | text        | `submitted`, `in_review`, `corrected`, `returned` |
| submitted_at  | timestamptz |                                                   |
| student_note  | text null   | observação do aluno                               |

### essay_files

| coluna       | tipo | nota                    |
| ------------ | ---- | ----------------------- |
| tenant_id    | uuid |                         |
| essay_id     | uuid |                         |
| storage_path | text |                         |
| mime_type    | text |                         |
| size_bytes   | int  |                         |
| page_order   | int  | redação em várias fotos |

### corrections

| coluna                 | tipo             | nota                                                                                                                                                               |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tenant_id              | uuid             |                                                                                                                                                                    |
| essay_id               | uuid unique      | 1 correção por redação (reenvio = nova redação)                                                                                                                    |
| corrector_id           | uuid             |                                                                                                                                                                    |
| c1..c5                 | smallint         | `check (cN in (0,40,80,120,160,200))`                                                                                                                              |
| total                  | smallint         | coluna gerada: c1+…+c5                                                                                                                                             |
| zero_reason            | text null        | `fuga_tema`, `nao_dissertativo`, `texto_insuficiente`, `copia_motivadores`, `parte_desconectada`, `identificacao`, `em_branco`, `outro`. Se preenchido, c1..c5 = 0 |
| comment_c1..comment_c5 | text null        | comentário por competência                                                                                                                                         |
| general_comment        | text null        |                                                                                                                                                                    |
| correction_file_path   | text null        | PDF/imagem corrigida, opcional                                                                                                                                     |
| published_at           | timestamptz null | aluno só vê quando publicada                                                                                                                                       |

### questions (dúvidas)

| coluna          | tipo      | nota                                |
| --------------- | --------- | ----------------------------------- |
| tenant_id       | uuid      |                                     |
| student_id      | uuid      |                                     |
| class_id        | uuid      |                                     |
| essay_id        | uuid null | dúvida sobre uma redação específica |
| body            | text      |                                     |
| attachment_path | text null |                                     |
| status          | text      | `open`, `answered`, `closed`        |

### question_replies

| coluna      | tipo | nota |
| ----------- | ---- | ---- |
| tenant_id   | uuid |      |
| question_id | uuid |      |
| author_id   | uuid |      |
| body        | text |      |

Fio de conversa: aluno e professor podem responder.

### materials

| coluna       | tipo             | nota |
| ------------ | ---------------- | ---- |
| tenant_id    | uuid             |      |
| title        | text             |      |
| description  | text null        |      |
| file_path    | text null        |      |
| external_url | text null        |      |
| published_at | timestamptz null |      |

`check (file_path is not null or external_url is not null)`. Vínculo com turmas em `material_classes (tenant_id, material_id, class_id)`.

### lessons (aulas gravadas)

| coluna           | tipo             | nota                               |
| ---------------- | ---------------- | ---------------------------------- |
| tenant_id        | uuid             |                                    |
| title            | text             |                                    |
| description      | text null        |                                    |
| youtube_video_id | text             | extraído e validado do link colado |
| module           | text null        | agrupamento simples                |
| position         | int              | ordem                              |
| published_at     | timestamptz null |                                    |

Vínculo com turmas em `lesson_classes`. Opcional: `lesson_progress (user_id, lesson_id, completed_at)`.

### notifications (in-app)

| coluna    | tipo             | nota               |
| --------- | ---------------- | ------------------ |
| tenant_id | uuid             |                    |
| user_id   | uuid             | destinatário       |
| type      | text             | ver eventos abaixo |
| title     | text             |                    |
| body      | text             |                    |
| link      | text             | rota interna       |
| read_at   | timestamptz null |                    |

### push_subscriptions

| coluna     | tipo        | nota |
| ---------- | ----------- | ---- |
| user_id    | uuid        |      |
| tenant_id  | uuid        |      |
| endpoint   | text unique |      |
| p256dh     | text        |      |
| auth       | text        |      |
| user_agent | text        |      |

### notification_preferences

| coluna        | tipo    | nota |
| ------------- | ------- | ---- |
| user_id       | uuid    |      |
| tenant_id     | uuid    |      |
| email_enabled | boolean |      |
| push_enabled  | boolean |      |

### audit_logs

| coluna    | tipo      | nota                      |
| --------- | --------- | ------------------------- |
| tenant_id | uuid null |                           |
| actor_id  | uuid null |                           |
| action    | text      |                           |
| entity    | text      |                           |
| entity_id | uuid      |                           |
| metadata  | jsonb     | nunca conteúdo de redação |

Registra aprovações, correções publicadas, mudanças de papel e acessos de `platform_admin`.

## RLS — padrão

Funções auxiliares no schema `app`, todas `security definer`, `stable` e com `search_path` fixo:

```sql
-- papel aprovado do usuário atual no tenant (null se não tiver)
create function app.current_role(t uuid) returns text ...

create function app.is_staff(t uuid) returns boolean ...  -- owner ou teacher aprovado E sessão com MFA (jwt aal = 'aal2')
create function app.is_member(t uuid) returns boolean ... -- qualquer papel aprovado
create function app.in_class(c uuid) returns boolean ...  -- usuário atual está na turma
```

Padrões de policy:

| Tabela               | Aluno aprovado                                                                             | Staff                                             |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| essays / essay_files | select/insert só onde `student_id = auth.uid()`; update só enquanto `status = 'submitted'` | select/update no tenant (teacher: só turmas dele) |
| corrections          | select só da própria redação **e** `published_at is not null`                              | tudo no tenant                                    |
| themes / assignments | select se atribuído a turma dele **e** `opens_at <= now()`                                 | tudo                                              |
| materials / lessons  | select se publicado **e** vinculado a turma dele                                           | tudo                                              |
| questions / replies  | só as próprias                                                                             | tenant                                            |
| notifications        | só `user_id = auth.uid()`                                                                  | só as próprias                                    |
| memberships          | a própria                                                                                  | tenant (para aprovar)                             |

Aluno `pending` não passa em `is_member`, então não vê nada além do próprio membership.

**Storage:** policies no bucket `essays` checam o primeiro segmento do path (`tenant_id`) e, para alunos, o dono do `essay_id` via join.

## Notificações

Uma função só, `notify(event, payload)`, em `lib/notifications`, chamada pelas server actions depois do commit. Ela:

1. insere em `notifications` (in-app, sempre),
2. envia email se `email_enabled`,
3. envia push para cada `push_subscription` do usuário se `push_enabled`. Remove a subscription se o endpoint retornar 404/410.

| Evento                                    | Destinatário                           |
| ----------------------------------------- | -------------------------------------- |
| `theme.published`                         | alunos aprovados das turmas atribuídas |
| `essay.submitted`                         | professores da turma                   |
| `correction.published`                    | aluno autor                            |
| `question.created`                        | professores da turma                   |
| `question.replied`                        | a outra parte                          |
| `membership.pending`                      | owner e teachers                       |
| `membership.approved`                     | aluno                                  |
| `material.published` / `lesson.published` | alunos das turmas                      |

Fase 1: envio síncrono, com timeout e falha silenciosa logada (a notificação in-app é a fonte da verdade). Se o volume crescer, mover email e push para fila (outbox + cron).

**Limitação do iOS:** web push só funciona com o PWA instalado na tela inicial (iOS 16.4+). Por isso a UI deve incentivar a instalação, e o email é o canal de fallback.

## Storage

| Bucket        | Público | Path                               |
| ------------- | ------- | ---------------------------------- |
| `essays`      | não     | `<tenant>/<essay_id>/<n>.<ext>`    |
| `corrections` | não     | `<tenant>/<essay_id>/<arquivo>`    |
| `materials`   | não     | `<tenant>/<material_id>/<arquivo>` |
| `questions`   | não     | `<tenant>/<question_id>/<arquivo>` |
| `branding`    | sim     | `<tenant>/logo.<ext>`              |

## Ambientes

- **local:** Supabase CLI (Docker) + `*.localhost`
- **staging:** projeto Supabase separado + preview da Vercel
- **produção:** projeto Supabase de produção, com backups diários (PITR quando o plano permitir) + domínio wildcard `*.dominio.com.br` na Vercel

## Fora da fase 1 (previsto no desenho)

- Migração dos dados do sistema PHP atual (script MySQL → Postgres; importar hash bcrypt se for o formato atual, senão forçar redefinição).
- Cobrança recorrente (Asaas/Stripe), limites por plano.
- Anotação sobre a imagem da redação.
- Pré-correção com IA (sugestão de notas, professor revisa).
- Dashboard de evolução por competência.
- Aula ao vivo (fase inicial: YouTube Live embutido + chat; depois sala via LiveKit).
- Domínio personalizado por tenant.
