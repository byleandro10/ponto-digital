# Estratégia Completa de Testes e Arquitetura — Billing Mercado Pago

> **Versão**: 2.0  
> **Data**: 2026-03-24  
> **Projeto**: Ponto Digital — SaaS de Ponto Eletrônico  
> **Stack atual**: Node.js (JS) + Express + Prisma + PostgreSQL + Mercado Pago SDK  
> **Stack alvo (testes/evolução)**: TypeScript + Vitest/Jest + Supertest  

---

## Diagnóstico do Estado Atual do Código

Antes de propor a estratégia, registrei os pontos críticos reais do código que li por completo:

| Arquivo | Problema | Severidade |
|---------|----------|------------|
| `billingService.js:13` | `TRIAL_DAYS = 14` — requisito pede 30 | **ALTA** |
| `mercadopagoService.js:8` | `TRIAL_DAYS = 14` duplicado e desacoplado | **MÉDIA** |
| `webhookController.js:31-34` | HMAC bypass silencioso quando `MP_WEBHOOK_SECRET` ausente ou headers faltando | **CRÍTICA** |
| `webhookController.js:12` | Idempotência em `Set()` — volátil, perdida em restart | **ALTA** |
| `webhookController.js:23` | Responde 200 **antes** de validar HMAC — aceita tudo | **ALTA** |
| `billingService.js:659-661` | `reactivateSubscription` aceita `cardTokenId` vazio — cria subscription sem MP | **ALTA** |
| `billingService.js:42-46` | `addDays`/`addMonths` com `Date` nativo — sem proteção de timezone | **MÉDIA** |
| `subscriptionGuard.js` | Sem tabela `WebhookEvent` — impossível auditar eventos processados | **MÉDIA** |
| Schema Prisma | Sem modelo `WebhookEvent` para persistir eventos brutos | **ALTA** |

---

## 1. ARQUITETURA DO FLUXO COMPLETO

### 1.1 Diagrama do Fluxo Ponta a Ponta

```
FASE 1: ONBOARDING                    FASE 2: TRIAL                    FASE 3: COBRANÇA
─────────────────────                  ─────────────────                ─────────────────

 ┌─────────────┐     ┌──────────┐     ┌───────────────┐               ┌────────────────┐
 │ 1. Cadastro │────▶│ 2. Token │────▶│ 3. Preapproval│──────────────▶│ 5. MP cobra    │
 │    Company  │     │  cartão  │     │    no MP      │  (auto, após  │    cartão      │
 └─────────────┘     │ (MP SDK) │     │    + Trial    │   TRIAL_DAYS) └───────┬────────┘
                     └──────────┘     └───────┬───────┘                       │
                                              │                               │
                                      ┌───────▼───────┐               ┌──────▼─────────┐
                                      │ 4. Subscription│               │ 6. Webhook MP  │
                                      │   status=TRIAL │               │  type=payment  │
                                      │   trialEndsAt  │               └──────┬─────────┘
                                      └────────────────┘                      │
                                                                              │
FASE 4: PROCESSAMENTO                 FASE 5: ACESSO                  ┌──────▼─────────┐
─────────────────────                  ─────────────────               │ 7. Validar     │
                                                                      │    HMAC +      │
┌──────────────────┐   ┌───────────────────┐   ┌───────────────┐     │    idempotência │
│ 8. activateSub() │──▶│ 9. Subscription   │──▶│ 10. Guard     │     └──────┬─────────┘
│  ou markPastDue()│   │    status=ACTIVE   │   │  libera/bloqueia         │
└──────────────────┘   │    ou PAST_DUE     │   │  acesso      │     ┌──────▼─────────┐
                       └───────────────────┘   └───────────────┘     │ 8. Processar   │
                                                                      │    Payment     │
                                                                      └────────────────┘

FASE 6: CICLO DE VIDA
─────────────────────

┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Cancelamento │   │ Inadimplência│   │ Reativação   │   │ Reconciliação│
│ (voluntário) │   │ (PAST_DUE → │   │ (novo cartão │   │ (cron diário)│
│              │   │  grace 3d)   │   │  + preapproval)  │              │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

### 1.2 Fonte da Verdade por Etapa

| Etapa | Fonte da Verdade | Justificativa |
|-------|------------------|---------------|
| Status da preapproval (existe? ativa?) | **Mercado Pago** | MP é o dono da assinatura recorrente |
| Status de pagamento específico | **Mercado Pago** | MP processa o pagamento |
| Status de acesso ao sistema | **Banco local** (`Company.subscriptionStatus`) | Decisão deve ser instantânea, sem chamada ao MP |
| Datas de trial/período | **Banco local** (`Subscription`) | Calculadas no momento da criação, imutáveis |
| Valor cobrado | **Mercado Pago** (`transaction_amount`) | Nunca confiar em valor local para cobranças |
| Registro de pagamento | **Ambos** | Payment local é espelho auditável do MP |

### 1.3 Pontos que Exigem Idempotência

| Ponto | Risco sem Idempotência | Solução Atual | Solução Ideal |
|-------|------------------------|---------------|---------------|
| Webhook de pagamento | Duplicar registro de Payment | `findFirst` por `mpPaymentId` + update/create | Tabela `WebhookEvent` com `UNIQUE(eventType, externalId)` + `SELECT FOR UPDATE` |
| Webhook de preapproval | Atualizar status redundantemente | Compara `subscription.status === newStatus` | Mesmo — tabela `WebhookEvent` |
| Criação de subscription | Duplicar assinatura | `findFirst` por `companyId + status IN (TRIAL, ACTIVE)` | OK, mas precisa de `UNIQUE INDEX` no banco |
| Ativação pós-pagamento | Estender período duas vezes | Nenhuma proteção explícita | Usar `paymentId` como chave de deduplicação na ativação |

### 1.4 Pontos que Exigem Logs Auditáveis

| Evento | O que logar | Onde logar |
|--------|-------------|------------|
| Webhook recebido | Payload bruto, headers, timestamp | Tabela `WebhookEvent` (não apenas console) |
| Subscription criada | companyId, plan, trialEnd, mpPreapprovalId | Já logado via console — migrar para tabela |
| Payment processado | paymentId, status anterior → novo, subscriptionId | Tabela `Payment` + `PaymentStatusChange` |
| Status alterado | oldStatus → newStatus, trigger (webhook/cron/manual) | Campo `statusChangedReason` na Subscription |
| Reconciliação | divergências encontradas + correções aplicadas | Tabela `ReconciliationLog` |

---

## 2. MODELAGEM DE ESTADOS DA ASSINATURA

### 2.1 Máquina de Estados Completa

```
                         ┌──────────────────────────────────────────────────────┐
                         │                   PENDING                            │
                         │ (criou no banco, aguardando confirmação do MP)       │
                         └─────────────┬────────────────────────┬───────────────┘
                                       │ MP confirma            │ MP rejeita / timeout
                                       │ preapproval            │
                         ┌─────────────▼───────────┐   ┌───────▼───────────────┐
                         │       TRIALING           │   │       CANCELED        │
                         │  (trial ativo,           │   │  (falha na criação)   │
                         │   acesso liberado)       │   └───────────────────────┘
                         └──────┬───────────┬───────┘
                                │           │
         pagamento OK           │           │ cancela voluntariamente
         (webhook payment)      │           │ ou trial expira sem cobrança
                                │           │
                  ┌─────────────▼──┐   ┌────▼──────────────────┐
                  │     ACTIVE     │   │      CANCELED         │
                  │ (pagante,      │   │ (voluntário ou        │
                  │  acesso pleno) │   │  trial não convertido)│
                  └──┬──────┬──┬──┘   └────────────────────────┘
                     │      │  │                    ▲
  pagamento          │      │  │ cancela            │ grace period
  recusado           │      │  │ voluntariamente    │ expira sem
  (webhook)          │      │  └────────────────────┤ pagamento
                     │      │                       │
               ┌─────▼──────┘                       │
               │  PAST_DUE    │                     │
               │ (grace period│─────────────────────┘
               │  3 dias)     │
               └──────┬───────┘
                      │
                      │ pagamento OK (retry aprovado)
                      │
               ┌──────▼───────┐
               │    ACTIVE    │ (reativado)
               └──────────────┘


ESTADOS AUXILIARES:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   PAUSED    │    │   EXPIRED   │    │   BLOCKED   │
│ (MP pausou) │    │ (trial +    │    │ (admin      │
│             │    │  grace sem  │    │  manual)    │
│             │    │  pagamento) │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 2.2 Tabela de Estados, Eventos e Ações

| Estado | Quando é Definido | Evento MP que Causa | Dá Acesso? | Ação do Sistema |
|--------|-------------------|---------------------|------------|-----------------|
| **PENDING** | `createSubscription()` chamado, antes de MP confirmar | — (estado local transitório) | ❌ Não | Aguardar confirmação via webhook de preapproval |
| **TRIALING** | MP confirma preapproval com free_trial | `subscription_preapproval: authorized` (com trial) | ✅ Sim (se `trialEndsAt > now`) | Nenhuma — aguardar fim do trial |
| **ACTIVE** | Pagamento aprovado | `payment: approved` | ✅ Sim | Estender `currentPeriodEnd` em +1 mês |
| **PAST_DUE** | Pagamento recusado | `payment: rejected` | ✅ Sim (até `gracePeriodEnd`, 3 dias) | Notificar empresa, aguardar retry do MP |
| **CANCELED** | Usuário cancela OU MP cancela | `subscription_preapproval: cancelled` OU `cancelSubscription()` | ❌ Não (após `currentPeriodEnd`) | Manter acesso até fim do período pago, depois bloquear |
| **EXPIRED** | Trial + grace period expiraram sem pagamento | Nenhum (cron/guard detecta) | ❌ Não | Bloquear acesso, oferecer reativação |
| **PAUSED** | MP pausa a preapproval | `subscription_preapproval: paused` | ❌ Não | Bloquear acesso, oferecer reativação |
| **BLOCKED** | Admin manual bloqueia empresa | — (ação operacional) | ❌ Não | Bloquear acesso, requer intervenção manual |

### 2.3 Diferença entre CANCELED e EXPIRED (ausente no código atual)

| | CANCELED | EXPIRED |
|---|----------|---------|
| **Gatilho** | Ação voluntária do usuário ou cancelamento no MP | Expiração automática (trial acabou e nunca pagou, ou grace period esgotou) |
| **Quem inicia** | Usuário ou MP | Sistema (cron/guard) |
| **Pode reativar facilmente?** | Sim, com novo cartão | Sim, mas pode precisar de novo trial (decisão de negócio) |
| **Sinaliza para métricas** | Churn voluntário | Churn involuntário / falha de conversão |

### 2.4 Schema de Banco Proposto

