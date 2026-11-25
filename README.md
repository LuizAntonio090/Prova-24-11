# Trama: e-commerce de roupas

Loja virtual completa de roupas, com vitrine, catálogo com filtros, carrinho, checkout com PIX, cartão e boleto (Mercado Pago), área do cliente e painel administrativo. O nome, o logotipo e as cores da loja podem ser trocados pelo painel, sem mexer no código.

| Camada | Tecnologia |
| --- | --- |
| Front-end | React 19 + Vite 7 + Tailwind CSS 4 |
| Back-end | Node.js 20+ + Express 5 |
| Banco de dados | PostgreSQL 14+ (SQL com migrações versionadas, driver `pg`) |
| Autenticação | Sessões seguras em cookie httpOnly (token aleatório, só o hash fica no banco) e senhas com scrypt |
| Validação | Zod (no servidor) |
| Pagamentos | Mercado Pago: PIX e boleto via API de Pagamentos, cartão via Checkout Pro |
| E-mail | SMTP via Nodemailer |

> **Por que não Prisma e JWT?** O briefing permitia trocar a stack. Optei por SQL direto com migrações (`server/src/db/migrations`) porque a lógica de estoque precisa de travas de linha (`SELECT … FOR UPDATE`) e de uma visão com preço promocional vigente, que ficam mais claras em SQL. Sessões em cookie httpOnly também podem ser revogadas na hora (logout, troca de senha), coisa que um JWT não permite. Se preferir Prisma, rode `npx prisma db pull` no banco já migrado para gerar o schema.

---

## Funcionalidades

**Loja**
- Página inicial com banners editáveis, vantagens, destaques, lançamentos, categorias, faixa de ofertas, mais vendidos e cadastro na newsletter.
- Menu com Masculino, Feminino, Infantil, Camisetas, Calças, Bermudas, Jaquetas, Calçados, Acessórios e Promoções. Cada categoria tem sua página. As categorias vêm do banco e são gerenciadas no painel.
- Filtros por preço, tamanho, cor, marca, categoria e disponibilidade. Ordenação por relevância, menor preço, maior preço, lançamentos e mais vendidos. Paginação.
- Busca com sugestões enquanto o cliente digita.
- Página de produto com galeria, preço e preço promocional, parcelamento, cores e tamanhos com estoque por variação, quantidade, favoritos, cálculo de frete por CEP e produtos relacionados.
- Carrinho salvo no navegador, que continua lá depois de recarregar a página, com cupom, frete, subtotal e total. Preços e estoque são sempre recalculados pelo servidor.
- Checkout em 4 etapas: identificação, endereço (preenchido pelo CEP via ViaCEP), entrega e pagamento.
- Página do pedido com QR Code e código PIX copia e cola, boleto ou botão para o cartão, botão "Já paguei, verificar", troca de forma de pagamento, cancelamento e linha do tempo.

**Conta do cliente**
- Cadastro (nome, e-mail, CPF opcional e validado, telefone, senha e confirmação), login, logout, confirmação de e-mail e recuperação de senha.
- Dados pessoais, troca de senha (encerra as outras sessões), endereços, histórico e status dos pedidos, favoritos.

**Painel administrativo** (`/admin`, só para quem tem papel de administrador)
- Visão geral com receita do mês e comparação com o mês anterior, pedidos, ticket médio, clientes, gráfico de 14 dias, mais vendidos, pedidos recentes e estoque baixo.
- Produtos: criar, editar, excluir, enviar fotos, gerar a grade de tamanhos por cor, marcar destaque, ativar e desativar.
- Estoque por variação, com filtro de estoque baixo.
- Categorias, cupons (percentual ou valor fixo, pedido mínimo, limite de usos, validade) e promoções (por produto ou por categoria inteira, com data de término).
- Clientes, com detalhes de pedidos e endereços.
- Pedidos: filtros, busca, detalhe e atualização de status (exige código de rastreio para "Enviado"). O cancelamento devolve o estoque.
- Relatórios por período: receita, pedidos, ticket médio, descontos, cancelamentos, receita por dia, por categoria, por forma de pagamento e por produto. Exporta CSV.
- Lista da newsletter, com exportação em CSV.
- Configurações: nome, frase, logotipo, as três cores da marca (com prévia ao vivo), contato, CNPJ, redes sociais, banners da home e tabela de frete.

---

## Estrutura de pastas

