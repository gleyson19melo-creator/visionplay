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

app.use(express.static(path.join(__dirname, 'public')));

// Lê JSON e cria arquivo se não existir
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

// Salva JSON
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Exige login
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  next();
}

// Exige admin
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  if (req.session.user.tipo !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao admin.' });
  }

  next();
}

/* =========================
   FUNÇÕES DO PROXY HLS
========================= */

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
   PROXY HLS COMPLETO
========================= */

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
   CONTEÚDOS - FIRESTORE
========================= */

app.get('/api/canais', requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('canais').get();

    const canais = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        trailerUrl: data.trailerUrl || data.url || '',
        videoUrl: data.videoUrl || ''
      };
    });

    res.json(canais);
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

    res.json({ message: 'Conteúdo removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover conteúdo:', error);
    res.status(500).json({ error: 'Erro ao remover conteúdo.' });
  }
});

/* =========================
   PÁGINAS
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  if (req.session.user.tipo !== 'admin') return res.redirect('/cliente.html');

  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/cliente.html', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  if (req.session.user.tipo !== 'cliente') return res.redirect('/admin.html');

  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});