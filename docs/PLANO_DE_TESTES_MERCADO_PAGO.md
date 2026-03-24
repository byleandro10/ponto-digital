# Plano de Testes — Integração Mercado Pago (Ponto Digital)

> **Versão**: 1.0  
> **Data**: 2026-03-24  
> **Escopo**: Fluxo completo de assinaturas — trial → cobrança → webhook → controle de acesso  
> **Stack**: Node.js + Express + Prisma + Mercado Pago Preapproval API  

---

## 1. Mapeamento do Fluxo Ponta a Ponta

```
┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐    ┌────────────────────┐
│  CADASTRO   │───▶│  TOKENIZAÇÃO     │───▶│  CRIAÇÃO DA       │───▶│  INÍCIO DO         │
│  da empresa │    │  do cartão       │    │  PREAPPROVAL (MP) │    │  TRIAL (14 dias)   │
│  (Company)  │    │  (MP JS SDK)     │    │  com free_trial   │    │  status = TRIAL    │
└─────────────┘    └──────────────────┘    └───────────────────┘    └────────┬───────────┘
                                                                             │
                                                                    14 dias depois
                                                                             │
┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐    ┌────▼───────────────┐
│  LIBERAÇÃO /    │◀──│  ATUALIZAÇÃO     │◀──│  WEBHOOK do MP    │◀──│  TENTATIVA DE      │
│  BLOQUEIO de   │    │  no banco        │    │  (payment ou      │    │  COBRANÇA          │
│  acesso        │    │  (Subscription + │    │   preapproval)    │    │  automática (MP)   │
│                │    │   Company)       │    └───────────────────┘    └────────────────────┘
└─────────────────┘    └──────────────────┘
```

### Detalhamento de cada etapa

| # | Etapa | Componente | Arquivo | Ação |
|---|-------|-----------|---------|------|
| 1 | Cadastro da empresa | `authController.register()` | `authController.js` | Cria Company com `subscriptionStatus=TRIAL`, `trialEndsAt=now+14d` |
| 2 | Tokenização do cartão | MP JS SDK (front-end) | `Checkout.jsx` | Gera `cardTokenId` via `window.MercadoPago.createCardToken()` |
| 3 | Criação da Preapproval | `billingService.createSubscription()` | `billingService.js` | Valida plano, cria preapproval no MP com `free_trial: {frequency: 14, frequency_type: 'days'}`, salva Subscription com `status=TRIAL` |
| 4 | Início do Trial | Persistência atômica (Prisma `$transaction`) | `billingService.js` | `trialStart=now`, `trialEndsAt=now+14d`, `Company.subscriptionStatus=TRIAL` |
| 5 | Fim do Trial / Cobrança | Mercado Pago (automático) | — | MP tenta cobrar o cartão automaticamente após expirar o `free_trial` |
| 6 | Webhook de pagamento | `webhookController.handleMercadoPagoWebhook()` | `webhookController.js` | Recebe `type=payment`, valida HMAC, verifica idempotência, delega a `billingService.handlePaymentWebhook()` |
| 7 | Processamento do pagamento | `billingService.handlePaymentWebhook()` | `billingService.js` | Busca pagamento no MP, faz upsert em Payment, se APPROVED → `activateSubscription()`, se REJECTED → `markAsPastDue()` |
| 8 | Atualização no banco | `activateSubscription()` / `markAsPastDue()` | `billingService.js` | Atualiza `Subscription.status` e `Company.subscriptionStatus` em transação |
| 9 | Controle de acesso | `subscriptionGuard` middleware | `subscriptionGuard.js` | Verifica `Company.subscriptionStatus`: TRIAL (se dentro do prazo), ACTIVE, PAST_DUE (com grace period de 3 dias) → libera; demais → 402 |

### Observação Crítica (Divergência com Requisito)

> **Seu requisito menciona 30 dias de trial, mas o código atual usa 14 dias (`TRIAL_DAYS = 14`).**  
> A constante `TRIAL_DAYS` em `billingService.js` (linha 13) e `mercadopagoService.js` (linha 8) está definida como **14**.  
> **Ação necessária**: alterar para 30 caso esse seja o período desejado, ou alinhar o requisito.  
> Este plano de testes referencia a constante `TRIAL_DAYS` para ser agnóstico ao valor.

---

## 2. Matriz de Cenários de Teste

### 2.1 Criação de Assinatura e Trial

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-001** | Assinatura criada com sucesso | Empresa registrada, sem assinatura ativa | 1. POST `/api/subscriptions/create-preapproval` com `{plan: "BASIC", cardTokenId: "<valid>", email: "test@test.com"}` | Status 200, Subscription criada com `status=TRIAL`, `plan=BASIC`, `mpPreapprovalId` populado; Company atualizada com `subscriptionStatus=TRIAL` | cardTokenId válido do sandbox, companyId existente | **CRÍTICA** |
| **TC-002** | Trial de TRIAL_DAYS dias aplicado corretamente | TC-001 concluído | 1. Verificar `trialStart` e `trialEndsAt` na Subscription criada | `trialEndsAt - trialStart = TRIAL_DAYS dias (exato, sem desvio de horas)`, `currentPeriodEnd = trialEndsAt` | — | **CRÍTICA** |
| **TC-003** | Data da primeira cobrança calculada corretamente | TC-001 concluído | 1. Consultar preapproval no MP via `mpPreapprovalId` 2. Verificar `auto_recurring.free_trial` | `free_trial.frequency = TRIAL_DAYS`, `free_trial.frequency_type = 'days'`; data da primeira cobrança no MP = `created + TRIAL_DAYS dias` | `mpPreapprovalId` da subscription | **CRÍTICA** |
| **TC-004** | Rejeição de plano inválido | Empresa autenticada | POST com `plan: "GOLD"` | Status 400, `"Plano inválido. Use BASIC, PROFESSIONAL ou ENTERPRISE."` | plano inexistente | **ALTA** |
| **TC-005** | Rejeição sem token de cartão | Empresa autenticada | POST sem `cardTokenId` | Status 400, `"Token do cartão é obrigatório."` | — | **ALTA** |
| **TC-006** | Rejeição sem email | Empresa autenticada | POST sem `email` | Status 400, `"E-mail é obrigatório."` | — | **ALTA** |
| **TC-007** | Duplicidade de assinatura bloqueada | Empresa já com Subscription `status=TRIAL` ou `ACTIVE` | POST `/api/subscriptions/create-preapproval` | Status 400, `"Empresa já possui assinatura ativa."` | companyId com assinatura existente | **CRÍTICA** |

### 2.2 Cobrança no Fim do Trial

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-010** | Cobrança aprovada no fim do trial | Subscription `status=TRIAL`, trial expirado, cartão válido no MP | 1. Simular webhook `type=payment` com pagamento `status=approved` 2. Verificar banco | Subscription → `status=ACTIVE`, `currentPeriodEnd = now + 1 mês`, Payment criado com `status=APPROVED`, `Company.subscriptionStatus=ACTIVE` | paymentId aprovado do sandbox | **CRÍTICA** |
| **TC-011** | Cobrança recusada no fim do trial | Subscription `status=TRIAL`, cartão recusado | 1. Simular webhook `type=payment` com pagamento `status=rejected` | Subscription → `status=PAST_DUE`, `gracePeriodEnd = now + 3 dias`, Payment com `status=REJECTED`, `Company.subscriptionStatus=PAST_DUE` | paymentId rejeitado do sandbox | **CRÍTICA** |

### 2.3 Cartão Inválido / Expirado / Token Inválido

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-020** | Cartão inválido rejeita criação da assinatura | Empresa autenticada | POST com cardTokenId gerado a partir de número inválido (ex: `0000 0000 0000 0000`) | Erro da API do MP propagado, Subscription **não** criada no banco | token de cartão inválido do sandbox | **ALTA** |
| **TC-021** | Cartão expirado rejeita criação | Empresa autenticada | POST com cardToken de cartão com validade passada | Erro do MP (ex: `cc_rejected_card_disabled`), Subscription não criada | token de cartão expirado do sandbox (usar cartão de teste `APRO` com data passada) | **ALTA** |
| **TC-022** | Token de cartão inválido/expirado | Empresa autenticada | POST com `cardTokenId: "tok_invalid_12345"` | Erro 400 do MP (`"card_token not found"`), Subscription não criada | token fabricado | **ALTA** |