```sql
-- Tabela principal: Subscription (evoluída)
-- Campos adicionais recomendados marcados com [NEW]

model Subscription {
  id                 String    @id @default(uuid())
  companyId          String
  plan               String    -- BASIC | PROFESSIONAL | ENTERPRISE
  status             String    @default("PENDING")
  -- PENDING | TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED | PAUSED | BLOCKED

  trialStart         DateTime?
  trialEndsAt        DateTime?
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  gracePeriodEnd     DateTime?

  mpPreapprovalId    String?   @unique
  mpCustomerId       String?
  cancelledAt        DateTime?
  cancelReason       String?       -- [NEW] voluntary | payment_failed | admin | mp_cancelled
  statusChangedAt    DateTime?     -- [NEW] última mudança de status
  statusChangedBy    String?       -- [NEW] webhook | cron | api | admin

  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

-- [NEW] Tabela de eventos de webhook
model WebhookEvent {
  id              String    @id @default(uuid())
  eventType       String    -- payment | subscription_preapproval
  externalId      String    -- data.id do MP
  action          String?   -- action field do webhook v2
  payload         Json      -- body bruto do webhook
  headers         Json?     -- headers relevantes (x-signature, x-request-id)
  status          String    @default("RECEIVED")
  -- RECEIVED | PROCESSING | PROCESSED | FAILED | SKIPPED
  processedAt     DateTime?
  errorMessage    String?
  retryCount      Int       @default(0)
  createdAt       DateTime  @default(now())

  @@unique([eventType, externalId])  -- idempotência nativa
  @@index([status])
  @@index([createdAt])
}

-- [NEW] Tabela de tentativas de cobrança
model ChargeAttempt {
  id              String    @id @default(uuid())
  subscriptionId  String
  mpPaymentId     String?   @unique
  attemptNumber   Int       @default(1)  -- 1ª, 2ª, 3ª tentativa
  amount          Decimal
  status          String    -- PENDING | APPROVED | REJECTED
  failureReason   String?
  mpStatus        String?   -- status bruto do MP (approved, rejected, etc.)
  mpStatusDetail  String?   -- status_detail do MP (cc_rejected_insufficient_amount, etc.)
  attemptedAt     DateTime  @default(now())
  resolvedAt      DateTime?

  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@index([subscriptionId])
  @@index([status])
}

-- Payment existente (mantido como está, já funciona)
model Payment { ... }

-- [NEW] Tabela de reconciliação
model ReconciliationLog {
  id              String    @id @default(uuid())
  subscriptionId  String
  companyId       String
  localStatus     String
  mpStatus        String
  action          String    -- CORRECTED | FLAGGED | NO_ACTION
  details         Json?
  executedAt      DateTime  @default(now())

  @@index([executedAt])
}
```

---

## 3. ESTRATÉGIA DE TESTES EM CAMADAS

### 3.1 Pirâmide de Testes

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         ~5 testes    (sandbox MP real)
                 ╱──────╲
                ╱        ╲
               ╱Integration╲    ~25 testes    (banco real, MP mockado)
              ╱────────────╲
             ╱              ╲
            ╱   Unitários    ╲  ~40 testes    (tudo mockado)
           ╱──────────────────╲