```
.
├── client/                    # Front-end (React + Vite + Tailwind)
│   ├── index.html
│   ├── vite.config.js         # proxy de /api e /uploads para o servidor em dev
│   └── src/
│       ├── main.jsx, App.jsx  # provedores e rotas
│       ├── index.css          # tokens da marca (Tailwind 4 @theme)
│       ├── lib/               # roteador, cliente da API, formatação, hooks
│       ├── context/           # sessão, carrinho, favoritos, configurações, avisos
│       ├── components/        # UI reutilizável, cabeçalho/rodapé, cards de produto…
│       ├── pages/             # Home, Catálogo, Produto, Carrinho, Checkout, Pedido, Conta…
│       └── admin/             # Painel administrativo (carregado sob demanda)
├── server/                    # Back-end (Express)
│   └── src/
│       ├── index.js, app.js, config.js
│       ├── db/                # pool, migrações SQL, seed
│       ├── lib/               # erros/validação, segurança, e-mail, frete, configurações
│       ├── middleware/        # sessão/permissões, cabeçalhos, CSRF, limite de tentativas
│       ├── services/          # orçamento do carrinho, pedidos, Mercado Pago, catálogo
│       └── routes/            # auth, catálogo, pedidos/pagamentos, conta, admin/*
├── api/index.js               # entrada da função serverless na Vercel
├── vercel.json                # build e rotas na Vercel
├── docker-compose.yml         # PostgreSQL local
├── .env.example
└── package.json               # workspaces + scripts
```

### Banco de dados

Tabelas: `users`, `sessions`, `email_tokens`, `categories`, `products`, `product_categories`, `product_images`, `product_variants` (estoque por tamanho e cor), `addresses`, `favorites`, `coupons`, `orders`, `order_items`, `order_status_history`, `payments`, `settings` e `newsletter_subscribers` e `media` (imagens). Há também a visão `v_products`, com o preço efetivo considerando a promoção vigente e o estoque total. As chaves estrangeiras e as restrições (`CHECK`, `UNIQUE`) estão em `server/src/db/migrations/001_init.sql`.

---

## Como rodar

### 1. Requisitos
- Node.js **20.12 ou mais recente** (recomendado: 22 LTS)
- PostgreSQL 14+ (ou Docker)

### 2. Instalação

```bash
# na pasta do projeto
npm install
cp .env.example .env        # no Windows: copy .env.example .env
```

