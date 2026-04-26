const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');
const db = require('./firebase');

const app = express();
const PORT = process.env.PORT || 3000;

const CHANNELS_FILE = path.join(__dirname, 'canais.json');
const USERS_FILE = path.join(__dirname, 'usuarios.json');

// Cache simples para reduzir leituras no Firebase
// Diminui erro de cota quando muita gente abre o site.
const CACHE_TTL = 1000 * 60; // 1 minuto
const cache = {};

function getCache(key) {
  const item = cache[key];
  if (!item || !item.data) return null;
  if (Date.now() - item.time > CACHE_TTL) return null;
  return item.data;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

function clearCache(prefix) {
  Object.keys(cache).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete cache[key];
    }
  });
}

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'visionplay_sessao_secreta_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  extensions: false
}));

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    }

    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Erro ao ler ${filePath}:`, error.message);
    return [];
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  if (req.session.user.tipo !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao admin.' });
  }

  next();
}

function fetchRemote(url, callback) {
  const client = url.startsWith('https://') ? https : http;

  client.get(url, (remoteRes) => {
    callback(null, remoteRes);
  }).on('error', (error) => {
    callback(error);
  });
}

function buildAbsoluteUrl(baseUrl, relativePath) {
  try {
    return new URL(relativePath, baseUrl).toString();
  } catch (error) {
    return relativePath;
  }
}

/* =========================
   TIKTOK - CONFIGURAÇÃO
========================= */

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const TIKTOK_REDIRECT_URI =
  process.env.TIKTOK_REDIRECT_URI ||
  'https://cinezor.onrender.com/auth/tiktok/callback';

function tiktokEstaConfigurado() {
  return Boolean(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REDIRECT_URI);
}

function criarStateTikTok() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

app.get('/proxy-hls', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('URL não informada.');
  }

  fetchRemote(targetUrl, (error, remoteRes) => {
    if (error) {
      console.error('Erro ao buscar playlist HLS:', error.message);
      return res.status(500).send('Erro ao carregar playlist.');
    }

    if (remoteRes.statusCode >= 400) {
      return res.status(remoteRes.statusCode).send('Erro ao carregar playlist.');
    }

    let data = '';

    remoteRes.on('data', (chunk) => {
      data += chunk.toString();
    });

    remoteRes.on('end', () => {
      const lines = data.split('\n');

      const rewritten = lines.map((line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }

        const absoluteUrl = buildAbsoluteUrl(targetUrl, trimmed);

        if (absoluteUrl.includes('.m3u8')) {
          return `/proxy-hls?url=${encodeURIComponent(absoluteUrl)}`;
        }

        return `/proxy-segment?url=${encodeURIComponent(absoluteUrl)}`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(rewritten.join('\n'));
    });
  });
});

app.get('/proxy-segment', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('URL não informada.');
  }

  fetchRemote(targetUrl, (error, remoteRes) => {
    if (error) {
      console.error('Erro ao buscar segmento:', error.message);
      return res.status(500).send('Erro ao carregar segmento.');
    }

    if (remoteRes.statusCode >= 400) {
      return res.status(remoteRes.statusCode).send('Erro ao carregar segmento.');
    }

    const contentType = remoteRes.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    remoteRes.pipe(res);
  });
});

/* =========================
   LOGIN
========================= */

app.post('/api/login', async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Preencha usuário e senha.' });
  }

  const users = readJson(USERS_FILE);
  const userIndex = users.findIndex((user) => user.usuario === usuario);

  if (userIndex === -1) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  const foundUser = users[userIndex];
  let senhaValida = false;

  if (typeof foundUser.senha === 'string' && foundUser.senha.startsWith('$2')) {
    senhaValida = await bcrypt.compare(senha, foundUser.senha);
  } else {
    senhaValida = foundUser.senha === senha;

    if (senhaValida) {
      users[userIndex].senha = await bcrypt.hash(senha, 10);
      saveJson(USERS_FILE, users);
    }
  }

  if (!senhaValida) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  req.session.user = {
    id: foundUser.id,
    usuario: foundUser.usuario,
    tipo: foundUser.tipo
  };

  res.json({
    message: 'Login realizado com sucesso.',
    tipo: foundUser.tipo,
    usuario: foundUser.usuario
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logout realizado com sucesso.' });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    id: req.session.user.id,
    usuario: req.session.user.usuario,
    tipo: req.session.user.tipo
  });
});

/* =========================
   CADASTRO E RECUPERAÇÃO
========================= */

app.post('/api/register', async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Preencha usuário e senha.' });
  }

  if (usuario.trim().length < 3) {
    return res.status(400).json({ error: 'O usuário deve ter pelo menos 3 caracteres.' });
  }

  if (senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const users = readJson(USERS_FILE);

  const existe = users.find((user) => user.usuario.toLowerCase() === usuario.toLowerCase());
  if (existe) {
    return res.status(400).json({ error: 'Esse usuário já existe.' });
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  users.push({
    id: Date.now(),
    usuario: usuario.trim(),
    senha: senhaHash,
    tipo: 'cliente'
  });

  saveJson(USERS_FILE, users);

  res.status(201).json({ message: 'Conta criada com sucesso.' });
});

app.post('/api/reset-password', async (req, res) => {
  const { usuario, novaSenha } = req.body;

  if (!usuario || !novaSenha) {
    return res.status(400).json({ error: 'Preencha usuário e nova senha.' });
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  const users = readJson(USERS_FILE);
  const index = users.findIndex((user) => user.usuario === usuario);

  if (index === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  users[index].senha = await bcrypt.hash(novaSenha, 10);
  saveJson(USERS_FILE, users);

  res.json({ message: 'Senha redefinida com sucesso.' });
});

/* =========================
   USUÁRIOS
========================= */

app.get('/api/usuarios', requireAdmin, (req, res) => {
  const users = readJson(USERS_FILE).map((user) => ({
    id: user.id,
    usuario: user.usuario,
    tipo: user.tipo
  }));

  res.json(users);
});

app.post('/api/usuarios', requireAdmin, async (req, res) => {
  const { usuario, senha, tipo } = req.body;

  if (!usuario || !senha || !tipo) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  const users = readJson(USERS_FILE);

  const existe = users.find((user) => user.usuario.toLowerCase() === usuario.toLowerCase());
  if (existe) {
    return res.status(400).json({ error: 'Esse usuário já existe.' });
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  users.push({
    id: Date.now(),
    usuario: usuario.trim(),
    senha: senhaHash,
    tipo
  });

  saveJson(USERS_FILE, users);

  res.status(201).json({ message: 'Usuário criado com sucesso.' });
});

app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const users = readJson(USERS_FILE);

  const filtered = users.filter((u) => u.id !== id);
  saveJson(USERS_FILE, filtered);

  res.json({ message: 'Usuário removido com sucesso.' });
});

/* =========================
   CONTEÚDOS - FIRESTORE COM PAGINAÇÃO
========================= */

app.get('/api/canais', requireAuth, async (req, res) => {
  try {
    const limite = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor || '';
    const cacheKey = `canais_${limite}_${cursor}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let query = db.collection('canais')
      .orderBy('criadoEm', 'desc')
      .limit(limite);

    if (cursor) {
      query = db.collection('canais')
        .orderBy('criadoEm', 'desc')
        .startAfter(cursor)
        .limit(limite);
    }

    const snapshot = await query.get();

    const canais = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        trailerUrl: data.trailerUrl || data.url || '',
        videoUrl: data.videoUrl || '',
        criadoEm: data.criadoEm || ''
      };
    });

    const ultimo = canais.length ? canais[canais.length - 1].criadoEm : null;
    const resposta = {
      items: canais,
      nextCursor: canais.length === limite ? ultimo : null,
      hasMore: canais.length === limite
    };

    setCache(cacheKey, resposta);
    res.json(resposta);
  } catch (error) {
    console.error('Erro ao listar conteúdos:', error);
    res.status(500).json({ error: 'Erro ao listar conteúdos.' });
  }
});