```

### 3.2 Camada A: Testes Unitários

| Aspecto | Detalhe |
|---------|---------|
| **Objetivo** | Validar lógica pura sem I/O |
| **Framework** | Jest (já instalado) ou Vitest |
| **O que validar** | Cálculo de datas, mapeamento de status, validações de entrada, BillingError, addDays/addMonths edge cases |
| **O que mockar** | Prisma (todas as queries), mercadopagoService (todas as chamadas), `Date` (fake timers) |
| **O que NÃO usar** | Banco real, HTTP real, sandbox MP |
| **Tempo target** | < 5 segundos para todos |

**Exemplos concretos:**

| Caso | Módulo | Assert |
|------|--------|--------|
| `createSubscription` com plano 'GOLD' | billingService | Lança `BillingError('Plano inválido', 400)` |
| `createSubscription` sem cardTokenId | billingService | Lança `BillingError('Token do cartão é obrigatório', 400)` |
| `createSubscription` com assinatura ativa existente | billingService | Lança `BillingError('Empresa já possui assinatura ativa', 400)` |
| `addDays(2026-01-30, 30)` | helpers | `2026-03-01` (fev tem 28 dias) |
| `addMonths(2026-01-31, 1)` | helpers | `2026-03-03` — **bug real** do `setMonth` nativo |
| Trial de 30 dias a partir de `2026-12-15` | billingService | `trialEndsAt = 2027-01-14` |
| Mapeamento `approved → APPROVED` | billingService | Retorno correto |
| Mapeamento de status MP desconhecido | billingService | Retorna `'PENDING'` como fallback |
| HMAC com hash correto | webhookController | `verifyWebhookSignature → true` |
| HMAC com hash adulterado | webhookController | `verifyWebhookSignature → false` |

### 3.3 Camada B: Testes de Integração

| Aspecto | Detalhe |
|---------|---------|
| **Objetivo** | Validar fluxo real entre HTTP → Controller → Service → Banco |
| **Framework** | Jest + Supertest |
| **O que validar** | Endpoints reais, persistência no banco, transações, idempotência, status codes HTTP |
| **O que mockar** | Apenas `mercadopagoService` (nock ou jest.mock) |
| **O que usar real** | Banco PostgreSQL de teste (via docker-compose ou in-memory), Express app |
| **Tempo target** | < 30 segundos para todos |

**Exemplos concretos:**

| Caso | Endpoint | Assert |
|------|----------|--------|
| POST `/api/subscriptions/create-preapproval` com dados válidos | create-preapproval | Status 201, Subscription no banco com status=TRIAL |
| POST webhook pagamento aprovado | `/api/webhooks/mercadopago` | Status 200, Payment criado, Subscription → ACTIVE |
| POST webhook duplicado | `/api/webhooks/mercadopago` (2x) | Status 200, apenas 1 Payment no banco |
| POST webhook com HMAC inválido | `/api/webhooks/mercadopago` | Status 200 (para MP), nenhuma alteração no banco |
| GET rota protegida com status=TRIAL e trial válido | `/api/employees` | Status 200 |
| GET rota protegida com status=CANCELLED | `/api/employees` | Status 402 |
| POST cancel durante TRIAL | `/api/subscriptions/cancel` | Subscription → CANCELLED |

### 3.4 Camada C: Testes E2E (Sandbox)

| Aspecto | Detalhe |
|---------|---------|
| **Objetivo** | Validar integração real com API do Mercado Pago |
| **Framework** | Jest + Supertest + sandbox MP real |
| **O que validar** | Criação de preapproval real, token de cartão real, resposta da API |
| **O que mockar** | Nada — tudo real |
| **Ambiente** | `MP_ACCESS_TOKEN` de sandbox, banco de teste |
| **Tempo target** | < 60 segundos (depende de rede) |
| **Execução** | Apenas no CI (não no watch mode) |

**Exemplos concretos:**

| Caso | Assert |
|------|--------|
| Criar preapproval com cartão APRO (aprovação) | Retorno com `id`, `status: authorized` |
| Criar preapproval com cartão OTHE (recusa) | Erro ou `status` diferente de authorized |
| Fluxo: Registrar → Criar subscription → Verificar status | Subscription no banco com `mpPreapprovalId` real |

### 3.5 Camada D: Testes de Reconciliação

| Aspecto | Detalhe |
|---------|---------|
| **Objetivo** | Garantir que divergências entre banco local e MP são detectadas e corrigidas |
| **Framework** | Jest |
| **O que validar** | Cron de reconciliação detecta e corrige status divergentes |
| **O que mockar** | `mercadopagoService.getPreapproval` retorna status diferente do banco |

**Exemplos concretos:**

| Caso | Assert |
|------|--------|
| Banco diz TRIALING, MP diz `authorized` | Corrigir para ACTIVE |
| Banco diz ACTIVE, MP diz `cancelled` | Corrigir para CANCELED |
| Banco diz TRIALING, `trialEndsAt < now` | Flaggear como EXPIRED |
| Preapproval não encontrada no MP | Registrar em `ReconciliationLog` |

### 3.6 Camada E: Testes de Resiliência

| Aspecto | Detalhe |
|---------|---------|
| **Objetivo** | Testar comportamento sob falha |
| **Framework** | Jest |
| **O que validar** | Timeouts, erros de rede, respostas inesperadas do MP, concorrência |

**Exemplos concretos:**

| Caso | Assert |
|------|--------|
| `mpService.createPreapproval()` lança timeout | Subscription NÃO criada no banco, erro propagado |
| `mpService.getPayment()` retorna `null` | Webhook processado sem erro, log de warning |
| Dois webhooks idênticos processados simultaneamente | Apenas 1 Payment criado (com mutex/transaction) |
| Resposta inesperada do MP (campo ausente) | Graceful degradation, log + não crashar |

---

## 4. MATRIZ DE CASOS DE TESTE

### 4.1 Cadastro e Trial

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-001 | Unit | Subscription criada com sucesso | Nenhuma assinatura ativa | `createSubscription({plan: 'BASIC', cardTokenId: 'tok_valid', email})` | Subscription no banco com `status=TRIAL`, `trialEndsAt = now + TRIAL_DAYS` | CRÍTICA |
| T-002 | Unit | Trial de 30 dias aplicado | T-001 concluído | Verificar `trialEndsAt - trialStart` | Exatamente `TRIAL_DAYS * 86400000` ms | CRÍTICA |
| T-003 | Unit | Data da 1ª cobrança correta | T-001 concluído | Consultar preapproval no MP | `free_trial.frequency = TRIAL_DAYS`, `frequency_type = 'days'` | CRÍTICA |
| T-004 | Integration | Acesso liberado durante trial | Company com `TRIAL`, `trialEndsAt > now` | GET `/api/employees` com JWT | Status 200 | CRÍTICA |
| T-005 | Integration | Acesso bloqueado sem assinatura | Company sem subscription | GET `/api/employees` com JWT | Status 402 | CRÍTICA |
| T-006 | Unit | Rejeição de plano inválido | — | `createSubscription({plan: 'GOLD', ...})` | BillingError 400 | ALTA |
| T-007 | Unit | Rejeição sem cardTokenId | — | `createSubscription({plan: 'BASIC', cardTokenId: '', ...})` | BillingError 400 | ALTA |
| T-008 | Unit | Rejeição sem email | — | `createSubscription({plan: 'BASIC', email: '', ...})` | BillingError 400 | ALTA |
| T-009 | Integration | Duplicidade de assinatura bloqueada | Company com subscription TRIAL | POST create-preapproval | Status 400, 'já possui assinatura ativa' | CRÍTICA |

### 4.2 Cobrança

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-010 | Integration | Cobrança aprovada ativa subscription | Subscription TRIAL, trial expirado | Webhook `payment: approved` | Subscription → ACTIVE, Payment APPROVED, `currentPeriodEnd = now + 1 mês` | CRÍTICA |
| T-011 | Integration | Cobrança recusada → PAST_DUE | Subscription TRIAL | Webhook `payment: rejected` | Subscription → PAST_DUE, `gracePeriodEnd = now + 3d`, Payment REJECTED | CRÍTICA |
| T-012 | E2E | Cartão expirado recusado no MP | Empresa autenticada | POST create-preapproval com token de cartão expirado | Erro do MP, Subscription NÃO criada | ALTA |
| T-013 | E2E | Cartão inválido recusado | Empresa autenticada | POST com número inválido | Erro do MP | ALTA |
| T-014 | Unit | Token de cartão inválido | — | `createSubscription({cardTokenId: 'fake_token', ...})` | Erro do MP propagado, sem persistência | ALTA |
| T-015 | Unit | Falha temporária do MP (timeout) | mpService mockado para rejeitar | `createSubscription(...)` | Erro propagado, Subscription NÃO criada | ALTA |
| T-016 | Unit | Timeout na API do MP | mpService mockado para timeout | `createSubscription(...)` | Erro propagado, banco limpo | ALTA |
| T-017 | Unit | Resposta inesperada do MP | mpService retorna `{ unexpected: true }` | `createSubscription(...)` | `mpPreapprovalId = null`, subscription criada (degradation) | MÉDIA |

### 4.3 Webhook

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-020 | Integration | Webhook pagamento aprovado | Subscription com mpPreapprovalId | POST webhook `{type: 'payment', data: {id: 'pay_1'}}` | Status 200, Payment APPROVED, Subscription ACTIVE | CRÍTICA |
| T-021 | Integration | Webhook pagamento recusado | Subscription ativa | POST webhook `{type: 'payment', data: {id: 'pay_2'}}` com rejected | Subscription → PAST_DUE, Payment REJECTED | CRÍTICA |
| T-022 | Integration | Webhook duplicado | T-020 já executado | POST webhook idêntico | Status 200, apenas 1 Payment no banco | CRÍTICA |
| T-023 | Integration | Webhook fora de ordem (payment antes de preapproval) | Subscription existe | Enviar payment webhook sem preapproval prévio | Payment processado (busca por external_reference) | ALTA |
| T-024 | Unit | Webhook com payload inválido | — | POST `{type: 'payment', data: {}}` | Status 200, nenhuma ação, log 'não tratado' | MÉDIA |
| T-025 | Unit | Webhook de evento desconhecido | — | POST `{type: 'merchant_order', data: {id: '1'}}` | Status 200, ignorado com log | BAIXA |
| T-026 | Integration | Webhook reprocessado manualmente | Event já PROCESSED na tabela | Chamar handler manualmente com mesmo eventId | Detectar duplicata, não reprocessar | ALTA |
| T-027 | Unit | Falha durante processamento | billingService.handlePaymentWebhook mockado para erro | POST webhook | Status 200 (já respondido), erro logado | ALTA |
| T-028 | Integration | Retry seguro após erro | WebhookEvent com status=FAILED | Reprocessar evento | Status muda para PROCESSED se bem-sucedido | ALTA |
| T-029 | Integration | Webhook com HMAC inválido | `MP_WEBHOOK_SECRET configurado` | POST com header forjado | Status 200, nenhuma ação no banco | CRÍTICA |

### 4.4 Regras de Negócio

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-030 | Integration | Cancelamento antes da 1ª cobrança | Subscription TRIAL | POST `/api/subscriptions/cancel` | Subscription → CANCELLED, MP cancelado | ALTA |
| T-031 | Integration | Cancelamento após 1ª cobrança | Subscription ACTIVE | POST cancel | CANCELLED, mensagem 'acesso até fim do período' | ALTA |
| T-032 | Integration | Reativação com novo cartão | Subscription CANCELLED | POST reactivate com cardToken | Nova Subscription ACTIVE, nova preapproval | ALTA |
| T-033 | Integration | Bloqueio por inadimplência | PAST_DUE + grace expirado | GET rota protegida | Status 402, `code: PAYMENT_OVERDUE` | CRÍTICA |
| T-034 | Integration | Desbloqueio após regularização | PAST_DUE → pagamento aprovado | Webhook approved + GET rota protegida | ACTIVE, Status 200 | CRÍTICA |
| T-035 | Integration | Duas assinaturas ativas (bug) | Manipular banco para 2 assinaturas ACTIVE | `createSubscription(...)` | BillingError 'já possui assinatura ativa' — **mas e se já existem?** | ALTA |
| T-036 | Reconciliation | Divergência status local vs MP | Banco=TRIAL, MP=authorized | Executar reconciliação | Corrigir para ACTIVE + log | ALTA |
| T-037 | Integration | Cancelamento sem assinatura ativa | Nenhuma subscription ativa | POST cancel | Status 404 | BAIXA |

### 4.5 Segurança

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-040 | Integration | Replay de webhook | Evento já processado, idempotência limpa (restart) | Reenviar mesmo webhook | Se persistente: ignorado. Se em memória: **reprocessa (BUG)** | CRÍTICA |
| T-041 | Integration | Tentativa de forjar evento | Sem MP_WEBHOOK_SECRET válido | POST webhook com HMAC forjado | Rejeitado | CRÍTICA |
| T-042 | Integration | Manipulação do front para estender trial | — | Enviar `trialEndsAt` no body | Backend ignora — calcula internamente | CRÍTICA |
| T-043 | Integration | Liberar acesso sem pagamento | Company CANCELLED, front tenta chamar API | GET rota protegida | 402 (guard no backend, não no front) | CRÍTICA |
| T-044 | Integration | Concorrência: 2 webhooks simultâneos | Mesmo paymentId | 2 POSTs paralelos | Apenas 1 Payment criado (SELECT FOR UPDATE) | ALTA |
| T-045 | Integration | Webhook sem headers de assinatura + SECRET configurado | MP_WEBHOOK_SECRET definido | POST sem x-signature | Rejeitado (não processado) | CRÍTICA |
| T-046 | Integration | Reativação sem cartão cria sub "fantasma" | — | POST reactivate sem cardTokenId | Deveria rejeitar; código atual aceita (**BUG**) | ALTA |

### 4.6 Datas e Tempo

| ID | Tipo | Cenário | Pré-condições | Passos | Resultado Esperado | Criticidade |
|----|------|---------|---------------|--------|--------------------|----|
| T-050 | Unit | Trial termina exatamente em TRIAL_DAYS dias | Clock em `2026-03-01T12:00:00Z` | `createSubscription(...)` | `trialEndsAt = 2026-03-31T12:00:00Z` (se TRIAL_DAYS=30) | CRÍTICA |
| T-051 | Unit | Virada de mês: jan → fev (30 dias) | Clock em `2026-01-15` | addDays(date, 30) | `2026-02-14` | ALTA |
| T-052 | Unit | Virada de ano: dez → jan | Clock em `2026-12-15`, TRIAL_DAYS=30 | createSubscription | `trialEndsAt = 2027-01-14` | ALTA |
| T-053 | Unit | Timezone: servidor em UTC-3 vs UTC | — | Criar subscription nos dois TZ | Mesmo `trialEndsAt` em ISO | ALTA |
| T-054 | Unit | Ano bissexto: fev 2028 | Clock em `2028-02-10`, TRIAL_DAYS=30 | addDays | `2028-03-11` | MÉDIA |
| T-055 | Unit | addMonths edge case: 31 jan + 1 mês | `addMonths(new Date('2026-01-31'), 1)` | Executar | `2026-03-03` (Date nativo) — **bug**: deveria ser `2026-02-28` | ALTA |
| T-056 | Unit | Sem cobrança antecipada | Clock em `trialEndsAt - 1ms` | `subscriptionGuard` | Acesso liberado | CRÍTICA |
| T-057 | Unit | Bloqueio no instante exato do vencimento | Clock em `trialEndsAt + 1ms` | `subscriptionGuard` | Acesso bloqueado (402) | CRÍTICA |

---

## 5. TESTES DE DATA E RELÓGIO

### 5.1 Abstração de Relógio (TimeProvider)

O problema central: `new Date()` é espalhado por todo o código, tornando impossível testar datas sem fake timers.

**Solução recomendada: injeção de TimeProvider**

```typescript
// src/lib/time-provider.ts

export interface TimeProvider {
  now(): Date;
  addDays(date: Date, days: number): Date;
  addMonths(date: Date, months: number): Date;
}

/** Provider real — usado em produção */
export class SystemTimeProvider implements TimeProvider {
  now(): Date {
    return new Date();
  }

  addDays(date: Date, days: number): Date {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);    // ← UTC, não local
    return d;
  }

  addMonths(date: Date, months: number): Date {
    const d = new Date(date.getTime());
    const targetMonth = d.getUTCMonth() + months;
    d.setUTCMonth(targetMonth);

    // Proteção contra overflow de mês (31 jan + 1 mês → 28 fev)
    // Se o dia do mês original não cabe no mês de destino,
    // volta para o último dia do mês de destino
    if (d.getUTCDate() !== new Date(date.getTime()).getUTCDate()) {
      d.setUTCDate(0); // Volta para último dia do mês anterior
    }
    return d;
  }
}

/** Provider fake — usado em testes */
export class FakeTimeProvider implements TimeProvider {
  private currentTime: Date;

