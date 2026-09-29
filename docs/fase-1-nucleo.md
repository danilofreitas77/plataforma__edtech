# Fase 1 — Núcleo

Objetivo: ter o produto novo com **paridade funcional** com o sistema PHP atual, já multi-tenant, com redefinição de senha e PWA. Ao fim da fase, a cliente atual pode ser migrada como tenant #1.

Fora do escopo: cobrança, IA, anotação na imagem, aula ao vivo, dashboards avançados, migração de dados (vira a fase 1.5).

## Ordem de implementação

Cada etapa é uma branch/PR. Não comece a próxima sem a anterior passando em lint, typecheck e testes.

| #   | Etapa                                       | Depende de |
| --- | ------------------------------------------- | ---------- |
| 0   | Setup do projeto                            | —          |
| 1   | Tenants + resolução por subdomínio          | 0          |
| 2   | Auth completo                               | 1          |
| 3   | Turmas + cadastro por código + aprovação    | 2          |
| 4   | Layouts (aluno/professor) + marca do tenant | 3          |
| 5   | Temas e atribuição para turmas              | 4          |
| 6   | Envio de redação                            | 5          |
| 7   | Correção por competência                    | 6          |
| 8   | Dúvidas                                     | 6          |
| 9   | Materiais e aulas gravadas                  | 4          |
| 10  | Notificações (in-app, email, push)          | 7, 8       |
| 11  | PWA                                         | 10         |
| 12  | Polimento, e2e e deploy em staging          | todos      |

Obs.: a etapa 10 pode ser iniciada antes, com `notify()` só gravando in-app, e as etapas 5–9 já chamando `notify()`. Email e push entram depois sem mudar os chamadores.

---

## 0. Setup do projeto

- Next.js + TypeScript strict, pnpm, ESLint, Prettier.
- Tailwind + shadcn/ui inicializados.
- Supabase CLI inicializado (`supabase/`), com `config.toml` versionado.
- Clients Supabase: `server.ts`, `browser.ts`, `admin.ts` (este com `import "server-only"`).
- Scripts do `CLAUDE.md` funcionando (`dev`, `db:types`, `test`, `e2e`, `lint`, `typecheck`).
- Vitest, Playwright e pgTAP configurados, com 1 teste de exemplo cada.
- GitHub Actions: lint + typecheck + test + `supabase test db` em todo PR.
- `.env.example` com todas as variáveis.

**Aceite:** `pnpm dev` sobe, CI verde num PR vazio.

## 1. Tenants + resolução por subdomínio

- Migration: `tenants`, `profiles` (com trigger que cria profile ao criar `auth.users`), `memberships`, funções `app.*` de RLS.
- `src/proxy.ts` (Next 16 — antigo middleware): extrai o slug do host, resolve o tenant (cache em memória com TTL curto) e injeta `x-tenant-id`. Retorna 404 se o slug não existir ou o tenant estiver suspenso.
- Helper `getTenant()` para Server Components e Actions.
- Seed: 2 tenants (`demo-a`, `demo-b`), cada um com owner, teacher e 3 alunos (um `pending`).

**Aceite:**

- `demo-a.localhost:3000` e `demo-b.localhost:3000` resolvem tenants diferentes.
- Slug inexistente → 404.
- Testes de RLS: usuário de `demo-a` não lê `memberships` de `demo-b`.

## 2. Auth completo

Telas (dentro do subdomínio do tenant, com a marca dele):

- Login (email + senha).
- Cadastro de aluno — só via código de turma (ver etapa 3).
- Confirmação de email.
- **Esqueci minha senha** → email com link → **definir nova senha**.
- Alterar senha logado (em "Minha conta").
- Logout.

Regras:

- Senha mínima de 8 caracteres.
- Mensagem de login genérica ("email ou senha inválidos"), sem revelar se o email existe.
- Rate limit do Supabase Auth ativo.
- Login em tenant onde o usuário não tem membership → tela "você não tem acesso a esta escola".
- Emails de auth em português, com nome e logo do tenant (templates do Supabase ou Resend via hook).

**Aceite:** e2e cobrindo cadastro → confirmação → login → esqueci senha → nova senha → login com a nova senha.

## 3. Turmas + cadastro por código + aprovação

Professor:

- CRUD de turmas (arquivar em vez de apagar).
- Ver e regenerar `join_code`, ligar/desligar `join_enabled`.
- Link de convite pronto pra copiar: `https://<slug>.dominio/cadastro?turma=<code>`.
- Lista de cadastros pendentes com **aprovar / recusar** (individual e em lote).
- Lista de alunos por turma. Pode mover o aluno de turma e suspender o acesso.

Aluno:

- Cadastro com código da turma → membership `pending` + `class_members`.
- Enquanto `pending`: tela "aguardando aprovação do professor", sem nenhum outro conteúdo.
- Usuário já existente (de outro tenant) pode entrar com a mesma conta e pedir acesso.

**Aceite:**

- Código inválido ou turma com `join_enabled = false` → erro claro.
- Teste de RLS: aluno `pending` não lê temas, materiais, aulas nem redações.
- Aprovação dispara `membership.approved`. Novo cadastro dispara `membership.pending`.

## 4. Layouts + marca do tenant

- Layout do aluno: navegação inferior no mobile (Início, Redações, Aulas, Materiais, Dúvidas) e sidebar no desktop.
- Layout do professor: sidebar (Painel, Turmas, Temas, Correções, Dúvidas, Materiais, Aulas, Configurações).
- Sino de notificações com contador de não lidas no header.
- Configurações do tenant (owner): nome, logo (upload para `branding`), cor primária. A cor vira CSS variable aplicada ao tema.
- Painel do professor: redações aguardando correção, dúvidas abertas, cadastros pendentes.
- Início do aluno: temas abertos com prazo, últimas correções, avisos.
- Estados vazios e de carregamento em todas as listas.

**Aceite:** trocar logo e cor reflete nas telas do tenant sem afetar o outro. Tudo usável em 375px.

## 5. Temas e atribuição

- CRUD de temas: título, proposta (markdown), textos motivadores (lista editável), PDF opcional.
- Atribuir tema a uma ou mais turmas com `opens_at` (padrão: agora) e `due_at` opcional.
- Duplicar tema (reuso entre anos).
- Aluno vê os temas abertos das suas turmas, com prazo e status ("não enviado", "enviado", "corrigido").
- Publicar (quando `opens_at` chega) dispara `theme.published`. Para agendamento futuro, fica para depois: na fase 1, notifica só se `opens_at <= now()` no momento da atribuição.

**Aceite:** aluno de turma não atribuída não vê o tema (teste de RLS).

## 6. Envio de redação

- A partir do tema: enviar **PDF** (1 arquivo) **ou fotos** (1 a 4 imagens, ordenáveis).
- No celular, o botão de foto abre a câmera (`accept="image/*" capture="environment"`).
- Compressão no client antes do upload: lado maior até 2000 px, JPEG qualidade ~0.8. HEIC convertido quando o navegador suportar; senão, envia como está e o servidor aceita.
- Validação no servidor: MIME, tamanho (≤ 15 MB por arquivo), quantidade.
- Upload direto para o Storage via signed upload URL gerada por server action, depois registro em `essays` + `essay_files`.
- Aluno pode trocar os arquivos enquanto `status = 'submitted'`. Depois que o professor abrir (`in_review`), não pode mais.
- Envio após `due_at`: permitido, mas marcado como **atrasado**.
- Observação opcional do aluno.
- Dispara `essay.submitted`.

**Aceite:**

- e2e: aluno envia 2 fotos pelo viewport mobile e o professor vê.
- RLS: aluno B não acessa arquivos do aluno A nem por signed URL forjada (a policy de storage bloqueia).

## 7. Correção por competência

Tela do professor:

- Fila de correção com filtros: turma, tema, status, atrasadas.
- Visualizador: imagens com zoom/rotação ou PDF embutido, lado a lado com o formulário (em cima e embaixo no mobile).
- Nota por competência C1–C5 com seletor de 0/40/80/120/160/200 e total calculado ao vivo.
- Comentário por competência + comentário geral.
- Zerar redação com motivo (zera todas as competências).
- Anexar arquivo corrigido (opcional, para quem corrige no papel ou no tablet).
- **Salvar rascunho** (aluno não vê) e **Publicar** (aluno vê e recebe `correction.published`).
- Abrir a redação muda o status para `in_review`.
- Atalho "próxima redação" após publicar.