### 2.4 Falha Temporária da API

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-030** | Falha temporária na API do MP ao criar preapproval | mpService.createPreapproval mockado para lançar erro de rede | 1. POST `/api/subscriptions/create-preapproval` | Status 500, Subscription **não** criada no banco (rollback), mensagem de erro genérica | mock do mpService | **ALTA** |
| **TC-031** | Falha temporária na API do MP ao cancelar | mpService.updatePreapprovalStatus mockado para lançar erro | 1. POST `/api/subscriptions/cancel` | Assinatura cancelada **localmente** (fallback do código: `"Continua — o cancelamento local é prioritário"`), Company → CANCELLED | mock do mpService | **MÉDIA** |

### 2.5 Webhooks

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-040** | Webhook pagamento aprovado | Subscription existente com `mpPreapprovalId` | 1. POST `/api/webhooks/mercadopago` com `{type: "payment", data: {id: "<paymentId>"}}` + headers HMAC válidos | 200 retornado imediatamente, Subscription → ACTIVE, Payment criado com APPROVED | paymentId, HMAC assinado | **CRÍTICA** |
| **TC-041** | Webhook pagamento recusado | Subscription existente | 1. POST com payment `status=rejected` | Subscription → PAST_DUE, gracePeriodEnd setado, Payment com REJECTED | paymentId rejeitado | **CRÍTICA** |
| **TC-042** | Webhook duplicado (mesmo tipo + data.id) | TC-040 já executado | 1. Enviar mesmo webhook novamente | 200 retornado, log `"Evento já processado (idempotência)"`, **nenhuma** alteração no banco | mesmo payload | **CRÍTICA** |
| **TC-043** | Webhook fora de ordem (pagamento antes de preapproval) | Subscription existente | 1. Enviar webhook de payment antes do webhook de preapproval | Payment processado normalmente (o código busca subscription por `mpPreapprovalId` ou `external_reference`) | paymentId com metadata | **ALTA** |
| **TC-044** | Webhook com assinatura HMAC inválida | MP_WEBHOOK_SECRET configurado | 1. POST com header `x-signature` adulterado | 200 retornado (para não causar retry no MP), log `"Assinatura HMAC inválida"`, **nenhuma** ação executada | payload adulterado | **CRÍTICA** |
| **TC-045** | Webhook preapproval → authorized | Subscription `status=TRIAL` | 1. POST `{type: "subscription_preapproval", data: {id: "<preapprovalId>"}}` 2. Mock getPreapproval retorna `{status: "authorized"}` | Subscription → ACTIVE, Company → ACTIVE | preapprovalId | **ALTA** |
| **TC-046** | Webhook preapproval → cancelled | Subscription `status=ACTIVE` | 1. POST com preapproval `status=cancelled` | Subscription → CANCELLED, `cancelledAt` preenchido, Company → CANCELLED | preapprovalId | **ALTA** |
| **TC-047** | Webhook preapproval → paused | Subscription `status=ACTIVE` | 1. POST com preapproval `status=paused` | Subscription → PAUSED, Company → PAUSED | preapprovalId | **MÉDIA** |
| **TC-048** | Webhook sem data.id | — | 1. POST `{type: "payment", data: {}}` | 200 retornado, log `"Tipo de evento não tratado"`, nenhuma ação | payload incompleto | **MÉDIA** |

### 2.6 Cancelamento e Reativação

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-050** | Cancelamento durante trial | Subscription `status=TRIAL` | 1. POST `/api/subscriptions/cancel` | Subscription → CANCELLED, `cancelledAt` preenchido, MP preapproval cancelada, Company → CANCELLED | companyId | **ALTA** |
| **TC-051** | Cancelamento após primeira cobrança | Subscription `status=ACTIVE` | 1. POST `/api/subscriptions/cancel` | Subscription → CANCELLED, Company → CANCELLED; mensagem: `"Acesso permanece até o fim do período atual."` | companyId | **ALTA** |
| **TC-052** | Reativação com novo cartão | Subscription `status=CANCELLED` | 1. POST `/api/subscriptions/reactivate` com `{cardTokenId, email}` | Nova Subscription criada com `status=ACTIVE`, `currentPeriodEnd = now + 30 dias`, nova preapproval no MP | cardTokenId válido | **ALTA** |
| **TC-053** | Reativação sem cartão | Subscription `status=CANCELLED` | 1. POST `/api/subscriptions/reactivate` sem `cardTokenId` | Subscription criada com `status=ACTIVE`, sem `mpPreapprovalId` (OK no código atual, mas **risco**: sem MP a cobrança nunca acontecerá) | email | **MÉDIA** |
| **TC-054** | Cancelamento sem assinatura ativa | Nenhuma assinatura ativa | 1. POST `/api/subscriptions/cancel` | Status 404, `"Nenhuma assinatura ativa encontrada."` | companyId | **BAIXA** |

### 2.7 Controle de Acesso (subscriptionGuard)

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-060** | Acesso liberado durante TRIAL válido | Company `subscriptionStatus=TRIAL`, `trialEndsAt > now` | GET `/api/employees` (rota protegida) | Status 200, dados retornados | JWT válido | **CRÍTICA** |
| **TC-061** | Acesso bloqueado após trial expirado | Company `subscriptionStatus=TRIAL`, `trialEndsAt < now` | GET `/api/employees` | Status 402, `code: "TRIAL_EXPIRED"` | JWT válido | **CRÍTICA** |
| **TC-062** | Acesso liberado com ACTIVE | Company `subscriptionStatus=ACTIVE` | GET `/api/employees` | Status 200 | JWT válido | **CRÍTICA** |
| **TC-063** | Acesso liberado em PAST_DUE dentro do grace period | Company `subscriptionStatus=PAST_DUE`, Subscription `gracePeriodEnd > now` | GET `/api/employees` | Status 200 | JWT válido | **ALTA** |
| **TC-064** | Acesso bloqueado em PAST_DUE após grace period | Company `subscriptionStatus=PAST_DUE`, `gracePeriodEnd < now` | GET `/api/employees` | Status 402 | JWT válido | **CRÍTICA** |
| **TC-065** | Acesso bloqueado com CANCELLED | Company `subscriptionStatus=CANCELLED` | GET `/api/employees` | Status 402 | JWT válido | **CRÍTICA** |
| **TC-066** | Acesso bloqueado com PAUSED | Company `subscriptionStatus=PAUSED` | GET `/api/employees` | Status 402 | JWT válido | **ALTA** |
| **TC-067** | SUPER_ADMIN bypassa subscription guard | User `role=SUPER_ADMIN` | GET `/api/employees` | Status 200, independente do status da assinatura | JWT com role SUPER_ADMIN | **ALTA** |
| **TC-068** | Tentativa de acesso após inadimplência | Company `subscriptionStatus=PAST_DUE`, grace period expirado | 1. GET rota protegida 2. Tentar novamente com token diferente | Ambas retornam 402 | — | **CRÍTICA** |

### 2.8 Divergência de Status

| ID | Objetivo | Pré-condições | Passos | Resultado Esperado | Dados Necessários | Criticidade |
|----|----------|---------------|--------|--------------------|--------------------|-------------|
| **TC-070** | Divergência: banco=TRIAL, MP=authorized | Subscription `status=TRIAL`, preapproval no MP está `authorized` | 1. Executar reconciliação 2. Ou: receber webhook de preapproval | Subscription → ACTIVE, Company → ACTIVE (alinhado ao MP) | preapprovalId | **ALTA** |
| **TC-071** | Divergência: banco=ACTIVE, MP=cancelled | Subscription `status=ACTIVE`, preapproval no MP está `cancelled` | 1. Executar reconciliação | Subscription → CANCELLED, Company → CANCELLED | preapprovalId | **ALTA** |

---

## 3. Estratégia de Automação

### 3.1 Estrutura de Testes em Camadas

```
tests/
├── unit/                           # Testes unitários (sem I/O)
│   ├── billingService.test.js      # Lógica de negócio isolada
│   ├── webhookController.test.js   # Roteamento de eventos, HMAC
│   ├── subscriptionGuard.test.js   # Regras de controle de acesso
│   └── helpers.test.js             # addDays, addMonths, BillingError
│
├── integration/                    # Testes de integração (banco real, MP mockado)
│   ├── billing.integration.test.js # createSubscription → banco + mocks do MP
│   ├── webhook.integration.test.js # POST webhook → processamento → banco
│   └── access.integration.test.js  # Guard + banco real
│
├── e2e/                            # Testes end-to-end (sandbox Mercado Pago real)
│   ├── trial-to-charge.e2e.test.js # Fluxo completo trial → cobrança
│   └── cancel-reactivate.e2e.test.js
│
├── sandbox/                        # Helpers para sandbox do MP
│   └── mpSandboxHelper.js          # Gerar tokens de teste, simular webhooks
│
├── fixtures/                       # Dados de teste
│   ├── webhooks.json               # Payloads de webhook do MP
│   └── companies.json              # Empresas de teste
│
└── helpers/
    ├── db.js                       # Setup/teardown do banco de teste
    ├── time.js                     # Fake clock / time travel
    └── auth.js                     # Gerar JWTs de teste
```