  constructor(initialTime: Date | string) {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  /** Avança o relógio N dias */
  advanceDays(days: number): void {
    this.currentTime = this.addDays(this.currentTime, days);
  }

  /** Avança o relógio N meses */
  advanceMonths(months: number): void {
    this.currentTime = this.addMonths(this.currentTime, months);
  }

  /** Define uma data específica */
  setTime(date: Date | string): void {
    this.currentTime = new Date(date);
  }

  addDays(date: Date, days: number): Date {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  addMonths(date: Date, months: number): Date {
    const d = new Date(date.getTime());
    const originalDay = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    if (d.getUTCDate() !== originalDay) {
      d.setUTCDate(0);
    }
    return d;
  }
}
```

### 5.2 Uso do Fake Timer com Jest (Abordagem Imediata)

Para o código atual em JS, sem refatorar para TimeProvider:

```typescript
// tests/helpers/time.ts

/**
 * Congela o relógio em uma data específica.
 * Todos os `new Date()` e `Date.now()` retornam essa data.
 */
export function freezeTime(date: string | Date) {
  jest.useFakeTimers({ now: new Date(date) });
}

/**
 * Avança o relógio N dias a partir do instante atual.
 */
export function advanceDays(days: number) {
  const current = Date.now();
  jest.setSystemTime(current + days * 24 * 60 * 60 * 1000);
}

/**
 * Avança o relógio para 1 milissegundo após uma data.
 * Útil para testar "exatamente no vencimento".
 */
export function advancePast(date: Date) {
  jest.setSystemTime(new Date(date.getTime() + 1));
}

/**
 * Restaura o relógio real.
 */
export function restoreClock() {
  jest.useRealTimers();
}
```

### 5.3 Exemplo de Time Travel no Teste

```typescript
import { freezeTime, advanceDays, advancePast, restoreClock } from '../helpers/time';
import { createSubscription, TRIAL_DAYS } from '../../src/services/billingService';

describe('Trial timing — cenários de data', () => {
  afterEach(() => restoreClock());

  it('trial expira exatamente em TRIAL_DAYS dias', () => {
    freezeTime('2026-06-01T10:00:00Z');

    const sub = /* mock + criação */;

    const diffMs = sub.trialEndsAt.getTime() - sub.trialStart.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(TRIAL_DAYS);
  });

  it('guard libera no último milissegundo do trial', () => {
    freezeTime('2026-06-01T10:00:00Z');
    // Criar subscription (trialEndsAt = 2026-07-01T10:00:00Z)

    // Avançar para 1ms antes do vencimento
    jest.setSystemTime(new Date('2026-07-01T09:59:59.999Z'));

    // Guard deve liberar
    // expect(guard result).toBe('allowed')
  });

  it('guard bloqueia 1ms após o trial', () => {
    freezeTime('2026-06-01T10:00:00Z');
    // Criar subscription

    jest.setSystemTime(new Date('2026-07-01T10:00:00.001Z'));

    // Guard deve bloquear
    // expect(guard result).toBe('blocked')
  });
});
```

### 5.4 Riscos Comuns com Datas

| # | Risco | Causa | Mitigação |
|---|-------|-------|-----------|
| 1 | **Cobrar 1 dia antes** | `setDate(d.getDate() + 30)` cruza DST, relógio local avança 1h → sobra 23h → JS arredonda | Sempre usar `setUTCDate` em vez de `setDate` |
| 2 | **Cobrar 1 dia depois** | Timezone do servidor muda durante operação | Armazenar todas as datas em UTC no banco |
| 3 | **Mês calendário vs. 30 dias corridos** | `addMonths` do Date nativo (31 jan + 1 = 3 mar) | Usar `addDays(date, 30)` para trial, ou library type-safe |
| 4 | **Timezone inconsistente na comparação** | `trialEndsAt` armazenado em UTC, comparado com `new Date()` em horário local | Prisma já retorna `Date` em UTC; garantir que `guard` compara em UTC |
| 5 | **Horário de verão brasileiro** | Brasil não tem mais DST desde 2019, mas servidores podem estar em regiões com DST | Forçar `TZ=UTC` no servidor (env var ou `process.env.TZ = 'UTC'`) |

### 5.5 Qual Data Usar como Referência?

| Opção | Quando usar | Risco |
|-------|-------------|-------|
| `Date.now()` no backend (criação local) | **Recomendado para `trialStart`** — é o momento em que o sistema reconhece o início | Mínimo |
| `created_date` da preapproval no MP | Para reconciliação e auditoria | Pode ter latência de rede |
| Data informada pelo front-end | **NUNCA** | Manipulável, timezone errado |
| `date_approved` do pagamento no MP | Para `paidAt` do Payment | OK — é o momento real da cobrança |

**Regra**: `trialStart = now()` no backend. `trialEndsAt = trialStart + TRIAL_DAYS dias`. Imutável após criação.

---

## 6. WEBHOOKS E IDEMPOTÊNCIA

### 6.1 Fluxo de Processamento Seguro

```
POST /api/webhooks/mercadopago
         │
         ▼
┌─────────────────┐
│ 1. Respond 200  │  ← Imediato, evita retry do MP
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Validar HMAC │  ← Se inválido: log + return (NÃO processar)
│   (obrigatório) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ 3. Persistir evento bruto   │  ← INSERT WebhookEvent (eventType, externalId, payload)
│    Tabela WebhookEvent      │    Se UNIQUE violation → evento duplicado → return
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ 4. Processar em transação   │  ← BEGIN TRANSACTION
│    - Buscar subscription    │    SELECT ... FOR UPDATE (lock)
│    - Mapear status          │    Atualizar Payment/Subscription
│    - Atualizar banco        │    COMMIT
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ 5. Atualizar WebhookEvent   │  ← status = PROCESSED, processedAt = now
│    Log de auditoria         │
└─────────────────────────────┘
```

### 6.2 Implementação da Idempotência Persistente

```typescript
// src/modules/webhooks/webhook-processor.ts

interface WebhookPayload {
  type?: string;
  action?: string;
  data?: { id?: string };
}

async function processWebhook(
  payload: WebhookPayload,
  headers: { signature: string; requestId: string }
): Promise<void> {

  const eventType = payload.type || payload.action || 'unknown';
  const externalId = String(payload.data?.id || '');

  if (!externalId) {
    console.warn('[Webhook] Evento sem data.id — ignorando');
    return;
  }

  // 1. Verificar HMAC (OBRIGATÓRIO em produção)
  if (!verifyHmac(headers, externalId)) {
    console.warn('[Webhook] HMAC inválido — rejeitando');
    return;
  }

  // 2. Persistir evento bruto (idempotência via UNIQUE constraint)
  let webhookEvent: WebhookEvent;
  try {
    webhookEvent = await prisma.webhookEvent.create({
      data: {
        eventType,
        externalId,
        action: payload.action || null,
        payload: payload as any,
        headers: headers as any,
        status: 'PROCESSING',
      },
    });
  } catch (error: any) {
    // UNIQUE violation = evento duplicado
    if (error.code === 'P2002') {
      console.log('[Webhook] Evento duplicado — ignorando:', { eventType, externalId });

      // Verificar se precisa reprocessar (status=FAILED)
      const existing = await prisma.webhookEvent.findFirst({
        where: { eventType, externalId },
      });
      if (existing?.status === 'FAILED') {
        console.log('[Webhook] Reprocessando evento FAILED:', existing.id);
        webhookEvent = existing;
        await prisma.webhookEvent.update({
          where: { id: existing.id },
          data: { status: 'PROCESSING', retryCount: { increment: 1 } },
        });
      } else {
        return; // Já processado com sucesso
      }
    } else {
      throw error;
    }
  }

  // 3. Processar em transação com lock
  try {
    if (eventType === 'payment' || eventType.startsWith('payment.')) {
      await billingService.handlePaymentWebhook(externalId);
    } else if (eventType === 'subscription_preapproval' || eventType.startsWith('subscription_preapproval.')) {
      await billingService.handlePreapprovalWebhook(externalId);
    }

    // 4. Marcar como processado
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  } catch (error: any) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: 'FAILED', errorMessage: error.message },
    });
    console.error('[Webhook] Falha no processamento:', {
      eventId: webhookEvent.id,
      error: error.message,
    });
  }
}
```

### 6.3 Proteção contra Concorrência

```typescript
// Dentro de handlePaymentWebhook — usar SELECT FOR UPDATE

