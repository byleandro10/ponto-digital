# Deploy na Hostinger com GitHub + Supabase

## Objetivo

Publicar o `ponto-digital` na Hostinger com:

- frontend em `https://ponto.lbrcore.com`
- API em `https://api.lbrcore.com/api`
- `backend/src/app.js` atende a API em `/api`
- o mesmo codigo continua podendo servir o build do `frontend` Vite
- o banco continua no Supabase PostgreSQL via Prisma

## Arquitetura de producao

- Runtime unico: Node.js
- Frontend: build estatico em `frontend/dist`
- Backend: Express em `backend/src/app.js`
- Banco: Supabase PostgreSQL
- Publicacao: integracao da Hostinger com GitHub
- Frontend: `ponto.lbrcore.com`
- API: `api.lbrcore.com`
- Branch de deploy: `master`

## Comandos para a Hostinger

Use Node.js `20.x` ou `22.x`.

- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`

O `npm run build` faz:

1. instalar dependencias do `frontend`, incluindo `devDependencies` como `vite`
2. gerar o Prisma Client
3. gerar `frontend/dist`
4. copiar o build final para `dist` na raiz, para provedores que fixam `Diretorio raiz = ./`

## Variaveis de ambiente

Cadastre no painel da Hostinger:

```env
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=3001
APP_URL=https://ponto.lbrcore.com
FRONTEND_URL=https://ponto.lbrcore.com
ALLOWED_ORIGINS=https://ponto.lbrcore.com,https://api.lbrcore.com
VITE_API_BASE_URL=https://api.lbrcore.com/api
NOTIFICATION_TIMEZONE=America/Sao_Paulo
MP_ACCESS_TOKEN=
MP_PUBLIC_KEY=
VITE_MP_PUBLIC_KEY=
MP_WEBHOOK_SECRET=
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

Notas:

- `JWT_SECRET` deve ter pelo menos 32 caracteres.
- `VITE_API_BASE_URL` deve apontar para `https://api.lbrcore.com/api`.
- `VITE_MP_PUBLIC_KEY` deve repetir a chave publica usada pelo frontend.
- Se for promover depois para dominio principal, atualize `APP_URL`, `FRONTEND_URL` e `ALLOWED_ORIGINS`.
- Se o Supabase exigir URL diferente para Prisma em operacoes administrativas, mantenha `DIRECT_URL`.

## Passo a passo na Hostinger

1. Criar um app Node.js no plano `Business` ou `Cloud`.
2. Conectar a conta GitHub.
3. Selecionar o repositorio `byleandro10/ponto-digital`.
4. Selecionar a branch inicial de deploy: `master`.
5. Configurar `ponto.lbrcore.com` para o frontend publicado.
6. Configurar `api.lbrcore.com` apontando para a aplicacao da API ou para o mesmo app Node.js, conforme o painel da Hostinger permitir.
7. Definir os comandos:
   - Install: `npm install`
   - Build: `npm run build`
   - Start: `npm start`
8. Selecionar Node.js `20.x` ou `22.x`.
9. Cadastrar todas as variaveis de ambiente.
10. Executar o primeiro deploy.

Se aparecer o erro `vite: command not found`, isso normalmente significa que o ambiente instalou o `frontend` sem as dependencias de build. Neste projeto, o script `npm run build` ja corrige isso executando:

- `npm --prefix frontend install --include=dev`

Se o painel da Hostinger travar `Diretorio raiz` em `./`, mantenha:

- `Comando de construcao`: `npm run build`
- `Diretorio de saida`: `dist`

Porque este repositório agora copia automaticamente `frontend/dist` para `./dist` no fim da compilacao.

## GitHub e deploy automatico

Fluxo recomendado:

- cada `push` na branch `master` dispara um novo deploy pela integracao nativa da Hostinger
- o build gera `frontend/dist`
- o processo Node sobe com `npm start`

Antes do primeiro push para producao:

- confirme que a branch publicada na Hostinger e `master`
- confirme que as variaveis no painel estao preenchidas
- confirme que `ponto.lbrcore.com` e `api.lbrcore.com` ja respondem no DNS da Hostinger

## Mercado Pago

Depois que a API estiver publica, atualize o webhook no painel do Mercado Pago:

- URL: `https://api.lbrcore.com/api/webhooks/mercadopago`

Tambem revise:

- `FRONTEND_URL`
- `APP_URL`
- `VITE_API_BASE_URL`
- `MP_WEBHOOK_SECRET`
- `VITE_MP_PUBLIC_KEY`

## Checklist pos-deploy

- `GET /api/health` responde `200`
- `https://api.lbrcore.com/api/health` responde `200`
- abrir `https://ponto.lbrcore.com/login` diretamente funciona
- abrir `/admin/dashboard` diretamente retorna a SPA, sem erro 404 do servidor
- login funciona
- rotas autenticadas continuam chamando `https://api.lbrcore.com/api`
- conexao com Supabase funciona
- geracao de relatorios e exportacoes funciona
- SDK do Mercado Pago carrega no frontend
- webhook do Mercado Pago responde no dominio publico

## Promocao de staging para producao

Configuracao operacional para este ambiente:

1. `APP_URL=https://ponto.lbrcore.com`
2. `FRONTEND_URL=https://ponto.lbrcore.com`
3. `ALLOWED_ORIGINS=https://ponto.lbrcore.com,https://api.lbrcore.com`
4. `VITE_API_BASE_URL=https://api.lbrcore.com/api`
5. webhook Mercado Pago em `https://api.lbrcore.com/api/webhooks/mercadopago`
