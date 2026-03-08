# Billing — Sistema de Assinatura Recorrente via Mercado Pago

## Visão Geral

Sistema completo de cobrança recorrente por assinatura usando **Mercado Pago Preapproval** (assinaturas recorrentes), com:

- Trial gratuito de **14 dias** (cartão obrigatório no início)
- Cobrança automática mensal via cartão de crédito
- Webhooks para atualização automática de status
- Grace period de 3 dias em caso de falha de pagamento

---

## Arquitetura de Camadas

```
┌─────────────────────────────────────────────┐
│  API Layer (Controllers + Routes)           │
│  subscriptionController.js                  │
│  webhookController.js                       │
│  billingRoutes.js / subscriptionRoutes.js   │
├─────────────────────────────────────────────┤
│  Service Layer (Regras de Negócio)          │
│  billingService.js                          │
├─────────────────────────────────────────────┤
│  Integration Layer (Mercado Pago SDK)       │
│  mercadopagoService.js                      │
├─────────────────────────────────────────────┤
│  Persistence Layer (Prisma ORM)             │
│  schema.prisma (Subscription, Payment)      │
└─────────────────────────────────────────────┘
```

---

## Estados da Assinatura

| Status     | Acesso    | Descrição                                      |
|------------|-----------|-------------------------------------------------|
| `TRIAL`    | ✅ Total  | 14 dias grátis, cartão já cadastrado            |
| `ACTIVE`   | ✅ Total  | Pagamento em dia                                |
| `PAST_DUE` | ⚠️ 3 dias | Pagamento falhou, carência de 3 dias            |
| `PAUSED`   | ❌ Bloqueado | Assinatura pausada no MP                     |
| `CANCELLED`| ❌ Bloqueado | Assinatura cancelada                         |

---

## Endpoints

### Billing (novos, conforme spec)

| Método | Endpoint                           | Descrição                    |
|--------|------------------------------------|------------------------------|
| POST   | `/api/billing/create-subscription` | Cria assinatura com trial    |
| POST   | `/api/billing/cancel-subscription` | Cancela assinatura           |
| GET    | `/api/billing/subscription-status` | Status da assinatura         |

### Subscriptions (existentes, mantidos para compatibilidade)

| Método | Endpoint                                | Descrição                    |
|--------|-----------------------------------------|------------------------------|
| POST   | `/api/subscriptions/create-preapproval` | Cria assinatura com trial    |
| GET    | `/api/subscriptions/status`             | Status da assinatura         |
| PUT    | `/api/subscriptions/change-plan`        | Trocar plano                 |
| POST   | `/api/subscriptions/cancel`             | Cancelar                     |
| GET    | `/api/subscriptions/payments`           | Listar pagamentos            |
| POST   | `/api/subscriptions/reactivate`         | Reativar assinatura          |

### Webhooks

| Método | Endpoint                    | Descrição              |
|--------|-----------------------------|------------------------|
| POST   | `/api/webhooks/mercadopago` | Webhook do Mercado Pago|

---

## Fluxo Completo

```
1. Empresa cria conta
   └─ Company.subscriptionStatus = "TRIAL" (30 dias default do registro)

2. Admin escolhe plano e informa cartão
   └─ POST /api/billing/create-subscription
      ├─ body: { plan: "BASIC", cardTokenId: "tok_xxx", email: "admin@empresa.com" }
      ├─ Cria Preapproval no MP com free_trial de 14 dias
      ├─ Salva Subscription no banco (status: TRIAL)
      └─ Atualiza Company (subscriptionStatus: TRIAL, trialEndsAt: +14 dias)

3. Trial de 14 dias
   └─ Acesso total ao sistema via subscriptionGuard

4. Após 14 dias: MP cobra automaticamente
   └─ Webhook: payment.created → handlePaymentWebhook
      ├─ approved → Subscription.status = ACTIVE
      └─ rejected → Subscription.status = PAST_DUE + gracePeriodEnd

5. Cobranças mensais subsequentes
   └─ Mesmo fluxo via webhooks

6. Cancelamento
   └─ POST /api/billing/cancel-subscription
      ├─ Cancela no MP (preapproval.status = cancelled)
      └─ Subscription.status = CANCELLED
```

---

## Banco de Dados

### Tabela `Subscription`