async function handlePaymentWebhookSafe(paymentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock na subscription para evitar race condition
    const subscription = await tx.$queryRaw`
      SELECT * FROM "Subscription"
      WHERE "mpPreapprovalId" = ${preapprovalId}
      FOR UPDATE
    `;

    if (!subscription) return;

    // ... processar pagamento com lock garantido
    // Outro webhook paralelo vai esperar este commit
  });
}
```

### 6.4 Asserts Obrigatórios nos Testes de Idempotência

```typescript
describe('Idempotência de webhooks', () => {
  it('mesmo evento processado 2x não cria 2 payments', async () => {
    await sendWebhook({ type: 'payment', data: { id: 'pay_123' } });
    await sendWebhook({ type: 'payment', data: { id: 'pay_123' } });

    const payments = await prisma.payment.findMany({
      where: { mpPaymentId: 'pay_123' },
    });
    expect(payments).toHaveLength(1);
  });

  it('mesmo evento processado 2x não altera status 2x', async () => {
    // Setup: Subscription TRIAL
    await sendWebhook({ type: 'payment', data: { id: 'pay_approve' } }); // → ACTIVE
    const afterFirst = await getSubscription();
    const firstPeriodEnd = afterFirst.currentPeriodEnd;

    await sendWebhook({ type: 'payment', data: { id: 'pay_approve' } }); // duplicado
    const afterSecond = await getSubscription();

    // currentPeriodEnd NÃO deve ter sido estendido novamente
    expect(afterSecond.currentPeriodEnd.getTime())
      .toBe(firstPeriodEnd.getTime());
  });

  it('mesmo evento processado 2x não aumenta saldo/créditos', async () => {
    // Se existir lógica de créditos, garantir que não duplica
    const balanceBefore = await getCompanyBalance(companyId);
    await sendWebhook({ type: 'payment', data: { id: 'pay_123' } });
    await sendWebhook({ type: 'payment', data: { id: 'pay_123' } });
    const balanceAfter = await getCompanyBalance(companyId);

    expect(balanceAfter).toBe(balanceBefore); // Ou +1, não +2
  });

  it('webhook de preapproval processado 2x não muda cancelledAt 2x', async () => {
    await sendWebhook({ type: 'subscription_preapproval', data: { id: 'pre_cancel' } });
    const sub1 = await getSubscription();

    // Simular passagem de tempo
    jest.advanceTimersByTime(60000);

    await sendWebhook({ type: 'subscription_preapproval', data: { id: 'pre_cancel' } });
    const sub2 = await getSubscription();

    expect(sub2.cancelledAt.getTime()).toBe(sub1.cancelledAt.getTime());
  });
});
```

---

## 7. ESTRUTURA DE CÓDIGO PROPOSTA

### 7.1 Estrutura de Pastas (Evolução TypeScript)

```
backend/
├── src/
│   ├── app.ts
│   ├── server.ts                       # Entrypoint (separado do app para testes)
│   │
│   ├── config/
│   │   ├── database.ts                 # Prisma client singleton
│   │   ├── mercadopago.ts              # MP SDK config
│   │   └── env.ts                      # Validação de env vars (zod)
│   │
│   ├── lib/
│   │   ├── time-provider.ts            # [NEW] Abstração de relógio
│   │   ├── errors.ts                   # BillingError, AppError
│   │   └── logger.ts                   # Logger estruturado (pino/winston)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.service.ts
│   │   │
│   │   ├── billing/                    # [REFACTOR] billingService.js → módulo
│   │   │   ├── billing.controller.ts
│   │   │   ├── billing.routes.ts
│   │   │   ├── billing.service.ts      # Orquestração de negócio
│   │   │   ├── billing.constants.ts    # TRIAL_DAYS, PLAN_PRICES, STATUS
│   │   │   └── billing.types.ts        # Interfaces/types
│   │   │
│   │   ├── subscriptions/
│   │   │   ├── subscription.controller.ts
│   │   │   ├── subscription.routes.ts
│   │   │   └── subscription.service.ts
│   │   │
│   │   ├── webhooks/                   # [REFACTOR] webhookController → módulo dedicado
│   │   │   ├── webhook.controller.ts
│   │   │   ├── webhook.routes.ts
│   │   │   ├── webhook.processor.ts    # [NEW] Lógica de processamento
│   │   │   ├── webhook.validator.ts    # [NEW] HMAC validation
│   │   │   └── webhook.types.ts
│   │   │
│   │   ├── access/                     # [NEW]
│   │   │   └── access-policy.service.ts # Lógica de quem pode acessar o quê
│   │   │
│   │   └── reconciliation/             # [NEW]
│   │       ├── reconciliation.service.ts
│   │       └── reconciliation.cron.ts
│   │
│   ├── integrations/
│   │   └── mercadopago/
│   │       ├── mercadopago.client.ts   # [REFACTOR] mercadopagoService.js
│   │       └── mercadopago.types.ts    # Tipos da API do MP
│   │
│   └── middlewares/
│       ├── auth.middleware.ts
│       ├── subscription-guard.middleware.ts
│       └── rate-limit.middleware.ts
│
├── tests/
│   ├── unit/
│   │   ├── billing.service.test.ts
│   │   ├── subscription-guard.test.ts
│   │   ├── webhook.validator.test.ts
│   │   ├── webhook.processor.test.ts
│   │   ├── access-policy.test.ts
│   │   ├── time-provider.test.ts
│   │   └── reconciliation.test.ts
│   │
│   ├── integration/
│   │   ├── billing.integration.test.ts
│   │   ├── webhook.integration.test.ts
│   │   ├── access.integration.test.ts
│   │   └── cancel-reactivate.integration.test.ts
│   │
│   ├── e2e/
│   │   ├── trial-to-charge.e2e.test.ts
│   │   └── cancel-reactivate.e2e.test.ts
│   │
│   ├── fixtures/
│   │   ├── webhook-payloads.ts         # Payloads de teste do MP
│   │   ├── companies.ts               # Factories de empresa
│   │   └── subscriptions.ts           # Factories de subscription
│   │
│   └── helpers/
│       ├── db.ts                       # Setup/teardown do banco de teste
│       ├── time.ts                     # freezeTime, advanceDays
│       ├── auth.ts                     # Gerar JWTs de teste
│       ├── webhook.ts                  # signWebhook helper
│       └── setup.ts                    # Jest globalSetup
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── jest.config.ts
```

### 7.2 Separação de Responsabilidades

| Componente | Responsabilidade | NÃO faz |
|-----------|------------------|---------|
| **BillingService** | Orquestra regras de negócio: criar subscription, cancelar, reativar, processar webhooks, calcular datas | Não chama API do MP diretamente |
| **MercadoPagoClient** | Wrapper da API do MP: createPreapproval, getPayment, updateStatus | Não persiste no banco, não toma decisões de negócio |
| **WebhookProcessor** | Valida HMAC, persiste evento bruto, chama BillingService, atualiza status do evento | Não implementa lógica de negócio |
| **AccessPolicyService** | Decide se uma empresa pode acessar recurso (baseado em status + datas) | Não altera status |
| **ReconciliationService** | Compara banco local vs. MP, corrige divergências | Executa sob cron, não em request |
| **SubscriptionGuard** | Middleware Express que chama AccessPolicyService | Não contém lógica de decisão (delega) |
| **TimeProvider** | Abstrai `new Date()` e cálculos de data | Puro, sem I/O |

---

## 8. EXEMPLOS DE IMPLEMENTAÇÃO

### 8.A Teste Unitário — Criação da Assinatura com Trial

```typescript
// tests/unit/billing.service.test.ts

import { createSubscription, TRIAL_DAYS, STATUS, BillingError } from '../../src/services/billingService';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/config/database', () => {
  const subCreate = jest.fn();
  const subFindFirst = jest.fn();
  const companyUpdate = jest.fn();
  return {
    subscription: { findFirst: subFindFirst, create: subCreate },
    company: { update: companyUpdate },
    $transaction: jest.fn((fn: Function) =>
      fn({
        subscription: { create: subCreate, findFirst: subFindFirst },
        company: { update: companyUpdate },
      })
    ),
  };
});

jest.mock('../../src/services/mercadopagoService', () => ({
  createPreapproval: jest.fn().mockResolvedValue({
    id: 'mp_pre_abc123',
    payer_id: 'mp_payer_789',
    status: 'authorized',
  }),
}));

const prisma = require('../../src/config/database');
const mpService = require('../../src/services/mercadopagoService');

// ── Testes ───────────────────────────────────────────────────────────────────

