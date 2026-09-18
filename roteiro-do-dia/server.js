const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ====================== CONFIG ======================
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama3.1-8b';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

const ACCESS_CODE = process.env.ACCESS_CODE || '';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'velocitaglobal@gmail.com';

const JWT_TTL = '12h';
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

// ====================== SENHAS ======================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch {
    return false;
  }
}

// ====================== AUTENTICAÇÃO (JWT, sem estado em memória) ======================
// O login usa um token assinado (JWT) em vez de sessão guardada na memória do servidor.
// Isso resolve o problema de "precisar logar de novo toda vez que o servidor reinicia" —
// a chave de assinatura fica guardada no banco (ver db.js), não na memória do processo,
// então o token continua válido mesmo depois de um redeploy ou de o serviço "dormir"
// por inatividade e reiniciar.
async function signToken(user) {
  const secret = await db.getJwtSecret();
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, role: user.role, jti }, secret, { expiresIn: JWT_TTL });
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

    const secret = await db.getJwtSecret();
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (e) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    if (payload.jti && await db.isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const user = await db.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado. Faça login novamente.' });
    // Status é sempre conferido fresco no banco a cada requisição — banir/suspender uma conta
    // tem efeito imediato na próxima chamada dela, sem precisar derrubar sessão nenhuma.
    if (user.status === 'banido') return res.status(403).json({ error: 'Conta banida. Comunique a administração.', banned: true });
    if (user.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa temporariamente. Comunique a administração.', suspended: true });

    req.user = user;
    req.tokenPayload = payload;
    touchLastSeenThrottled(user.id);
    next();
  } catch (e) {
    console.error('Erro em requireAuth:', e);
    res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
}

// Admin e moderador têm acesso ao painel (leitura, suspender/banir, adicionar afiliado).
// Ações mais sensíveis (promover/rebaixar cargo, remover conta) exigem requireSuperAdmin.
function requireStaff(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'moderador')) {
    return res.status(403).json({ error: 'Acesso restrito à administração.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ação restrita a administradores.' });
  }
  next();
}

// Evita gravar "visto por último" no banco a cada requisição (custaria caro em volume) —
// só atualiza no máximo 1x a cada 20s por usuário.
const lastTouchCache = new Map();
function touchLastSeenThrottled(userId) {
  const now = Date.now();
  const last = lastTouchCache.get(userId) || 0;
  if (now - last > 20000) {
    lastTouchCache.set(userId, now);
    db.touchLastSeen(userId, now).catch((e) => console.error('Erro ao atualizar last_seen:', e.message));
  }
}

// ====================== SEED DO ADMIN ======================
async function seedAdmin() {
  const admins = await db.countAdmins();
  if (admins > 0) return;
  const pass = ADMIN_PASS || 'trocar123';
  await db.createUser({
    email: CONTACT_EMAIL, username: ADMIN_USER, passHash: hashPassword(pass),
    role: 'admin', status: 'ativo', createdByAdmin: false
  });
  if (!ADMIN_PASS) {
    console.log(`[AVISO] Admin criado: usuário "${ADMIN_USER}" / senha "trocar123". Defina ADMIN_PASS no .env para mudar.`);
  } else {
    console.log(`[OK] Admin criado: usuário "${ADMIN_USER}" com a senha do .env.`);
  }
}

