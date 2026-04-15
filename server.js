const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const http = require('http');
const https = require('https');

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
    secure: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Lê arquivo JSON e garante que ele exista
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

// Salva dados no arquivo JSON
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Exige usuário logado
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  next();
}

// Exige admin logado
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
   PROXY PARA STREAMS HTTP
========================= */
app.get('/proxy-stream', (req, res) => {
  const streamUrl = req.query.url;

  if (!streamUrl) {
    return res.status(400).send('URL não informada.');
  }

  const client = streamUrl.startsWith('https://') ? https : http;

  client.get(streamUrl, (streamRes) => {
    if (streamRes.statusCode >= 400) {
      return res.status(streamRes.statusCode).send('Erro ao carregar stream.');
    }

    // libera acesso
    res.setHeader('Access-Control-Allow-Origin', '*');

    // repassa content-type do stream original
    const contentType = streamRes.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    streamRes.pipe(res);
  }).on('error', (error) => {
    console.error('Erro no proxy:', error.message);
    res.status(500).send('Erro ao processar proxy.');
  });
});

/* =========================
   LOGIN
========================= */
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;
  const users = readJson(USERS_FILE);

  const foundUser = users.find(
    (user) => user.usuario === usuario && user.senha === senha
  );

  if (!foundUser) {
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

app.post('/api/usuarios', requireAdmin, (req, res) => {
  const { usuario, senha, tipo } = req.body;

  if (!usuario || !senha || !tipo) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  const users = readJson(USERS_FILE);

  users.push({
    id: Date.now(),
    usuario,
    senha,
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
   CONTEÚDOS
========================= */
app.get('/api/canais', requireAuth, (req, res) => {
  res.json(readJson(CHANNELS_FILE));
});

app.post('/api/canais', requireAdmin, (req, res) => {
  const { nome, categoria, url, logo } = req.body;

  if (!nome || !categoria || !url) {
    return res.status(400).json({
      error: 'Os campos nome, categoria e url são obrigatórios.'
    });
  }

  const channels = readJson(CHANNELS_FILE);

  const newChannel = {
    id: Date.now(),
    nome,
    categoria,
    url,
    logo: logo || '',
    status: 'online',
    criadoEm: new Date().toISOString()
  };

  channels.push(newChannel);
  saveJson(CHANNELS_FILE, channels);

  res.status(201).json({
    message: 'Conteúdo adicionado com sucesso.'
  });
});

app.put('/api/canais/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const channels = readJson(CHANNELS_FILE);

  const index = channels.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }

  channels[index] = {
    ...channels[index],
    ...req.body
  };

  saveJson(CHANNELS_FILE, channels);

  res.json({ message: 'Conteúdo atualizado com sucesso.' });
});

app.delete('/api/canais/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const channels = readJson(CHANNELS_FILE);

  const filtered = channels.filter((c) => c.id !== id);
  saveJson(CHANNELS_FILE, filtered);

  res.json({ message: 'Conteúdo removido com sucesso.' });
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