describe('BillingService.createSubscription', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00Z') });
    jest.clearAllMocks();
    prisma.subscription.findFirst.mockResolvedValue(null);
  });

  afterEach(() => jest.useRealTimers());

  // ── T-001: Subscription criada com sucesso ──

  it('cria subscription com status TRIAL e trial de TRIAL_DAYS dias', async () => {
    prisma.subscription.create.mockResolvedValue({
      id: 'sub_001',
      plan: 'BASIC',
      status: STATUS.TRIAL,
      trialStart: new Date('2026-06-01T12:00:00Z'),
      trialEndsAt: new Date('2026-07-01T12:00:00Z'), // 30 dias se TRIAL_DAYS=30
      mpPreapprovalId: 'mp_pre_abc123',
    });

    const result = await createSubscription({
      companyId: 'company_xyz',
      plan: 'BASIC',
      cardTokenId: 'tok_valid_123',
      email: 'admin@empresa.com.br',
    });

    // Assert 1: MP chamado com parâmetros corretos
    expect(mpService.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 49,
        withTrial: true,
        payerEmail: 'admin@empresa.com.br',
        externalRef: 'company_xyz',
        cardTokenId: 'tok_valid_123',
      })
    );

    // Assert 2: Subscription criada no banco com dados corretos
    expect(prisma.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_xyz',
        plan: 'BASIC',
        status: STATUS.TRIAL,
        mpPreapprovalId: 'mp_pre_abc123',
      }),
    });

    // Assert 3: Company atualizada
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company_xyz' },
      data: expect.objectContaining({
        subscriptionStatus: STATUS.TRIAL,
      }),
    });

    // Assert 4: Retorno correto
    expect(result.status).toBe(STATUS.TRIAL);
    expect(result.mpPreapprovalId).toBe('mp_pre_abc123');
  });

  // ── T-002: Trial dura exatamente TRIAL_DAYS dias ──

  it('trial dura exatamente TRIAL_DAYS dias (sem fração)', async () => {
    // Capturar o argumento passado para prisma.subscription.create
    prisma.subscription.create.mockImplementation(({ data }: any) => {
      return Promise.resolve(data);
    });

    await createSubscription({
      companyId: 'c1',
      plan: 'BASIC',
      cardTokenId: 'tok',
      email: 'a@b.com',
    });

    const createCall = prisma.subscription.create.mock.calls[0][0];
    const trialStart = new Date(createCall.data.trialStart);
    const trialEnd = new Date(createCall.data.trialEndsAt);

    const diffMs = trialEnd.getTime() - trialStart.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(TRIAL_DAYS);
  });

  // ── T-006: Plano inválido ──

  it('rejeita plano inválido', async () => {
    await expect(
      createSubscription({ companyId: 'c1', plan: 'GOLD', cardTokenId: 'tok', email: 'a@b.com' })
    ).rejects.toThrow(BillingError);

    await expect(
      createSubscription({ companyId: 'c1', plan: 'GOLD', cardTokenId: 'tok', email: 'a@b.com' })
    ).rejects.toThrow(/Plano inválido/);

    // Assert: MP nunca chamado
    expect(mpService.createPreapproval).not.toHaveBeenCalled();
    // Assert: Banco nunca chamado
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  // ── T-009: Duplicidade bloqueada ──

  it('bloqueia criação quando já existe assinatura ativa', async () => {
    prisma.subscription.findFirst.mockResolvedValue({ id: 'existing_sub', status: 'ACTIVE' });

    await expect(
      createSubscription({ companyId: 'c1', plan: 'BASIC', cardTokenId: 'tok', email: 'a@b.com' })
    ).rejects.toThrow(/já possui assinatura ativa/);

    expect(mpService.createPreapproval).not.toHaveBeenCalled();
  });

  // ── T-015: Falha do MP não persiste no banco ──

  it('não persiste subscription se MP falhar', async () => {
    mpService.createPreapproval.mockRejectedValue(new Error('MP_TIMEOUT'));

    await expect(
      createSubscription({ companyId: 'c1', plan: 'BASIC', cardTokenId: 'tok', email: 'a@b.com' })
    ).rejects.toThrow('MP_TIMEOUT');

    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  // ── T-055: addMonths edge case ──

  it('detecta bug do addMonths nativo: 31 jan + 1 mês', () => {
    // Este teste documenta o bug existente no código:
    const jan31 = new Date('2026-01-31T12:00:00Z');
    const result = new Date(jan31);
    result.setMonth(result.getMonth() + 1);

    // JavaScript nativo: 31 jan + 1 mês = 3 de março (overflow de fev)
    // Isso é um BUG se o objetivo é "fim de fevereiro"
    expect(result.getUTCMonth()).toBe(2); // Março (0-indexed)
    expect(result.getUTCDate()).toBe(3);  // Dia 3

    // Com correção (como proposto no TimeProvider):
    const corrected = new Date('2026-01-31T12:00:00Z');
    const originalDay = corrected.getUTCDate(); // 31
    corrected.setUTCMonth(corrected.getUTCMonth() + 1);
    if (corrected.getUTCDate() !== originalDay) {
      corrected.setUTCDate(0); // Volta para último dia do mês anterior = 28 fev
    }
    expect(corrected.getUTCMonth()).toBe(1); // Fevereiro
    expect(corrected.getUTCDate()).toBe(28);
  });
});
```

### 8.B Teste de Integração — Webhook de Pagamento

```typescript
// tests/integration/webhook.integration.test.ts

import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app';
import prisma from '../../src/config/database';

// Mock apenas do MP client (não do billingService — queremos testar o fluxo real com banco)
jest.mock('../../src/services/mercadopagoService');
const mpService = require('../../src/services/mercadopagoService');

const MP_SECRET = 'test_secret_e2e_abc123';

// ── Helpers ──────────────────────────────────────────────────────────────────

function signWebhook(dataId: string, requestId: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', MP_SECRET).update(manifest).digest('hex');
  return {
    signature: `ts=${ts},v1=${hash}`,
    requestId,
  };
}

async function sendPaymentWebhook(paymentId: string, reqId: string = `req_${Date.now()}`) {
  const { signature, requestId } = signWebhook(paymentId, reqId);
  return request(app)
    .post('/api/webhooks/mercadopago')
    .set('x-signature', signature)
    .set('x-request-id', requestId)
    .send({ type: 'payment', data: { id: paymentId } });
}

// ── Setup ────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/mercadopago — integração com banco', () => {
  let company: any;
  let subscription: any;

  beforeAll(async () => {
    process.env.MP_WEBHOOK_SECRET = MP_SECRET;

    // Seed: empresa + subscription em trial
    company = await prisma.company.create({
      data: {
        name: 'Empresa Integração Teste',
        cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'),
        email: `int-test-${Date.now()}@test.com`,
        password: '$2a$10$hashedpassword',
        subscriptionStatus: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
      },
    });

    subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        plan: 'BASIC',
        status: 'TRIAL',
        trialStart: new Date(),
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
        mpPreapprovalId: `preapproval_int_${Date.now()}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { companyId: company.id } });
    await prisma.subscription.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  // ── T-020: Pagamento aprovado ativa subscription ──

  it('pagamento aprovado: Subscription → ACTIVE + Payment APPROVED', async () => {
    const paymentId = `pay_approved_${Date.now()}`;

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: subscription.mpPreapprovalId },
      external_reference: company.id,
    });

    const res = await sendPaymentWebhook(paymentId);
    expect(res.status).toBe(200);

    // Aguardar processamento assíncrono (o handler responde antes de processar)
    await new Promise((r) => setTimeout(r, 600));

    // Assert: Subscription → ACTIVE
    const updatedSub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSub!.status).toBe('ACTIVE');
    expect(updatedSub!.currentPeriodEnd).toBeDefined();
    expect(updatedSub!.gracePeriodEnd).toBeNull();

    // Assert: Payment criado
    const payment = await prisma.payment.findFirst({ where: { mpPaymentId: paymentId } });
    expect(payment).toBeDefined();
    expect(payment!.status).toBe('APPROVED');
    expect(Number(payment!.amount)).toBe(49);

    // Assert: Company atualizada
    const updatedCompany = await prisma.company.findUnique({ where: { id: company.id } });
    expect(updatedCompany!.subscriptionStatus).toBe('ACTIVE');
  });

  // ── T-022: Webhook duplicado não duplica Payment ──

  it('webhook duplicado: não cria segundo Payment', async () => {
    const paymentId = `pay_dup_${Date.now()}`;

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: subscription.mpPreapprovalId },
    });

    // Enviar 2 vezes
    await sendPaymentWebhook(paymentId, 'req_dup_1');
    await new Promise((r) => setTimeout(r, 300));
    await sendPaymentWebhook(paymentId, 'req_dup_2');
    await new Promise((r) => setTimeout(r, 300));

    // Assert: Apenas 1 Payment
    const payments = await prisma.payment.findMany({ where: { mpPaymentId: paymentId } });
    expect(payments).toHaveLength(1);
  });

  // ── T-029: HMAC inválido não processa ──

  it('HMAC inválido: retorna 200 mas não processa', async () => {
    const paymentId = `pay_forged_${Date.now()}`;

    const res = await request(app)
      .post('/api/webhooks/mercadopago')
      .set('x-signature', 'ts=9999999999,v1=00000forgedhash00000')
      .set('x-request-id', 'req_forged')
      .send({ type: 'payment', data: { id: paymentId } });

    expect(res.status).toBe(200); // MP recebe 200

    await new Promise((r) => setTimeout(r, 300));

    // Assert: Nenhum Payment criado
    const payment = await prisma.payment.findFirst({ where: { mpPaymentId: paymentId } });
    expect(payment).toBeNull();
  });

  // ── T-021: Pagamento recusado → PAST_DUE ──

  it('pagamento recusado: Subscription → PAST_DUE com grace period', async () => {
    // Reset subscription to ACTIVE first
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE' },
    });

    const paymentId = `pay_rejected_${Date.now()}`;

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'rejected',
      status_detail: 'cc_rejected_insufficient_amount',
      transaction_amount: 49.0,
      metadata: { preapproval_id: subscription.mpPreapprovalId },
    });

    await sendPaymentWebhook(paymentId);
    await new Promise((r) => setTimeout(r, 600));

    // Assert: Subscription → PAST_DUE
    const updatedSub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSub!.status).toBe('PAST_DUE');
    expect(updatedSub!.gracePeriodEnd).toBeDefined();

    // Assert: gracePeriodEnd = now + 3 dias
    const graceEnd = updatedSub!.gracePeriodEnd!.getTime();
    const expected = Date.now() + 3 * 86400000;
    expect(Math.abs(graceEnd - expected)).toBeLessThan(5000); // Tolerância de 5s
  });
});
```

### 8.C Teste E2E — Fluxo Completo Trial → Cobrança

```typescript
// tests/e2e/trial-to-charge.e2e.test.ts

import request from 'supertest';
import app from '../../src/app';
import prisma from '../../src/config/database';

// Mock do MP service para simular webhooks internamente
jest.mock('../../src/services/mercadopagoService');
const mpService = require('../../src/services/mercadopagoService');

describe('E2E: Registro → Trial → Cobrança → Acesso', () => {
  let authToken: string;
  let companyId: string;

  afterAll(async () => {
    if (companyId) {
      await prisma.payment.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // ── Passo 1: Registrar empresa ──

  it('1. Registro: empresa criada em TRIAL', async () => {
    const email = `e2e-full-${Date.now()}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: `E2E Full Flow ${Date.now()}`,
        cnpj: `${Date.now()}`.slice(0, 14),
        email,
        password: 'SenhaForte@2026!',
      })
      .expect(201);

    authToken = res.body.token;
    companyId = res.body.company?.id || res.body.companyId;

    expect(authToken).toBeDefined();
    expect(companyId).toBeDefined();
  });

  // ── Passo 2: Verificar status inicial ──

  it('2. Status inicial: TRIAL com dias restantes', async () => {
    const res = await request(app)
      .get('/api/subscriptions/status')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.subscription.status).toBe('TRIAL');
    expect(res.body.subscription.trialDaysLeft).toBeGreaterThan(0);
  });

  // ── Passo 3: Criar assinatura com cartão ──

  it('3. Criar assinatura: subscription com preapproval', async () => {
    mpService.createPreapproval.mockResolvedValue({
      id: `mp_preapproval_e2e_${Date.now()}`,
      payer_id: 'mp_payer_e2e_123',
      status: 'authorized',
    });

    const res = await request(app)
      .post('/api/subscriptions/create-preapproval')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        plan: 'BASIC',
        cardTokenId: 'tok_e2e_valid_123',
        email: `e2e-${Date.now()}@test.com`,
      })
      .expect(201);

    expect(res.body.subscription.status).toBe('TRIAL');
    expect(res.body.subscription.mpPreapprovalId).toBeDefined();
  });

  // ── Passo 4: Acesso liberado durante trial ──

  it('4. Acesso: liberado durante trial', async () => {
    await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  // ── Passo 5: Avançar relógio + simular cobrança ──

  it('5. Simular 1ª cobrança aprovada via webhook', async () => {
    const sub = await prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const paymentId = `e2e_pay_${Date.now()}`;

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: sub!.mpPreapprovalId },
      external_reference: companyId,
    });

    // Chamar handler diretamente (simula webhook)
    const { handlePaymentWebhook } = require('../../src/services/billingService');
    await handlePaymentWebhook(paymentId);

    // Assert: Subscription ativada
    const updatedSub = await prisma.subscription.findFirst({
      where: { id: sub!.id },
    });
    expect(updatedSub!.status).toBe('ACTIVE');
    expect(updatedSub!.currentPeriodEnd).toBeDefined();

    // Assert: Payment registrado
    const payment = await prisma.payment.findFirst({ where: { mpPaymentId: paymentId } });
    expect(payment).toBeDefined();
    expect(payment!.status).toBe('APPROVED');
  });

  // ── Passo 6: Acesso continua após ativação ──

  it('6. Acesso: continua liberado após ativação', async () => {
    await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  // ── Passo 7: Verificar status atualizado ──

  it('7. Status: ACTIVE após pagamento', async () => {
    const res = await request(app)
      .get('/api/subscriptions/status')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.subscription.status).toBe('ACTIVE');
  });
});
```

### 8.D Teste de Falha — Webhook Duplicado, Pagamento Recusado, Acesso Bloqueado

```typescript
// tests/integration/failures.integration.test.ts

import request from 'supertest';
import app from '../../src/app';
import prisma from '../../src/config/database';
import jwt from 'jsonwebtoken';

jest.mock('../../src/services/mercadopagoService');
const mpService = require('../../src/services/mercadopagoService');

describe('Cenários de falha — integração', () => {
  let company: any;
  let subscription: any;
  let adminToken: string;

  beforeAll(async () => {
    company = await prisma.company.create({
      data: {
        name: 'Empresa Falhas',
        cnpj: `fail${Date.now()}`.slice(0, 14),
        email: `fail-${Date.now()}@test.com`,
        password: '$2a$10$hash',
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: null,
      },
    });

    const admin = await prisma.user.create({
      data: {
        name: 'Admin Falhas',
        email: `admin-fail-${Date.now()}@test.com`,
        password: '$2a$10$hash',
        role: 'ADMIN',
        companyId: company.id,
      },
    });

    subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        plan: 'BASIC',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        mpPreapprovalId: `pre_fail_${Date.now()}`,
      },
    });

    adminToken = jwt.sign(
      { id: admin.id, role: 'ADMIN', companyId: company.id, type: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { companyId: company.id } });
    await prisma.subscription.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  // ── T-033: Acesso bloqueado após inadimplência ──

  it('acesso bloqueado quando PAST_DUE + grace expirado', async () => {
    // Setar PAST_DUE com grace period no passado
    const pastGrace = new Date(Date.now() - 86400000); // ontem
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE', gracePeriodEnd: pastGrace },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { subscriptionStatus: 'PAST_DUE' },
    });

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(402);

    expect(res.body.code).toBe('PAYMENT_OVERDUE');
  });

  // ── T-034: Desbloqueio após regularização ──

  it('acesso liberado após pagamento aprovado resolver PAST_DUE', async () => {
    const paymentId = `pay_resolve_${Date.now()}`;

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: subscription.mpPreapprovalId },
    });

    const { handlePaymentWebhook } = require('../../src/services/billingService');
    await handlePaymentWebhook(paymentId);

    // Agora deve ter acesso
    await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Verificar status
    const updatedSub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSub!.status).toBe('ACTIVE');
  });

  // ── T-043: Front-end não pode liberar acesso ──

  it('front não pode bypassar guard — empresa CANCELLED recebe 402', async () => {
    await prisma.company.update({
      where: { id: company.id },
      data: { subscriptionStatus: 'CANCELLED' },
    });

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Override-Status', 'ACTIVE') // Tentativa de manipulação
      .expect(402);

    expect(res.body.code).toBe('SUBSCRIPTION_INACTIVE');

    // Restaurar
    await prisma.company.update({
      where: { id: company.id },
      data: { subscriptionStatus: 'ACTIVE' },
    });
  });
});
```

### 8.E Reconciliação Diária

```typescript
// src/modules/reconciliation/reconciliation.service.ts

