const API_URL = "http://localhost:3000";
let currentPage = 1; // Variável global para paginação

// --- Funções Auxiliares ---

const getToken = () => localStorage.getItem("who_token");
const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

function logout() {
  localStorage.removeItem("who_token");
  window.location.href = "index.html";
}

// --- Lógica do Login/Registro ---

const authForm = document.getElementById("authForm");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const endpoint = isLogin ? "/auth/login" : "/auth/register";

    // 1. Validação de Senha Dupla (Task 2)
    if (!isLogin) {
      const confirmPass = document.getElementById("confirmPassword").value;
      if (password !== confirmPass) {
        const alertBox = document.getElementById("alertBox");
        alertBox.innerText = "As senhas não conferem!";
        alertBox.classList.remove("d-none");
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro na autenticação");

      if (isLogin) {
        localStorage.setItem("who_token", data.token);
        window.location.href = "dashboard.html";
      } else {
        alert("Conta criada! Agora faça login.");
        // Chama a função global que definimos no HTML (Task 1)
        window.toggleAuth("login");
        document.getElementById("alertBox").classList.add("d-none");
      }
    } catch (err) {
      const alertBox = document.getElementById("alertBox");
      alertBox.innerText = err.message;
      alertBox.classList.remove("d-none");
    }
  });
}

// --- Lógica do Dashboard ---

async function checkAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }
  if (document.getElementById("setupSection")) {
    await loadCompanyInfo();
  }
}

async function loadCompanyInfo() {
  try {
    const res = await fetch(`${API_URL}/company/me`, { headers: getHeaders() });

    if (res.status === 404) {
      document.getElementById("setupSection").classList.remove("d-none");
    } else if (res.ok) {
      const data = await res.json();
      document.getElementById("dashboardSection").classList.remove("d-none");
      document.getElementById("companyTitle").innerText = data.name;
      loadDashboardData(1); // Carrega página 1 inicial
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao carregar perfil.");
  }
}

async function createCompany() {
  const name = document.getElementById("companyName").value;
  if (!name) return alert("Digite um nome!");

  // 2. Confirmação Irreversível (Task 3)
  if (
    !confirm(
      `Tem certeza que deseja criar a empresa "${name}"?\nEssa ação não pode ser desfeita.`
    )
  ) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/company`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      location.reload();
    } else {
      alert("Erro ao criar empresa");
    }
  } catch (err) {
    console.error(err);
  }
}

async function refreshData() {
  // 1. Bloqueio extra de segurança antes de chamar API
  if (document.getElementById("btnRefresh").disabled) return;

  const loading = document.getElementById("loadingOverlay");
  loading.classList.remove("d-none");

  try {
    const res = await fetch(`${API_URL}/data/refresh`, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await res.json();
    if (res.ok) {
      alert(`Sucesso! ${data.totalSaved} novos dados analisados.`);

      // ⭐ NOVO: Salva a hora atual no localStorage
      localStorage.setItem("last_refresh_time", Date.now().toString());

      // ⭐ NOVO: Inicia a contagem regressiva visual
      checkRefreshCooldown();

      loadDashboardData(1);
    } else {
      alert("Erro ao atualizar dados.");
    }
  } catch (err) {
    alert("Erro de conexão.");
  } finally {
    loading.classList.add("d-none");
  }
}

// 4. Função de Paginação
function changePage(step) {
  currentPage += step;
  if (currentPage < 1) currentPage = 1;
  loadDashboardData(currentPage);
}

async function loadDashboardData(page = 1) {
  currentPage = page;

  // Carrega Stats e Tópicos (somente se for page 1 ou quiser otimizar)
  // Para simplificar, recarregamos stats sempre para manter sinc
  const resStats = await fetch(`${API_URL}/dashboard/stats?period=30`, {
    headers: getHeaders(),
  });
  const stats = await resStats.json();
  document.getElementById("statTotal").innerText = stats.total || 0;
  document.getElementById("statPositive").innerText = stats.positive || 0;
  document.getElementById("statNegative").innerText = stats.negative || 0;
  document.getElementById("statNeutral").innerText = stats.neutral || 0;

  const resTopics = await fetch(`${API_URL}/dashboard/topics?period=30`, {
    headers: getHeaders(),
  });
  const topicsData = await resTopics.json();
  const topicsList = document.getElementById("topicsList");
  topicsList.innerHTML = "";

  const sortedTopics = Object.entries(topicsData.topics || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (sortedTopics.length === 0)
    topicsList.innerHTML = '<li class="list-group-item">Sem dados</li>';
  sortedTopics.forEach(([topic, count]) => {
    topicsList.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${topic} <span class="badge bg-primary rounded-pill">${count}</span>
            </li>`;
  });

  // 5. Carrega Feed com Paginação (Task 4)
  const limit = 5;
  const resFeed = await fetch(
    `${API_URL}/dashboard/feed?page=${page}&limit=${limit}`,
    {
      headers: getHeaders(),
    }
  );
  const feedData = await resFeed.json();
  const feedList = document.getElementById("feedList");
  feedList.innerHTML = "";

  // Atualiza controles de paginação
  const totalPages = feedData.meta.lastPage || 1;
  document.getElementById(
    "pageInfo"
  ).innerText = `Página ${page} de ${totalPages}`;
  document.getElementById("btnPrev").disabled = page <= 1;
  document.getElementById("btnNext").disabled = page >= totalPages;

  if (!feedData.data || feedData.data.length === 0) {
    feedList.innerHTML = '<p class="text-muted">Nenhum dado nesta página.</p>';
    return;
  }

  feedData.data.forEach((item) => {
    let badgeColor = "secondary";
    if (item.sentiment === "POSITIVE") badgeColor = "success";
    if (item.sentiment === "NEGATIVE") badgeColor = "danger";

    // Lógica do "Ler Mais"
    const fullText = item.content;
    const shortText =
      fullText.length > 120 ? fullText.substring(0, 120) + "..." : fullText;
    const hasMore = fullText.length > 120;
    const title = item.title || "Feedback IA";

    feedList.innerHTML += `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <h6 class="card-title d-flex justify-content-between">
                        ${title}
                        <span class="badge bg-${badgeColor}">${
      item.sentiment
    }</span>
                    </h6>
                    
                    <div class="card-text small text-muted mb-1">
                        <span class="short-text">${shortText}</span>
                        ${
                          hasMore
                            ? `<span class="full-text d-none">${fullText}</span>`
                            : ""
                        }
                        ${
                          hasMore
                            ? `<br><span class="read-more-link" onclick="toggleReadMore(this)">Ler mais</span>`
                            : ""
                        }
                    </div>
                    
                    <small class="text-muted" style="font-size: 0.7em">${new Date(
                      item.createdAt
                    ).toLocaleDateString()}</small>
                </div>
            </div>`;
  });
}