// ====================== PROMPT DA IA ======================
const SYSTEM_PROMPT = `Você cria roteiros de vídeo curto e vertical (~30s) para afiliados divulgarem produtos de e-commerce em redes sociais (TikTok, Reels, Shorts, Kwai). A pessoa te dá o nome do produto e, às vezes, categoria/diferencial/plataforma/preço/peso/dimensões/foto/planilha (CSV) do produto.

Responda SOMENTE com um JSON válido, compacto, sem markdown, sem \`\`\`, sem texto antes ou depois, no formato exato:
{"duracao":"Xs","banner_topo":"texto curto para uma faixa branca fixa no topo do vídeo, tom de sátira/meme brasileiro ou gancho de curiosidade que já puxa o clique, até 8 palavras","hook":"gancho falado de abertura, até 15 palavras","cenas":[{"tempo":"0:0X","camera":"direção de câmera curta, ex: Close no rosto","visual":"o que acontece na cena, até 18 palavras","texto_tela":"texto curto que aparece sobreposto na tela, até 6 palavras"}],"narracao":"roteiro completo de narração em português do Brasil, natural e falado (não escrito), apresentando o produto de forma persuasiva e terminando com uma chamada tipo 'Acessa o link aqui embaixo' ou equivalente, até 70 palavras","legenda":"legenda pronta para postar, com humor brasileiro tipo meme/sátira (referência de internet, tom descontraído, nada de texto de vendedor chato), até 35 palavras","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"prompt_video_ia":"prompt em inglês, até 110 palavras, pronto para colar em ferramentas de geração de VÍDEO por IA (Veo, Kling, Runway, Sora etc)","cta":"frase final de call to action mencionando o link na bio/link do afiliado, até 20 palavras"}

Regras:
- Gere de 3 a 4 objetos em "cenas" (o hook conta como abertura, não como cena).
- Tom direto, popular, brasileiro, adequado a TikTok/Reels/Shorts/Kwai — ajuste o ritmo conforme a plataforma informada (TikTok/Kwai toleram humor mais pastel/meme; Reels/Shorts pedem um corte um pouco mais limpo), mas sempre dentro do formato vertical curto.
- Nunca invente características, prêmios, garantias, preço, peso ou dimensões que não foram informados sobre o produto. Se peso/dimensões/preço/planilha CSV forem informados, use esses dados reais no frame de especificações descrito abaixo. Sem essas informações, não invente números — omita o frame de especificações do prompt_video_ia.
- Nunca mencione uma URL específica — apenas oriente para "o link" ou "o link na bio", já que cada afiliado usa o próprio link.
- Se uma foto do produto for enviada, observe suas características reais visíveis (cor, formato, material aparente, detalhes) e use isso para deixar as cenas visuais, o prompt_video_ia e o frame de especificações fiéis à aparência real do produto. Não invente nada que não seja visível na foto ou informado no texto/planilha.
- "prompt_video_ia" é o roteiro técnico completo do vídeo e deve sempre conter, nesta ordem: (1) declarar explicitamente que é um VÍDEO vertical 9:16 de ~30 segundos, nunca uma imagem estática; (2) uma faixa/banner branco fixo na parte superior do quadro durante todo o vídeo, exibindo o texto de "banner_topo" (cite o texto literal entre aspas no prompt); (3) cenas do produto em uso com máximo realismo cinematográfico e acabamento de comercial profissional (iluminação bem descrita, textura e material realistas, movimento de câmera físico e sutil — handheld leve, dolly, close-up — lente e profundidade de campo, evitando o visual "genérico de IA" com brilho excessivo, simetria irreal ou movimento robótico); (4) SE peso/dimensões/preço foram informados, um frame no estilo blueprint/diagrama técnico do produto (fundo claro tipo papel de engenharia, linhas de cota, o produto em contorno/wireframe) mostrando essas métricas reais como legendas/callouts; (5) narração em português do Brasil ao longo do vídeo — cite o texto literal de "narracao" entre aspas no prompt, indicando que deve ser a voz falada (voice-over) do vídeo; (6) frame final de encerramento com o texto "Acesse o link abaixo" ou equivalente em português sobreposto na tela.
- prompt_video_ia NUNCA deve pedir para simular ou fingir ser uma gravação amadora real, um depoimento real de cliente, ou uma cena "flagrada" ao vivo — isso seria propaganda enganosa. O objetivo é parecer um comercial profissional bem produzido e com narração clara, não disfarçar a origem do conteúdo.
- Todo o resto sempre em português do Brasil.`;

function cleanJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tenta, em ordem, cada provedor cuja chave esteja configurada: Gemini -> OpenRouter -> Groq -> Anthropic.
// Se um provedor falhar (fora do ar, sobrecarregado, limite atingido), passa pro próximo
// automaticamente antes de mostrar erro ao afiliado.
// Tempo máximo que cada provedor tem para responder antes de desistir dele e passar
// para o próximo da fila — sem isso, um provedor lento (mesmo sem dar erro) travaria
// a geração inteira esperando por ele indefinidamente.
const PROVIDER_TIMEOUT_MS = 25000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('provider_timeout');
      err.friendly = `${label} demorou demais para responder (mais de ${Math.round(ms / 1000)}s).`;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callAI(userPrompt, image) {
  const providers = [];
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', fn: () => callGemini(userPrompt, image) });
  if (OPENROUTER_API_KEY) providers.push({ name: 'OpenRouter', fn: () => callOpenRouter(userPrompt, image) });
  if (GROQ_API_KEY) providers.push({ name: 'Groq', fn: () => callGroq(userPrompt, image) });
  if (CEREBRAS_API_KEY) providers.push({ name: 'Cerebras', fn: () => callCerebras(userPrompt) });
  if (MISTRAL_API_KEY) providers.push({ name: 'Mistral', fn: () => callMistral(userPrompt) });
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Anthropic', fn: () => callAnthropic(userPrompt, image) });

  if (!providers.length) {
    const err = new Error('no_key_configured');
    err.friendly = 'Nenhuma chave de IA configurada. Preencha GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY ou ANTHROPIC_API_KEY no servidor.';
    throw err;
  }

  let lastErr = null;
  for (const provider of providers) {
    try {
      return await withTimeout(provider.fn(), PROVIDER_TIMEOUT_MS, provider.name);
    } catch (e) {
      console.log(`${provider.name} falhou (${e.message}), tentando próximo provedor configurado...`);
      lastErr = e;
    }
  }
  throw lastErr;
}

async function callOpenRouter(userPrompt, image) {
  const content = [{ type: 'text', text: userPrompt }];
  if (image && image.base64) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}` } });
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: OPENROUTER_MODEL, max_tokens: 2000, temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Erro da API OpenRouter:', response.status, errText);
    const err = new Error('openrouter_error');
    err.friendly = response.status === 429
      ? 'O limite gratuito do OpenRouter foi atingido por agora. Tente novamente em instantes.'
      : 'Erro ao chamar a API do OpenRouter. Confira sua chave e o modelo em openrouter.ai.';
    throw err;
  }

  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return cleanJsonText(text);
}

async function callGroq(userPrompt, image) {
  const content = [{ type: 'text', text: userPrompt }];
  if (image && image.base64) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}` } });
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL, max_tokens: 2000, temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Erro da API Groq:', response.status, errText);
    const err = new Error('groq_error');
    err.friendly = response.status === 429
      ? 'O limite gratuito do Groq foi atingido por agora. Tente novamente em alguns minutos.'
      : 'Erro ao chamar a API do Groq. Confira sua chave em console.groq.com.';
    throw err;
  }

  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return cleanJsonText(text);
}