| Campo              | Tipo       | Descrição                                  |
|--------------------|------------|--------------------------------------------|
| `id`               | UUID       | PK                                         |
| `companyId`        | UUID       | FK → Company                               |
| `plan`             | String     | BASIC / PROFESSIONAL / ENTERPRISE          |
| `status`           | String     | TRIAL / ACTIVE / PAST_DUE / CANCELLED / PAUSED |
| `trialStart`       | DateTime?  | Início do trial                            |
| `trialEndsAt`      | DateTime?  | Fim do trial (agora + 14 dias)             |
| `currentPeriodStart` | DateTime? | Início do período atual                   |
| `currentPeriodEnd` | DateTime?  | Fim do período atual                       |
| `gracePeriodEnd`   | DateTime?  | Fim da carência (pagamento falhou)         |
| `mpPreapprovalId`  | String?    | ID da preapproval no MP (unique)           |
| `mpCustomerId`     | String?    | ID do payer no MP                          |
| `cancelledAt`      | DateTime?  | Data de cancelamento                       |
| `createdAt`        | DateTime   | Criação                                    |
| `updatedAt`        | DateTime   | Última atualização                         |

### Tabela `Payment`

| Campo            | Tipo      | Descrição                               |
|------------------|-----------|-----------------------------------------|
| `id`             | UUID      | PK                                      |
| `subscriptionId` | UUID      | FK → Subscription                       |
| `companyId`      | UUID      | FK → Company                            |
| `mpPaymentId`    | String?   | ID do pagamento no MP (unique)          |
| `amount`         | Decimal   | Valor                                   |
| `status`         | String    | PENDING / APPROVED / REJECTED / REFUNDED|
| `paidAt`         | DateTime? | Data do pagamento                       |
| `failureReason`  | String?   | Motivo da falha                         |
| `createdAt`      | DateTime  | Criação                                 |

---

## Configuração de Credenciais Mercado Pago

### 1. Criar conta de desenvolvedor

Acesse: https://www.mercadopago.com.br/developers

### 2. Obter credenciais

No painel do desenvolvedor:
- **Credenciais de teste**: prefixo `TEST-` (sandbox)
- **Credenciais de produção**: prefixo `APP_USR-` (real)

### 3. Configurar variáveis de ambiente

```env
# .env (backend)
MP_ACCESS_TOKEN="TEST-seu-access-token"
MP_PUBLIC_KEY="TEST-seu-public-key"
MP_WEBHOOK_SECRET="seu-webhook-secret"
```

### 4. Configurar Webhook no painel do MP

1. Acesse: Developers → Webhooks
2. URL: `https://seu-dominio.com/api/webhooks/mercadopago`
3. Eventos:
   - `subscription_preapproval`
   - `payment`
4. Copie o **webhook secret** para a variável `MP_WEBHOOK_SECRET`

---

## Como Testar Localmente

### 1. Instalar dependências

```bash
cd ponto-digital/backend
npm install
```

### 2. Aplicar migration

```bash
# Se prisma migrate funcionar com seu banco:
npx prisma migrate dev

# Ou aplicar o SQL manualmente no Supabase/Neon:
# Copie o conteúdo de prisma/migrations/20260308000121_add_billing_fields/migration.sql
```

### 3. Gerar Prisma Client

```bash
npx prisma generate
```

### 4. Iniciar servidor

```bash
npm run dev
```

### 5. Testar criação de assinatura

```bash
# 1. Faça login para obter JWT
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"senha123"}' \
  | jq -r '.token')

# 2. Criar assinatura
curl -X POST http://localhost:3001/api/billing/create-subscription \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "plan": "BASIC",
    "cardTokenId": "card_token_gerado_no_frontend",
    "email": "admin@empresa.com"
  }'

# 3. Verificar status
curl http://localhost:3001/api/billing/subscription-status \
  -H "Authorization: Bearer $TOKEN"

# 4. Cancelar
curl -X POST http://localhost:3001/api/billing/cancel-subscription \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Testar webhook localmente (com ngrok)

```bash
# Instale ngrok: https://ngrok.com
ngrok http 3001

# Use a URL do ngrok como webhook no painel do MP
# Ex: https://abc123.ngrok.io/api/webhooks/mercadopago
```

### 7. Simular webhook manualmente

```bash
curl -X POST http://localhost:3001/api/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "data": { "id": "12345678" }
  }'
