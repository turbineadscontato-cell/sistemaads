# Sistema TurbinaADS — Fase 1

Núcleo do sistema de gestão de clientes: cadastro de clientes, status de pagamento,
tarefas por gestor, pendências por cliente, CRM de leads/reuniões e login com
permissões por perfil (sócio / gestor / atendente).

- `backend/` — API (Node.js + Express + Prisma + PostgreSQL), publicar na **Railway**.
- `frontend/` — painel web (Next.js + Tailwind), publicar na **Vercel**.

## 1. Subir o código para o GitHub

1. Crie um repositório novo e **vazio** em github.com (sem README, sem .gitignore) — ex: `turbineads-sistema`.
2. No terminal, dentro desta pasta:

```bash
git init
git add .
git commit -m "Sistema TurbinaADS - Fase 1"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/turbineads-sistema.git
git push -u origin main
```

(Troque `SEU-USUARIO` pelo seu usuário do GitHub. O GitHub vai pedir login na hora do push.)

## 2. Publicar o backend na Railway

1. railway.app → **New Project** → **Deploy from GitHub repo** → selecione o repositório.
2. Nas configurações do serviço criado: **Settings → Root Directory** → digite `backend`.
3. No mesmo projeto Railway: **New → Database → Add PostgreSQL**.
4. Volte ao serviço do backend → aba **Variables** → adicione:
   - `DATABASE_URL` → clique em "Add Reference" e escolha a variável `DATABASE_URL` do serviço Postgres que você acabou de criar (assim ficam conectados).
   - `JWT_SECRET` → um valor aleatório longo (gere com `openssl rand -hex 32` no terminal, ou qualquer texto longo e único).
   - `SEED_ADMIN_NAME` → seu nome.
   - `SEED_ADMIN_EMAIL` → o email que você vai usar pra logar como sócio.
   - `SEED_ADMIN_PASSWORD` → uma senha forte.
   - `FRONTEND_URL` → deixe em branco por enquanto, vamos preencher no passo 4.
5. Railway vai buildar e rodar automaticamente (o `railway.json` já está configurado para aplicar as migrações do banco e criar o usuário inicial antes de subir o servidor).
6. Em **Settings → Networking → Generate Domain**, gere uma URL pública (algo como `https://turbineads-backend-production.up.railway.app`). Copie essa URL — vai precisar dela no próximo passo.

## 3. Publicar o frontend na Vercel

1. vercel.com → **Add New → Project** → importe o mesmo repositório do GitHub.
2. Em **Configure Project**: **Root Directory** → `frontend`.
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_API_URL` → a URL da Railway que você copiou no passo 2.6 (sem barra no final).
4. **Deploy**. Ao terminar, a Vercel te dá uma URL tipo `https://turbineads-sistema.vercel.app` — esse é o link do painel.

## 4. Fechar o ciclo (liberar o CORS)

1. Volte na Railway → serviço do backend → **Variables** → edite `FRONTEND_URL` com a URL da Vercel do passo 3.4.
2. Isso reinicia o backend automaticamente. Pronto — o frontend já consegue falar com a API.

## 5. Primeiro login

Acesse a URL da Vercel e entre com o `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` que você configurou no passo 2.4.
Esse é o usuário **sócio** — com acesso completo. A partir dele, o próximo passo é criar os
logins dos gestores e do atendente (isso ainda não tem tela própria nesta primeira versão;
me avise quando chegar aqui que eu adiciono a tela de gestão de usuários).

## Rodando localmente (opcional, para testar antes de publicar)

Backend:
```bash
cd backend
cp .env.example .env    # edite com uma URL de Postgres local
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev              # roda em http://localhost:3001
```

Frontend (em outro terminal):
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev               # roda em http://localhost:3000
```
