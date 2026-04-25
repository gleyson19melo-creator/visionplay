// Controla a instância do player HLS
let hlsPlayer = null;

// Faz login no sistema
async function login(event) {
  event.preventDefault();

  const usuario = document.getElementById('loginUser')?.value.trim();
  const senha = document.getElementById('loginPass')?.value.trim();
  const loginMessage = document.getElementById('loginMessage');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    const data = await response.json();

    if (!response.ok) {
      if (loginMessage) {
        loginMessage.textContent = data.error || 'Erro no login.';
        loginMessage.className = 'message error';
      }
      return;
    }

    localStorage.clear();

    if (data.tipo === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/cliente.html';
    }
  } catch (error) {
    if (loginMessage) {
      loginMessage.textContent = 'Erro ao conectar com o servidor.';
      loginMessage.className = 'message error';
    }
  }
}

// =========================
// CADASTRO E ESQUECI SENHA
// =========================
window.abrirCadastro = function () {
  const modal = document.getElementById('cadastroModal');
  if (modal) modal.classList.add('active');
};

window.fecharCadastro = function () {
  const modal = document.getElementById('cadastroModal');
  if (modal) modal.classList.remove('active');
};

window.abrirEsqueciSenha = function () {
  const modal = document.getElementById('forgotModal');
  if (modal) modal.classList.add('active');
};

window.fecharEsqueciSenha = function () {
  const modal = document.getElementById('forgotModal');
  if (modal) modal.classList.remove('active');
};

async function cadastrarCliente(event) {
  event.preventDefault();

  const usuario = document.getElementById('registerUser')?.value.trim();
  const senha = document.getElementById('registerPass')?.value.trim();
  const registerMessage = document.getElementById('registerMessage');

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    const data = await response.json();

    if (!response.ok) {
      if (registerMessage) {
        registerMessage.textContent = data.error || 'Erro ao cadastrar.';
        registerMessage.className = 'message error';
      }
      return;
    }

    if (registerMessage) {
      registerMessage.textContent = data.message || 'Cadastro realizado com sucesso.';
      registerMessage.className = 'message success';
    }

    document.getElementById('registerForm')?.reset();
  } catch (error) {
    if (registerMessage) {
      registerMessage.textContent = 'Erro ao conectar com o servidor.';
      registerMessage.className = 'message error';
    }
  }
}

async function redefinirSenha(event) {
  event.preventDefault();

  const usuario = document.getElementById('forgotUser')?.value.trim();
  const novaSenha = document.getElementById('newPass')?.value.trim();
  const forgotMessage = document.getElementById('forgotMessage');

  try {
    const response = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, novaSenha })
    });

    const data = await response.json();

    if (!response.ok) {
      if (forgotMessage) {
        forgotMessage.textContent = data.error || 'Erro ao redefinir senha.';
        forgotMessage.className = 'message error';
      }
      return;
    }

    if (forgotMessage) {
      forgotMessage.textContent = data.message || 'Senha atualizada com sucesso.';
      forgotMessage.className = 'message success';
    }

    document.getElementById('forgotForm')?.reset();
  } catch (error) {
    if (forgotMessage) {
      forgotMessage.textContent = 'Erro ao conectar com o servidor.';
      forgotMessage.className = 'message error';
    }
  }
}

// Destrói player HLS antigo para evitar conflito
function destroyHls() {
  if (hlsPlayer) {
    hlsPlayer.destroy();
    hlsPlayer = null;
  }
}

// Tenta reproduzir vídeo contornando bloqueio de autoplay
function tryPlay(videoElement) {
  if (!videoElement) return;

  videoElement.muted = true;

  videoElement.play()
    .then(() => {
      videoElement.muted = false;
    })
    .catch((error) => {
      console.log('Erro ao reproduzir vídeo:', error);
    });
}