### 3.2 O Que Mockar vs. O Que Testar com Sandbox Real

| Camada | mercadopagoService | Prisma (banco) | Express (HTTP) | Data/Tempo |
|--------|--------------------|----------------|----------------|------------|
| **Unitário** | ✅ Mock total (jest.mock) | ✅ Mock total | Não se aplica | ✅ Fake timers |
| **Integração** | ✅ Mock (nock/jest) | ❌ Banco real (SQLite ou PostgreSQL de teste) | ✅ Supertest | ✅ Fake timers |
| **E2E** | ❌ Sandbox real do MP | ❌ Banco real | ✅ Servidor real (supertest) | ⚠️ Limitado (MP controla datas) |

### 3.3 Ferramentas Recomendadas

| Finalidade | Ferramenta | Justificativa |
|-----------|-----------|---------------|
| Test runner | **Jest** | Já padrão em Node.js, suporte a fake timers nativo |
| HTTP testing | **Supertest** | Integração direta com Express, sem precisar subir servidor |
| Mock de APIs externas | **nock** | Intercepta chamadas HTTP para MP em integração |
| Banco de teste | **Prisma com SQLite** ou **PostgreSQL via testcontainers** | Isolamento total, migrations automáticas |
| Fake clock | **Jest fake timers** (`jest.useFakeTimers()`) | Controle de `Date.now()` e `setTimeout` |
| Cobertura | **Jest --coverage** com threshold mínimo de 80% | Garante que novos PRs não reduzem cobertura |
| E2E com sandbox MP | **Scripts customizados** + API do sandbox | Gerar cartões de teste via API do MP |

---

## 4. Testes de Data e Tempo

### 4.1 Abordagem: Fake Clock com Jest

```javascript
// tests/helpers/time.js

/**
 * Avança o relógio do sistema para uma data específica.
 * Uso: simular expiração de trial, grace period, etc.
 */
function travelTo(date) {
  jest.useFakeTimers({ now: new Date(date) });
}

/**
 * Avança N dias a partir de agora.
 */
function advanceDays(days) {
  const current = Date.now();
  const target = current + days * 24 * 60 * 60 * 1000;
  jest.setSystemTime(target);
}

/**
 * Restaura relógio real.
 */
function restoreClock() {
  jest.useRealTimers();
}

module.exports = { travelTo, advanceDays, restoreClock };
```

### 4.2 Cenários de Tempo Obrigatórios

| ID | Cenário | Setup | Assert |
|----|---------|-------|--------|
| **TT-001** | Trial expira exatamente no dia correto | Criar subscription em `2026-03-01T10:00:00Z`, `TRIAL_DAYS=14` | `trialEndsAt === 2026-03-15T10:00:00Z` |
| **TT-002** | Trial na virada de mês (janeiro → fevereiro) | Criar em `2026-01-25`, TRIAL_DAYS=14 | `trialEndsAt === 2026-02-08` |
| **TT-003** | Trial na virada de ano (dezembro → janeiro) | Criar em `2026-12-20`, TRIAL_DAYS=14 | `trialEndsAt === 2027-01-03` |
| **TT-004** | Trial em fevereiro — ano bissexto | Criar em `2028-02-15` (2028 é bissexto), TRIAL_DAYS=14 | `trialEndsAt === 2028-02-29` |
| **TT-005** | Trial em fevereiro — ano não-bissexto | Criar em `2027-02-15`, TRIAL_DAYS=14 | `trialEndsAt === 2027-03-01` |
| **TT-006** | `addMonths` não gera data inválida (31 jan + 1 mês) | `currentPeriodStart = 2026-01-31`, ativar com addMonths(now, 1) | `currentPeriodEnd` deve ser `2026-02-28` (JavaScript `setMonth` faz rollover) |
| **TT-007** | Sem cobrança antecipada — trial >= TRIAL_DAYS | Criar subscription, avançar clock para `trialEndsAt - 1 dia` | `subscriptionGuard` ainda libera (status=TRIAL, trialEndsAt > now) |
| **TT-008** | Sem atraso na cobrança — bloqueio no dia exato | Avançar clock para 1 segundo após `trialEndsAt` | `subscriptionGuard` bloqueia (TRIAL_EXPIRED) se cobrança não foi processada |

### 4.3 Cuidados com Timezone

```javascript
// SEMPRE usar UTC no backend para datas de assinatura
// Testar que a criação não depende de timezone do servidor:

describe('Timezone safety', () => {
  it('trialEndsAt é calculado em UTC independente do TZ do servidor', () => {
    const originalTZ = process.env.TZ;

    // Simular servidor em SP (UTC-3)
    process.env.TZ = 'America/Sao_Paulo';
    const sub1 = createTrialDates(new Date('2026-06-01T00:00:00Z'));

    // Simular servidor em UTC
    process.env.TZ = 'UTC';
    const sub2 = createTrialDates(new Date('2026-06-01T00:00:00Z'));

    expect(sub1.trialEndsAt.toISOString()).toBe(sub2.trialEndsAt.toISOString());

    process.env.TZ = originalTZ;
  });
});
```

### 4.4 Validação: "TRIAL_DAYS Dias" Não Gera Cobrança Antecipada Nem Atrasada

```javascript
describe('Precision of TRIAL_DAYS-day trial', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('trial dura exatamente TRIAL_DAYS * 24h', async () => {
    const now = new Date('2026-03-01T12:00:00Z');
    jest.setSystemTime(now);

    const sub = await billingService.createSubscription({
      companyId: 'test-company',
      plan: 'BASIC',
      cardTokenId: 'tok_test',
      email: 'test@test.com',
    });

    const trialMs = sub.trialEndsAt.getTime() - sub.trialStart.getTime();
    const trialDays = trialMs / (1000 * 60 * 60 * 24);

    expect(trialDays).toBe(TRIAL_DAYS); // Exatamente TRIAL_DAYS, sem fração
  });
});
```

---

## 5. Validação de Webhooks

### 5.1 Checklist de Segurança e Robustez

| # | Verificação | Status no Código | Teste |
|---|-------------|------------------|-------|
| ✅ | **Validação de autenticidade (HMAC)** | Implementado em `verifyWebhookSignature()` — usa `crypto.timingSafeEqual` | TC-044 |
| ✅ | **Idempotência** | Implementado via Set em memória (`processedWebhooks`) | TC-042 |
| ⚠️ | **Idempotência persistente** | Set em memória — **perda em restart do servidor** | Recomendação: migrar para Redis ou tabela `WebhookEvent` no banco |
| ✅ | **Tolerância a duplicidade** | Idempotency key = `${type}:${data.id}` | TC-042 |
| ✅ | **Reprocessamento seguro** | Upsert em Payment (`findFirst` + `update or create`), check de status redundante em preapproval | TC-042, TC-043 |
| ✅ | **Logs auditáveis** | `console.log` com tipo, dataId, requestId, timestamp | Verificar em testes de integração |
| ⚠️ | **Resposta rápida (202/200)** | Responde 200 **antes** de processar — ✅ correto, mas se o processamento falhar, o MP nunca saberá | Verificar que erros são logados |
| ❌ | **Fila de processamento** | Não implementado — processamento síncrono após response | Recomendação: usar fila (BullMQ/SQS) para robustez |
| ❌ | **Persistência de evento bruto** | Não salva payload original do webhook | Recomendação: salvar em tabela `WebhookLog` |

### 5.2 Testes de Webhook Obrigatórios

| # | Teste | Assert |
|---|-------|--------|
| WH-01 | Webhook com HMAC válido é processado | Status 200 + ação executada no banco |
| WH-02 | Webhook com HMAC inválido é ignorado | Status 200 (p/ MP) + log de warning + **sem** ação no banco |
| WH-03 | Webhook sem header `x-signature` | Se `MP_WEBHOOK_SECRET` está setado, **deve** ignorar (verificar se código atual faz isso — o `if` atual permite passagem se `!signature`) |
| WH-04 | Webhook duplicado idêntico | Segundo envio não altera banco |
| WH-05 | Webhook de tipo desconhecido | Status 200, log `"Tipo de evento não tratado"`, sem erro |
| WH-06 | Webhook com data.id referenciando subscription inexistente | Log de warning, sem erro (graceful) |
| WH-07 | Acesso **nunca** liberado/bloqueado apenas pelo front-end | Endpoint protegido retorna dados do servidor; front-end não tem autoridade para setar status |