// Cerebras e Mistral: modelos de texto (sem suporte a foto do produto), usados como
// mais duas opções gratuitas na cadeia de fallback, depois de Gemini/OpenRouter/Groq.
async function callCerebras(userPrompt) {
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CEREBRAS_API_KEY}` },
    body: JSON.stringify({
      model: CEREBRAS_MODEL, max_tokens: 2000, temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Erro da API Cerebras:', response.status, errText);
    const err = new Error('cerebras_error');
    err.friendly = response.status === 429
      ? 'O limite gratuito do Cerebras foi atingido por agora. Tente novamente em instantes.'
      : 'Erro ao chamar a API do Cerebras. Confira sua chave em cloud.cerebras.ai.';
    throw err;
  }

  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return cleanJsonText(text);
}

async function callMistral(userPrompt) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: MISTRAL_MODEL, max_tokens: 2000, temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Erro da API Mistral:', response.status, errText);
    const err = new Error('mistral_error');
    err.friendly = response.status === 429
      ? 'O limite gratuito do Mistral foi atingido por agora. Tente novamente em instantes.'
      : 'Erro ao chamar a API do Mistral. Confira sua chave em console.mistral.ai.';
    throw err;
  }

  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return cleanJsonText(text);
}

async function callGemini(userPrompt, image) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const parts = [{ text: userPrompt }];
  if (image && image.base64) {
    parts.push({ inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.base64 } });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.9, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'minimal' } }
  });

  const MAX_ATTEMPTS = 3;
  let lastErrText = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    if (response.ok) {
      const data = await response.json();
      const p = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = p.map((x) => x.text || '').join('').trim();
      return cleanJsonText(text);
    }

    lastStatus = response.status;
    lastErrText = await response.text();
    console.error(`Erro da API Gemini (tentativa ${attempt}/${MAX_ATTEMPTS}):`, lastStatus, lastErrText);

    if (lastStatus === 429) break;
    const isOverloaded = lastStatus === 503;
    if (!isOverloaded || attempt === MAX_ATTEMPTS) break;
    await sleep(attempt * 1200);
  }

  const err = new Error('gemini_error');
  if (lastStatus === 429) {
    err.friendly = 'O limite gratuito de uso por minuto do Gemini foi atingido. Aguarde cerca de 1 minuto ou configure outro provedor (OpenRouter/Groq) para fallback automático.';
  } else if (lastStatus === 503) {
    err.friendly = 'O Gemini está sobrecarregado no momento, mesmo após algumas tentativas. Tente gerar de novo em instantes.';
  } else {
    err.friendly = 'Erro ao chamar a API do Gemini. Confira sua chave em aistudio.google.com.';
  }
  throw err;
}

async function callAnthropic(userPrompt, image) {
  const content = [];
  if (image && image.base64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType || 'image/jpeg', data: image.base64 } });
  }
  content.push({ type: 'text', text: userPrompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1800, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Erro da API Anthropic:', response.status, errText);
    const err = new Error('anthropic_error');
    err.friendly = 'Erro ao chamar a API da Anthropic. Confira sua chave e seu saldo.';
    throw err;
  }

  const data = await response.json();
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  return cleanJsonText(text);
}

// ====================== TESTES INDIVIDUAIS DE IA (painel admin) ======================
// Chamadas leves e baratas (poucos tokens), separadas da geração normal, só para checar
// se cada provedor configurado está respondendo. Testam todos em paralelo, cada um
// isoladamente — diferente da geração real, aqui queremos saber o status de CADA um.
async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Responda apenas com a palavra: ok' }] }],
    generationConfig: { maxOutputTokens: 30, temperature: 0 }
  });
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  return text || '(resposta vazia)';
}

async function testOpenRouter() {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: 30, messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }] })
  });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return text.trim() || '(resposta vazia)';
}

async function testGroq() {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 30, messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }] })
  });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return text.trim() || '(resposta vazia)';
}

async function testCerebras() {
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CEREBRAS_API_KEY}` },
    body: JSON.stringify({ model: CEREBRAS_MODEL, max_tokens: 30, messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }] })
  });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return text.trim() || '(resposta vazia)';
}

