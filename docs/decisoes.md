# Decisões do projeto

O **porquê** das escolhas. Quando uma decisão mudar, atualize aqui (com data) em vez de apagar — o histórico importa.

## Negócio

| Data    | Decisão                                                                                                                              | Motivo                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09 | Transformar a plataforma da cliente atual (curso de redação/Enem, 3 anos de parceria, PHP nativo na Hostinger) em SaaS multi-tenant. | Produto já validado em uso real; mercado de professores/cursinhos que corrigem as próprias redações é menos disputado que o B2C de correção. |
| 2026-09 | **Público-alvo:** professores de redação independentes e cursinhos pequenos (B2B). Não é correção vendida direto ao aluno.           | Diferente dos concorrentes B2C; a dor é o tempo de correção e o controle da evolução dos alunos.                                             |
| 2026-09 | A cliente atual vira o **tenant #1** e parceira de design (feedback, depoimento, case), com condição especial a combinar.            | Mantém a relação e dá validação real.                                                                                                        |
| 2026-09 | **Pendente:** formalizar por contrato a propriedade do código antes de vender para terceiros.                                        | O sistema original foi feito para a cliente.                                                                                                 |
| 2026-09 | Modelo de preço preferido: por **aluno ativo**, com planos. Cobrança fica para a fase 2.                                             | Escala com o valor entregue; simples de explicar.                                                                                            |
| 2026-09 | Marca branca por tenant (subdomínio, logo, cor).                                                                                     | O professor vende a plataforma como sendo dele.                                                                                              |
| 2026-09 | **Sem app nativo** por enquanto: PWA.                                                                                                | Custo; o PWA cobre câmera, instalação e push (no iOS, só com o app instalado).                                                               |

## Técnica

| Data    | Decisão                                                                                                                                         | Alternativas consideradas                       | Motivo                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 2026-09 | Next.js 16 + Supabase + TypeScript, deploy na Vercel.                                                                                           | Laravel + Inertia; NestJS + Next separados.     | Mais produtivo para desenvolvimento com IA, auth/storage/RLS prontos, custo inicial baixo.   |
| 2026-09 | Reescrita **incremental**: o sistema PHP continua atendendo a cliente só com manutenção até o novo ter paridade; aí migra.                      | Big bang (reescrever e trocar de uma vez).      | Reduz risco com um único desenvolvedor e rotina apertada.                                    |
| 2026-09 | Multi-tenancy com banco único + `tenant_id` + RLS.                                                                                              | Schema por tenant; banco por tenant.            | Barato e simples de operar; o RLS garante o isolamento no banco.                             |
| 2026-09 | Aula ao vivo: começar com YouTube Live não listado embutido + chat na plataforma; sala interativa (LiveKit) depois, como recurso de plano pago. | Jitsi self-hosted; SDK de vídeo desde o início. | Custo zero e a professora já usa YouTube; vídeo interativo tem custo por minuto.             |
| 2026-09 | MFA obrigatório para staff (owner/teacher), opcional para alunos.                                                                               | MFA para todos; sem MFA.                        | Staff acessa dados de muitos menores; exigir de aluno aumenta atrito sem ganho proporcional. |
| 2026-09 | Next 16 renomeou `middleware.ts` para `proxy.ts`. A resolução de tenant fica em `src/proxy.ts`.                                                 | —                                               | Mudança do framework.                                                                        |

## Ordem das fases

1. **Fase 1 — núcleo** (`docs/fase-1-nucleo.md`): paridade com o sistema atual + multi-tenant + reset de senha + PWA.
2. **Fase 1.5 — migração da cliente atual:** script MySQL → Postgres; importar senhas se forem bcrypt, senão forçar redefinição; ensaio em staging; virada.
3. **Fase 2 — vender:** cobrança recorrente (Asaas/Stripe), limites por plano, onboarding de novos tenants, site de marketing.
4. **Fase 3 — diferenciais:** correção anotada na imagem, pré-correção com IA (professor revisa), dashboard de evolução por competência.
5. **Fase 4 — ao vivo:** YouTube Live + chat → sala interativa.

## Em aberto

- Nome do produto e domínio (hoje `dominio.com.br` é placeholder em todo o projeto).
- Formato dos hashes de senha no banco atual.
- Número de alunos ativos da cliente atual (para dimensionar o plano do Supabase).
- Repositório público ou privado (recomendado: privado, por ser o código do produto).