```

---

## Exemplos de Payloads de Webhook

### subscription_preapproval (assinatura autorizada)

```json
{
  "id": "event-uuid",
  "type": "subscription_preapproval",
  "date_created": "2026-03-07T10:00:00.000-03:00",
  "data": {
    "id": "2c9380848db159c1018db1a0909e0001"
  },
  "action": "subscription_preapproval.updated"
}
```

### payment (pagamento aprovado)

```json
{
  "id": "event-uuid",
  "type": "payment",
  "date_created": "2026-03-21T10:00:00.000-03:00",
  "data": {
    "id": "1234567890"
  },
  "action": "payment.created"
}
```

### payment (pagamento rejeitado)

```json
{
  "id": "event-uuid",
  "type": "payment",
  "date_created": "2026-03-21T10:00:00.000-03:00",
  "data": {
    "id": "1234567891"
  },
  "action": "payment.updated"
}
```

### Detalhes do pagamento (resposta da API MP ao buscar payment)

```json
{
  "id": 1234567890,
  "status": "approved",
  "status_detail": "accredited",
  "transaction_amount": 49.00,
  "currency_id": "BRL",
  "date_approved": "2026-03-21T10:00:00.000-03:00",
  "external_reference": "company-uuid-123",
  "metadata": {
    "preapproval_id": "2c9380848db159c1018db1a0909e0001"
  },
  "payer": {
    "email": "admin@empresa.com"
  }
}
```

### Detalhes da preapproval (resposta da API MP)

```json
{
  "id": "2c9380848db159c1018db1a0909e0001",
  "status": "authorized",
  "reason": "Ponto Digital — Plano Básico",
  "external_reference": "company-uuid-123",
  "payer_id": 123456789,
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 49,
    "currency_id": "BRL",
    "free_trial": {
      "frequency": 14,
      "frequency_type": "days"
    }
  },
  "date_created": "2026-03-07T10:00:00.000-03:00",
  "last_modified": "2026-03-07T10:00:00.000-03:00"
}
```

---

## Checklist para Produção

### Credenciais
- [ ] Trocar `MP_ACCESS_TOKEN` de `TEST-` para credencial de produção (`APP_USR-`)
- [ ] Trocar `MP_PUBLIC_KEY` para credencial de produção
- [ ] Configurar `MP_WEBHOOK_SECRET` no painel do MP
- [ ] Verificar se `FRONTEND_URL` está correto (usado como `back_url`)

### Webhook
- [ ] Registrar URL de webhook em produção no painel do MP
- [ ] Selecionar eventos: `subscription_preapproval`, `payment`
- [ ] Testar webhook com evento real
- [ ] Verificar que o endpoint `/api/webhooks/mercadopago` é acessível publicamente (sem auth)

### Banco de Dados
- [ ] Aplicar migration `20260308000121_add_billing_fields`
- [ ] Verificar índices: `Subscription_mpPreapprovalId_idx`, `Payment_mpPaymentId_idx`
- [ ] Verificar constraints unique em `mpPreapprovalId` e `mpPaymentId`

### Segurança
- [ ] `MP_WEBHOOK_SECRET` configurado e validado (HMAC SHA-256)
- [ ] Webhook responde 200 rapidamente (antes de processar)
- [ ] Idempotência: webhook duplicado não cria pagamento duplicado
- [ ] Comparação de hash usa `timingSafeEqual` (timing-attack safe)

### Monitoramento
- [ ] Logs de auditoria: `[Billing]` e `[Webhook]` no stdout
- [ ] Alertar quando status muda para `PAST_DUE`
- [ ] Monitorar taxa de falha de webhooks no painel do MP

### Frontend
- [ ] Integrar SDK JS do MP para gerar `cardTokenId`
- [ ] Exibir status da assinatura no dashboard
- [ ] Avisar quando trial está para expirar (< 3 dias)
- [ ] Tela de pagamento para reativar assinatura cancelada
- [ ] Mensagem de erro clara quando `subscriptionGuard` retorna 402

### Testes
- [ ] Testar fluxo completo: registro → trial → pagamento → ativo
- [ ] Testar cancelamento e reativação
- [ ] Testar falha de pagamento → PAST_DUE → grace period
- [ ] Testar webhook com assinatura HMAC válida e inválida
- [ ] Testar idempotência (mesmo webhook 2x)

---

## Arquivos Criados/Modificados

### Criados
| Arquivo | Descrição |
|---------|-----------|
| `backend/src/services/mercadopagoService.js` | Camada de integração com API do MP |
| `backend/src/services/billingService.js` | Regras de negócio de billing |
| `backend/src/routes/billingRoutes.js` | Rotas `/api/billing/*` |
| `backend/prisma/migrations/20260308000121_add_billing_fields/migration.sql` | Migration SQL |
| `backend/docs/BILLING.md` | Esta documentação |

### Modificados
| Arquivo | O que mudou |
|---------|-------------|
| `backend/prisma/schema.prisma` | Adicionado `trialStart`, `gracePeriodEnd`, `failureReason`, indexes unique |
| `backend/src/controllers/subscriptionController.js` | Refatorado para usar billingService |
| `backend/src/controllers/webhookController.js` | HMAC + idempotência + usa billingService |
| `backend/src/middlewares/subscriptionGuard.js` | Suporte a PAUSED + usa gracePeriodEnd |
| `backend/src/app.js` | Registrado billingRoutes |
| `.env.example` | Documentação expandida do MP |