import prisma from '../../config/database';
import mpClient from '../../integrations/mercadopago/mercadopago.client';

const MP_STATUS_MAP: Record<string, string> = {
  authorized: 'ACTIVE',
  paused: 'PAUSED',
  cancelled: 'CANCELLED',
  pending: 'TRIAL',
};

interface ReconciliationReport {
  totalChecked: number;
  divergences: Array<{
    subscriptionId: string;
    companyId: string;
    localStatus: string;
    mpStatus: string;
    correctedTo: string;
  }>;
  errors: Array<{ subscriptionId: string; error: string }>;
  expiredTrials: number;
  expiredGracePeriods: number;
  executedAt: Date;
}

export async function runDailyReconciliation(): Promise<ReconciliationReport> {
  const now = new Date();
  const report: ReconciliationReport = {
    totalChecked: 0,
    divergences: [],
    errors: [],
    expiredTrials: 0,
    expiredGracePeriods: 0,
    executedAt: now,
  };

  console.log('[Reconciliation] Início:', now.toISOString());

  // ── 1. Checar subscriptions ativas contra o MP ──

  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
      mpPreapprovalId: { not: null },
    },
    include: { company: { select: { name: true } } },
  });

  report.totalChecked = activeSubscriptions.length;

  for (const sub of activeSubscriptions) {
    try {
      const mpPre = await mpClient.getPreapproval(sub.mpPreapprovalId!);
      if (!mpPre) {
        report.errors.push({
          subscriptionId: sub.id,
          error: `Preapproval ${sub.mpPreapprovalId} não encontrada no MP`,
        });
        continue;
      }

      const expectedStatus = MP_STATUS_MAP[mpPre.status];
      if (!expectedStatus) continue; // Status desconhecido, ignorar

      if (sub.status !== expectedStatus) {
        // Divergência encontrada — corrigir
        report.divergences.push({
          subscriptionId: sub.id,
          companyId: sub.companyId,
          localStatus: sub.status,
          mpStatus: mpPre.status,
          correctedTo: expectedStatus,
        });

        const updateData: any = { status: expectedStatus };
        if (expectedStatus === 'CANCELLED') {
          updateData.cancelledAt = now;
          updateData.cancelReason = 'reconciliation_correction';
        }

        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data: updateData,
          });
          await tx.company.update({
            where: { id: sub.companyId },
            data: { subscriptionStatus: expectedStatus },
          });
        });

        // Registrar log de reconciliação
        await prisma.reconciliationLog.create({
          data: {
            subscriptionId: sub.id,
            companyId: sub.companyId,
            localStatus: sub.status,
            mpStatus: mpPre.status,
            action: 'CORRECTED',
            details: { correctedTo: expectedStatus },
          },
        });
      }
    } catch (error: any) {
      report.errors.push({
        subscriptionId: sub.id,
        error: error.message,
      });
    }
  }

  // ── 2. Detectar trials expirados ──

  const expiredTrials = await prisma.subscription.count({
    where: { status: 'TRIAL', trialEndsAt: { lt: now } },
  });
  report.expiredTrials = expiredTrials;

  // ── 3. Detectar grace periods expirados ──

  const expiredGrace = await prisma.subscription.count({
    where: { status: 'PAST_DUE', gracePeriodEnd: { lt: now } },
  });
  report.expiredGracePeriods = expiredGrace;

  console.log('[Reconciliation] Concluída:', {
    totalChecked: report.totalChecked,
    divergences: report.divergences.length,
    errors: report.errors.length,
    expiredTrials: report.expiredTrials,
    expiredGracePeriods: report.expiredGracePeriods,
  });

  return report;
}
```

**Teste da reconciliação:**

```typescript
// tests/unit/reconciliation.test.ts

import { runDailyReconciliation } from '../../src/modules/reconciliation/reconciliation.service';

jest.mock('../../src/config/database');
jest.mock('../../src/integrations/mercadopago/mercadopago.client');

const prisma = require('../../src/config/database');
const mpClient = require('../../src/integrations/mercadopago/mercadopago.client');

describe('Reconciliação diária', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: Function) => fn(prisma));
    prisma.reconciliationLog = { create: jest.fn().mockResolvedValue({}) };
  });

  it('T-036: corrige divergência TRIAL local → ACTIVE no MP', async () => {
    prisma.subscription.findMany
      .mockResolvedValueOnce([{
        id: 'sub_div_1',
        companyId: 'comp_1',
        status: 'TRIAL',
        mpPreapprovalId: 'mp_pre_div_1',
        company: { name: 'Empresa Divergente' },
      }]);

    prisma.subscription.count
      .mockResolvedValueOnce(0)   // trials expirados
      .mockResolvedValueOnce(0);  // grace expirados

    mpClient.getPreapproval.mockResolvedValue({
      id: 'mp_pre_div_1',
      status: 'authorized',
    });

    prisma.subscription.update.mockResolvedValue({});
    prisma.company.update.mockResolvedValue({});

    const report = await runDailyReconciliation();

    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toEqual(
      expect.objectContaining({
        localStatus: 'TRIAL',
        correctedTo: 'ACTIVE',
      })
    );

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_div_1' },
      data: { status: 'ACTIVE' },
    });

    expect(prisma.reconciliationLog.create).toHaveBeenCalled();
  });

  it('reporta erro quando preapproval não existe no MP', async () => {
    prisma.subscription.findMany
      .mockResolvedValueOnce([{
        id: 'sub_ghost',
        companyId: 'comp_ghost',
        status: 'ACTIVE',
        mpPreapprovalId: 'mp_pre_ghost',
        company: { name: 'Fantasma' },
      }]);

    prisma.subscription.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mpClient.getPreapproval.mockResolvedValue(null);

    const report = await runDailyReconciliation();

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].error).toContain('não encontrada');
    expect(report.divergences).toHaveLength(0);
  });
});
```

---

## 9. CRITÉRIOS DE ACEITE DE PRODUÇÃO

### 9.1 Cobertura de Testes

| Módulo | Cobertura Mínima | Justificativa |
|--------|------------------|---------------|
| `billingService` | **90%** branches | Movimenta dinheiro; cada branch não coberto é um risco financeiro |
| `webhookController` / `webhookProcessor` | **85%** branches | Ponto de entrada de eventos financeiros |
| `subscriptionGuard` | **95%** branches | Gatekeeper de acesso — cada branch precisa ser testado |
| `mercadopagoService` | **70%** lines | Interface com API externa; difícil cobrir todas as edge cases |
| `reconciliationService` | **80%** branches | Safety net; precisa funcionar quando falham os outros |

### 9.2 Cenários Obrigatórios Aprovados

Todos os testes marcados como **CRÍTICA** na Seção 4 devem estar passando:

- [ ] T-001: Assinatura criada com sucesso
- [ ] T-002: Trial de TRIAL_DAYS dias exatos
- [ ] T-004: Acesso liberado durante trial
- [ ] T-005: Acesso bloqueado sem assinatura
- [ ] T-009: Duplicidade bloqueada
- [ ] T-010: Cobrança aprovada → ACTIVE
- [ ] T-011: Cobrança recusada → PAST_DUE
- [ ] T-020: Webhook pagamento aprovado
- [ ] T-021: Webhook pagamento recusado
- [ ] T-022: Webhook duplicado
- [ ] T-029: HMAC inválido rejeitado
- [ ] T-033: Bloqueio por inadimplência
- [ ] T-034: Desbloqueio após regularização
- [ ] T-040: Replay de webhook seguro
- [ ] T-041: Webhook forjado rejeitado
- [ ] T-042: Manipulação de data ignorada
- [ ] T-043: Front-end não bypassa guard
- [ ] T-045: Webhook sem headers rejeitado
- [ ] T-050: Trial expira na data correta
- [ ] T-056: Sem cobrança antecipada
- [ ] T-057: Bloqueio no vencimento

### 9.3 Observabilidade Mínima

| Item | Requisito |
|------|-----------|
| **Logs estruturados** | Todo evento de billing logado com `subscriptionId`, `companyId`, `status` |
| **Métricas** | Contadores: webhooks recebidos, processados, falhos, duplicados |
| **Dashboard** | Distribuição de status de assinaturas (TRIAL/ACTIVE/PAST_DUE/CANCELLED) |
| **Alertas** | ≥5 webhooks FAILED em 1h, ≥3 pagamentos REJECTED em 1d, reconciliação com divergências |
| **Rastreabilidade** | Todo Payment referencia `mpPaymentId`, toda Subscription referencia `mpPreapprovalId` |

### 9.4 Estratégia de Rollback

| Cenário | Ação |
|---------|------|
| Bug no processamento de webhook | Reprocessar eventos FAILED da tabela WebhookEvent |
| Subscription em status errado | Reconciliação manual via admin + reconciliação automática via cron |
| Cobrança indevida | Estornar no painel do MP, criar Payment com status=REFUNDED |
| Webhook URL incorreta | Corrigir no painel do MP, reprocessar eventos perdidos |

### 9.5 Plano para Eventos Perdidos

1. **Detecção**: Reconciliação diária compara MP vs banco
2. **Recuperação**: Para cada subscription divergente, buscar `preapproval` e `payments` no MP
3. **Correção**: Criar/atualizar registros locais baseado nos dados do MP
4. **Prevenção**: Implementar fila de processamento (BullMQ) para não depender de processamento síncrono inline

---

## 10. CHECKLIST DE PRODUÇÃO

```
CREDENCIAIS E SEGURANÇA
[ ] MP_ACCESS_TOKEN de produção configurado em variável de ambiente segura (não em .env commitado)
[ ] MP_WEBHOOK_SECRET de produção configurado
[ ] JWT_SECRET forte (mínimo 256 bits) e não padrão
[ ] Validação HMAC obrigatória (não bypassável se secret ausente)
[ ] Rate limiting no endpoint de webhook (proteção contra DDoS)
[ ] HTTPS obrigatório (certificado SSL válido)
[ ] Nenhum dado de cartão armazenado (apenas tokens transitórios)
[ ] Logs não expõem tokens, senhas ou dados financeiros sensíveis

