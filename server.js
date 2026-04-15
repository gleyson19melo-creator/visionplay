const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');

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

  // Caso novo: senha com hash bcrypt
  if (typeof foundUser.senha === 'string' && foundUser.senha.startsWith('$2')) {
    senhaValida = await bcrypt.compare(senha, foundUser.senha);
  } else {
    // Caso antigo: senha salva em texto puro
    senhaValida = foundUser.senha === senha;

    // Migra automaticamente para hash se login antigo deu certo
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
   CONTEÚDOS
========================= */

app.get('/api/canais', requireAuth, (req, res) => {
  res.json(readJson(CHANNELS_FILE));
});

app.post('/api/canais', requireAdmin, (req, res) => {
  const { nome, categoria, url, logo, sinopse, oficial } = req.body;

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
    sinopse: sinopse || '',
    oficial: oficial || '',
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
    ...req.body,
    logo: req.body.logo ?? channels[index].logo,
    sinopse: req.body.sinopse ?? channels[index].sinopse,
    oficial: req.body.oficial ?? channels[index].oficial
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