# Guia de Integrações — Velocita Global CRM

Todas as integrações ficam em **Configurações > Integrações** (e **Configurações > Assistente IA** para a IA). Depois de preencher os campos e clicar em Salvar, elas passam a funcionar automaticamente — sem precisar reiniciar o servidor.

Antes de começar: seu CRM precisa estar acessível pela internet (não só `localhost`) para as plataformas da Meta e do Google conseguirem enviar eventos para os webhooks. Depois de publicar no Render (veja o guia de deploy que já te passei), use a URL pública dele nos passos abaixo, por exemplo `https://velocita-global-crm.onrender.com`.

---

## 1. WhatsApp Business (Meta Cloud API)

**O que você precisa ter:** uma conta comercial na Meta (Meta Business Suite) e um número de telefone dedicado ao WhatsApp Business.

**Passo a passo:**
1. Acesse [developers.facebook.com](https://developers.facebook.com) e crie um app do tipo **Business**.
2. Dentro do app, adicione o produto **WhatsApp**.
3. Na seção WhatsApp > Primeiros Passos, você verá um **número de teste** já pronto para usar (bom para testar antes de usar seu número real) e o **Phone Number ID**.
4. Gere um **Token de Acesso Temporário** (para testes) ou um **Token Permanente** (produção, requer revisão do app pela Meta).
5. No painel WhatsApp > Configuration, configure o **Webhook**:
   - URL de callback: `https://SEU-DOMINIO/api/webhooks/whatsapp`
   - Verify Token: crie uma palavra-chave qualquer (ex: `velocita2026`) — é só uma senha que você inventa
   - Inscreva-se no campo `messages`
6. No Velocita Global, vá em **Configurações > Integrações > WhatsApp Business**:
   - Cole o **Phone Number ID**
   - Cole o **Verify Token** (o mesmo que você criou no passo 5)
   - Cole o **Access Token**
7. Salve. Pronto — mensagens enviadas pelo CRM (na conversa do lead) passam a ser entregues de verdade, e mensagens recebidas no WhatsApp aparecem automaticamente na conversa do lead correspondente (pelo número de telefone cadastrado).

---

## 2. Facebook (Messenger)

**O que você precisa ter:** uma Página do Facebook da empresa.

**Passo a passo:**
1. No mesmo app criado no passo anterior (ou um novo), adicione o produto **Messenger**.
2. Em Messenger > Configuration, conecte sua **Página do Facebook** e gere o **Page Access Token**.
3. Configure o webhook:
   - URL: `https://SEU-DOMINIO/api/webhooks/facebook`
   - Verify Token: use o mesmo do WhatsApp ou outro à sua escolha
   - Inscreva-se nos campos `messages` e `messaging_postbacks`
4. No Velocita Global, em **Configurações > Integrações > Facebook**, cole o **App ID**, **App Secret** e **Page Access Token**.
5. Para o CRM saber para qual lead enviar uma mensagem, cada lead precisa ter o **Facebook PSID** (ID da conversa) preenchido — isso é capturado automaticamente quando a pessoa manda uma mensagem pela primeira vez (fica registrado no evento do webhook).

---

## 3. Instagram (Direct)

**O que você precisa ter:** uma conta comercial do Instagram vinculada à mesma Página do Facebook.

**Passo a passo:**
1. No painel do app, adicione o produto **Instagram** e conecte a conta comercial.
2. Gere o **Access Token** do Instagram (mesmo fluxo do Facebook, é a Graph API).
3. Webhook: `https://SEU-DOMINIO/api/webhooks/instagram`, mesmo verify token.
4. Em **Configurações > Integrações > Instagram**, cole o **Access Token**.

---

## 4. Google Ads (leads de anúncios)

**O que você precisa ter:** uma conta Google Ads com campanhas de geração de leads (Lead Form Extensions).

**Passo a passo:**
1. Acesse [ads.google.com](https://ads.google.com) e crie um projeto no [Google Cloud Console](https://console.cloud.google.com) vinculado à sua conta.
2. Ative a **Google Ads API** e gere um **Developer Token** em Ferramentas > Central de API do Google Ads (a aprovação pode levar alguns dias).
3. Crie credenciais **OAuth 2.0** (Client ID e Client Secret) no Google Cloud Console.
4. Gere um **Refresh Token** (normalmente via uma ferramenta OAuth Playground do Google, usando seu Client ID/Secret).
5. Para receber leads automaticamente, configure em **Google Ads > Ferramentas > Configurações de leads > Webhook**, apontando para: `https://SEU-DOMINIO/api/webhooks/google-ads-leads`.
6. No Velocita Global, em **Configurações > Integrações > Google Ads**, cole Developer Token, Client ID, Client Secret e Refresh Token.

> Esse é o processo mais burocrático de todos — a Google exige aprovação do Developer Token para uso em produção. Para testar rápido, você pode usar o modo de teste (test account) enquanto aguarda a aprovação.

---

## 5. E-mail (SMTP — envio e recebimento)

**Envio (já funciona assim que configurar):**
1. Use os dados SMTP do seu provedor de e-mail. Exemplos comuns:
   - **Gmail/Google Workspace**: host `smtp.gmail.com`, porta `587`. Você precisa criar uma **Senha de App** em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (não use sua senha normal).
   - **Outlook/Microsoft 365**: host `smtp.office365.com`, porta `587`.
   - **Provedor próprio/hospedagem**: pergunte ao seu provedor de hospedagem o host e porta SMTP.
2. Em **Configurações > Integrações > E-mail (SMTP)**, preencha Servidor, Porta, Usuário e Senha.
3. Salve — o botão de enviar e-mail na conversa do lead passa a mandar e-mails de verdade.

**Recebimento (mais avançado):** como e-mail não tem um "webhook nativo" como WhatsApp, a forma mais simples é usar um serviço de **Inbound Parse** gratuito, como o do **SendGrid** ou **Mailgun**:
1. Crie uma conta gratuita no SendGrid ou Mailgun.
2. Configure um subdomínio de e-mail (ex: `respostas.velocitaglobal.com`) apontando o MX para o serviço.
3. Configure o Inbound Parse Webhook apontando para: `https://SEU-DOMINIO/api/webhooks/email`.
4. Respostas de e-mail para esse endereço aparecerão automaticamente na conversa do lead (pelo e-mail cadastrado).

---

## 6. Assinatura Digital (Clicksign / Autentique / DocuSign)

Isso ficou como um campo de configuração pronto (provedor + API Key) em **Configurações > Integrações**, mas o envio de documentos para assinatura ainda não está implementado no código — cada provedor tem um fluxo de upload de PDF bem diferente. Se você me disser qual desses três provedores vai usar, eu implemento o envio de contratos para assinatura na tela de detalhe do negócio.

---

## 7. Assistente de IA (Ollama / Groq / Gemini / Claude)

Em **Configurações > Assistente IA**, escolha um provedor:

### Opção gratuita e 100% local: Ollama
1. Baixe e instale o Ollama em [ollama.com/download](https://ollama.com/download) (Windows, Mac ou Linux).
2. Abra um terminal e rode: `ollama pull llama3.1` (baixa o modelo, ~4.7GB).
3. Deixe o Ollama rodando (ele inicia sozinho como serviço, ou rode `ollama serve`).
4. No Velocita Global, selecione o provedor **Ollama**, deixe o endereço como `http://localhost:11434` e o modelo como `llama3.1`.
5. Importante: como o servidor do CRM (Node.js) é quem faz a chamada para o Ollama, ambos precisam estar rodando **na mesma máquina** (ou você aponta para o IP da máquina onde o Ollama está rodando na sua rede).

### Opção gratuita na nuvem: Groq (recomendado se seu PC não tem uma boa placa de vídeo)
1. Crie uma conta grátis em [console.groq.com](https://console.groq.com) (sem cartão de crédito).
2. Gere uma API Key em API Keys > Create API Key.
3. No Velocita Global, selecione o provedor **Groq**, cole a chave e use o modelo `llama-3.1-8b-instant` (rápido) ou `llama-3.3-70b-versatile` (mais inteligente).

### Opção gratuita na nuvem: Google Gemini
1. Crie uma chave grátis em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. No Velocita Global, selecione **Google Gemini**, cole a chave, modelo `gemini-1.5-flash`.

### Opção paga: Anthropic Claude
1. Crie uma conta em [console.anthropic.com](https://console.anthropic.com) e adicione créditos.
2. Gere uma API Key.
3. Selecione **Anthropic Claude**, cole a chave, modelo `claude-sonnet-4-5`.

---

## 8. Vivo PABX (ligações)

A Vivo PABX Virtual não publica uma API padronizada como as outras — o acesso é liberado por contrato. Para configurar:

1. Entre em contato com seu **gerente de contas Vivo** (ou acesse o painel administrativo da sua conta PABX) e peça a **documentação da API de click-to-call** e um **token de acesso**.
2. Cadastre em **Configurações > Integrações > Vivo PABX**: a URL da API e o token fornecidos.
3. Em **Configurações > Usuários**, cadastre o **ramal** de cada atendente (é assim que o sistema sabe qual ramal vai tocar primeiro antes de conectar com o cliente).
4. Clique em "📞 Ligar (Vivo PABX)" no detalhe de qualquer lead para testar.

Se o formato de requisição que a Vivo exigir for diferente do que implementei (o endpoint espera hoje `{ ramal, numero }` em JSON), me envie a documentação da sua conta que eu ajusto o código exatamente para o seu contrato.

---

## Resumo dos webhooks (URLs prontas para colar nos painéis das plataformas)

| Canal | URL |
|---|---|
| WhatsApp | `https://SEU-DOMINIO/api/webhooks/whatsapp` |
| Facebook | `https://SEU-DOMINIO/api/webhooks/facebook` |
| Instagram | `https://SEU-DOMINIO/api/webhooks/instagram` |
| Google Ads (leads) | `https://SEU-DOMINIO/api/webhooks/google-ads-leads` |
| E-mail (Inbound Parse) | `https://SEU-DOMINIO/api/webhooks/email` |
