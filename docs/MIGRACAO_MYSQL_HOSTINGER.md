# Migracao de Supabase Postgres para MySQL da Hostinger

## Objetivo

Migrar o app para usar MySQL hospedado na Hostinger, deixando o banco acessivel apenas para a aplicacao e removendo a dependencia operacional do Supabase.

## O que foi ajustado no projeto

- schema principal do Prisma convertido para `mysql`
- schema antigo do Supabase preservado em `backend/prisma/schema.postgresql.prisma`
- build agora tenta aplicar o schema automaticamente quando `DATABASE_URL` for MySQL
- script de migracao de dados criado em `backend/scripts/migrate-postgres-to-mysql.js`

## Scripts principais

- Gerar Prisma Client:
  - `npm run prisma:generate`
- Criar/atualizar schema no MySQL:
  - `npm run db:push`
- Migrar dados do Postgres para o MySQL:
  - `npm run migrate:data:mysql`

## Variaveis necessarias para a migracao

- `DATABASE_URL`
  - conexao MySQL da Hostinger
- `SOURCE_DATABASE_URL`
  - conexao PostgreSQL atual do Supabase

## Ordem da migracao

1. Criar banco MySQL vazio na Hostinger
2. Configurar `DATABASE_URL` com esse banco MySQL
3. Executar `npm install`
4. Executar `npm run prisma:generate`
5. Executar `npm run db:push`
6. Configurar `SOURCE_DATABASE_URL` com o banco atual do Supabase
7. Executar `npm run migrate:data:mysql`
8. Atualizar o deploy da aplicacao para usar apenas o `DATABASE_URL` MySQL

## Observacoes

- O script de migracao limpa as tabelas de destino antes de importar
- Como os dados atuais sao de teste, essa estrategia simplifica a troca
- O campo `DIRECT_URL` deixa de ser necessario no MySQL