// Reproduz vídeo ou embed
function playVideoUrl(videoElement, url) {
  const embedFrame = document.getElementById('embedFrame');
  if (!videoElement || !url) return;

  destroyHls();

  if (embedFrame) {
    embedFrame.style.display = 'none';
    embedFrame.src = '';
  }

  videoElement.style.display = 'block';
  videoElement.pause();
  videoElement.removeAttribute('src');

  let finalUrl = url;

  if (url.includes('.m3u8')) {
    finalUrl = `/proxy-hls?url=${encodeURIComponent(url)}`;
  } else if (url.startsWith('http://')) {
    finalUrl = `/proxy-segment?url=${encodeURIComponent(url)}`;
  }

  if (
    url.includes('/embed/') ||
    url.includes('embedplayapi.site') ||
    url.includes('superflixapi.rest') ||
    url.includes('youtube.com/embed/') ||
    url.includes('player.vimeo.com/')

  ) {
    videoElement.style.display = 'none';

    if (embedFrame) {
      embedFrame.style.display = 'block';
      embedFrame.src = url;
    }
    return;
  }

  if (url.includes('.m3u8')) {
    if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = finalUrl;
      videoElement.load();
      tryPlay(videoElement);
    } else if (window.Hls && Hls.isSupported()) {
      hlsPlayer = new Hls();
      hlsPlayer.loadSource(finalUrl);
      hlsPlayer.attachMedia(videoElement);

      hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function () {
        tryPlay(videoElement);
      });

      hlsPlayer.on(Hls.Events.ERROR, function (event, data) {
        console.log('Erro no HLS:', data);
      });
    } else {
      alert('Seu navegador não suporta esse tipo de vídeo.');
    }
    return;
  }

  videoElement.src = finalUrl;
  videoElement.load();
  tryPlay(videoElement);
}

// Faz logout do sistema
async function logout() {
  destroyHls();

  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) { }

  localStorage.clear();
  window.location.href = '/';
}

// Ativa login se estiver na tela inicial
if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', login);
}

if (document.getElementById('registerForm')) {
  document.getElementById('registerForm').addEventListener('submit', cadastrarCliente);
}

if (document.getElementById('forgotForm')) {
  document.getElementById('forgotForm').addEventListener('submit', redefinirSenha);
}

