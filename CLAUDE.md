# CLAUDE.md

Guia para o Claude Code trabalhar neste repositório. Leia inteiro antes de qualquer tarefa.

@AGENTS.md

> **Next.js 16:** várias APIs mudaram em relação ao que você conhece (ex.: `middleware.ts` virou `proxy.ts`).
> Antes de usar uma API do Next, consulte `node_modules/next/dist/docs/`.

## O produto

SaaS multi-tenant para professores e cursinhos de redação (foco Enem). Cada tenant é um professor ou escola com sua própria marca, turmas e alunos.

Funções principais:

- Aluno envia redação (PDF ou foto) e dúvidas.
- Professor corrige com nota por competência do Enem (C1–C5) e responde dúvidas.
- Professor publica temas, materiais e aulas (links de vídeo do YouTube).
- Cadastro por turma, com aprovação do professor.
- Notificações: in-app, email e web push.

Especificações detalhadas ficam em `/docs`. **Sempre leia a spec da feature antes de implementar.** Se a spec for ambígua ou conflitar com este arquivo, pare e pergunte — não invente regra de negócio.

## Stack (decisões travadas — não trocar sem aprovação explícita)

| Camada                | Escolha                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Linguagem             | TypeScript em modo `strict` (proibido `any` sem comentário justificando)                  |
| Framework             | Next.js (App Router, Server Components, Server Actions)                                   |
| UI                    | Tailwind CSS + shadcn/ui + lucide-react                                                   |
| Formulários/validação | react-hook-form + Zod (schemas Zod compartilhados entre client e server)                  |
| Banco                 | Supabase Postgres, com Row Level Security (RLS) em **todas** as tabelas                   |
| Auth                  | Supabase Auth (email/senha, confirmação de email, redefinição de senha)                   |
| Arquivos              | Supabase Storage (buckets privados, acesso por signed URL)                                |
| Migrations            | Supabase CLI (`supabase/migrations/*.sql`), SQL puro                                      |
| Tipos do banco        | Gerados com `supabase gen types typescript` em `src/lib/db/types.ts` — nunca editar à mão |
| Email                 | Resend + React Email                                                                      |
| Web push              | `web-push` com chaves VAPID                                                               |
| PWA                   | Serwist (service worker + manifest)                                                       |
| Testes                | Vitest (unit), Playwright (e2e), testes SQL de RLS em `supabase/tests`                    |
| Deploy                | Vercel (app) + Supabase (banco/auth/storage)                                              |

Não adicione dependências novas sem justificar no PR. Prefira o que já está na stack.

## Estrutura de pastas

```
src/
  app/
    (marketing)/          # site público do SaaS (domínio raiz)
    (auth)/               # login, cadastro, redefinir senha — por tenant
    (app)/
      aluno/              # área do aluno
      professor/          # área do professor
    api/                  # route handlers (webhooks, push, etc.)
  components/
    ui/                   # shadcn (gerado, não editar à mão sem motivo)
    shared/               # componentes reutilizáveis do produto
  features/               # uma pasta por domínio: essays, classes, themes, questions, materials, lessons, notifications, tenants
    <feature>/
      actions.ts          # server actions
      queries.ts          # leituras (server-only)
      schemas.ts          # Zod
      components/
  lib/
    supabase/             # clients: server, browser, admin (service role)
    tenant/               # resolução de tenant
    notifications/        # notify() e canais (inapp, email, push)
    auth/                 # helpers de sessão e papel
supabase/
  migrations/
  tests/                  # testes de RLS (pgTAP)
  seed.sql
docs/
```

## Multi-tenancy — REGRAS INEGOCIÁVEIS

1. **Toda tabela de domínio tem `tenant_id uuid not null`**, com FK para `tenants` e índice.
2. **RLS habilitado em toda tabela**, sem exceção. Nenhuma policy `using (true)` em tabela de domínio.
3. O isolamento é garantido **pelo banco (RLS)**, não pelo código. Filtros por `tenant_id` no código são complementares, não substitutos.
4. O **client service role** (`lib/supabase/admin.ts`) ignora RLS. Só pode ser usado em:
   - webhooks,
   - jobs de sistema,
   - criação inicial de tenant.
     Todo uso precisa de comentário `// SERVICE_ROLE: <motivo>`. Nunca importe o admin client em código que roda no browser.
5. O tenant é resolvido pelo subdomínio (`<slug>.dominio.com.br`) no `src/proxy.ts` (no Next 16 o antigo `middleware.ts` se chama `proxy.ts`). Nunca confie em `tenant_id` vindo do body ou da query string do client.
6. **Toda migration que cria tabela deve vir com teste de RLS** em `supabase/tests`, provando que:
   - usuário do tenant A não lê nem escreve dados do tenant B,
   - aluno não lê redação de outro aluno,
   - aluno pendente (não aprovado) não acessa conteúdo.
7. Arquivos no Storage ficam em `<tenant_id>/<recurso>/<id>/<arquivo>`, com policies de storage equivalentes às da tabela.

## Segurança e LGPD

- Muitos alunos são **menores de idade**. Colete o mínimo de dados pessoais. Não registre conteúdo de redação nem dados pessoais em logs.
- Upload: valide tipo MIME e tamanho **no servidor**. Aceite apenas PDF, JPEG, PNG, WEBP e HEIC, com máximo de 15 MB. Comprima imagens no client antes de enviar.
- Arquivos só via signed URL com expiração curta. Buckets nunca públicos (exceto `branding`, para logos).
- Toda server action valida o input com Zod e checa papel e tenant antes de agir.
- Segredos só em variáveis de ambiente. Nunca commitar `.env*` (exceto `.env.example`).

## Convenções de código

- Nomes de código e banco em **inglês**. Textos de interface em **português do Brasil**.
- Tabelas no plural, snake_case. Colunas `created_at` e `updated_at` (trigger) em todas.
- Server Components por padrão. `"use client"` só quando precisar de interatividade.
- Mutations via Server Actions que retornam `{ ok: true, data } | { ok: false, error }`. Não lançar erro para o client.
- Datas: armazenar em UTC (`timestamptz`). Exibir em `America/Sao_Paulo`.
- Mobile-first: a maioria dos alunos usa celular. Teste toda tela em 375px de largura.
- Acessibilidade: labels em inputs, foco visível, contraste AA.

## Fluxo de trabalho

- Uma feature por branch e PR. Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`…).
- Antes de dar uma tarefa como concluída, rodar:
  ```
  pnpm check        # lint + typecheck + vitest + testes de RLS
  ```
- Mudou o schema? Crie a migration, rode `pnpm db:types` e escreva o teste de RLS.
- Features grandes: proponha um plano primeiro e espere aprovação.
- Não refatore código fora do escopo da tarefa sem pedir.
- Atualize a spec em `/docs` quando uma decisão mudar durante a implementação.

## Comandos

```
pnpm dev             # app local
pnpm db:start        # banco/auth/storage local (Docker)
pnpm db:reset        # recria banco local com migrations + seed
pnpm db:types        # gera tipos do banco em src/lib/db/types.ts
pnpm db:test         # testes de RLS (pgTAP)
pnpm test            # vitest
pnpm e2e             # playwright (desktop + mobile)
pnpm check           # tudo acima que roda sem browser
pnpm format          # prettier
```

Componentes shadcn: `pnpm dlx shadcn@latest add <componente>` (já configurado em `components.json`).

## Documentos

- `docs/arquitetura.md` — visão geral, multi-tenancy, modelo de dados, RLS, notificações.
- `docs/fase-1-nucleo.md` — escopo, critérios de aceite e ordem de implementação da fase 1.