### 5.3 Vulnerabilidade Identificada: Webhook Sem HMAC

```javascript
// webhookController.js, linhas 30-34:
if (process.env.MP_WEBHOOK_SECRET && signature && requestId) {
  // ... valida
}
```

> **PROBLEMA**: Se `MP_WEBHOOK_SECRET` não está definido, OU se `signature` ou `requestId` estão ausentes, a validação é **silenciosamente pulada**.  
> **RISCO**: Em ambiente onde `MP_WEBHOOK_SECRET` não está configurado, qualquer requisição POST pode disparar ações.  
> **RECOMENDAÇÃO**: Em produção, **exigir** `MP_WEBHOOK_SECRET` e rejeitar webhooks sem assinatura.

```javascript
// Sugestão de fix:
if (!process.env.MP_WEBHOOK_SECRET) {
  console.error('[Webhook] MP_WEBHOOK_SECRET não configurado — rejeitando webhook');
  return; // Já respondeu 200 acima
}
if (!signature || !requestId) {
  console.warn('[Webhook] Headers de assinatura ausentes — rejeitando');
  return;
}
```

---

## 6. Regras de Negócio e Estados da Assinatura

### 6.1 Máquina de Estados

```
                    ┌──────────────────┐
                    │     TRIAL        │
                    │  (trial ativo)   │
                    └────┬─────┬───────┘
                         │     │
          pagamento OK   │     │  cancela / trial expira sem pagamento
                         │     │
                    ┌────▼──┐  └──────────┐
                    │ACTIVE │             │
                    │       │             │
                    └──┬─┬──┘         ┌───▼──────┐
                       │ │            │CANCELLED │
        pagamento      │ │ cancela    │          │
        rejeitado      │ │            └──────────┘
                       │ │                 ▲
                  ┌────▼─┘                 │
                  │PAST_DUE│               │
                  │(grace  │───────────────┘
                  │period) │  grace period expirado
                  └──┬─────┘  sem pagamento
                     │
                     │ pagamento OK
                     │
                  ┌──▼───┐
                  │ACTIVE│ (reativado)
                  └──────┘
```

### 6.2 Tabela de Transição de Estados

| Estado Atual | Evento MP | Evento de Negócio | Novo Estado | Ação do Sistema |
|-------------|-----------|-------------------|-------------|-----------------|
| — | — | Cadastro da empresa (`authController.register()`) | **TRIAL** | Criar Company com `subscriptionStatus=TRIAL`, `trialEndsAt=now+TRIAL_DAYS` |
| — | — | Criação de assinatura (`createSubscription()`) | **TRIAL** | Criar Subscription com trial, criar preapproval no MP |
| TRIAL | `payment.approved` | Primeira cobrança aprovada | **ACTIVE** | `activateSubscription()`: setar `currentPeriodEnd = now + 1 mês`, limpar gracePeriod |
| TRIAL | `payment.rejected` | Primeira cobrança recusada | **PAST_DUE** | `markAsPastDue()`: setar `gracePeriodEnd = now + 3 dias` |
| TRIAL | `subscription_preapproval.authorized` | MP confirma autorização | **ACTIVE** | Atualizar status + Company |
| TRIAL | — | Trial expira sem cobrança | **TRIAL** (bloqueado pelo guard) | `subscriptionGuard` retorna 402 `TRIAL_EXPIRED` |
| TRIAL | — | Usuário cancela | **CANCELLED** | `cancelSubscription()`: cancelar no MP + marcar `cancelledAt` |
| ACTIVE | `payment.approved` | Cobrança recorrente aprovada | **ACTIVE** | Estender `currentPeriodEnd` por mais 1 mês |
| ACTIVE | `payment.rejected` | Cobrança recorrente recusada | **PAST_DUE** | Iniciar grace period de 3 dias |
| ACTIVE | `subscription_preapproval.paused` | MP pausou | **PAUSED** | Bloquear acesso |
| ACTIVE | `subscription_preapproval.cancelled` | MP cancelou | **CANCELLED** | Bloquear acesso |
| ACTIVE | — | Usuário cancela | **CANCELLED** | `cancelSubscription()` |
| PAST_DUE | `payment.approved` | Pagamento de retry aprovado | **ACTIVE** | `activateSubscription()`, limpar grace period |
| PAST_DUE | — | Grace period expira (3 dias) | **PAST_DUE** (bloqueado pelo guard) | Acesso negado (402) |
| PAST_DUE | — | Usuário cancela | **CANCELLED** | `cancelSubscription()` |
| CANCELLED | — | Usuário reativa | **ACTIVE** | `reactivateSubscription()`: nova preapproval, nova Subscription |
| PAUSED | `subscription_preapproval.authorized` | MP reautorizou | **ACTIVE** | Atualizar status |

### 6.3 Estado Sugerido Ausente: `EXPIRED`

O código atual não tem o estado `EXPIRED`. Recomendação:

| Estado | Quando | Diferença de CANCELLED |
|--------|--------|----------------------|
| **EXPIRED** | Trial expirou e nenhuma assinatura foi criada, ou grace period expirou sem pagamento | **Automático** (o sistema define); CANCELLED é voluntário (o usuário pediu) |

> **Implementação sugerida**: cron job ou check no `subscriptionGuard` que muda TRIAL → EXPIRED quando `trialEndsAt < now` e não há pagamento, e PAST_DUE → EXPIRED quando `gracePeriodEnd < now`.

---

## 7. Critérios de Aceite para Produção

### 7.1 Critérios Funcionais

| # | Critério | Como Verificar |
|---|----------|----------------|
| CA-01 | Assinatura criada com sucesso cria preapproval no MP e Subscription no banco | TC-001 passando |
| CA-02 | Trial dura exatamente TRIAL_DAYS dias (nem mais, nem menos) | TC-002, TT-001 a TT-008 |
| CA-03 | Pagamento aprovado ativa assinatura automaticamente | TC-010, TC-040 |
| CA-04 | Pagamento recusado marca PAST_DUE com grace period | TC-011, TC-041 |
| CA-05 | Acesso bloqueado para CANCELLED, PAUSED e TRIAL expirado | TC-061, TC-065, TC-066 |
| CA-06 | Grace period de 3 dias funciona corretamente | TC-063, TC-064 |
| CA-07 | Webhooks duplicados não alteram estado | TC-042 |
| CA-08 | HMAC é validado em todos os webhooks | TC-044 |
| CA-09 | Cancelamento funciona em qualquer estado ativo | TC-050, TC-051 |
| CA-10 | Reativação cria nova subscription e preapproval | TC-052 |

### 7.2 Critérios Não-Funcionais

| # | Critério | Threshold |
|---|----------|-----------|
| NF-01 | Webhook responde em < 200ms (antes do processamento) | Medir com load test |
| NF-02 | Cobertura de testes unitários > 80% nos módulos de billing | `jest --coverage` |
| NF-03 | Zero vulnerabilidades de segurança críticas | TC-044, TC-080 a TC-087 |
| NF-04 | Logs estruturados para todo evento de billing | Auditoria manual |
| NF-05 | `MP_WEBHOOK_SECRET` obrigatório em produção | Checklist de deploy |
| NF-06 | Nenhuma informação de cartão armazenada no servidor | Revisão de código |
| NF-07 | Idempotência persistente (não apenas em memória) | Redis ou tabela no banco |

### 7.3 Checklist Final Pré-Produção

- [ ] Todos os testes TC-001 a TC-071 passando
- [ ] Todos os testes de segurança TC-080 a TC-087 passando
- [ ] `MP_WEBHOOK_SECRET` configurado e validação forçada
- [ ] Idempotência de webhook migrada para persistência (Redis/banco)
- [ ] Webhook URL configurado no painel do Mercado Pago (produção)
- [ ] Cartão de teste removido / credenciais de produção configuradas
- [ ] Variáveis de ambiente `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` setadas
- [ ] Reconciliação diária implementada e agendada (cron)
- [ ] Monitoramento/alertas configurados para falhas de webhook
- [ ] Logs de billing rotacionados e armazenados (não apenas stdout)
- [ ] Teste de carga executado no endpoint de webhook (mínimo 100 req/s)
- [ ] Backup do banco configurado antes do go-live