async function testMistral() {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` },
    body: JSON.stringify({ model: MISTRAL_MODEL, max_tokens: 30, messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }] })
  });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return text.trim() || '(resposta vazia)';
}

async function testAnthropic() {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 30, messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }] })
  });
  if (!response.ok) { const t = await response.text(); throw new Error(`HTTP ${response.status}: ${t.slice(0, 200)}`); }
  const data = await response.json();
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  return text || '(resposta vazia)';
}

// ====================== ROTAS: AUTENTICAÇÃO ======================
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Login rápido, sem senha nem código de acesso — usado quando se entra pelo Velocita
// Global CRM (que já exige seu próprio login). Só escolhe o papel (Admin ou Afiliado):
// Admin usa a conta de admin já existente; Afiliado usa uma conta compartilhada única,
// criada automaticamente no primeiro uso.
app.post('/api/quick-login', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['admin', 'afiliado'].includes(role)) {
      return res.status(400).json({ error: 'Papel inválido.' });
    }

    let user;
    if (role === 'admin') {
      const all = await db.listAllUsers();
      user = all.find((u) => u.role === 'admin');
      if (!user) return res.status(500).json({ error: 'Nenhuma conta de admin encontrada.' });
    } else {
      user = await db.findUserByUsername('afiliado');
      if (!user) {
        user = await db.createUser({
          email: CONTACT_EMAIL, username: 'afiliado', passHash: hashPassword(crypto.randomBytes(16).toString('hex')),
          role: 'afiliado', status: 'ativo', createdByAdmin: true
        });
      }
    }

    if (user.status === 'banido') return res.status(403).json({ error: 'Conta banida. Comunique a administração.' });
    if (user.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa. Comunique a administração.' });

    const token = await signToken(user);
    res.json({ ok: true, token, role: user.role, username: user.username });
  } catch (e) {
    console.error('Erro em /api/quick-login:', e);
    res.status(500).json({ error: 'Erro interno ao entrar.' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, username, password, accessCode } = req.body || {};

    if (!ACCESS_CODE || accessCode !== ACCESS_CODE) {
      return res.status(401).json({ error: 'Erro! Comunique a administração!', contactEmail: CONTACT_EMAIL, needsAuth: true });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanUser = String(username || '').trim();

    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Informe um email válido.' });
    if (!USERNAME_RE.test(cleanUser)) return res.status(400).json({ error: 'Usuário deve ter de 3 a 24 caracteres (letras, números, ponto, hífen ou underline).' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    if (await db.findUserByUsername(cleanUser)) return res.status(409).json({ error: 'Este nome de usuário já existe. Escolha outro.' });
    if (await db.findUserByEmail(cleanEmail)) return res.status(409).json({ error: 'Este email já está registrado.' });

    await db.createUser({ email: cleanEmail, username: cleanUser, passHash: hashPassword(password), role: 'afiliado', status: 'ativo', createdByAdmin: false });
    res.json({ ok: true, message: 'Criado com sucesso!' });
  } catch (e) {
    console.error('Erro em /api/register:', e);
    res.status(500).json({ error: 'Erro interno ao registrar. Tente novamente.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password, accessCode, role } = req.body || {};

    if (!ACCESS_CODE || accessCode !== ACCESS_CODE) {
      return res.status(401).json({ error: 'Código de acesso incorreto.' });
    }

    const user = await db.findUserByUsername(String(username || '').trim());
    if (!user || !verifyPassword(password, user.passHash)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    // A aba "Admin" do login aceita tanto admin quanto moderador — mesmo painel,
    // permissões diferentes (checadas nas rotas do painel, não aqui).
    const wantsAdminTab = role === 'admin';
    const userIsStaff = user.role === 'admin' || user.role === 'moderador';
    if (wantsAdminTab !== userIsStaff) {
      return res.status(403).json({
        error: wantsAdminTab ? 'Esta conta não tem acesso de administração.' : 'Esta é uma conta de administração. Selecione "Admin" para entrar.'
      });
    }

    if (user.status === 'banido') return res.status(403).json({ error: 'Conta banida. Comunique a administração.', contactEmail: CONTACT_EMAIL });
    if (user.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa temporariamente. Comunique a administração.', contactEmail: CONTACT_EMAIL });

    const token = await signToken(user);
    res.json({ ok: true, token, role: user.role, username: user.username });
  } catch (e) {
    console.error('Erro em /api/login:', e);
    res.status(500).json({ error: 'Erro interno ao entrar. Tente novamente.' });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      const secret = await db.getJwtSecret();
      try {
        const payload = jwt.verify(token, secret, { ignoreExpiration: true });
        if (payload.jti && payload.exp) await db.revokeToken(payload.jti, payload.exp * 1000);
      } catch (e) { /* token já inválido, nada a revogar */ }
    }
  } catch (e) {
    console.error('Erro em /api/logout:', e);
  }
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.username, role: req.user.role, status: req.user.status });
});

// ====================== ROTAS: GERAÇÃO ======================
app.post('/api/generate', requireAuth, async (req, res) => {
  const { product, category, diff, platform, weight, dimensions, price, csvText, imageBase64, imageMimeType } = req.body || {};

  if (!product || !String(product).trim()) {
    return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
  }

  const userPrompt = [
    `Produto: ${product}`,
    category ? `Categoria: ${category}` : null,
    diff ? `Diferencial destacado pelo vendedor: ${diff}` : null,
    price ? `Preço: ${price}` : null,
    weight ? `Peso: ${weight}` : null,
    dimensions ? `Dimensões: ${dimensions}` : null,
    `Plataforma de destino: ${platform || 'Geral (TikTok, Reels e Shorts)'}`,
    csvText ? `Planilha de especificações do produto (CSV, dados reais fornecidos pelo vendedor):\n${String(csvText).slice(0, 4000)}` : null
  ].filter(Boolean).join('\n');

  const image = imageBase64 ? { base64: imageBase64, mimeType: imageMimeType } : null;

  try {
    const clean = await callAI(userPrompt, image);
    const parsed = JSON.parse(clean);

    await db.insertLog({
      userId: req.user.id, username: req.user.username,
      product: String(product).slice(0, 120), platform: platform || 'Geral',
      ts: Date.now(), result: parsed
    });

    res.json(parsed);
  } catch (err) {
    console.error('Erro interno:', err);
    res.status(502).json({ error: err.friendly || 'Erro interno ao gerar o roteiro. Tente novamente.' });
  }
});

// Histórico pessoal do afiliado logado. Busca por texto no nome do produto via ?q= e
// limite via ?limit= (padrão 100, máximo 300).
app.get('/api/history', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 300);
  const items = await db.getUserHistory(req.user.id, { q, limit });
  res.json({
    ok: true, total: items.length,
    items: items.map((l) => ({ id: l.id, product: l.product, platform: l.platform, ts: l.ts, result: l.result || null }))
  });
});

// ====================== ROTAS: ADMIN ======================
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

app.get('/api/admin/overview', requireAuth, requireStaff, async (req, res) => {
  const now = Date.now();
  const todayKey = dayKey(now);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * 86400000));
  const since = now - 14 * 86400000;

  const [affiliates, recentLogs, generationsTotal] = await Promise.all([
    db.listAffiliates(),
    db.getRecentLogsForBI(since),
    db.countAllLogs()
  ]);

  const perDay = Object.fromEntries(days.map((k) => [k, 0]));
  let totalToday = 0;
  for (const log of recentLogs) {
    const k = dayKey(log.ts);
    if (k in perDay) perDay[k]++;
    if (k === todayKey) totalToday++;
  }

  const users = await Promise.all(affiliates.map(async (u) => {
    const logsForUser = recentLogs.filter((l) => l.userId === u.id);
    const last7 = logsForUser.filter((l) => now - l.ts <= 7 * 86400000).length;
    const today = logsForUser.filter((l) => dayKey(l.ts) === todayKey).length;
    const lastLog = logsForUser.length ? logsForUser[logsForUser.length - 1] : null;
    const uDays = {};
    for (const l of logsForUser) { const k = dayKey(l.ts); if (days.includes(k)) uDays[k] = (uDays[k] || 0) + 1; }
    const total = await db.countLogsForUser(u.id);
    return {
      id: u.id, username: u.username, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt,
      online: u.lastSeenAt ? (now - u.lastSeenAt <= ONLINE_WINDOW_MS) : false,
      total, today, last7,
      lastActivity: lastLog ? lastLog.ts : null,
      lastProduct: lastLog ? lastLog.product : null,
      spark: days.map((k) => uDays[k] || 0)
    };
  }));

  users.sort((a, b) => b.total - a.total);

  const onlyAffiliates = affiliates.filter((u) => u.role === 'afiliado');

  res.json({
    ok: true,
    myRole: req.user.role,
    summary: {
      totalAffiliates: onlyAffiliates.length,
      totalModerators: affiliates.filter((u) => u.role === 'moderador').length,
      active: onlyAffiliates.filter((u) => u.status === 'ativo').length,
      suspended: affiliates.filter((u) => u.status === 'suspenso').length,
      banned: affiliates.filter((u) => u.status === 'banido').length,
      online: users.filter((u) => u.online).length,
      generationsToday: totalToday,
      generationsTotal
    },
    perDay: days.map((k) => ({ day: k, count: perDay[k] })),
    users
  });
});

app.post('/api/admin/users/:id/status', requireAuth, requireStaff, async (req, res) => {
  const { status } = req.body || {};
  if (!['ativo', 'suspenso', 'banido'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use: ativo, suspenso ou banido.' });
  }
  const user = await db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Afiliado não encontrado.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Não é possível alterar o status de um administrador.' });
  // Moderador só pode agir sobre afiliados comuns — não sobre outro moderador.
  if (req.user.role === 'moderador' && user.role !== 'afiliado') {
    return res.status(403).json({ error: 'Moderadores só podem agir sobre afiliados.' });
  }

  await db.updateUserStatus(user.id, status);
  res.json({ ok: true, id: user.id, status });
});

// Promove um afiliado a moderador, ou rebaixa um moderador de volta a afiliado.
// Restrito a administradores — mudar a hierarquia da equipe é sensível demais para moderador.
app.post('/api/admin/users/:id/role', requireAuth, requireSuperAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!['afiliado', 'moderador'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido. Use: afiliado ou moderador.' });
  }
  const user = await db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Não é possível alterar o papel de um administrador.' });

  await db.updateUserRole(user.id, role);
  res.json({ ok: true, id: user.id, role });
});

// Remove a conta definitivamente. Restrito a administradores. O histórico de gerações
// da pessoa continua registrado (com o nome guardado no próprio log), só a conta some.
app.delete('/api/admin/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const user = await db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Não é possível remover uma conta de administrador.' });

  await db.deleteUser(user.id);
  res.json({ ok: true, id: user.id });
});

// Admin cria um afiliado manualmente, sem passar pelo código de acesso (ele já está
// autenticado como admin) — útil pra dar acesso direto sem depender do time se registrar.
app.post('/api/admin/users', requireAuth, requireStaff, async (req, res) => {
  try {
    const { email, username, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanUser = String(username || '').trim();

    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Informe um email válido.' });
    if (!USERNAME_RE.test(cleanUser)) return res.status(400).json({ error: 'Usuário deve ter de 3 a 24 caracteres (letras, números, ponto, hífen ou underline).' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    if (await db.findUserByUsername(cleanUser)) return res.status(409).json({ error: 'Este nome de usuário já existe.' });
    if (await db.findUserByEmail(cleanEmail)) return res.status(409).json({ error: 'Este email já está registrado.' });

    const user = await db.createUser({ email: cleanEmail, username: cleanUser, passHash: hashPassword(password), role: 'afiliado', status: 'ativo', createdByAdmin: true });
    res.json({ ok: true, id: user.id, username: user.username });
  } catch (e) {
    console.error('Erro em /api/admin/users:', e);
    res.status(500).json({ error: 'Erro interno ao criar afiliado.' });
  }
});

app.get('/api/admin/logs', requireAuth, requireStaff, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 500);
  const userId = req.query.userId || null;
  const q = String(req.query.q || '').trim();
  const logs = await db.getAdminLogs({ q, userId, limit });
  res.json({ ok: true, logs });
});

// Testa cada provedor de IA configurado individualmente (chamada leve, poucos tokens),
// pra o admin ver rapidamente quem está no ar sem precisar gerar um roteiro completo.
app.get('/api/admin/test-ai', requireAuth, requireStaff, async (req, res) => {
  const providers = [
    { name: 'Gemini', envVar: 'GEMINI_API_KEY', configured: !!GEMINI_API_KEY, fn: testGemini },
    { name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', configured: !!OPENROUTER_API_KEY, fn: testOpenRouter },
    { name: 'Groq', envVar: 'GROQ_API_KEY', configured: !!GROQ_API_KEY, fn: testGroq },
    { name: 'Cerebras', envVar: 'CEREBRAS_API_KEY', configured: !!CEREBRAS_API_KEY, fn: testCerebras },
    { name: 'Mistral', envVar: 'MISTRAL_API_KEY', configured: !!MISTRAL_API_KEY, fn: testMistral },
    { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', configured: !!ANTHROPIC_API_KEY, fn: testAnthropic }
  ];

  const results = await Promise.all(providers.map(async (p) => {
    if (!p.configured) return { name: p.name, configured: false, ok: false, message: `Sem ${p.envVar} configurada.` };
    const start = Date.now();
    try {
      const reply = await p.fn();
      return { name: p.name, configured: true, ok: true, latencyMs: Date.now() - start, message: reply.slice(0, 100) };
    } catch (e) {
      return { name: p.name, configured: true, ok: false, latencyMs: Date.now() - start, message: String(e.message || e).slice(0, 220) };
    }
  }));

  res.json({ ok: true, results });
});

// Exporta uma planilha (CSV) com todos os usuários — afiliados, moderadores e admins —
// e suas estatísticas de geração. Abre direto no Excel/Google Sheets.
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const ROLE_LABEL = { admin: 'Admin', moderador: 'Moderador', afiliado: 'Afiliado' };

app.get('/api/admin/export', requireAuth, requireStaff, async (req, res) => {
  try {
    const users = await db.listAllUsers();
    const rows = await Promise.all(users.map(async (u) => {
      const total = await db.countLogsForUser(u.id);
      return [
        u.username, u.email, ROLE_LABEL[u.role] || u.role, u.status,
        new Date(u.createdAt).toLocaleDateString('pt-BR'),
        total,
        u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString('pt-BR') : ''
      ];
    }));

    const header = ['Usuário', 'Email', 'Papel', 'Status', 'Criado em', 'Gerações totais', 'Última atividade'];
    const csvLines = [header, ...rows].map((row) => row.map(csvEscape).join(';'));
    const csv = '\uFEFF' + csvLines.join('\r\n'); // BOM ajuda o Excel a ler acentos corretamente

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="afiliados-roteiro-do-dia-${dayKey(Date.now())}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('Erro em /api/admin/export:', e);
    res.status(500).json({ error: 'Erro ao gerar a planilha.' });
  }
});

// ====================== INICIALIZAÇÃO ======================
// Prepara o banco (tabelas + admin inicial). Chamado tanto ao rodar este arquivo
// sozinho (standalone) quanto quando montado dentro de outro servidor Express
// (ex: o Velocita Global CRM, em /roteiro-do-dia).
async function init() {
  await db.init();
  await seedAdmin();
  db.cleanupExpiredRevocations().catch(() => {});
}

module.exports = { app, init };

// Se este arquivo for executado diretamente (node server.js), sobe seu próprio
// servidor na porta configurada — continua funcionando como projeto standalone.
if (require.main === module) {
  (async () => {
    try {
      await init();
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`Roteiro do Dia rodando em http://localhost:${PORT}`);
      });
    } catch (e) {
      console.error('Falha ao iniciar o servidor:', e);
      process.exit(1);
    }
  })();
}