app.post('/api/canais', requireAdmin, async (req, res) => {
  try {
    const {
      nome,
      categoria,
      trailerUrl,
      videoUrl,
      url,
      logo,
      sinopse,
      oficial
    } = req.body;

    const trailerFinal = trailerUrl || url || '';
    const videoFinal = videoUrl || '';

    if (!nome || !categoria || (!trailerFinal && !videoFinal)) {
      return res.status(400).json({
        error: 'Os campos nome, categoria e pelo menos um entre trailer ou vídeo são obrigatórios.'
      });
    }

    const novoCanal = {
      nome,
      categoria,
      trailerUrl: trailerFinal,
      videoUrl: videoFinal,
      url: trailerFinal,
      logo: logo || '',
      sinopse: sinopse || '',
      oficial: oficial || '',
      status: 'online',
      criadoEm: new Date().toISOString()
    };

    const docRef = await db.collection('canais').add(novoCanal);
    clearCache('canais');

    res.status(201).json({
      message: 'Conteúdo adicionado com sucesso.',
      id: docRef.id
    });
  } catch (error) {
    console.error('Erro ao adicionar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao adicionar conteúdo.' });
  }
});

app.put('/api/canais/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const docRef = db.collection('canais').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Conteúdo não encontrado.' });
    }

    const atual = docSnap.data();

    const trailerFinal =
      req.body.trailerUrl !== undefined
        ? req.body.trailerUrl
        : (req.body.url !== undefined ? req.body.url : (atual.trailerUrl || atual.url || ''));

    const videoFinal =
      req.body.videoUrl !== undefined
        ? req.body.videoUrl
        : (atual.videoUrl || '');

    const atualizado = {
      ...atual,
      ...req.body,
      trailerUrl: trailerFinal || '',
      videoUrl: videoFinal || '',
      url: trailerFinal || '',
      logo: req.body.logo ?? atual.logo ?? '',
      sinopse: req.body.sinopse ?? atual.sinopse ?? '',
      oficial: req.body.oficial ?? atual.oficial ?? ''
    };

    if (!atualizado.nome || !atualizado.categoria || (!atualizado.trailerUrl && !atualizado.videoUrl)) {
      return res.status(400).json({
        error: 'Os campos nome, categoria e pelo menos um entre trailer ou vídeo são obrigatórios.'
      });
    }

    await docRef.set(atualizado);
    clearCache('canais');

    res.json({ message: 'Conteúdo atualizado com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao atualizar conteúdo.' });
  }
});

