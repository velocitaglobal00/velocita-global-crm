# Velocita Global CRM

CRM comercial completo inspirado no Pipedrive, com backend em Node.js/Express e frontend em HTML/CSS/JavaScript puro (SPA).

## Funcionalidades

- Login por senha única (`Velocita1`), com sessão persistida no servidor
- Dashboard com métricas de vendas, funil de conversão e meta do mês
- Pipeline (Kanban) com drag-and-drop entre estágios
- Gestão de negócios: criar, editar, marcar como Ganho/Perdido, excluir
- Histórico de atividades por negócio (notas, e-mails, chamadas, reuniões, tarefas)
- Contatos (pessoas) e Empresas com busca em tempo real
- Configurações: estágios do funil, usuários e campos personalizados

## Como rodar localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Senha de acesso: `Velocita1`.

## Deploy no Render

Este projeto já inclui um `render.yaml`. Basta conectar o repositório do GitHub em [render.com](https://render.com) como um novo **Web Service** — o Render detecta o `render.yaml` automaticamente (build: `npm install`, start: `node server.js`).

## Estrutura

```
velocita-crm/
├── server.js          # servidor Express + API REST + autenticação por sessão
├── db.js              # camada de acesso ao "banco" (arquivo JSON)
├── db.json            # dados (estágios, negócios, contatos, empresas, usuários)
├── views/app.html      # SPA principal (protegida por login)
└── public/
    ├── login.html
    ├── css/style.css
    ├── js/login.js
    ├── js/app.js
    └── img/logo.svg
```