Tela do aluno:

- Nota total em destaque, notas e comentários por competência, arquivo corrigido.
- Histórico das suas redações com nota.

**Aceite:**

- Constraint do banco impede nota fora dos valores válidos.
- Aluno não vê a correção antes de `published_at` (teste de RLS).
- Zerar exige motivo.

## 8. Dúvidas

- Aluno abre dúvida (texto + anexo opcional), geral ou ligada a uma redação.
- Conversa em fio: aluno e professor respondem.
- Professor vê a lista por status/turma e marca como respondida ou fechada.
- Dispara `question.created` e `question.replied`.

**Aceite:** aluno só vê as próprias dúvidas. Professor vê as das turmas dele.

## 9. Materiais e aulas gravadas

Materiais:

- Upload de arquivo (PDF, imagem, DOCX, PPTX, até 50 MB) ou link externo.
- Vincular a turmas, publicar/despublicar.
- Aluno baixa via signed URL.

Aulas:

- Professor cola o link do YouTube. O sistema extrai e valida o `video_id` (formatos `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`).
- Título, descrição, módulo e ordem (arrastar para ordenar).
- Player embutido com `youtube-nocookie.com`.
- Aluno vê as aulas agrupadas por módulo e marca como assistida.
- Publicar dispara `material.published` / `lesson.published`.

**Aceite:** teste unitário do parser de link do YouTube cobrindo todos os formatos e links inválidos.

## 10. Notificações

- `notify(event, payload)` resolve os destinatários conforme a tabela da arquitetura.
- In-app: sino com lista, marcar como lida (uma e todas), link para a tela certa. Atualiza via Supabase Realtime ou polling leve.
- Email via Resend: templates simples com a marca do tenant e link direto. Uma notificação por evento, sem digest na fase 1.
- Push: tela "ativar notificações" pede permissão, salva a subscription e envia teste. Remove subscriptions inválidas (404/410).
- Preferências por usuário: liga/desliga email e push.
- Falha de email/push não quebra a action (log + segue).

**Aceite:** professor publica correção → aluno recebe in-app, email e push (em Android/desktop; no iOS, com o PWA instalado).

## 11. PWA

- Manifest por tenant (nome, ícone, cor), gerado dinamicamente por rota.
- Service worker (Serwist): cache de shell e assets estáticos, página offline simples. **Não** cachear respostas com dados de alunos.
- Handler de `push` e `notificationclick` (abre a rota do link).
- Prompt de instalação próprio:
  - Android/desktop: botão usando `beforeinstallprompt`.
  - iOS: instrução visual "Compartilhar → Adicionar à Tela de Início", mostrada ao tentar ativar notificações.

**Aceite:** Lighthouse PWA instalável. Push funcionando com o app instalado no Android e no iOS 16.4+.

## 12. Polimento, e2e e staging

- Fluxo e2e completo: professor cria turma → aluno se cadastra → professor aprova → professor publica tema → aluno envia redação → professor corrige → aluno vê a nota.
- Revisão de acessibilidade básica (teclado, labels, contraste).
- Páginas de erro (404, 500, sem acesso).
- Termos de uso e política de privacidade (placeholders para revisão jurídica), com aceite no cadastro.
- Deploy em staging: projeto Supabase separado, Vercel com wildcard `*.staging.dominio`.
- Checklist de segurança revisado (abaixo).

## Checklist de segurança (rodar antes de fechar a fase)

- [ ] Toda tabela com RLS habilitado (`select tablename from pg_tables where schemaname='public' and not rowsecurity` retorna vazio).
- [ ] Nenhum uso de admin client sem comentário `SERVICE_ROLE`.
- [ ] Nenhum `tenant_id` aceito vindo do client.
- [ ] Buckets privados, exceto `branding`.
- [ ] Testes de isolamento entre tenants passando para todas as tabelas.
- [ ] Nenhum dado pessoal ou conteúdo de redação em logs.
- [ ] Headers de segurança (CSP, `X-Frame-Options`, `Referrer-Policy`).
- [ ] Variáveis de ambiente de produção fora do repositório.

## Definição de pronto da fase 1

- Todas as etapas com aceite cumprido.
- CI verde.
- Staging no ar com os 2 tenants de demo.
- A professora atual testou o fluxo completo em staging e aprovou.