app.delete('/api/canais/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('canais').doc(id).delete();
    clearCache('canais');

    res.json({ message: 'Conteúdo removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover conteúdo:', error);
    res.status(500).json({ error: 'Erro ao remover conteúdo.' });
  }
});

/* =========================
   LIVROS - FIRESTORE COM PAGINAÇÃO
========================= */

app.get('/api/livros', requireAuth, async (req, res) => {
  try {
    const limite = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor || '';
    const cacheKey = `livros_${limite}_${cursor}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let query = db.collection('livros')
      .orderBy('criadoEm', 'desc')
      .limit(limite);

    if (cursor) {
      query = db.collection('livros')
        .orderBy('criadoEm', 'desc')
        .startAfter(cursor)
        .limit(limite);
    }

    const snapshot = await query.get();

    const livros = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        titulo: data.titulo || '',
        autor: data.autor || '',
        categoria: data.categoria || '',
        capa: data.capa || '',
        descricao: data.descricao || '',
        link: data.link || '',
        status: data.status || 'online',
        criadoEm: data.criadoEm || ''
      };
    });

    const ultimo = livros.length ? livros[livros.length - 1].criadoEm : null;
    const resposta = {
      items: livros,
      nextCursor: livros.length === limite ? ultimo : null,
      hasMore: livros.length === limite
    };

    setCache(cacheKey, resposta);
    res.json(resposta);
  } catch (error) {
    console.error('Erro ao listar livros:', error);
    res.status(500).json({ error: 'Erro ao listar livros.' });
  }
});

app.post('/api/livros', requireAdmin, async (req, res) => {
  try {
    const {
      titulo,
      autor,
      categoria,
      capa,
      descricao,
      link
    } = req.body;

    if (!titulo || !autor || !categoria || !link) {
      return res.status(400).json({
        error: 'Os campos título, autor, categoria e link são obrigatórios.'
      });
    }

    const novoLivro = {
      titulo: titulo.trim(),
      autor: autor.trim(),
      categoria: categoria.trim(),
      capa: capa || '',
      descricao: descricao || '',
      link: link.trim(),
      status: 'online',
      criadoEm: new Date().toISOString()
    };

    const docRef = await db.collection('livros').add(novoLivro);
    clearCache('livros');

    res.status(201).json({
      message: 'Livro adicionado com sucesso.',
      id: docRef.id
    });
  } catch (error) {
    console.error('Erro ao adicionar livro:', error);
    res.status(500).json({ error: 'Erro ao adicionar livro.' });
  }
});

app.put('/api/livros/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const docRef = db.collection('livros').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Livro não encontrado.' });
    }

    const atual = docSnap.data();

    const atualizado = {
      ...atual,
      ...req.body,
      titulo: req.body.titulo ?? atual.titulo ?? '',
      autor: req.body.autor ?? atual.autor ?? '',
      categoria: req.body.categoria ?? atual.categoria ?? '',
      capa: req.body.capa ?? atual.capa ?? '',
      descricao: req.body.descricao ?? atual.descricao ?? '',
      link: req.body.link ?? atual.link ?? '',
      status: req.body.status ?? atual.status ?? 'online'
    };

    if (!atualizado.titulo || !atualizado.autor || !atualizado.categoria || !atualizado.link) {
      return res.status(400).json({
        error: 'Os campos título, autor, categoria e link são obrigatórios.'
      });
    }

    await docRef.set(atualizado);
    clearCache('livros');

    res.json({ message: 'Livro atualizado com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar livro:', error);
    res.status(500).json({ error: 'Erro ao atualizar livro.' });
  }
});

app.delete('/api/livros/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('livros').doc(id).delete();
    clearCache('livros');

    res.json({ message: 'Livro removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover livro:', error);
    res.status(500).json({ error: 'Erro ao remover livro.' });
  }
});

/* =========================
   SALAS - ASSISTIR COM AMIGOS
========================= */

app.post('/api/salas/:roomId', requireAuth, async (req, res) => {
  try {
    const { nome, videoUrl } = req.body;
    const roomId = req.params.roomId;

    if (!nome || !videoUrl) {
      return res.status(400).json({ error: 'Nome e vídeo são obrigatórios.' });
    }

    await db.collection('watchRooms').doc(roomId).set({
      nome,
      videoUrl,
      isPlaying: false,
      currentTime: 0,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    }, { merge: true });

    res.json({ message: 'Sala criada com sucesso.' });
  } catch (error) {
    console.error('Erro ao criar sala:', error);
    res.status(500).json({ error: 'Erro ao criar sala.' });
  }
});

app.get('/api/salas/:roomId', requireAuth, async (req, res) => {
  try {
    const doc = await db.collection('watchRooms').doc(req.params.roomId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Erro ao buscar sala:', error);
    res.status(500).json({ error: 'Erro ao buscar sala.' });
  }
});

app.post('/api/salas/:roomId/status', requireAuth, async (req, res) => {
  try {
    await db.collection('watchRooms').doc(req.params.roomId).set({
      isPlaying: !!req.body.isPlaying,
      currentTime: Number(req.body.currentTime) || 0,
      atualizadoEm: new Date().toISOString()
    }, { merge: true });

    res.json({ message: 'Status atualizado.' });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
});

app.post('/api/salas/:roomId/entrar', requireAuth, async (req, res) => {
  try {
    await db.collection('watchRooms')
      .doc(req.params.roomId)
      .collection('online')
      .doc(String(req.session.user.id))
      .set({
        nome: req.session.user.usuario || 'Convidado',
        userId: req.session.user.id,
        entrouEm: new Date().toISOString(),
        ultimoPing: new Date().toISOString()
      }, { merge: true });

    res.json({ message: 'Entrou na sala.' });
  } catch (error) {
    console.error('Erro ao entrar na sala:', error);
    res.status(500).json({ error: 'Erro ao entrar na sala.' });
  }
});

app.get('/api/salas/:roomId/online', requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('watchRooms')
      .doc(req.params.roomId)
      .collection('online')
      .get();

    const online = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(online);
  } catch (error) {
    console.error('Erro ao listar online:', error);
    res.status(500).json({ error: 'Erro ao listar online.' });
  }
});

app.post('/api/salas/:roomId/chat', requireAuth, async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    await db.collection('watchRooms')
      .doc(req.params.roomId)
      .collection('chat')
      .add({
        nome: req.session.user.usuario || 'Convidado',
        texto: texto.trim(),
        criadoEm: new Date().toISOString()
      });

    res.json({ message: 'Mensagem enviada.' });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

app.get('/api/salas/:roomId/chat', requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('watchRooms')
      .doc(req.params.roomId)
      .collection('chat')
      .orderBy('criadoEm', 'asc')
      .limit(80)
      .get();

    const mensagens = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(mensagens);
  } catch (error) {
    console.error('Erro ao buscar chat:', error);
    res.status(500).json({ error: 'Erro ao buscar chat.' });
  }
});

/* =========================
   TIKTOK - ROTAS
========================= */

/*
  Essas rotas deixam o Cinezor preparado para integração com TikTok.
  Para funcionar de verdade, adicione no Render:
  TIKTOK_CLIENT_KEY
  TIKTOK_CLIENT_SECRET
  TIKTOK_REDIRECT_URI

  O app também precisa estar aprovado no TikTok Developers.
*/

app.get('/auth/tiktok', requireAdmin, (req, res) => {
  try {
    if (!tiktokEstaConfigurado()) {
      return res.status(400).send(`
        <h2>TikTok ainda não configurado</h2>
        <p>Adicione TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e TIKTOK_REDIRECT_URI no Render.</p>
        <p>Depois tente conectar novamente.</p>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    const state = criarStateTikTok();
    req.session.tiktokState = state;

    const params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      redirect_uri: TIKTOK_REDIRECT_URI,
      state
    });

    return res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
  } catch (error) {
    console.error('Erro ao iniciar login TikTok:', error);
    return res.status(500).send('Erro ao conectar com TikTok.');
  }
});

