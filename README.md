# Plataforma de Redação

SaaS multi-tenant para professores e cursinhos de redação (Enem): envio de redações, correção por competência, dúvidas, materiais, aulas e notificações. PWA.

- Arquitetura: [`docs/arquitetura.md`](docs/arquitetura.md)
- Plano da fase 1: [`docs/fase-1-nucleo.md`](docs/fase-1-nucleo.md)
- Regras para o Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Postgres + RLS, Auth, Storage) · Vitest · Playwright · pgTAP · GitHub Actions · Vercel

## Rodando localmente

Pré-requisitos: Node 22, pnpm 10, Docker.

```bash
pnpm install
pnpm db:start              # sobe Supabase local (Docker)
cp .env.example .env.local # cole as chaves que o db:start mostrou
pnpm db:reset              # aplica migrations + seed
pnpm dev                   # http://localhost:3000
```

Tenants rodam em subdomínio: `http://<slug>.localhost:3000` (a partir da etapa 1).

## Verificação

```bash
pnpm check   # lint + typecheck + vitest + testes de RLS
pnpm e2e     # playwright (desktop + mobile)
```

Na primeira vez: `pnpm exec playwright install chromium`.

## Status

- [x] Etapa 0 — setup do projeto
- [ ] Etapa 1 — tenants + resolução por subdomínio
