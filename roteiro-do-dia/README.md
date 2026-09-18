# Roteiro do Dia

Gerador de roteiros virais para afiliados, com login, registro, banco de dados persistente e painel de administração.

## Como rodar

1. `npm install`
2. Copie `.env.example` para `.env` e preencha:
   - **Banco de dados** (recomendado para produção): `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` — crie grátis em https://turso.tech. Sem isso, usa um arquivo SQLite local (`./data.db`), que funciona bem para testar mas some a cada deploy em provedores sem disco persistente (ex: Render free).
   - Pelo menos uma chave de IA: `GEMINI_API_KEY` (aistudio.google.com), `OPENROUTER_API_KEY` (openrouter.ai/keys, grátis e sem cartão) e/ou `GROQ_API_KEY` (console.groq.com). Configurar mais de uma deixa o sistema resiliente: se a primeira falhar ou estiver fora do ar, ele tenta a próxima sozinha, na ordem Gemini → OpenRouter → Groq → Anthropic.
   - `ACCESS_CODE` (código que os afiliados usam para registrar e logar)
   - `ADMIN_PASS` (senha do administrador)
3. `node server.js`
4. Abra http://localhost:3000

## Contas e papéis

- **Admin**: criado automaticamente na primeira execução com `ADMIN_USER` / `ADMIN_PASS` do `.env`. Entra selecionando "Admin" no login. É o único papel que pode promover/rebaixar e remover contas.
- **Moderador**: um afiliado promovido pelo admin. Acessa o mesmo painel (entra também pela aba "Admin"), pode gerenciar afiliados (suspender/banir/reativar/adicionar), testar IA e exportar a planilha — mas não pode promover/rebaixar ninguém, não pode remover contas, e não pode agir sobre outro moderador (só sobre afiliados comuns).
- **Afiliados**: podem se registrar sozinhos na aba "Registrar" (email + usuário + senha + código de acesso), ou o admin/moderador pode criar a conta diretamente pelo painel (botão "+ Adicionar afiliado"), sem precisar do código de acesso.

## Login persistente

O login usa um token assinado (JWT), não uma sessão guardada na memória do processo. A chave usada para assinar fica salva no próprio banco de dados — então o login continua valendo mesmo depois de o servidor reiniciar (redeploy, ou o serviço "dormir" por inatividade e acordar de novo), sem pedir para entrar de novo. Cada requisição confere o status da conta direto no banco, então banir ou suspender um afiliado tem efeito imediato, mesmo em um token que ainda não expirou.

## Painel admin (`/admin.html`)

- Resumo: afiliados, moderadores, online agora, ativos, suspensos, banidos, gerações (hoje/total)
- Gráfico de gerações por dia (14 dias), atualizado a cada 10 segundos
- **Testar IA**: roda uma chamada curta em cada provedor configurado (Gemini/OpenRouter/Groq/Anthropic) e mostra se cada um está respondendo, sem gastar uma geração completa
- **+ Adicionar afiliado**: cria uma conta de afiliado na hora (email + usuário + senha), sem precisar do código de acesso
- **Promover/Rebaixar** e **Remover** (admin apenas): promove um afiliado a moderador (ou rebaixa de volta), ou remove a conta definitivamente — o histórico de gerações da pessoa continua registrado, só a conta some
- **⬇ Baixar planilha**: exporta um CSV com todos os usuários (afiliados, moderadores e admins), status, papel e total de gerações — abre direto no Excel/Google Sheets
- Whitelist (ativos) e Blacklist (suspensos/banidos) com botões Suspender, Banir e Reativar — efeito imediato
- BI por afiliado: gerações hoje / 7 dias / total, mini-gráfico de atividade dos últimos 14 dias, última geração e produto
- Histórico de gerações com busca por produto ou afiliado + botão Limpar pesquisa

## Gerador (`/app.html`)

- Campos opcionais de preço, peso e dimensões, além de categoria/diferencial — quanto mais preenchido, mais rico fica o roteiro
- Upload de foto do produto e, agora, upload de uma **planilha .csv** com especificações do produto (a IA lê e usa os dados reais; a tela mostra uma prévia da tabela)
- O botão "Gerar roteiro viral" mostra um cronômetro (segundos decorridos) enquanto espera a resposta da IA
- O resultado agora inclui: faixa branca para o topo do vídeo (texto de sátira/gancho), narração completa em português pronta pra colar num gerador de voz ou vídeo por IA, além do prompt de vídeo já existente
- Histórico pessoal com busca + botão Limpar pesquisa

## Dados

Usuários (com senha criptografada) e histórico de gerações ficam no banco configurado em `TURSO_DATABASE_URL` (ou em `./data.db` local, se essa variável não estiver definida). Recomendado usar Turso em produção para os dados sobreviverem a deploys.