app.get('/auth/tiktok/callback', requireAdmin, async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <h2>TikTok retornou erro</h2>
        <p>${error_description || error}</p>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <h2>Código TikTok não recebido</h2>
        <p>Tente conectar novamente.</p>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    if (!state || state !== req.session.tiktokState) {
      return res.status(400).send(`
        <h2>Validação de segurança falhou</h2>
        <p>O state do TikTok não bateu com a sessão.</p>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    if (!tiktokEstaConfigurado()) {
      return res.status(400).send(`
        <h2>TikTok ainda não configurado</h2>
        <p>Adicione as variáveis no Render e tente de novo.</p>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    const body = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_REDIRECT_URI
    });

    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Erro ao pegar token TikTok:', tokenData);
      return res.status(400).send(`
        <h2>Erro ao conectar TikTok</h2>
        <p>Não foi possível gerar o token.</p>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
        <a href="/admin.html">Voltar ao painel</a>
      `);
    }

    req.session.tiktok = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      openId: tokenData.open_id,
      expiresIn: tokenData.expires_in,
      conectadoEm: new Date().toISOString()
    };

    delete req.session.tiktokState;

    return res.send(`
      <h2>TikTok conectado com sucesso ✅</h2>
      <p>Agora o Cinezor está autorizado a usar a conta TikTok conectada.</p>
      <a href="/admin.html">Voltar ao painel</a>
    `);
  } catch (error) {
    console.error('Erro no callback TikTok:', error);
    return res.status(500).send('Erro ao finalizar conexão com TikTok.');
  }
});

