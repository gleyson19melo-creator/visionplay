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

  if (url.includes('/embed/') || url.includes('embedplayapi.site')) {
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
  } catch (error) {}

  localStorage.clear();
  window.location.href = '/';
}

// Ativa login se estiver na tela inicial
if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', login);
}

/* =========================
   ÁREA ADMIN
========================= */
if (window.location.pathname.includes('admin.html')) {
  const form = document.getElementById('channelForm');
  const editForm = document.getElementById('editForm');
  const userForm = document.getElementById('userForm');

  const listaCanais = document.getElementById('listaCanais');
  const listaUsuarios = document.getElementById('listaUsuarios');

  const mensagem = document.getElementById('mensagem');
  const userMessage = document.getElementById('userMessage');

  const totalCanais = document.getElementById('totalCanais');
  const totalUsuarios = document.getElementById('totalUsuarios');
  const busca = document.getElementById('busca');

  const playerModal = document.getElementById('playerModal');
  const videoPlayer = document.getElementById('videoPlayer');
  const playerTitle = document.getElementById('playerTitle');
  const editModal = document.getElementById('editModal');

  let canaisGlobais = [];

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

  function atualizarTotal(canais) {
    if (!totalCanais) return;
    totalCanais.textContent = Array.isArray(canais) ? canais.length : 0;
  }

  function atualizarTotalUsuarios(usuarios) {
    if (!totalUsuarios) return;
    totalUsuarios.textContent = Array.isArray(usuarios) ? usuarios.length : 0;
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
      const urlSegura = String(canal.url || '').replace(/'/g, "\\'");
      const canalJson = JSON.stringify(canal).replace(/'/g, "&apos;");

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
          <div class="channel-info"><strong>Trailer:</strong> ${canal.url || 'Sem URL'}</div>
          <div class="channel-info"><strong>Oficial:</strong> ${canal.oficial || 'Sem link oficial'}</div>
          <div class="channel-actions">
            <button class="btn btn-watch" onclick="assistirCanal('${nomeSeguro}', '${urlSegura}')">Trailer</button>
            <button class="btn btn-edit" onclick='abrirEdicao(${canalJson})'>Editar</button>
            <button class="btn btn-danger" onclick="removerCanal(${canal.id})">Excluir</button>
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

  window.assistirCanal = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal) return;
    playerTitle.textContent = nome;
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
    const editUrl = document.getElementById('editUrl');
    const editLogo = document.getElementById('editLogo');
    const editSinopse = document.getElementById('editSinopse');
    const editOficial = document.getElementById('editOficial');

    if (!editId || !editNome || !editCategoria || !editUrl || !editLogo) return;

    editId.value = canal.id;
    editNome.value = canal.nome || '';
    editCategoria.value = canal.categoria || '';
    editUrl.value = canal.url || '';
    editLogo.value = canal.logo || '';

    if (editSinopse) editSinopse.value = canal.sinopse || '';
    if (editOficial) editOficial.value = canal.oficial || '';

    editModal.classList.add('active');
  };

  window.fecharEdicao = function () {
    if (!editModal) return;
    editModal.classList.remove('active');
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

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        nome: document.getElementById('nome')?.value,
        categoria: document.getElementById('categoria')?.value,
        url: document.getElementById('url')?.value,
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
        url: document.getElementById('editUrl')?.value,
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

  carregarCanais();
  carregarUsuarios();
}

/* =========================
   ÁREA CLIENTE PREMIUM
========================= */
if (window.location.pathname.includes('cliente.html')) {
  const listaCanais = document.getElementById('listaCanais');
  const buscaCliente = document.getElementById('buscaCliente');
  const totalCanaisCliente = document.getElementById('totalCanaisCliente');

  const playerModal = document.getElementById('playerModal');
  const videoPlayer = document.getElementById('videoPlayer');
  const playerTitle = document.getElementById('playerTitle');

  let canaisCliente = [];
  let categoriaAtual = 'Todos';

  function atualizarTotalCliente(lista) {
    if (!totalCanaisCliente) return;
    totalCanaisCliente.textContent = Array.isArray(lista) ? lista.length : 0;
  }

  function renderizarCanaisCliente(lista) {
    if (!listaCanais) return;

    listaCanais.innerHTML = '';
    atualizarTotalCliente(lista);

    if (!Array.isArray(lista) || lista.length === 0) {
      listaCanais.innerHTML = '<div class="empty">Nenhum conteúdo disponível.</div>';
      return;
    }

    lista.slice().reverse().forEach((canal) => {
      const logo = canal.logo?.trim()
        ? canal.logo
        : 'https://via.placeholder.com/600x340?text=Sem+Logo';

      const nomeSeguro = String(canal.nome || '').replace(/'/g, "\\'");
      const urlSegura = String(canal.url || '').replace(/'/g, "\\'");
      const linkOficial = canal.oficial?.trim() ? canal.oficial : '#';

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
            <button class="btn btn-watch" onclick="assistirCanalCliente('${nomeSeguro}', '${urlSegura}')">
              Trailer
            </button>

            <a class="btn btn-edit" href="${linkOficial}" target="_blank" rel="noopener noreferrer">
              Assistir Oficial
            </a>
          </div>
        </div>
      `;

      listaCanais.appendChild(card);
    });
  }

  function aplicarFiltros() {
    const termo = buscaCliente ? buscaCliente.value.toLowerCase().trim() : '';

    const filtrados = canaisCliente.filter((canal) => {
      const bateBusca =
        (canal.nome || '').toLowerCase().includes(termo) ||
        (canal.categoria || '').toLowerCase().includes(termo);

      const bateCategoria =
        categoriaAtual === 'Todos' || canal.categoria === categoriaAtual;

      return bateBusca && bateCategoria;
    });

    renderizarCanaisCliente(filtrados);
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

  if (buscaCliente) {
    buscaCliente.addEventListener('input', () => {
      aplicarFiltros();
    });
  }

  window.assistirCanalCliente = function (nome, url) {
    if (!playerTitle || !videoPlayer || !playerModal) return;
    playerTitle.textContent = nome;
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

  carregarCanaisCliente();
}