/* =========================
   ÁREA ADMIN
========================= */
if (window.location.pathname.includes('admin.html')) {
  const form = document.getElementById('channelForm');
  const editForm = document.getElementById('editForm');
  const userForm = document.getElementById('userForm');
  const bookForm = document.getElementById('bookForm');
  const editBookForm = document.getElementById('editBookForm');

  const listaCanais = document.getElementById('listaCanais');
  const listaUsuarios = document.getElementById('listaUsuarios');
  const listaLivros = document.getElementById('listaLivros');

  const mensagem = document.getElementById('mensagem');
  const userMessage = document.getElementById('userMessage');
  const bookMessage = document.getElementById('bookMessage');
  const editBookMessage = document.getElementById('editBookMessage');

  const totalCanais = document.getElementById('totalCanais');
  const totalUsuarios = document.getElementById('totalUsuarios');
  const totalLivros = document.getElementById('totalLivros');

  const busca = document.getElementById('busca');
  const buscaLivros = document.getElementById('buscaLivros');

  const playerModal = document.getElementById('playerModal');
  const videoPlayer = document.getElementById('videoPlayer');
  const playerTitle = document.getElementById('playerTitle');
  const editModal = document.getElementById('editModal');
  const editBookModal = document.getElementById('editBookModal');

  let canaisGlobais = [];
  let livrosGlobais = [];

  function showMessage(text, type) {
    if (!mensagem) return;
    mensagem.textContent = text;
    mensagem.className = `message panel-message ${type}`;
  }

  function showUserMessage(text, type) {
    if (!userMessage) return;
    userMessage.textContent = text;
    userMessage.className = `message panel-message ${type}`;
  }

  function showBookMessage(text, type) {
    if (!bookMessage) return;
    bookMessage.textContent = text;
    bookMessage.className = `message panel-message ${type}`;
  }

  function showEditBookMessage(text, type) {
    if (!editBookMessage) return;
    editBookMessage.textContent = text;
    editBookMessage.className = `message panel-message ${type}`;
  }

  function atualizarTotal(canais) {
    if (!totalCanais) return;
    totalCanais.textContent = Array.isArray(canais) ? canais.length : 0;
  }

  function atualizarTotalUsuarios(usuarios) {
    if (!totalUsuarios) return;
    totalUsuarios.textContent = Array.isArray(usuarios) ? usuarios.length : 0;
  }

  function atualizarTotalLivros(livros) {
    if (!totalLivros) return;
    totalLivros.textContent = Array.isArray(livros) ? livros.length : 0;
  }

  function obterTrailerUrl(canal) {
    return canal.trailerUrl || canal.url || '';
  }

  function obterVideoUrl(canal) {
    return canal.videoUrl || '';
  }

  function renderizarCanais(canais) {
    if (!listaCanais) return;

    listaCanais.innerHTML = '';
    atualizarTotal(canaisGlobais);

    if (!Array.isArray(canais) || canais.length === 0) {
      listaCanais.innerHTML = '<div class="empty">Nenhum canal encontrado.</div>';
      return;
    }

    canais.slice().reverse().forEach((canal) => {
      const logo = canal.logo?.trim()
        ? canal.logo
        : 'https://via.placeholder.com/600x340?text=Sem+Logo';

      const nomeSeguro = String(canal.nome || '').replace(/'/g, "\\'");
      const trailerUrl = obterTrailerUrl(canal);
      const videoUrl = obterVideoUrl(canal);
      const trailerSegura = String(trailerUrl || '').replace(/'/g, "\\'");
      const videoSegura = String(videoUrl || '').replace(/'/g, "\\'");
      const canalJson = JSON.stringify(canal).replace(/'/g, "&apos;");

      const botoesAcao = `
        ${trailerUrl ? `<button class="btn btn-watch" onclick="assistirTrailer('${nomeSeguro}', '${trailerSegura}')">Trailer</button>` : ''}
        ${videoUrl ? `<button class="btn btn-watch" onclick="assistirVideo('${nomeSeguro}', '${videoSegura}')">Assistir</button>` : ''}
        <button class="btn btn-edit" onclick='abrirEdicao(${canalJson})'>Editar</button>
        <button class="btn btn-danger" onclick="removerCanal('${canal.id}')">Excluir</button>
      `;

      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML = `
        <img class="channel-thumb" src="${logo}" alt="Logo do canal" />
        <div class="channel-body">
          <div class="channel-meta">
            <div class="channel-name">${canal.nome || 'Sem nome'}</div>
            <span class="status">${canal.categoria || 'Sem categoria'}</span>
          </div>
          <div class="channel-info"><strong>Categoria:</strong> ${canal.categoria || 'Sem categoria'}</div>
          <div class="channel-info"><strong>Sinopse:</strong> ${canal.sinopse || 'Sem sinopse'}</div>
          <div class="channel-info"><strong>Trailer:</strong> ${trailerUrl || 'Sem trailer'}</div>
          <div class="channel-info"><strong>Vídeo:</strong> ${videoUrl || 'Sem vídeo completo'}</div>
          <div class="channel-info"><strong>Oficial:</strong> ${canal.oficial || 'Sem link oficial'}</div>
          <div class="channel-actions">
            ${botoesAcao}
          </div>
        </div>
      `;
      listaCanais.appendChild(card);
    });
  }

  function renderizarUsuarios(usuarios) {
    if (!listaUsuarios) return;

    listaUsuarios.innerHTML = '';
    atualizarTotalUsuarios(usuarios);

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      listaUsuarios.innerHTML = '<div class="empty">Nenhum usuário encontrado.</div>';
      return;
    }

    usuarios.slice().reverse().forEach((user) => {
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML = `
        <div class="channel-body">
          <div class="channel-meta">
            <div class="channel-name">${user.usuario}</div>
            <span class="status">${user.tipo}</span>
          </div>
          <div class="channel-info"><strong>ID:</strong> ${user.id}</div>
          <div class="channel-info"><strong>Tipo:</strong> ${user.tipo}</div>
          <div class="channel-actions">
            ${user.tipo === 'admin' ? '' : `<button class="btn btn-danger" onclick="removerUsuario(${user.id})">Excluir</button>`}
          </div>
        </div>
      `;
      listaUsuarios.appendChild(card);
    });
  }

  function renderizarLivros(livros) {
    if (!listaLivros) return;

    listaLivros.innerHTML = '';
    atualizarTotalLivros(livrosGlobais);

    if (!Array.isArray(livros) || livros.length === 0) {
      listaLivros.innerHTML = '<div class="empty">Nenhum livro encontrado.</div>';
      return;
    }

    livros.slice().reverse().forEach((livro) => {
      const capa = livro.capa?.trim()
        ? livro.capa
        : 'https://via.placeholder.com/600x340?text=Sem+Capa';

      const livroJson = JSON.stringify(livro).replace(/'/g, "&apos;");
      const linkSeguro = livro.link?.trim() ? livro.link : '#';

      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML = `
        <img class="channel-thumb" src="${capa}" alt="Capa do livro" />
        <div class="channel-body">
          <div class="channel-meta">
            <div class="channel-name">${livro.titulo || 'Sem título'}</div>
            <span class="status">${livro.categoria || 'Sem categoria'}</span>
          </div>
          <div class="channel-info"><strong>Autor:</strong> ${livro.autor || 'Sem autor'}</div>
          <div class="channel-info"><strong>Categoria:</strong> ${livro.categoria || 'Sem categoria'}</div>
          <div class="channel-info"><strong>Descrição:</strong> ${livro.descricao || 'Sem descrição'}</div>
          <div class="channel-info"><strong>Link:</strong> ${livro.link || 'Sem link'}</div>
          <div class="channel-actions">
            <a class="btn btn-watch" href="${linkSeguro}" target="_blank" rel="noopener noreferrer">Abrir</a>
            <button class="btn btn-edit" onclick='abrirEdicaoLivro(${livroJson})'>Editar</button>
            <button class="btn btn-danger" onclick="removerLivro('${livro.id}')">Excluir</button>
          </div>
        </div>
      `;
      listaLivros.appendChild(card);
    });
  }

  async function carregarCanais() {
    try {
      const response = await fetch('/api/canais', {
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      const canais = await response.json();

      if (!response.ok) {
        showMessage('Não foi possível carregar os canais.', 'error');
        return;
      }

      canaisGlobais = Array.isArray(canais) ? canais : [];
      renderizarCanais(canaisGlobais);
    } catch (error) {
      showMessage('Erro ao carregar canais.', 'error');
    }
  }

  async function carregarUsuarios() {
    try {
      const response = await fetch('/api/usuarios', {
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      const usuarios = await response.json();

      if (!response.ok) {
        showUserMessage('Não foi possível carregar os usuários.', 'error');
        return;
      }

      renderizarUsuarios(usuarios);
    } catch (error) {
      showUserMessage('Erro ao carregar usuários.', 'error');
    }
  }

  async function carregarLivros() {
    try {
      const response = await fetch('/api/livros', {
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      const livros = await response.json();

      if (!response.ok) {
        showBookMessage('Não foi possível carregar os livros.', 'error');
        return;
      }

      livrosGlobais = Array.isArray(livros) ? livros : [];
      renderizarLivros(livrosGlobais);
    } catch (error) {
      showBookMessage('Erro ao carregar livros.', 'error');
    }
  }

  if (busca) {
    busca.addEventListener('input', () => {
      const termo = busca.value.toLowerCase().trim();
      const filtrados = canaisGlobais.filter((canal) =>
        (canal.nome || '').toLowerCase().includes(termo) ||
        (canal.categoria || '').toLowerCase().includes(termo)
      );
      renderizarCanais(filtrados);
    });
  }

  if (buscaLivros) {
    buscaLivros.addEventListener('input', () => {
      const termo = buscaLivros.value.toLowerCase().trim();
      const filtrados = livrosGlobais.filter((livro) =>
        (livro.titulo || '').toLowerCase().includes(termo) ||
        (livro.autor || '').toLowerCase().includes(termo) ||
        (livro.categoria || '').toLowerCase().includes(termo)
      );
      renderizarLivros(filtrados);
    });
  }

  window.assistirTrailer = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal || !url) return;
    playerTitle.textContent = `${nome} - Trailer`;
    playerModal.classList.add('active');
    playVideoUrl(videoPlayer, url);
  };

  window.assistirVideo = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal || !url) return;
    playerTitle.textContent = `${nome} - Assistir`;
    playerModal.classList.add('active');
    playVideoUrl(videoPlayer, url);
  };

  window.fecharPlayer = function () {
    const embedFrame = document.getElementById('embedFrame');

    if (!playerModal || !videoPlayer) return;

    destroyHls();
    playerModal.classList.remove('active');

    if (embedFrame) {
      embedFrame.src = '';
      embedFrame.style.display = 'none';
    }

    videoPlayer.style.display = 'block';
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
  };

  window.abrirEdicao = function (canal) {
    if (!editModal) return;

    const editId = document.getElementById('editId');
    const editNome = document.getElementById('editNome');
    const editCategoria = document.getElementById('editCategoria');
    const editTrailerUrl = document.getElementById('editTrailerUrl');
    const editVideoUrl = document.getElementById('editVideoUrl');
    const editLogo = document.getElementById('editLogo');
    const editSinopse = document.getElementById('editSinopse');
    const editOficial = document.getElementById('editOficial');

    if (!editId || !editNome || !editCategoria || !editLogo) return;

    editId.value = canal.id;
    editNome.value = canal.nome || '';
    editCategoria.value = canal.categoria || '';
    if (editTrailerUrl) editTrailerUrl.value = canal.trailerUrl || canal.url || '';
    if (editVideoUrl) editVideoUrl.value = canal.videoUrl || '';
    editLogo.value = canal.logo || '';

    if (editSinopse) editSinopse.value = canal.sinopse || '';
    if (editOficial) editOficial.value = canal.oficial || '';

    editModal.classList.add('active');
  };

  window.fecharEdicao = function () {
    if (!editModal) return;
    editModal.classList.remove('active');
  };

  window.abrirEdicaoLivro = function (livro) {
    if (!editBookModal) return;

    const editLivroId = document.getElementById('editLivroId');
    const editLivroTitulo = document.getElementById('editLivroTitulo');
    const editLivroAutor = document.getElementById('editLivroAutor');
    const editLivroCategoria = document.getElementById('editLivroCategoria');
    const editLivroCapa = document.getElementById('editLivroCapa');
    const editLivroDescricao = document.getElementById('editLivroDescricao');
    const editLivroLink = document.getElementById('editLivroLink');

    if (!editLivroId || !editLivroTitulo || !editLivroAutor || !editLivroCategoria || !editLivroLink) return;

    editLivroId.value = livro.id || '';
    editLivroTitulo.value = livro.titulo || '';
    editLivroAutor.value = livro.autor || '';
    editLivroCategoria.value = livro.categoria || '';
    editLivroCapa.value = livro.capa || '';
    editLivroDescricao.value = livro.descricao || '';
    editLivroLink.value = livro.link || '';

    if (editBookMessage) editBookMessage.textContent = '';
    editBookModal.classList.add('active');
  };

  window.fecharEdicaoLivro = function () {
    if (!editBookModal) return;
    editBookModal.classList.remove('active');
  };

  window.removerCanal = async function (id) {
    try {
      const response = await fetch(`/api/canais/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      if (!response.ok) {
        showMessage(data.error || 'Erro ao excluir canal.', 'error');
        return;
      }

      showMessage(data.message, 'success');
      carregarCanais();
    } catch (error) {
      showMessage('Erro ao excluir canal.', 'error');
    }
  };

  window.removerUsuario = async function (id) {
    try {
      const response = await fetch(`/api/usuarios/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      if (!response.ok) {
        showUserMessage(data.error || 'Erro ao excluir usuário.', 'error');
        return;
      }

      showUserMessage(data.message, 'success');
      carregarUsuarios();
    } catch (error) {
      showUserMessage('Erro ao excluir usuário.', 'error');
    }
  };

  window.removerLivro = async function (id) {
    try {
      const response = await fetch(`/api/livros/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      if (!response.ok) {
        showBookMessage(data.error || 'Erro ao excluir livro.', 'error');
        return;
      }

      showBookMessage(data.message, 'success');
      carregarLivros();
    } catch (error) {
      showBookMessage('Erro ao excluir livro.', 'error');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        nome: document.getElementById('nome')?.value,
        categoria: document.getElementById('categoria')?.value,
        trailerUrl: document.getElementById('trailerUrl')?.value,
        videoUrl: document.getElementById('videoUrl')?.value,
        logo: document.getElementById('logo')?.value,
        sinopse: document.getElementById('sinopse')?.value,
        oficial: document.getElementById('oficial')?.value
      };

      try {
        const response = await fetch('/api/canais', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/';
          return;
        }

        if (!response.ok) {
          showMessage(data.error || 'Erro ao adicionar canal.', 'error');
          return;
        }

        showMessage(data.message, 'success');
        form.reset();
        carregarCanais();
      } catch (error) {
        showMessage('Erro ao adicionar canal.', 'error');
      }
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = document.getElementById('editId')?.value;

      const payload = {
        nome: document.getElementById('editNome')?.value,
        categoria: document.getElementById('editCategoria')?.value,
        trailerUrl: document.getElementById('editTrailerUrl')?.value,
        videoUrl: document.getElementById('editVideoUrl')?.value,
        logo: document.getElementById('editLogo')?.value,
        sinopse: document.getElementById('editSinopse')?.value,
        oficial: document.getElementById('editOficial')?.value
      };

      try {
        const response = await fetch(`/api/canais/${id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/';
          return;
        }

        if (!response.ok) {
          showMessage(data.error || 'Erro ao editar canal.', 'error');
          return;
        }

        showMessage(data.message, 'success');
        fecharEdicao();
        carregarCanais();
      } catch (error) {
        showMessage('Erro ao editar canal.', 'error');
      }
    });
  }

  if (userForm) {
    userForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        usuario: document.getElementById('novoUsuario')?.value,
        senha: document.getElementById('novaSenha')?.value,
        tipo: document.getElementById('tipoUsuario')?.value
      };

      try {
        const response = await fetch('/api/usuarios', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/';
          return;
        }

        if (!response.ok) {
          showUserMessage(data.error || 'Erro ao adicionar usuário.', 'error');
          return;
        }

        showUserMessage(data.message, 'success');
        userForm.reset();
        carregarUsuarios();
      } catch (error) {
        showUserMessage('Erro ao adicionar usuário.', 'error');
      }
    });
  }

  if (bookForm) {
    bookForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        titulo: document.getElementById('livroTitulo')?.value,
        autor: document.getElementById('livroAutor')?.value,
        categoria: document.getElementById('livroCategoria')?.value,
        capa: document.getElementById('livroCapa')?.value,
        descricao: document.getElementById('livroDescricao')?.value,
        link: document.getElementById('livroLink')?.value
      };

      try {
        const response = await fetch('/api/livros', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/';
          return;
        }

        if (!response.ok) {
          showBookMessage(data.error || 'Erro ao adicionar livro.', 'error');
          return;
        }

        showBookMessage(data.message, 'success');
        bookForm.reset();
        carregarLivros();
      } catch (error) {
        showBookMessage('Erro ao adicionar livro.', 'error');
      }
    });
  }

  if (editBookForm) {
    editBookForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = document.getElementById('editLivroId')?.value;

      const payload = {
        titulo: document.getElementById('editLivroTitulo')?.value,
        autor: document.getElementById('editLivroAutor')?.value,
        categoria: document.getElementById('editLivroCategoria')?.value,
        capa: document.getElementById('editLivroCapa')?.value,
        descricao: document.getElementById('editLivroDescricao')?.value,
        link: document.getElementById('editLivroLink')?.value
      };

      try {
        const response = await fetch(`/api/livros/${id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/';
          return;
        }

        if (!response.ok) {
          showEditBookMessage(data.error || 'Erro ao editar livro.', 'error');
          return;
        }

        showBookMessage(data.message, 'success');
        showEditBookMessage(data.message, 'success');
        fecharEdicaoLivro();
        carregarLivros();
      } catch (error) {
        showEditBookMessage('Erro ao editar livro.', 'error');
      }
    });
  }

  carregarCanais();
  carregarUsuarios();
  carregarLivros();
}

/* =========================
   ÁREA CLIENTE PREMIUM
========================= */
if (window.location.pathname.includes('cliente.html')) {
  const listaCanais = document.getElementById('listaCanais');
  const buscaCliente = document.getElementById('buscaCliente');
  const buscaLivrosCliente = document.getElementById('buscaLivrosCliente');
  const totalCanaisCliente = document.getElementById('totalCanaisCliente');

  const playerModal = document.getElementById('playerModal');
  const videoPlayer = document.getElementById('videoPlayer');
  const playerTitle = document.getElementById('playerTitle');

  const bookModal = document.getElementById('bookModal');
  const bookFrame = document.getElementById('bookFrame');
  const bookTitle = document.getElementById('bookTitle');

  let canaisCliente = [];
  let livrosCliente = [];
  let categoriaAtual = 'Todos';

  function atualizarTotalCliente(lista) {
    if (!totalCanaisCliente) return;
    totalCanaisCliente.textContent = Array.isArray(lista) ? lista.length : 0;
  }

  function obterTrailerUrl(canal) {
    return canal.trailerUrl || canal.url || '';
  }

  function obterVideoUrl(canal) {
    return canal.videoUrl || '';
  }

  function converterLinkLivro(url) {
    if (!url) return '';

    if (url.includes('drive.google.com/file/d/') && url.includes('/view')) {
      return url.replace('/view', '/preview');
    }

    return url;
  }

  function renderizarCatalogoCliente(listaConteudos, listaLivros) {
    if (!listaCanais) return;

    listaCanais.innerHTML = '';

    const conteudos = Array.isArray(listaConteudos) ? listaConteudos : [];
    const livros = Array.isArray(listaLivros) ? listaLivros : [];
    const total = conteudos.length + livros.length;

    atualizarTotalCliente(new Array(total));

    if (total === 0) {
      listaCanais.innerHTML = '<div class="empty">Nenhum conteúdo disponível.</div>';
      return;
    }

    conteudos.slice().reverse().forEach((canal) => {
      const logo = canal.logo?.trim()
        ? canal.logo
        : 'https://via.placeholder.com/600x340?text=Sem+Logo';

      const nomeSeguro = String(canal.nome || '').replace(/'/g, "\\'");
      const trailerUrl = obterTrailerUrl(canal);
      const videoUrl = obterVideoUrl(canal);
      const trailerSegura = String(trailerUrl || '').replace(/'/g, "\\'");
      const videoSegura = String(videoUrl || '').replace(/'/g, "\\'");
      const linkOficial = canal.oficial?.trim() ? canal.oficial : '#';

      const botoes = `
        ${trailerUrl ? `
          <button class="btn btn-watch" onclick="assistirTrailerCliente('${nomeSeguro}', '${trailerSegura}')">
            Trailer
          </button>
        ` : ''}
        ${videoUrl ? `
          <button class="btn btn-watch" onclick="assistirVideoCliente('${nomeSeguro}', '${videoSegura}')">
            Assistir
          </button>

          <button class="btn btn-edit" onclick="criarSalaAmigos('${nomeSeguro}', '${videoSegura}')">
            👥 Assistir com amigos
          </button>
        ` : ''}
        <a class="btn btn-edit" href="${linkOficial}" target="_blank" rel="noopener noreferrer">
          Oficial
        </a>
      `;

      const card = document.createElement('div');
      card.className = 'channel-card';

      card.innerHTML = `
        <img class="channel-thumb" src="${logo}" alt="Logo do canal">
        <div class="channel-body">
          <div class="channel-meta">
            <div class="channel-name">${canal.nome || 'Sem nome'}</div>
            <span class="status">${canal.categoria || 'Sem categoria'}</span>
          </div>

          <div class="channel-info">
            <strong>Sinopse:</strong> ${canal.sinopse || 'Sem sinopse'}
          </div>

          <div class="channel-actions">
            ${botoes}
          </div>
        </div>
      `;

      listaCanais.appendChild(card);
    });

    livros.slice().reverse().forEach((livro) => {
      const capa = livro.capa?.trim()
        ? livro.capa
        : 'https://via.placeholder.com/600x340?text=Sem+Capa';

      const linkLivro = livro.link?.trim() ? livro.link : '#';
      const tituloSeguro = String(livro.titulo || '').replace(/'/g, "\\'");
      const linkSeguro = String(linkLivro).replace(/'/g, "\\'");

      const card = document.createElement('div');
      card.className = 'channel-card';

      card.innerHTML = `
        <img class="channel-thumb" src="${capa}" alt="Capa do livro">
        <div class="channel-body">
          <div class="channel-meta">
            <div class="channel-name">${livro.titulo || 'Sem título'}</div>
            <span class="status">Livro</span>
          </div>

          <div class="channel-info">
            <strong>Autor:</strong> ${livro.autor || 'Sem autor'}
          </div>

          <div class="channel-info">
            <strong>Categoria:</strong> ${livro.categoria || 'Sem categoria'}
          </div>

          <div class="channel-info">
            <strong>Descrição:</strong> ${livro.descricao || 'Sem descrição'}
          </div>

          <div class="channel-actions">
            <button class="btn btn-watch" onclick="abrirLivroCliente('${tituloSeguro}', '${linkSeguro}')">
              Ler
            </button>
          </div>
        </div>
      `;

      listaCanais.appendChild(card);
    });
  }

  function aplicarFiltros() {
    const termo = buscaCliente ? buscaCliente.value.toLowerCase().trim() : '';
    const termoLivro = buscaLivrosCliente ? buscaLivrosCliente.value.toLowerCase().trim() : '';

    const conteudosFiltrados = canaisCliente.filter((canal) => {
      const bateBusca =
        (canal.nome || '').toLowerCase().includes(termo) ||
        (canal.categoria || '').toLowerCase().includes(termo);

      const bateCategoria =
        categoriaAtual === 'Todos' || canal.categoria === categoriaAtual;

      return bateBusca && bateCategoria;
    });

    const livrosFiltrados = livrosCliente.filter((livro) => {
      const buscaNormal =
        (livro.titulo || '').toLowerCase().includes(termo) ||
        (livro.autor || '').toLowerCase().includes(termo) ||
        (livro.categoria || '').toLowerCase().includes(termo);

      const buscaLivro =
        !termoLivro ||
        (livro.titulo || '').toLowerCase().includes(termoLivro) ||
        (livro.autor || '').toLowerCase().includes(termoLivro) ||
        (livro.categoria || '').toLowerCase().includes(termoLivro);

      const bateCategoria =
        categoriaAtual === 'Todos' || categoriaAtual === 'Livro';

      return buscaNormal && buscaLivro && bateCategoria;
    });

    renderizarCatalogoCliente(conteudosFiltrados, livrosFiltrados);
  }

  window.filtrarCategoria = function (categoria) {
    categoriaAtual = categoria;

    const botoes = document.querySelectorAll('.btn-filter');
    botoes.forEach((btn) => btn.classList.remove('active'));

    const botaoAtual = Array.from(botoes).find(
      (btn) => btn.innerText.trim() === categoria
    );

    if (botaoAtual) {
      botaoAtual.classList.add('active');
    }

    aplicarFiltros();
  };

  async function carregarCanaisCliente() {
    try {
      const response = await fetch('/api/canais', {
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      const canais = await response.json();

      if (!response.ok) {
        if (listaCanais) {
          listaCanais.innerHTML = '<div class="empty">Não foi possível carregar os conteúdos.</div>';
        }
        return;
      }

      canaisCliente = Array.isArray(canais) ? canais : [];
      aplicarFiltros();
    } catch (error) {
      if (listaCanais) {
        listaCanais.innerHTML = '<div class="empty">Erro ao carregar conteúdos.</div>';
      }
    }
  }

  async function carregarLivrosCliente() {
    try {
      const response = await fetch('/api/livros', {
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/';
        return;
      }

      const livros = await response.json();

      if (!response.ok) {
        return;
      }

      livrosCliente = Array.isArray(livros) ? livros : [];
      aplicarFiltros();
    } catch (error) { }
  }

  if (buscaCliente) {
    buscaCliente.addEventListener('input', () => {
      aplicarFiltros();
    });
  }

  if (buscaLivrosCliente) {
    buscaLivrosCliente.addEventListener('input', () => {
      aplicarFiltros();
    });
  }

  window.assistirTrailerCliente = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal || !url) return;
    playerTitle.textContent = `${nome} - Trailer`;
    playerModal.classList.add('active');
    playVideoUrl(videoPlayer, url);
  };

  window.assistirVideoCliente = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal || !url) return;
    playerTitle.textContent = `${nome} - Assistir`;
    playerModal.classList.add('active');
    playVideoUrl(videoPlayer, url);
  };

  window.abrirLivroCliente = function (titulo, url) {
    if (!bookModal || !bookFrame || !bookTitle || !url) return;

    const linkFinal = converterLinkLivro(url);
    bookTitle.textContent = titulo ? `${titulo} - Leitura` : 'Leitura';
    bookFrame.src = linkFinal;
    bookModal.classList.add('active');
  };

  window.fecharLivro = function () {
    if (!bookModal || !bookFrame) return;

    bookModal.classList.remove('active');
    bookFrame.src = '';
  };

  window.fecharPlayer = function () {
    const embedFrame = document.getElementById('embedFrame');

    if (!playerModal || !videoPlayer) return;

    destroyHls();
    playerModal.classList.remove('active');

    if (embedFrame) {
      embedFrame.src = '';
      embedFrame.style.display = 'none';
    }

    videoPlayer.style.display = 'block';
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
  };

  window.criarSalaAmigos = async function (nome, url) {
    if (!nome || !url) {
      alert('Esse conteúdo não tem vídeo completo para criar sala.');
      return;
    }

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    localStorage.setItem('cinezor_sala_room', roomId);
    localStorage.setItem('cinezor_sala_nome', nome);
    localStorage.setItem('cinezor_sala_video', url);

    try {
      const response = await fetch(`/api/salas/${encodeURIComponent(roomId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          videoUrl: url
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Erro ao criar sala.');
        return;
      }

      window.location.href =
        `/sala.html?room=${encodeURIComponent(roomId)}&nome=${encodeURIComponent(nome)}&video=${encodeURIComponent(url)}`;
    } catch (error) {
      alert('Erro ao conectar com o servidor para criar a sala.');
    }
  };

  carregarCanaisCliente();
  carregarLivrosCliente();
}