---

## 8. Testes Negativos e de Segurança

| ID | Objetivo | Passos | Resultado Esperado | Criticidade |
|----|----------|--------|--------------------|----|
| **TC-080** | Replay de webhook (mesmo payload reenviado horas depois) | 1. Enviar webhook válido 2. Limpar cache de idempotência (simular restart) 3. Reenviar mesmo payload | Se idempotência for apenas em memória: **reprocessa** (bug). Se persistente: ignora. **Assert**: Payment não duplicado quando idempotência persistente | **CRÍTICA** |
| **TC-081** | Assinatura criada sem cartão válido | 1. POST create-preapproval com `cardTokenId: ""` | Status 400, `"Token do cartão é obrigatório."` | **ALTA** |
| **TC-082** | Manipulação de datas no front-end | 1. Enviar `trialEndsAt` arbitrário no body da request de criação | Back-end **ignora** — calcula `trialEndsAt` internamente (`addDays(now, TRIAL_DAYS)`). Verificar que não há input do front-end para essa data | **CRÍTICA** |
| **TC-083** | Manter acesso após trial expirado (bypass via front-end) | 1. Trial expirado 2. Front-end tenta chamar API protegida enviando header customizado | `subscriptionGuard` valida no back-end, retorna 402 independente de headers | **CRÍTICA** |
| **TC-084** | Duplicidade de assinatura para mesmo cliente | 1. Criar assinatura (status=TRIAL) 2. Tentar criar segunda assinatura | Status 400, `"Empresa já possui assinatura ativa."` | **ALTA** |
| **TC-085** | Reenvio manual de eventos (admin dispara webhook manualmente) | 1. POST webhook com payload fabricado e HMAC válido (usando secret) | Processado normalmente — é um cenário legítimo para suporte. Verificar que é **idempotente** | **MÉDIA** |
| **TC-086** | Inconsistência cobrança vs permissão | 1. Payment `status=APPROVED` mas Subscription `status=PAST_DUE` 2. Chamar reconciliação | Reconciliação deve corrigir: Subscription → ACTIVE | **CRÍTICA** |
| **TC-087** | Webhook com `data.id` de outra conta MP | 1. Enviar webhook com paymentId pertencente a outro merchant | `mpService.getPayment()` retorna dados de outra conta? A API do MP filtra por access_token. Verificar que subscription **não** é encontrada (`findFirst` por `mpPreapprovalId`) | **ALTA** |

---

## 9. Pseudocódigo e Exemplos

### 9.1 Teste Unitário — `billingService.createSubscription()`

```javascript
// tests/unit/billingService.test.js

const { createSubscription, BillingError, TRIAL_DAYS } = require('../../src/services/billingService');

// Mockar dependências
jest.mock('../../src/config/database', () => {
  const subscriptionCreate = jest.fn();
  const companyUpdate = jest.fn();
  const subscriptionFindFirst = jest.fn();
  return {
    subscription: { findFirst: subscriptionFindFirst, create: subscriptionCreate },
    company: { update: companyUpdate },
    $transaction: jest.fn((fn) =>
      fn({
        subscription: { create: subscriptionCreate, findFirst: subscriptionFindFirst },
        company: { update: companyUpdate },
      })
    ),
  };
});

jest.mock('../../src/services/mercadopagoService', () => ({
  createPreapproval: jest.fn().mockResolvedValue({
    id: 'mp_preapproval_123',
    payer_id: 'mp_payer_456',
    status: 'authorized',
  }),
}));

const prisma = require('../../src/config/database');
const mpService = require('../../src/services/mercadopagoService');

describe('billingService.createSubscription', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-03-01T12:00:00Z') });
    jest.clearAllMocks();
    prisma.subscription.findFirst.mockResolvedValue(null); // sem assinatura existente
  });

  afterEach(() => jest.useRealTimers());

  it('deve criar subscription com status TRIAL e trial de TRIAL_DAYS dias', async () => {
    prisma.subscription.create.mockResolvedValue({
      id: 'sub_001',
      plan: 'BASIC',
      status: 'TRIAL',
      trialStart: new Date('2026-03-01T12:00:00Z'),
      trialEndsAt: new Date(`2026-03-${1 + TRIAL_DAYS}T12:00:00Z`),
      mpPreapprovalId: 'mp_preapproval_123',
    });

    const result = await createSubscription({
      companyId: 'company_001',
      plan: 'BASIC',
      cardTokenId: 'tok_valid',
      email: 'test@empresa.com',
    });

    // Assert: MP foi chamado com free_trial
    expect(mpService.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 49,
        withTrial: true,
        payerEmail: 'test@empresa.com',
      })
    );

    // Assert: Subscription criada com dados corretos
    expect(prisma.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_001',
        plan: 'BASIC',
        status: 'TRIAL',
        mpPreapprovalId: 'mp_preapproval_123',
      }),
    });

    // Assert: Retorno contém dados esperados
    expect(result).toMatchObject({
      plan: 'BASIC',
      status: 'TRIAL',
      mpPreapprovalId: 'mp_preapproval_123',
    });
  });

  it('deve rejeitar plano inválido', async () => {
    await expect(
      createSubscription({
        companyId: 'c1',
        plan: 'GOLD',
        cardTokenId: 'tok',
        email: 'a@b.com',
      })
    ).rejects.toThrow(BillingError);
    await expect(
      createSubscription({
        companyId: 'c1',
        plan: 'GOLD',
        cardTokenId: 'tok',
        email: 'a@b.com',
      })
    ).rejects.toThrow('Plano inválido');
  });

  it('deve rejeitar se empresa já tem assinatura ativa', async () => {
    prisma.subscription.findFirst.mockResolvedValue({ id: 'existing', status: 'ACTIVE' });

    await expect(
      createSubscription({
        companyId: 'c1',
        plan: 'BASIC',
        cardTokenId: 'tok',
        email: 'a@b.com',
      })
    ).rejects.toThrow('Empresa já possui assinatura ativa');
  });

  it('não deve persistir no banco se MP falhar', async () => {
    mpService.createPreapproval.mockRejectedValue(new Error('MP timeout'));

    await expect(
      createSubscription({
        companyId: 'c1',
        plan: 'BASIC',
        cardTokenId: 'tok',
        email: 'a@b.com',
      })
    ).rejects.toThrow('MP timeout');

    // Subscription.create nunca chamado
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });
});
```

### 9.2 Teste de Integração — Webhook de Pagamento

```javascript
// tests/integration/webhook.integration.test.js

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const prisma = require('../../src/config/database');

// Mock apenas do mercadopagoService (banco é real)
jest.mock('../../src/services/mercadopagoService');
const mpService = require('../../src/services/mercadopagoService');

const MP_SECRET = 'test_webhook_secret_123';

function signWebhook(dataId, requestId) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', MP_SECRET).update(manifest).digest('hex');
  return { signature: `ts=${ts},v1=${hash}`, requestId };
}

describe('POST /api/webhooks/mercadopago — pagamento', () => {
  let company, subscription;

  beforeAll(async () => {
    process.env.MP_WEBHOOK_SECRET = MP_SECRET;

    // Seed: empresa com assinatura em trial
    company = await prisma.company.create({
      data: {
        name: 'Empresa Teste',
        cnpj: '12345678000100',
        email: 'test@test.com',
        passwordHash: 'hashed',
        subscriptionStatus: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        plan: 'BASIC',
        status: 'TRIAL',
        trialStart: new Date(),
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        mpPreapprovalId: 'preapproval_test_001',
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { companyId: company.id } });
    await prisma.subscription.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  it('pagamento aprovado deve ativar assinatura', async () => {
    const paymentId = 'pay_approved_001';

    // Mock: MP retorna pagamento aprovado
    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: 'preapproval_test_001' },
      external_reference: company.id,
    });

    const { signature, requestId } = signWebhook(paymentId, 'req_001');

    await request(app)
      .post('/api/webhooks/mercadopago')
      .set('x-signature', signature)
      .set('x-request-id', requestId)
      .send({ type: 'payment', data: { id: paymentId } })
      .expect(200);

    // Aguardar processamento assíncrono (response é enviado antes)
    await new Promise((r) => setTimeout(r, 500));

    // Assert: Subscription ativada
    const updatedSub = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(updatedSub.status).toBe('ACTIVE');
    expect(updatedSub.gracePeriodEnd).toBeNull();
    expect(updatedSub.currentPeriodEnd).toBeDefined();

    // Assert: Payment criado
    const payment = await prisma.payment.findFirst({
      where: { mpPaymentId: paymentId },
    });
    expect(payment).toBeDefined();
    expect(payment.status).toBe('APPROVED');
    expect(payment.amount.toNumber()).toBe(49.0);

    // Assert: Company atualizada
    const updatedCompany = await prisma.company.findUnique({
      where: { id: company.id },
    });
    expect(updatedCompany.subscriptionStatus).toBe('ACTIVE');
  });

  it('webhook duplicado não deve duplicar pagamento', async () => {
    const paymentId = 'pay_approved_001'; // Mesmo do teste anterior

    mpService.getPayment.mockResolvedValue({
      id: paymentId,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: 'preapproval_test_001' },
    });

    const { signature, requestId } = signWebhook(paymentId, 'req_002');

    await request(app)
      .post('/api/webhooks/mercadopago')
      .set('x-signature', signature)
      .set('x-request-id', requestId)
      .send({ type: 'payment', data: { id: paymentId } })
      .expect(200);

    await new Promise((r) => setTimeout(r, 500));

    // Assert: Apenas 1 registro de pagamento
    const payments = await prisma.payment.findMany({
      where: { mpPaymentId: paymentId },
    });
    expect(payments).toHaveLength(1);
  });

  it('webhook com HMAC inválido não deve processar', async () => {
    const paymentId = 'pay_attack_001';

    await request(app)
      .post('/api/webhooks/mercadopago')
      .set('x-signature', 'ts=1234,v1=invalidhash')
      .set('x-request-id', 'req_attack')
      .send({ type: 'payment', data: { id: paymentId } })
      .expect(200); // Retorna 200 para MP, mas não processa

    await new Promise((r) => setTimeout(r, 500));

    // Assert: Nenhum pagamento criado
    const payment = await prisma.payment.findFirst({
      where: { mpPaymentId: paymentId },
    });
    expect(payment).toBeNull();
  });
});
```

