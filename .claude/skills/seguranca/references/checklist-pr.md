# Checklist de segurança do PR

Copie para a descrição do PR e marque. Item que não se aplica: `N/A` com o motivo em uma linha.

## Dados e acesso

- [ ] Tabela nova tem `tenant_id`, RLS habilitado, policies por operação e índice em `tenant_id`.
- [ ] Policies de `update` têm `using` **e** `with check`.
- [ ] Teste pgTAP cobre: tenant A × B, aluno × aluno, aluno pendente, teacher de outra turma, anônimo.
- [ ] Nenhum `tenant_id`, `student_id`, `status` ou papel aceito do client.
- [ ] Escrita de staff exige `aal2` (MFA).
- [ ] Nenhum uso novo do admin client — ou com `// SERVICE_ROLE: <motivo>`.
- [ ] Funções `security definer` com `search_path = ''`, checagem de papel interna e `execute` restrito.

## Entrada e saída

- [ ] Toda entrada validada com Zod (`strictObject`, `.max()` em strings/arrays) **no servidor**.
- [ ] Nenhum input interpolado em `.or()`, `.filter()`, `.textSearch()` ou SQL dinâmico.
- [ ] Nenhum `dangerouslySetInnerHTML` com dado de usuário. Markdown sem HTML cru.
- [ ] Uploads: tipo pelos bytes, tamanho e quantidade no servidor, nome gerado pelo servidor, sem SVG.
- [ ] Redirects só para caminhos internos.

## Sessão e auth

- [ ] Autorização no servidor usa `getUser()`/`getClaims()`, nunca `getSession()`.
- [ ] Mensagens de erro de auth não revelam se o email existe.
- [ ] Ações sensíveis (senha, MFA, papel) derrubam as outras sessões e geram `audit_logs`.

## Abuso

- [ ] Endpoint/ação nova abusável tem rate limit por usuário e por IP.

## Segredos e logs

- [ ] Nenhum segredo no código, em `NEXT_PUBLIC_*` ou em teste. `.env.example` atualizado (sem valores).
- [ ] Logs novos sem senha, token, signed URL, conteúdo de redação ou dado pessoal.
- [ ] Evento de segurança relevante registrado.

## Migration

- [ ] Migration nova (nenhuma migration aplicada foi editada).
- [ ] Bloco `-- rollback:` escrito (ou marcado IRREVERSÍVEL com aprovação).
- [ ] Mudança destrutiva segue expand → migrate → contract.
- [ ] `pnpm db:types` rodado.

## Dependências e config

- [ ] Dependência nova justificada (manutenção, alternativa na stack).
- [ ] `pnpm audit --prod --audit-level high` limpo.
- [ ] Headers de segurança e CSP não foram afrouxados.

## Verificação

- [ ] `pnpm check` verde (lint, typecheck, vitest, testes de RLS).
- [ ] `pnpm e2e` verde nos fluxos afetados (desktop e mobile).
