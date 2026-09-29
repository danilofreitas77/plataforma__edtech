# Plano de recuperação e resposta a incidentes

Manter este arquivo atualizado quando mudar infra, plano do Supabase ou contatos.

## Metas

| Métrica                              | Meta inicial                  | Como atingimos                                                           |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------ |
| **RPO** (quanto dado podemos perder) | 24 h (banco); 24 h (arquivos) | Backup diário do Supabase + cópia diária dos buckets. Com PITR: minutos. |
| **RTO** (quanto tempo fora do ar)    | 4 h                           | Rollback instantâneo da Vercel + runbooks abaixo + restauração ensaiada. |

Revisar as metas quando houver contrato com SLA ou mais tenants.

## Inventário

| Item                 | Onde                                        | Quem acessa |
| -------------------- | ------------------------------------------- | ----------- |
| Código               | GitHub `danilofreitas77/plataforma__edtech` | Danilo      |
| App                  | Vercel (produção + previews)                | Danilo      |
| Banco, Auth, Storage | Supabase — projetos `prod` e `staging`      | Danilo      |
| Email                | Resend                                      | Danilo      |
| Domínio e DNS        | registrador (preencher)                     | Danilo      |
| Backups externos     | bucket S3/R2 em conta separada (preencher)  | Danilo      |
| Monitoramento        | uptime + error tracking (preencher)         | Danilo      |

Todas as contas com MFA. Guardar códigos de recuperação fora do computador principal.

## Fluxo geral de incidente

1. **Detectar e registrar:** abrir uma issue privada `incidente: <resumo>` com hora de início.
2. **Conter:** parar o sangramento antes de investigar a fundo (rollback, desligar feature, revogar chave, suspender conta).
3. **Avaliar dados pessoais:** houve acesso indevido a dados de alunos? Se sim, seguir a seção LGPD.
4. **Corrigir** a causa e **recuperar** os dados.
5. **Comunicar** os tenants afetados (mensagem simples: o que aconteceu, impacto, o que foi feito, o que precisam fazer).
6. **Pós-incidente** (até 5 dias úteis): causa raiz, linha do tempo, ações para não repetir, virar teste quando possível.

## Runbooks

### Deploy quebrou a aplicação

1. Vercel → Deployments → deploy anterior saudável → **Instant Rollback**.
2. Se o deploy incluiu migration incompatível com o código antigo, ver o próximo runbook.
3. Reproduzir em staging, corrigir, novo PR.

### Migration causou problema

1. Parar novos deploys.
2. Se a migration tem `-- rollback:` seguro, aplicar como **nova migration compensatória** (primeiro em staging).
3. Se houve perda/corrupção de dados: restaurar via PITR/backup **em projeto novo**, extrair só as linhas afetadas e reimportar. Evitar restaurar produção inteira por cima, porque perde o que foi escrito depois.
4. Documentar e adicionar teste que teria pegado.

### Dados apagados/alterados por engano (usuário ou bug)

1. Identificar tabela, tenant e janela de tempo (usar `audit_logs`).
2. Restaurar backup/PITR em projeto separado, exportar as linhas do tenant/janela e reinserir.
3. Arquivos: recuperar da cópia externa dos buckets (versionamento).

### Segredo vazou (commit, log, print, máquina comprometida)

1. **Rotacionar primeiro, investigar depois:**
   - service role / JWT do Supabase: gerar novas chaves no dashboard e atualizar na Vercel;
   - Resend, VAPID e outras: revogar e gerar novas;
   - redeploy.
2. VAPID novo invalida as inscrições de push: pedir reinscrição no app.
3. Verificar logs do Supabase e da Vercel no período de exposição.
4. Se a service role vazou, tratar como possível acesso a **todos** os dados ⇒ seção LGPD.
5. Limpar o histórico do git não substitui a rotação.

### Conta de staff comprometida (professor/owner)

1. Suspender o membership e encerrar todas as sessões do usuário.
2. Resetar senha e MFA via `platform_admin` (registrado em `audit_logs`).
3. Revisar `audit_logs` do usuário: correções publicadas, aprovações, alterações.
4. Reverter mudanças indevidas e avisar o owner do tenant.

### Conta de infra comprometida (GitHub, Vercel, Supabase, domínio)

1. Recuperar acesso (códigos de recuperação), trocar senha, revogar sessões e tokens.
2. Auditar: deploys recentes, variáveis de ambiente, membros adicionados, webhooks, DNS.
3. Rotacionar todos os segredos acessíveis por aquela conta.

### Vazamento ou acesso indevido a dados pessoais (LGPD)

1. Conter e preservar evidências (logs, `audit_logs`).
2. Levantar: quais dados, de quais titulares, quais tenants, quando, como.
3. O **tenant é o controlador**; nós somos operadores. Avisar os tenants afetados **imediatamente** com as informações do passo 2, para que eles comuniquem a ANPD e os titulares. Dados de menores aumentam a gravidade.
4. Conferir o prazo vigente de comunicação à ANPD (regulamento de incidentes) e apoiar o controlador no que for preciso.
5. Registrar o incidente mesmo que se conclua que não houve risco relevante.

### Provedor fora do ar (Supabase/Vercel)

1. Confirmar na status page do provedor.
2. Publicar aviso para os tenants (email ou mensagem pronta).
3. Não tentar migrar às pressas. Se a indisponibilidade passar do RTO, avaliar restaurar o último backup externo em outro projeto e apontar o app para ele.

## Ensaios

| Ensaio                                        | Frequência            | Registro                                                 |
| --------------------------------------------- | --------------------- | -------------------------------------------------------- |
| Restaurar backup do banco em projeto de teste | mensal                | `docs/ensaios-restauracao.md` (data, duração, problemas) |
| Recuperar um arquivo da cópia dos buckets     | trimestral            | idem                                                     |
| Rollback de deploy na Vercel                  | a cada release grande | idem                                                     |
| Rotação de uma chave (ex.: Resend)            | semestral             | idem                                                     |