### 9.3 Teste E2E — Fluxo Trial até Cobrança (Sandbox)

```javascript
// tests/e2e/trial-to-charge.e2e.test.js

/**
 * Teste E2E com sandbox REAL do Mercado Pago.
 * Requer:
 *   - MP_ACCESS_TOKEN de sandbox configurado
 *   - Banco de teste populado
 *   - Servidor rodando (ou supertest com app)
 *
 * ATENÇÃO: este teste é lento (~10s) e depende de rede.
 * Executar apenas no CI ou manualmente, não no watch mode.
 */

const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/database');
const mpSandbox = require('../sandbox/mpSandboxHelper');

describe('E2E: Trial completo até primeira cobrança', () => {
  let authToken;
  let companyId;

  beforeAll(async () => {
    // 1. Registrar empresa
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: `E2E Test ${Date.now()}`,
        cnpj: `${Date.now()}`.slice(0, 14),
        email: `e2e-${Date.now()}@test.com`,
        password: 'SenhaForte@123',
      })
      .expect(201);

    authToken = registerRes.body.token;
    companyId = registerRes.body.company?.id || registerRes.body.companyId;
  });

  afterAll(async () => {
    if (companyId) {
      await prisma.payment.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('Passo 1: Empresa registrada em estado TRIAL', async () => {
    const statusRes = await request(app)
      .get('/api/subscriptions/status')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(statusRes.body.status).toBe('TRIAL');
    expect(statusRes.body.trialDaysLeft).toBeGreaterThan(0);
  });

  it('Passo 2: Criar assinatura com cartão de teste do sandbox', async () => {
    // Gerar token de cartão de teste (sandbox MP)
    const cardToken = await mpSandbox.createTestCardToken({
      cardNumber: '5031433215406351', // Mastercard de teste (approve)
      expirationMonth: 11,
      expirationYear: 2030,
      securityCode: '123',
      cardholderName: 'APRO', // Nome especial: aprovação automática
      identificationType: 'CPF',
      identificationNumber: '12345678909',
    });

    const createRes = await request(app)
      .post('/api/subscriptions/create-preapproval')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        plan: 'BASIC',
        cardTokenId: cardToken.id,
        email: `e2e-${Date.now()}@test.com`,
      })
      .expect(200);

    expect(createRes.body.status).toBe('TRIAL');
    expect(createRes.body.mpPreapprovalId).toBeDefined();
    expect(createRes.body.plan).toBe('BASIC');
  });

  it('Passo 3: Acesso liberado durante trial', async () => {
    // Chamar endpoint protegido pelo subscriptionGuard
    await request(app)
      .get('/api/employees') // Rota protegida
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('Passo 4: Simular pagamento aprovado (webhook)', async () => {
    // Em sandbox real, o MP levará dias para cobrar.
    // Para E2E rápido, simulamos o webhook que o MP enviaria:
    const sub = await prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Simular webhook internamente (bypass HMAC para E2E)
    const { handlePaymentWebhook } = require('../../src/services/billingService');

    // Mock do mpService.getPayment para retornar pagamento aprovado
    const mpService = require('../../src/services/mercadopagoService');
    const originalGetPayment = mpService.getPayment;
    mpService.getPayment = jest.fn().mockResolvedValue({
      id: 'e2e_pay_001',
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 49.0,
      date_approved: new Date().toISOString(),
      metadata: { preapproval_id: sub.mpPreapprovalId },
      external_reference: companyId,
    });

    await handlePaymentWebhook('e2e_pay_001');

    mpService.getPayment = originalGetPayment; // Restaurar

    // Verificar ativação
    const updatedSub = await prisma.subscription.findFirst({
      where: { id: sub.id },
    });
    expect(updatedSub.status).toBe('ACTIVE');

    const updatedCompany = await prisma.company.findUnique({
      where: { id: companyId },
    });
    expect(updatedCompany.subscriptionStatus).toBe('ACTIVE');
  });

  it('Passo 5: Acesso continua liberado após ativação', async () => {
    await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });
});
```

### 9.4 Função de Reconciliação Diária

```javascript
// src/services/reconciliationService.js

/**
 * Reconciliação diária entre banco local e Mercado Pago.
 *
 * Objetivo: detectar e corrigir divergências de status.
 * Executar via cron job (ex: todo dia às 03:00 UTC).
 *
 * Fluxo:
 * 1. Buscar todas as assinaturas ativas/trial/past_due no banco local
 * 2. Para cada uma, consultar status no MP
 * 3. Comparar e resolver divergências
 * 4. Gerar relatório
 */
const prisma = require('../config/database');
const mpService = require('./mercadopagoService');
const { STATUS, addDays, GRACE_PERIOD_DAYS } = require('./billingService');

const MP_STATUS_MAP = {
  authorized: STATUS.ACTIVE,
  paused: STATUS.PAUSED,
  cancelled: STATUS.CANCELLED,
  pending: STATUS.TRIAL,
};

async function runDailyReconciliation() {
  const startTime = Date.now();
  const report = {
    totalChecked: 0,
    divergences: [],
    errors: [],
    trialExpired: [],
    gracePeriodExpired: [],
    corrections: [],
  };

  console.log('[Reconciliation] Iniciando reconciliação diária...');

  // 1. Buscar assinaturas ativas no banco
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: [STATUS.TRIAL, STATUS.ACTIVE, STATUS.PAST_DUE, STATUS.PAUSED] },
      mpPreapprovalId: { not: null },
    },
    include: { company: true },
  });

  report.totalChecked = subscriptions.length;

  for (const sub of subscriptions) {
    try {
      // 2. Consultar status no MP
      const mpPreapproval = await mpService.getPreapproval(sub.mpPreapprovalId);

      if (!mpPreapproval) {
        report.errors.push({
          subscriptionId: sub.id,
          companyId: sub.companyId,
          error: 'Preapproval não encontrada no MP',
        });
        continue;
      }

      const mpStatus = MP_STATUS_MAP[mpPreapproval.status] || null;
      const localStatus = sub.status;

      // 3. Detectar divergência
      if (mpStatus && mpStatus !== localStatus) {
        report.divergences.push({
          subscriptionId: sub.id,
          companyId: sub.companyId,
          companyName: sub.company?.name,
          localStatus,
          mpStatus: mpPreapproval.status,
          expectedLocalStatus: mpStatus,
        });

        // 4. Corrigir automaticamente (MP é fonte de verdade para status de preapproval)
        await prisma.$transaction(async (tx) => {
          const updateData = { status: mpStatus };

          if (mpStatus === STATUS.CANCELLED) {
            updateData.cancelledAt = new Date();
          }

          await tx.subscription.update({
            where: { id: sub.id },
            data: updateData,
          });

          await tx.company.update({
            where: { id: sub.companyId },
            data: { subscriptionStatus: mpStatus },
          });
        });

        report.corrections.push({
          subscriptionId: sub.id,
          from: localStatus,
          to: mpStatus,
        });
      }
    } catch (error) {
      report.errors.push({
        subscriptionId: sub.id,
        companyId: sub.companyId,
        error: error.message,
      });
    }
  }

  // 5. Verificar trials expirados (sem cobertura de webhook)
  const now = new Date();
  const expiredTrials = await prisma.subscription.findMany({
    where: {
      status: STATUS.TRIAL,
      trialEndsAt: { lt: now },
    },
  });

  for (const sub of expiredTrials) {
    report.trialExpired.push({
      subscriptionId: sub.id,
      companyId: sub.companyId,
      trialEndsAt: sub.trialEndsAt,
    });
    // Nota: não alterar status automaticamente aqui — o subscriptionGuard já bloqueia.
    // Log para monitoramento.
  }

  // 6. Verificar grace periods expirados
  const expiredGrace = await prisma.subscription.findMany({
    where: {
      status: STATUS.PAST_DUE,
      gracePeriodEnd: { lt: now },
    },
  });

  for (const sub of expiredGrace) {
    report.gracePeriodExpired.push({
      subscriptionId: sub.id,
      companyId: sub.companyId,
      gracePeriodEnd: sub.gracePeriodEnd,
    });
  }

  const elapsed = Date.now() - startTime;
  console.log('[Reconciliation] Concluída:', {
    totalChecked: report.totalChecked,
    divergences: report.divergences.length,
    corrections: report.corrections.length,
    errors: report.errors.length,
    trialExpired: report.trialExpired.length,
    gracePeriodExpired: report.gracePeriodExpired.length,
    elapsedMs: elapsed,
  });

  return report;
}

// Teste unitário para a reconciliação
async function testReconciliation() {
  // Cenário: banco diz TRIAL, MP diz authorized → deve corrigir para ACTIVE
  // Cenário: banco diz ACTIVE, MP diz cancelled → deve corrigir para CANCELLED
  // Cenário: banco diz TRIAL, trialEndsAt < now → deve reportar trial expirado
  // Cenário: banco diz PAST_DUE, gracePeriodEnd < now → deve reportar grace expirado
}

module.exports = { runDailyReconciliation };
```

