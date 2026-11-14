# Velocita Global CRM

CRM comercial completo inspirado no Pipedrive, com backend em Node.js/Express e frontend em HTML/CSS/JavaScript puro (SPA).

## Funcionalidades

- Login por senha única (`Velocita1`), com sessão persistida no servidor
- Dashboard com métricas de vendas, funil de conversão, meta do mês e lembretes a vencer
- Pipeline (Kanban) com drag-and-drop entre estágios (Prospecção → Qualificação → Reunião → Proposta → Implantação) e dias por etapa
- Gestão de negócios: criar, editar, marcar como Ganho/Perdido, excluir
- Histórico de atividades por negócio (notas, e-mails, chamadas, reuniões, tarefas)
- Leads e Organizações em páginas separadas, com categorias, etiquetas e origem
- Conversas por canal (WhatsApp/Facebook/Instagram/E-mail) em cada lead, com identificação do atendente
- Assistente de IA: dicas automáticas (sem custo) + chat com IA (Ollama grátis local, Groq/Gemini grátis na nuvem, ou Claude pago)
- Integrações prontas para conectar: WhatsApp, Facebook, Instagram, Google Ads, E-mail (SMTP), Vivo PABX, Google Calendar e assinatura digital — veja [INTEGRACOES.md](INTEGRACOES.md)
- Configurações: estágios do funil, usuários (com ramal e assinatura de e-mail), campos personalizados, etiquetas e integrações
- BI por categoria de cliente, com faturamento por plataforma de vendas e por fornecedor
- **Gerador de Roteiros (IA)**: aplicação separada (login, banco e IA próprios) para gerar roteiros de vídeo viral para afiliados, disponível no mesmo site em `/roteiro-do-dia` — veja [roteiro-do-dia/README.md](roteiro-do-dia/README.md)

## Como rodar localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Senha de acesso: `Velocita1`.

O Gerador de Roteiros (IA), em `/roteiro-do-dia`, precisa do seu próprio `.env` — copie `roteiro-do-dia/.env.example` para `roteiro-do-dia/.env` e preencha pelo menos `ACCESS_CODE`, `ADMIN_PASS` e uma chave de IA (veja detalhes em [roteiro-do-dia/README.md](roteiro-do-dia/README.md)). No Render, essas mesmas variáveis devem ser adicionadas em **Environment** do serviço `velocita-global-crm` (é o mesmo serviço, não precisa criar um novo).

## Deploy no Render

Este projeto já inclui um `render.yaml`. Basta conectar o repositório do GitHub em [render.com](https://render.com) como um novo **Web Service** — o Render detecta o `render.yaml` automaticamente (build: `npm install`, start: `node server.js`).

## Estrutura

```
velocita-crm/
├── server.js              # servidor Express do CRM + API REST + autenticação por sessão
├── db.js                  # camada de acesso ao "banco" do CRM (arquivo JSON)
├── db.json                # dados do CRM (estágios, negócios, contatos, empresas, usuários)
├── views/app.html          # SPA principal do CRM (protegida por login)
├── public/
│   ├── login.html
│   ├── css/style.css
│   ├── js/login.js
│   ├── js/app.js
│   └── img/logo.webp
└── roteiro-do-dia/        # app separada: gerador de roteiros virais (login/banco/IA próprios)
    ├── server.js          # exporta { app, init }, montado em /roteiro-do-dia pelo server.js principal
    ├── db.js              # SQLite local ou Turso, independente do banco do CRM
    ├── .env.example        # variáveis próprias (ACCESS_CODE, ADMIN_PASS, chaves de IA...)
    └── public/            # index.html (login), app.html (gerador), admin.html (painel)
```