// Função para expandir texto
function toggleReadMore(element) {
  const parent = element.parentElement;
  const shortText = parent.querySelector(".short-text");
  const fullText = parent.querySelector(".full-text");

  if (fullText.classList.contains("d-none")) {
    fullText.classList.remove("d-none");
    shortText.classList.add("d-none");
    element.innerText = "Ler menos";
  } else {
    fullText.classList.add("d-none");
    shortText.classList.remove("d-none");
    element.innerText = "Ler mais";
  }
}

const COOLDOWN_TIME = 60 * 60 * 1000; // 1 hora em milissegundos
let cooldownInterval = null;

function checkRefreshCooldown() {
  const btn = document.getElementById("btnRefresh");
  if (!btn) return;

  const lastRefresh = localStorage.getItem("last_refresh_time");

  // Se nunca rodou, libera o botão
  if (!lastRefresh) {
    btn.disabled = false;
    btn.innerHTML = "🔄 Buscar Novas Reclamações (IA)";
    return;
  }

  const now = Date.now();
  const timePassed = now - parseInt(lastRefresh);
  const timeLeft = COOLDOWN_TIME - timePassed;

  // Se ainda falta tempo (diff menor que 1 hora)
  if (timeLeft > 0) {
    btn.disabled = true;
    btn.classList.remove("btn-success");
    btn.classList.add("btn-secondary");

    // Atualiza o texto imediatamente
    updateButtonTimer(btn, timeLeft);

    // Cria um relógio que atualiza a cada segundo
    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
      const newNow = Date.now();
      const newTimeLeft = COOLDOWN_TIME - (newNow - parseInt(lastRefresh));

      if (newTimeLeft <= 0) {
        // Tempo acabou! Libera o botão
        clearInterval(cooldownInterval);
        localStorage.removeItem("last_refresh_time");
        checkRefreshCooldown(); // Chama recursivamente para resetar o estilo
      } else {
        updateButtonTimer(btn, newTimeLeft);
      }
    }, 1000);
  } else {
    // Já passou 1 hora, libera tudo
    btn.disabled = false;
    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-success");
    btn.innerHTML = "🔄 Buscar Novas Reclamações (IA)";
    localStorage.removeItem("last_refresh_time"); // Limpa o storage antigo
  }
}

// Formata milissegundos para MM:SS
function updateButtonTimer(btn, ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Adiciona zero à esquerda se for menor que 10
  const minStr = minutes.toString().padStart(2, "0");
  const secStr = seconds.toString().padStart(2, "0");

  btn.innerHTML = `⏳ Aguarde ${minStr}:${secStr}`;
}