### 9.5 Teste da Reconciliação

```javascript
// tests/unit/reconciliation.test.js

const { runDailyReconciliation } = require('../../src/services/reconciliationService');

jest.mock('../../src/config/database');
jest.mock('../../src/services/mercadopagoService');

const prisma = require('../../src/config/database');
const mpService = require('../../src/services/mercadopagoService');

describe('Reconciliação diária', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
  });

  it('deve detectar e corrigir divergência TRIAL → ACTIVE', async () => {
    prisma.subscription.findMany
      .mockResolvedValueOnce([
        {
          id: 'sub_1',
          companyId: 'comp_1',
          status: 'TRIAL',
          mpPreapprovalId: 'mp_pre_1',
          company: { name: 'Empresa X' },
        },
      ])
      .mockResolvedValueOnce([]) // trials expirados
      .mockResolvedValueOnce([]); // grace expirados

    mpService.getPreapproval.mockResolvedValue({
      id: 'mp_pre_1',
      status: 'authorized', // MP diz que está autorizado
    });

    prisma.subscription.update.mockResolvedValue({});
    prisma.company.update.mockResolvedValue({});

    const report = await runDailyReconciliation();

    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toMatchObject({
      localStatus: 'TRIAL',
      expectedLocalStatus: 'ACTIVE',
    });
    expect(report.corrections).toHaveLength(1);
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('deve reportar trials expirados', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    prisma.subscription.findMany
      .mockResolvedValueOnce([]) // assinaturas ativas
      .mockResolvedValueOnce([
        {
          id: 'sub_2',
          companyId: 'comp_2',
          status: 'TRIAL',
          trialEndsAt: pastDate,
        },
      ])
      .mockResolvedValueOnce([]); // grace expirados

    const report = await runDailyReconciliation();

    expect(report.trialExpired).toHaveLength(1);
    expect(report.trialExpired[0].subscriptionId).toBe('sub_2');
  });
});
```

---

## 10. Saída Final

### 10.1 Tabela Completa de Testes

| ID | Categoria | Objetivo | Criticidade | Camada |
|----|-----------|----------|-------------|--------|
| TC-001 | Criação | Assinatura criada com sucesso | CRÍTICA | Unit + Integration |
| TC-002 | Trial | Trial de TRIAL_DAYS dias aplicado | CRÍTICA | Unit |
| TC-003 | Trial | Data da 1ª cobrança correta | CRÍTICA | Integration + E2E |
| TC-004 | Validação | Plano inválido rejeitado | ALTA | Unit |
| TC-005 | Validação | Sem token rejeitado | ALTA | Unit |
| TC-006 | Validação | Sem email rejeitado | ALTA | Unit |
| TC-007 | Duplicidade | Assinatura duplicada bloqueada | CRÍTICA | Unit + Integration |
| TC-010 | Cobrança | Cobrança aprovada ativa subscription | CRÍTICA | Integration |
| TC-011 | Cobrança | Cobrança recusada → PAST_DUE | CRÍTICA | Integration |
| TC-020 | Cartão | Cartão inválido rejeitado | ALTA | E2E (sandbox) |
| TC-021 | Cartão | Cartão expirado rejeitado | ALTA | E2E (sandbox) |
| TC-022 | Token | Token inválido rejeitado | ALTA | E2E (sandbox) |
| TC-030 | Resiliência | Falha temporária no MP (criação) | ALTA | Unit |
| TC-031 | Resiliência | Falha temporária no MP (cancelamento) | MÉDIA | Unit |
| TC-040 | Webhook | Pagamento aprovado processa ok | CRÍTICA | Integration |
| TC-041 | Webhook | Pagamento recusado → PAST_DUE | CRÍTICA | Integration |
| TC-042 | Webhook | Webhook duplicado ignorado | CRÍTICA | Integration |
| TC-043 | Webhook | Webhook fora de ordem funciona | ALTA | Integration |
| TC-044 | Webhook | HMAC inválido ignorado | CRÍTICA | Integration |
| TC-045 | Webhook | Preapproval authorized → ACTIVE | ALTA | Integration |
| TC-046 | Webhook | Preapproval cancelled | ALTA | Integration |
| TC-047 | Webhook | Preapproval paused | MÉDIA | Integration |
| TC-048 | Webhook | Webhook sem data.id | MÉDIA | Unit |
| TC-050 | Cancelamento | Cancelar durante trial | ALTA | Integration |
| TC-051 | Cancelamento | Cancelar após cobrança | ALTA | Integration |
| TC-052 | Reativação | Reativar com novo cartão | ALTA | Integration + E2E |
| TC-053 | Reativação | Reativar sem cartão (risco) | MÉDIA | Unit |
| TC-054 | Cancelamento | Cancelar sem assinatura ativa | BAIXA | Unit |
| TC-060 | Acesso | Trial válido libera acesso | CRÍTICA | Integration |
| TC-061 | Acesso | Trial expirado bloqueia | CRÍTICA | Integration |
| TC-062 | Acesso | ACTIVE libera acesso | CRÍTICA | Integration |
| TC-063 | Acesso | PAST_DUE com grace libera | ALTA | Integration |
| TC-064 | Acesso | PAST_DUE sem grace bloqueia | CRÍTICA | Integration |
| TC-065 | Acesso | CANCELLED bloqueia | CRÍTICA | Integration |
| TC-066 | Acesso | PAUSED bloqueia | ALTA | Integration |
| TC-067 | Acesso | SUPER_ADMIN bypassa | ALTA | Integration |
| TC-068 | Acesso | Inadimplência bloqueia | CRÍTICA | Integration |
| TC-070 | Reconciliação | Divergência TRIAL→ACTIVE | ALTA | Unit |
| TC-071 | Reconciliação | Divergência ACTIVE→CANCELLED | ALTA | Unit |
| TC-080 | Segurança | Replay de webhook | CRÍTICA | Integration |
| TC-081 | Segurança | Sem cartão válido | ALTA | Unit |
| TC-082 | Segurança | Manipulação de datas | CRÍTICA | Integration |
| TC-083 | Segurança | Bypass via front-end | CRÍTICA | Integration |
| TC-084 | Segurança | Duplicidade de assinatura | ALTA | Integration |
| TC-085 | Segurança | Reenvio manual de webhook | MÉDIA | Integration |
| TC-086 | Segurança | Inconsistência cobrança/permissão | CRÍTICA | Integration |
| TC-087 | Segurança | Webhook de outra conta | ALTA | Integration |
| TT-001~008 | Tempo | Cálculos de data/trial | CRÍTICA | Unit |