Edite o `.env`, e pelo menos defina `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

### 3. Banco de dados

Com Docker:
```bash
docker compose up -d
```
Sem Docker, crie um banco chamado `loja` no seu PostgreSQL e ajuste `DATABASE_URL` no `.env`.

Depois crie as tabelas e os dados iniciais (categorias, 30 produtos de exemplo, cupons `BEMVINDO10` e `VALE20`, configurações e o administrador):

```bash
npm run db:seed
```

### 4. Desenvolvimento

```bash
npm run dev
```

- Loja: http://localhost:5173
- Painel: http://localhost:5173/admin (entre com o `ADMIN_EMAIL` e o `ADMIN_PASSWORD` do `.env`)
- API: http://localhost:3333/api/health

Sem SMTP configurado, os e-mails de confirmação e de recuperação de senha aparecem no terminal da API, e o link também aparece na tela (apenas em desenvolvimento). Assim dá para testar todos os fluxos sem um servidor de e-mail.

### 5. Produção

```bash
npm run build          # gera client/dist
NODE_ENV=production npm start
```

Em produção, o próprio Express entrega o front-end compilado e a API no mesmo domínio, na porta `PORT`. Lista de verificação antes de publicar:
- `NODE_ENV=production`, `APP_URL` e `PUBLIC_API_URL` com o domínio HTTPS real, e `TRUST_PROXY=true` se estiver atrás de proxy.
- `DATABASE_URL` do banco gerenciado (`DATABASE_SSL=true` se ele exigir).
- `ADMIN_PASSWORD` forte. O seed recusa criar o administrador em produção sem ela.
- SMTP configurado (Resend, Brevo, Amazon SES, Mailgun…).
- Credenciais de **produção** do Mercado Pago e `MP_WEBHOOK_SECRET`. Em produção, webhooks sem assinatura válida são recusados.
- Revise os textos das páginas institucionais (trocas, entregas, privacidade, termos) em `client/src/pages/Info.jsx`.

Funciona em qualquer serviço que rode Node.js e PostgreSQL (Render, Railway, Fly.io, uma VPS com Nginx etc.). Para a Vercel, veja a seção abaixo.

## Publicar na Vercel

O projeto já vem pronto para a Vercel:
- `vercel.json` compila o front-end (`client/dist`) e envia `/api/*` para uma função serverless (`api/index.js`), que roda o mesmo app Express.
- Em cada deploy, o build roda as migrações e o seed. O seed é seguro para rodar várias vezes: só cria o que falta e não apaga nada.
- As imagens (as do seed e as enviadas pelo painel) ficam guardadas no banco e são servidas em `/api/media/:id`, porque a Vercel não tem disco permanente.
- `APP_URL` e `PUBLIC_API_URL` usam o domínio do projeto na Vercel automaticamente, se você não definir.

**Passo a passo**
1. **Suba o código para o GitHub.** Crie um repositório e envie a pasta do projeto (pelo GitHub Desktop ou por `git push`). O `.env` fica de fora pelo `.gitignore`. Nunca envie o seu.
2. **Importe na Vercel.** Em vercel.com, clique em *Add New → Project* e escolha o repositório. Deixe o *Framework Preset* como **Other** e a *Root Directory* como está (raiz). Antes de clicar em *Deploy*, abra *Environment Variables* e crie:
   - `ADMIN_EMAIL`: seu e-mail de administrador
   - `ADMIN_PASSWORD`: uma senha forte (sem ela o build falha de propósito)
   - `DATABASE_SSL`: `true`

   O primeiro deploy **vai falhar** por ainda não haver banco. Isso é esperado.
3. **Crie o banco.** No projeto, abra a aba *Storage* e escolha *Create Database → Neon (Postgres)*. O plano gratuito serve. Conecte o banco ao projeto: a Vercel cria a variável `DATABASE_URL` sozinha.
4. **Configure o e-mail (obrigatório para vender).** Os clientes precisam confirmar o e-mail para finalizar compras, e em produção o link não aparece na tela. Uma opção gratuita é o Brevo (300 e-mails/dia): crie a conta, valide o remetente e use `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` (seu login SMTP no Brevo), `SMTP_PASS` (a chave SMTP) e `MAIL_FROM="Sua Loja <seu@email.com>"`.
5. **Pagamentos (opcional para começar).** Adicione `MP_ACCESS_TOKEN` (credencial `TEST-` para testar). Para a confirmação automática, cadastre no Mercado Pago o webhook `https://SEU-PROJETO.vercel.app/api/payments/webhook/mercadopago` e adicione `MP_WEBHOOK_SECRET`.
6. **Publique de novo.** Em *Deployments*, abra o último deploy, clique em *⋯ → Redeploy* e confirme. Quando terminar, a loja estará em `https://SEU-PROJETO.vercel.app` e o painel em `/admin`.

Toda vez que você enviar alterações para o GitHub, a Vercel publica sozinha. Sempre que mudar uma variável de ambiente, faça *Redeploy*.

**Limitações na Vercel**
- O limite de tentativas de login fica na memória de cada instância da função, então protege menos do que num servidor único. Para reforçar, use um armazenamento compartilhado (ex.: Upstash Redis) em `middleware/security.js`.
- As requisições têm limite de 4,5 MB, por isso cada foto enviada pelo painel pode ter no máximo 3 MB.
- A primeira requisição depois de um tempo parado pode demorar 1 a 2 segundos (*cold start*).

---

## Integrações externas

### Mercado Pago (pagamentos)
1. Crie uma aplicação em https://www.mercadopago.com.br/developers/panel/app e copie o **Access Token de teste** (começa com `TEST-`) para `MP_ACCESS_TOKEN`.
2. Reinicie a API. A loja passa a gerar cobranças reais **de teste**: QR Code PIX, boleto e link do Checkout Pro para cartão.
3. Para confirmar pagamentos automaticamente, configure o webhook do evento **Pagamentos** com a URL `https://SEU_DOMINIO/api/payments/webhook/mercadopago` e copie a assinatura secreta para `MP_WEBHOOK_SECRET`. Em desenvolvimento, exponha a API com um túnel (ex.: `ngrok http 3333`) e coloque a URL HTTPS em `PUBLIC_API_URL`.
4. Sem webhook, o botão "Já paguei, verificar" na página do pedido consulta o status direto na API do Mercado Pago.

Para testar, use usuários e cartões de teste: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards

Regras de segurança implementadas:
- O pedido só vira "Pago" quando o Mercado Pago confirma (`approved`) e o valor pago cobre o total do pedido.
- O webhook nunca confia no corpo da notificação: sempre consulta o pagamento na API.
- Os dados de cartão nunca passam pelo servidor da loja.
- **Sem `MP_ACCESS_TOKEN`, nenhuma cobrança é simulada.** O pedido fica "Aguardando pagamento" e a tela avisa que o pagamento online não está ativo. O administrador pode marcar um pedido como pago manualmente (ex.: transferência conferida no extrato), e isso fica registrado no histórico.

### E-mail (SMTP)
Preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. São enviados e-mails de confirmação de cadastro, redefinição de senha, pedido recebido e mudança de status.

### Frete
O frete é calculado no servidor (`server/src/lib/shipping.js`) por região do CEP e peso, com duas opções (Econômica e Expressa) e frete grátis acima de um valor. Os valores-base são editados em **Painel > Configurações > Frete**. Para cotação em tempo real com transportadoras, substitua a função `quoteShipping` por uma integração com o Melhor Envio ou com os Correios, mantendo o mesmo formato de retorno.

### CEP
O formulário de endereço consulta o **ViaCEP** direto do navegador, um serviço gratuito que não precisa de chave.

---

## Segurança
- Senhas com **scrypt** e salt aleatório. Sessões em cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção. Só o hash SHA-256 do token fica no banco.
- Proteção contra **CSRF**: toda requisição que altera dados exige o cabeçalho `X-Requested-With`.
- **Limite de tentativas** em login, cadastro e envio de e-mails.
- As rotas `/api/admin/*` exigem papel de administrador no servidor, não só na interface.
- Validação de todas as entradas com Zod e consultas sempre parametrizadas.
- Upload de imagens restrito a JPG, PNG e WEBP, conferido pela assinatura do arquivo (não pela extensão), com limite de 3 MB. As imagens ficam no banco.
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options e outros) em produção.
- O estoque é reservado com travas de linha na criação do pedido, o que impede vender a mesma última unidade duas vezes.
- A recuperação de senha não revela se o e-mail tem cadastro. Os links expiram e só podem ser usados uma vez.

---

## O que foi testado

O projeto foi construído e testado em um ambiente sem acesso ao npm. O banco era um **PostgreSQL 16 real**, mas o Express, o driver `pg` e o Vite foram substituídos por versões compatíveis feitas só para o teste. O código da loja é exatamente o que está aqui. Fluxos verificados num navegador real (Chromium, desktop e celular):

- Navegação, menu, categorias, filtros (tamanho, cor, preço, marca, disponibilidade), ordenação, busca
- Página de produto: escolha de cor e tamanho, estoque, cálculo de frete, adicionar ao carrinho
- Carrinho persistente após recarregar a página, cupom válido e inválido
- Cadastro com validação, confirmação de e-mail, login, logout, recuperação de senha
- Checkout completo (endereço, entrega, PIX), criação do pedido, baixa de estoque, cancelamento com devolução de estoque
- Favoritos, edição de dados, troca de senha, bloqueio do painel para clientes (na tela e na API)
- Painel: visão geral, atualização de status (com rastreio), criação de produto com grade, ajuste de estoque, cupom, categoria, promoção por categoria, clientes, relatórios, troca de nome e cores da loja

**Não testado aqui** (exige internet ou credenciais suas): as chamadas reais ao Mercado Pago, o envio de e-mail por SMTP, a consulta ao ViaCEP e a fonte Archivo (Google Fonts). Ao rodar `npm install` na sua máquina, a primeira coisa a conferir é `npm run dev`, seguido de um pedido de teste com credenciais `TEST-` do Mercado Pago.

## Sobre as imagens do catálogo

Os 30 produtos de exemplo usam **ilustrações vetoriais geradas pelo seed** (silhuetas das peças nas cores de cada variação), e não fotos de banco de imagens. Assim o projeto funciona sem depender de links externos e sem problemas de direitos de uso. Substitua pelas fotos reais em **Painel > Produtos > Fotos**. Os produtos de exemplo também podem ser excluídos pelo painel.

## Próximos passos sugeridos
- Integração de frete em tempo real (Melhor Envio).
- Imagens num CDN (Vercel Blob, S3 ou Cloudinary) quando o catálogo crescer.
- Avaliações de produtos.
- Pagamento com cartão transparente (Checkout API, com o formulário de cartão do Mercado Pago dentro da loja).
- Testes automatizados (Vitest e Playwright) no CI.