app.get('/api/tiktok/status', requireAdmin, (req, res) => {
  res.json({
    configurado: tiktokEstaConfigurado(),
    conectado: Boolean(req.session.tiktok && req.session.tiktok.accessToken),
    aprovado: false,
    message: req.session.tiktok?.accessToken
      ? 'TikTok conectado nesta sessão.'
      : 'TikTok ainda não conectado.'
  });
});

app.post('/api/tiktok/postar', requireAdmin, async (req, res) => {
  try {
    if (!req.session.tiktok || !req.session.tiktok.accessToken) {
      return res.status(401).json({
        error: 'Conecte sua conta TikTok antes de postar.'
      });
    }

    /*
      Esta rota está preparada para a próxima etapa.
      Para publicar vídeo de verdade, ainda vamos precisar:
      1. Receber ou hospedar o MP4 do corte.
      2. Gerar uma URL pública do vídeo ou upload binário.
      3. Chamar a Content Posting API do TikTok.
      4. Usar video.publish após aprovação do app.
    */

    return res.status(202).json({
      message: 'TikTok conectado. A publicação automática será ativada depois da aprovação final e configuração do envio de vídeo.'
    });
  } catch (error) {
    console.error('Erro ao postar no TikTok:', error);
    res.status(500).json({ error: 'Erro ao postar no TikTok.' });
  }
});

/* =========================
   PÁGINAS PROTEGIDAS
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/cliente.html', requireAuth, (req, res) => {
  if (req.session.user.tipo !== 'cliente') {
    return res.redirect('/admin.html');
  }

  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

app.get('/sala.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sala.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
