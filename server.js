const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

const CHANNELS_FILE = path.join(__dirname, 'canais.json');
const USERS_FILE = path.join(__dirname, 'usuarios.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'visionplay_sessao_secreta_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

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

/* =========================
   LOGIN / LOGOUT / SESSÃO
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

app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Sem sessão ativa.' });
  }

  res.json({
    usuario: req.session.user.usuario,
    tipo: req.session.user.tipo
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
    return res.status(400).json({
      error: 'Os campos usuário, senha e tipo são obrigatórios.'
    });
  }

  const users = readJson(USERS_FILE);

  const userExists = users.some(
    (user) => user.usuario.toLowerCase() === String(usuario).trim().toLowerCase()
  );

  if (userExists) {
    return res.status(400).json({
      error: 'Esse usuário já existe.'
    });
  }

  const newUser = {
    id: Date.now(),
    usuario: String(usuario).trim(),
    senha: String(senha).trim(),
    tipo: String(tipo).trim().toLowerCase()
  };

  users.push(newUser);
  saveJson(USERS_FILE, users);

  res.status(201).json({
    message: 'Usuário adicionado com sucesso.',
    usuario: {
      id: newUser.id,
      usuario: newUser.usuario,
      tipo: newUser.tipo
    }
  });
});

app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const users = readJson(USERS_FILE);

  const userToDelete = users.find((user) => user.id === id);

  if (!userToDelete) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (userToDelete.tipo === 'admin') {
    return res.status(400).json({
      error: 'Não é permitido excluir um usuário admin por aqui.'
    });
  }

  const filtered = users.filter((user) => user.id !== id);
  saveJson(USERS_FILE, filtered);

  res.json({ message: 'Usuário removido com sucesso.' });
});

/* =========================
   CANAIS
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
    nome: String(nome).trim(),
    categoria: String(categoria).trim(),
    url: String(url).trim(),
    logo: logo ? String(logo).trim() : '',
    status: 'online',
    criadoEm: new Date().toISOString()
  };

  channels.push(newChannel);
  saveJson(CHANNELS_FILE, channels);

  res.status(201).json({
    message: 'Canal adicionado com sucesso.',
    canal: newChannel
  });
});

app.put('/api/canais/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { nome, categoria, url, logo } = req.body;

  if (!nome || !categoria || !url) {
    return res.status(400).json({
      error: 'Os campos nome, categoria e url são obrigatórios.'
    });
  }

  const channels = readJson(CHANNELS_FILE);
  const index = channels.findIndex((channel) => channel.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Canal não encontrado.' });
  }

  channels[index] = {
    ...channels[index],
    nome: String(nome).trim(),
    categoria: String(categoria).trim(),
    url: String(url).trim(),
    logo: logo ? String(logo).trim() : '',
    atualizadoEm: new Date().toISOString()
  };

  saveJson(CHANNELS_FILE, channels);

  res.json({
    message: 'Canal atualizado com sucesso.',
    canal: channels[index]
  });
});

app.delete('/api/canais/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const channels = readJson(CHANNELS_FILE);
  const filtered = channels.filter((channel) => channel.id !== id);

  if (filtered.length === channels.length) {
    return res.status(404).json({ error: 'Canal não encontrado.' });
  }

  saveJson(CHANNELS_FILE, filtered);
  res.json({ message: 'Canal removido com sucesso.' });
});

/* =========================
   PÁGINAS PROTEGIDAS
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  if (req.session.user.tipo !== 'admin') {
    return res.redirect('/cliente.html');
  }

  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/cliente.html', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  if (req.session.user.tipo !== 'cliente') {
    return res.redirect('/admin.html');
  }

  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});