**Total: 47 cenários** | Críticos: 22 | Altos: 18 | Médios: 5 | Baixos: 2

### 10.2 Checklist de Produção

```
INFRAESTRUTURA
[ ] MP_ACCESS_TOKEN de produção configurado
[ ] MP_WEBHOOK_SECRET de produção configurado
[ ] Webhook URL registrado no painel do Mercado Pago: POST https://<domínio>/api/webhooks/mercadopago
[ ] Certificado SSL válido no domínio (HTTPS obrigatório para webhooks)
[ ] Banco de dados com backup automático configurado
[ ] Logs centralizados (não apenas console.log)

SEGURANÇA
[ ] MP_WEBHOOK_SECRET é obrigatório (não permite bypass se ausente)
[ ] Idempotência de webhook persistente (Redis ou tabela WebhookEvent)
[ ] Rate limiting no endpoint de webhook
[ ] Nenhum dado sensível de cartão armazenado (apenas tokens)
[ ] CORS configurado para aceitar apenas domínios autorizados

FUNCIONAL
[ ] Teste com cartão de teste aprovado no sandbox ✓
[ ] Teste com cartão de teste recusado no sandbox ✓
[ ] Trial expira e bloqueia acesso corretamente ✓
[ ] Pagamento aprovado ativa assinatura ✓
[ ] Pagamento recusado inicia grace period ✓
[ ] Cancelamento funciona via API e via webhook ✓
[ ] Reativação cria nova preapproval ✓
[ ] Reconciliação diária agendada (cron) ✓

MONITORAMENTO
[ ] Alerta para falhas de webhook (5+ erros em 1h)
[ ] Alerta para divergências na reconciliação
[ ] Alerta para trials expirados sem conversão
[ ] Dashboard de métricas de assinatura (TRIAL, ACTIVE, PAST_DUE, CANCELLED)
[ ] Health check do endpoint de webhook
```

### 10.3 Riscos Principais

| # | Risco | Impacto | Probabilidade | Mitigação |
|---|-------|---------|---------------|-----------|
| R1 | **Idempotência em memória** — Set é perdido no restart do servidor, permitindo reprocessamento de webhooks | ALTO | ALTA | Migrar para Redis ou tabela `WebhookEvent` no banco |
| R2 | **HMAC bypassável** — Se `MP_WEBHOOK_SECRET` não estiver definido, qualquer request é aceita | CRÍTICO | MÉDIA | Forçar presença da variável em produção; rejeitar webhooks sem assinatura |
| R3 | **Divergência de TRIAL_DAYS** — Código usa 14 dias, requisito menciona 30 | ALTO | ALTA | Alinhar constante `TRIAL_DAYS` com requisito de negócio |
| R4 | **Reativação sem cartão** — `reactivateSubscription` permite `cardTokenId` vazio, criando subscription SEM preapproval no MP | ALTO | MÉDIA | Validar que `cardTokenId` é obrigatório em `reactivateSubscription` |
| R5 | **Processamento pós-response** — Webhook responde 200 antes de processar; se o processamento falhar, o MP não reenvia | MÉDIO | MÉDIA | Implementar fila de processamento (BullMQ) e/ou tabela de webhooks pendentes |
| R6 | **`addMonths` com edge case** — `new Date().setMonth(m+1)` pode gerar datas inválidas (ex: 31 Jan + 1 mês = 3 Mar) | MÉDIO | BAIXA | Usar library confiável (date-fns `addMonths`) ou adicionar teste TT-006 |
| R7 | **Sem estado EXPIRED** — Não há distinção entre cancelamento voluntário e expiração automática | BAIXO | — | Implementar estado EXPIRED e cron de limpeza |
| R8 | **Tabela Payment sem índice em mpPaymentId** — `findFirst` por `mpPaymentId` pode ser lento em escala | BAIXO | BAIXA | Já tem `@unique` no schema — coberto |

### 10.4 Ordem Recomendada de Execução

```
FASE 1 — Testes Unitários (Execução imediata, sem dependências externas)
─────────────────────────────────────────────────────────────────────────
Prioridade 1 (Críticos):
  1. TC-001  Criação de assinatura
  2. TC-002  Trial TRIAL_DAYS dias
  3. TC-007  Duplicidade bloqueada
  4. TT-001~008  Testes de datas e tempo
  5. TC-004~006  Validações de entrada

Prioridade 2 (Altos):
  6. TC-030  Falha temporária MP (criação)
  7. TC-031  Falha temporária MP (cancelamento)
  8. TC-048  Webhook sem data.id
  9. TC-053  Reativação sem cartão
  10. TC-054  Cancelamento sem assinatura

FASE 2 — Testes de Integração (Requer banco de teste)
─────────────────────────────────────────────────────────
Prioridade 1 (Críticos):
  11. TC-040  Webhook pagamento aprovado
  12. TC-041  Webhook pagamento recusado
  13. TC-042  Webhook duplicado
  14. TC-044  HMAC inválido
  15. TC-060~068  Controle de acesso (todos)
  16. TC-080  Replay de webhook
  17. TC-082  Manipulação de datas
  18. TC-083  Bypass front-end
  19. TC-086  Inconsistência cobrança/permissão

Prioridade 2 (Altos):
  20. TC-010~011  Cobrança no fim do trial
  21. TC-043  Webhook fora de ordem
  22. TC-045~047  Preapproval webhooks
  23. TC-050~052  Cancelamento e reativação
  24. TC-070~071  Reconciliação
  25. TC-084~085, TC-087  Segurança restante

FASE 3 — Testes E2E com Sandbox do Mercado Pago (Requer sandbox configurado)
──────────────────────────────────────────────────────────────────────────────
  26. TC-003  Data da primeira cobrança no MP
  27. TC-020~022  Cartão inválido, expirado, token inválido
  28. Fluxo completo: registro → trial → cobrança → ativação

FASE 4 — Correções e Hardening (Pré-produção)
──────────────────────────────────────────────
  29. Corrigir TRIAL_DAYS (14 → 30 se necessário)
  30. Tornar MP_WEBHOOK_SECRET obrigatório
  31. Migrar idempotência para Redis/banco
  32. Implementar reconciliação diária (cron)
  33. Teste de carga no endpoint de webhook
  34. Revisão final do checklist de produção
```

---

## Apêndice A — Helper para Sandbox do Mercado Pago

```javascript
// tests/sandbox/mpSandboxHelper.js

const axios = require('axios');

const MP_SANDBOX_TOKEN = process.env.MP_ACCESS_TOKEN; // Token de teste
const MP_API = 'https://api.mercadopago.com';

/**
 * Gera um card_token de teste no sandbox do MP.
 * Ref: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/cards
 */
async function createTestCardToken({
  cardNumber = '5031433215406351',
  expirationMonth = 11,
  expirationYear = 2030,
  securityCode = '123',
  cardholderName = 'APRO',
  identificationType = 'CPF',
  identificationNumber = '12345678909',
}) {
  const response = await axios.post(
    `${MP_API}/v1/card_tokens`,
    {
      card_number: cardNumber,
      expiration_month: expirationMonth,
      expiration_year: expirationYear,
      security_code: securityCode,
      cardholder: {
        name: cardholderName,
        identification: {
          type: identificationType,
          number: identificationNumber,
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${MP_SANDBOX_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data; // { id: "card_token_xxx", ... }
}

/**
 * Cartões de teste do Mercado Pago:
 *
 * | Resultado     | Número              | cardholderName |
 * |---------------|---------------------|----------------|
 * | Aprovado      | 5031 4332 1540 6351 | APRO           |
 * | Recusado      | 5031 4332 1540 6351 | OTHE           |
 * | Pendente      | 5031 4332 1540 6351 | CONT           |
 * | Fundos insuf. | 5031 4332 1540 6351 | FUND           |
 */

module.exports = { createTestCardToken };
```

## Apêndice B — Configuração do Jest

```javascript
// jest.config.js (sugestão)

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/integration/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Separar E2E para execução manual:
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      globalSetup: '<rootDir>/tests/helpers/db-setup.js',
      globalTeardown: '<rootDir>/tests/helpers/db-teardown.js',
    },
  ],
};
```