SEPARAÇÃO SANDBOX / PRODUÇÃO
[ ] Variáveis de ambiente distintas para sandbox e produção
[ ] Banco de teste separado do banco de produção
[ ] Webhook URL de sandbox NÃO aponta para produção
[ ] Testes E2E usam apenas credenciais de sandbox

WEBHOOK
[ ] URL de webhook registrada no painel do Mercado Pago (produção)
[ ] Formato: POST https://<domínio>/api/webhooks/mercadopago
[ ] Endpoint aceita POST sem autenticação JWT (é público, mas validado por HMAC)
[ ] Estratégia de response-before-process implementada
[ ] Idempotência persistente (tabela WebhookEvent ou Redis, NÃO Set em memória)
[ ] Eventos brutos persistidos antes do processamento
[ ] Eventos com status FAILED podem ser reprocessados

PERSISTÊNCIA E CONSISTÊNCIA
[ ] `external_reference` sempre populado com `companyId`
[ ] `mpPreapprovalId` com constraint UNIQUE no banco
[ ] `mpPaymentId` com constraint UNIQUE no banco
[ ] Todas as operações de mudança de status em `$transaction`
[ ] Company.subscriptionStatus sempre sincronizado com Subscription.status

REGRAS DE NEGÓCIO
[ ] TRIAL_DAYS definido corretamente (14 ou 30, conforme decisão de negócio)
[ ] TRIAL_DAYS consistente entre billingService e mercadopagoService
[ ] Grace period de 3 dias implementado e testado
[ ] Cancelamento funciona em qualquer estado ativo
[ ] Reativação exige cardTokenId válido (fix do bug atual)
[ ] Assinatura duplicada para mesma empresa é bloqueada

ACESSO
[ ] subscriptionGuard aplicado em TODAS as rotas protegidas
[ ] Guard consulta banco (não front-end, não cache, não JWT payload)
[ ] TRIAL expirado → 402
[ ] ACTIVE → 200
[ ] PAST_DUE dentro do grace → 200
[ ] PAST_DUE após grace → 402
[ ] CANCELLED → 402
[ ] PAUSED → 402
[ ] SUPER_ADMIN bypassa guard

RECONCILIAÇÃO
[ ] Cron de reconciliação diária agendado (ex: 03:00 UTC)
[ ] Reconciliação detecta divergências entre MP e banco local
[ ] Reconciliação gera log auditável (ReconciliationLog)
[ ] Trials expirados sem pagamento são flaggeados
[ ] Grace periods expirados são flaggeados

MONITORAMENTO E ALERTAS
[ ] Alerta: ≥5 webhooks FAILED em 1 hora
[ ] Alerta: Reconciliação com ≥1 divergência
[ ] Alerta: ≥3 pagamentos REJECTED consecutivos de uma empresa
[ ] Log rotation configurado (não depender apenas de console.log)
[ ] Health check do endpoint de webhook testável externamente

TESTES
[ ] Todos os testes CRÍTICA passando (22 cenários)
[ ] Cobertura ≥90% em billingService, ≥85% em webhookController, ≥95% em guard
[ ] Teste de carga no endpoint de webhook (mínimo 50 req/s)
[ ] Teste de timezone executado (servidor em UTC)
```

---

## 11. RISCOS PRINCIPAIS

| # | Risco | Impacto | Causa Provável | Mitigação |
|---|-------|---------|----------------|-----------|
| **R1** | Usuário com acesso sem pagar | **CRÍTICO** — perda de receita | Guard baseado em cache/front-end; status TRIAL nunca atualizado; webhook perdido | Guard consulta banco em tempo real; reconciliação diária; estado EXPIRED |
| **R2** | Usuário pago bloqueado indevidamente | **CRÍTICO** — churn, reclamação | Webhook de aprovação não processado; divergência MP/banco; race condition | Reconciliação diária corrige; grace period de 3 dias; retry de webhook; fila de processamento |
| **R3** | Cobrança duplicada | **ALTO** — estorno + reputação | Dois webhooks de pagamento para mesmo período sem deduplicação | Idempotência por `mpPaymentId` (UNIQUE); `SELECT FOR UPDATE` na subscription |
| **R4** | Webhook perdido | **ALTO** — assinatura fica no estado errado | Erro no processamento após response 200; servidor cai durante processamento | Persistir evento ANTES de processar; fila de reprocessamento; reconciliação como safety net |
| **R5** | Data errada da 1ª cobrança | **ALTO** — cobrar antes do trial terminar | Bug em `addDays` com timezone local; `TRIAL_DAYS` inconsistente entre modules | Usar UTC em todo cálculo; single source of truth para `TRIAL_DAYS`; teste T-050 |
| **R6** | Estados inconsistentes (banco ≠ MP) | **ALTO** — acesso incorreto | Webhook fora de ordem; falha parcial de transação; bug no mapeamento de status | Reconciliação diária; `$transaction` em todas as operações; tabela `ReconciliationLog` |
| **R7** | Corrida de concorrência | **MÉDIO** — duplicação, estado errado | Dois webhooks processados simultaneamente para mesma subscription | `SELECT FOR UPDATE`;idempotência por `WebhookEvent` UNIQUE; mutex |
| **R8** | Dependência excessiva do front-end | **CRÍTICO** — segurança | Front decide mostrar/esconder funcionalidades baseado em status local | Guard no backend é mandatory; front sempre consulta API; nunca armazenar status em localStorage como fonte de verdade |
| **R9** | Idempotência volátil (Set in-memory) | **ALTO** — reprocessamento após restart | `processedWebhooks = new Set()` em `webhookController.js` | Migrar para tabela `WebhookEvent` com UNIQUE constraint |
| **R10** | HMAC bypass quando MP_WEBHOOK_SECRET ausente | **CRÍTICO** — aceita webhooks forjados | `if (!MP_WEBHOOK_SECRET)` silenciosamente pula validação | Forçar presença do secret em produção; rejeitar se ausente |
| **R11** | `addMonths` overflow (31 jan + 1 = 3 mar) | **MÉDIO** — período de assinatura errado | `Date.setMonth` nativo do JS | Usar `setUTCMonth` com a correção de overflow proposta; ou usar `date-fns` |
| **R12** | Reativação sem cartão cria assinatura sem cobrança | **ALTO** — acesso grátis infinito | Código aceita `cardTokenId` vazio em `reactivateSubscription` | Validar presença obrigatória de `cardTokenId` |

---

## 12. ORDEM RECOMENDADA DE EXECUÇÃO

```
SPRINT 1 — FUNDAÇÕES (Semana 1)
════════════════════════════════

 1. [MODELO] Corrigir TRIAL_DAYS para 30 (ou alinhar com decisão de negócio)
    - billingService.js:13
    - mercadopagoService.js:8
    - Definir como constante única exportada de billing.constants

 2. [MODELO] Criar máquina de estados formal
    - Definir transições válidas
    - Adicionar estado PENDING e EXPIRED
    - Adicionar campos: cancelReason, statusChangedAt, statusChangedBy

 3. [INFRA] Criar TimeProvider
    - SystemTimeProvider para produção
    - FakeTimeProvider para testes
    - Substituir todos os `new Date()` em billingService e guard

 4. [SCHEMA] Criar tabela WebhookEvent no Prisma
    - migration + modelo
    - UNIQUE(eventType, externalId)

SPRINT 2 — CORE DO BILLING (Semana 2)
══════════════════════════════════════

 5. [BILLING] Refatorar createSubscription
    - Usar TimeProvider
    - Status inicial: PENDING → TRIALING após confirmação
    - Validar cardTokenId obrigatório em reactivateSubscription (fix R12)

 6. [PERSISTÊNCIA] Migrar idempotência para WebhookEvent
    - Substituir Set em memória
    - INSERT com catch de UNIQUE violation

 7. [WEBHOOK] Hardening do webhookController
    - Tornar MP_WEBHOOK_SECRET obrigatório em produção
    - Não responder 200 antes de validar HMAC (ou mover a response para DEPOIS da validação)
    - Persistir evento bruto antes de processar
    - Reprocessamento de eventos FAILED

SPRINT 3 — TESTES (Semana 3)
═════════════════════════════

 8. [TESTES] Escrever testes unitários (Fase 1 — 40 testes)
    - billingService
    - webhookValidator
    - subscriptionGuard
    - TimeProvider

 9. [TESTES] Escrever testes de integração (Fase 2 — 25 testes)
    - webhook endpoint com banco real
    - guard com banco real
    - cancelamento e reativação

10. [ACESSO] Revisar subscriptionGuard
    - Garantir cobertura de todos os estados
    - Testar PAST_DUE com grace period em fronteira
    - Testar SUPER_ADMIN bypass

SPRINT 4 — RECONCILIAÇÃO E E2E (Semana 4)
═══════════════════════════════════════════

11. [RECONCILIAÇÃO] Implementar ReconciliationService
    - Cron diário
    - Detectar divergências
    - Corrigir automaticamente
    - Logar em ReconciliationLog

12. [E2E] Escrever testes E2E com sandbox
    - Fluxo completo trial → cobrança
    - Cartão recusado
    - Cancelamento e reativação

SPRINT 5 — HARDENING (Semana 5)
════════════════════════════════

13. [SEGURANÇA] Audit final
    - Teste de carga no webhook (50+ req/s)
    - Teste de concorrência (2 webhooks simultâneos)
    - Teste de replay
    - Forçar UTC no servidor (process.env.TZ = 'UTC')

14. [OBSERVABILIDADE] Logs e alertas
    - Migrar console.log para logger estruturado (pino)
    - Configurar alertas para webhooks FAILED
    - Dashboard de status de assinaturas

15. [DEPLOY] Checklist de produção
    - Executar toda a checklist da Seção 10
    - Review de credenciais
    - Backup do banco antes do go-live
    - Deploy com feature flag (gradual rollout)
```

---

## Consideração Final

A integração atual está funcional, mas com vulnerabilidades reais que devem ser corrigidas antes de processar dinheiro em produção. Os 3 problemas mais urgentes, em ordem:

1. **Webhook HMAC bypassável** — qualquer pessoa pode forjar um webhook e ativar/cancelar assinaturas.
2. **Idempotência volátil** — um restart do servidor permite reprocessamento de webhooks antigos.
3. **Reativação sem cartão** — cria acesso gratuito infinito sem nenhuma cobrança configurada.

Todos os exemplos de código neste documento foram escritos com base na estrutura real do seu projeto (Express + Prisma + Mercado Pago SDK) e podem ser adaptados diretamente.
