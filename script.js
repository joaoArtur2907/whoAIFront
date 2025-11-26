const API_URL = "http://localhost:3000";
let currentPage = 1;
let currentUserId = null;

// --- [NOVO] Sistema de Notificações (Toasts) ---
function showToast(message, type = "info") {
  const container = document.querySelector(".toast-container");
  if (!container) return; // Segurança caso esqueça de por o HTML

  const id = "toast-" + Date.now();
  const bgClass =
    type === "error" || type === "danger"
      ? "text-bg-danger"
      : type === "success"
      ? "text-bg-success"
      : type === "warning"
      ? "text-bg-warning"
      : "text-bg-primary";

  const html = `
        <div id="${id}" class="toast align-items-center ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body fw-semibold">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

  // Adiciona ao HTML
  container.insertAdjacentHTML("beforeend", html);

  // Inicializa e mostra usando o Bootstrap
  const toastEl = document.getElementById(id);
  const toast = new bootstrap.Toast(toastEl, { delay: 4000 }); // Dura 4 segundos
  toast.show();

  // Limpa do DOM quando sumir
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove();
  });
}

// --- Funções Auxiliares ---

const getToken = () => localStorage.getItem("who_token");
const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

function logout() {
  localStorage.removeItem("who_token");
  localStorage.removeItem("last_sentiment"); // Limpa cache visual
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

    if (!isLogin) {
      const confirmPass = document.getElementById("confirmPassword").value;
      if (password !== confirmPass) {
        document.getElementById("alertBox").innerText =
          "As senhas não conferem!";
        document.getElementById("alertBox").classList.remove("d-none");
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
      if (!res.ok)
        throw new Error(data.message || data.error || "Erro na autenticação");

      if (isLogin) {
        localStorage.setItem("who_token", data.token);
        window.location.href = "dashboard.html";
      } else {
        showToast("Conta criada com sucesso! Agora faça login.", "success");
        window.toggleAuth("login");
        document.getElementById("alertBox").classList.add("d-none");
      }
    } catch (err) {
      const alertBox = document.getElementById("alertBox");
      if (alertBox) {
        alertBox.innerText = err.message;
        alertBox.classList.remove("d-none");
      } else {
        // Fallback: Se não achar a caixinha, usa o Toast vermelho
        showToast(err.message, "danger");
      }
    }
  });
}

// --- [NOVO] Busca dados do Usuário ---
async function loadUserInfo() {
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: getHeaders() });
    if (res.ok) {
      const user = await res.json();
      currentUserId = user.id; // Salva o ID do usuário logado
    }
  } catch (e) {
    console.error("Erro ao carregar usuário", e);
  }
}

// --- Lógica do Dashboard ---

async function checkAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }

  // 1. Primeiro carregamos quem é o usuário
  await loadUserInfo();

  // Se estiver na página dashboard, carrega infos da empresa
  if (document.getElementById("setupSection")) {
    await loadCompanyInfo();

    // Recupera sentimento salvo
    const savedSentiment = localStorage.getItem("last_sentiment");
    if (savedSentiment) updateSentimentBadge(savedSentiment);

    // Verifica o Cooldown (agora que já temos o User ID)
    checkRefreshCooldown();
  }
}

async function loadCompanyInfo() {
  try {
    const res = await fetch(`${API_URL}/company/me`, { headers: getHeaders() });

    if (res.status === 404) {
      // Usuário sem empresa
      document.getElementById("setupSection").classList.remove("d-none");
      document.getElementById("dashboardSection").classList.add("d-none");
    } else if (res.ok) {
      const data = await res.json();
      // Usuário com empresa
      document.getElementById("setupSection").classList.add("d-none");
      document.getElementById("dashboardSection").classList.remove("d-none");

      const titleEl = document.getElementById("companyTitle");
      if (titleEl) titleEl.innerText = data.name;

      loadDashboardData(1); // Inicia carregamento dos dados
      checkRefreshCooldown(); // Verifica se botão deve estar bloqueado
    }
  } catch (err) {
    console.error(err);
  }
}

// --- [NOVO] Função de Excluir Empresa (Reset) ---
async function deleteCompany() {
  if (
    !confirm(
      "Tem certeza? Isso apagará todos os dados coletados e permitirá cadastrar outra empresa."
    )
  ) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/company`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (res.ok) {
      localStorage.removeItem("last_sentiment");
      localStorage.removeItem("last_refresh_time");
      location.reload(); // Recarrega para cair no setupSection
    } else {
      showToast("Erro ao excluir empresa.");
    }
  } catch (err) {
    showToast("Erro de conexão.");
  }
}

// Variável para guardar o nome temporariamente enquanto o usuário decide
let pendingCompanyName = "";
let modalInstance = null; // Para controlar o abrir/fechar do modal

// 1. Função chamada pelo botão "Salvar" do formulário
function createCompany() {
  const nameInput = document.getElementById("companyName");
  const name = nameInput.value.trim();

  if (!name) return showToast("Digite um nome.", "warning");

  // Guarda o nome na variável global
  pendingCompanyName = name;

  // Prepara e mostra o Modal
  const modalEl = document.getElementById("confirmationModal");
  const msgEl = document.getElementById("modalMessage");

  msgEl.innerText = `Confirmar criação da empresa "${name}"?`;

  modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();
}

// 2. Função chamada APENAS quando clica em "Confirmar" DENTRO do Modal
// Precisamos adicionar o "listener" para esse botão uma única vez
document.addEventListener("DOMContentLoaded", () => {
  const btnConfirm = document.getElementById("btnConfirmAction");
  if (btnConfirm) {
    btnConfirm.addEventListener("click", async () => {
      // Esconde o modal
      if (modalInstance) modalInstance.hide();

      // Executa a criação real
      await executeCreateCompany();
    });
  }
});

// 3. A lógica real de ir no backend (Separada)
async function executeCreateCompany() {
  if (!pendingCompanyName) return;

  try {
    const res = await fetch(`${API_URL}/company`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name: pendingCompanyName }),
    });

    if (res.ok) {
      showToast("Empresa criada com sucesso!", "success");
      setTimeout(() => location.reload(), 1500); // Espera um pouco para ler o toast
    } else {
      showToast("Erro ao criar empresa.", "danger");
    }
  } catch (err) {
    console.error(err);
    showToast("Erro de conexão.", "danger");
  } finally {
    pendingCompanyName = ""; // Limpa a variável
  }
}

async function refreshData() {
  if (document.getElementById("btnRefresh").disabled) return;

  const loading = document.getElementById("loadingOverlay");
  if (loading) loading.classList.remove("d-none");

  try {
    const res = await fetch(`${API_URL}/data/refresh`, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await res.json();
    if (res.ok) {
      showToast("Sucesso Análise concluida");

      // Atualiza sentimento visualmente
      if (data.overallSentiment) {
        localStorage.setItem("last_sentiment", data.overallSentiment);
        updateSentimentBadge(data.overallSentiment);
      }

      // Bloqueia botão (USANDO CHAVE DO USUÁRIO)
      const storageKey = getStorageKey();
      if (storageKey) {
        localStorage.setItem(storageKey, Date.now().toString());
      }

      checkRefreshCooldown();

      // Recarrega TUDO (Gráficos, Feed e RELATÓRIO DE TEXTO)
      loadDashboardData(1);
    } else {
      showToast(
        "Erro ao atualizar dados: " + (data.error || "Erro desconhecido")
      );
    }
  } catch (err) {
    showToast("Erro de conexão (Timeout ou Falha no Servidor).");
  } finally {
    if (loading) loading.classList.add("d-none");
  }
}

function changePage(step) {
  currentPage += step;
  if (currentPage < 1) currentPage = 1;
  loadDashboardData(currentPage);
}

// Função Mestra que carrega tudo
async function loadDashboardData(page = 1) {
  currentPage = page;

  // 1. Carrega Estatísticas
  loadStats();
  // 2. Carrega Tópicos
  loadTopics();
  // 3. Carrega Feed
  loadFeed(page);
  // 4. [NOVO] Carrega Relatório de IA (Texto)
  loadReport();
}

async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/dashboard/stats?period=30`, {
      headers: getHeaders(),
    });
    const stats = await res.json();
    document.getElementById("statTotal").innerText = stats.total || 0;
    document.getElementById("statPositive").innerText = stats.positive || 0;
    document.getElementById("statNegative").innerText = stats.negative || 0;
    document.getElementById("statNeutral").innerText = stats.neutral || 0;
  } catch (e) {
    console.error("Erro stats", e);
  }
}

async function loadTopics() {
  try {
    const res = await fetch(`${API_URL}/dashboard/topics?period=30`, {
      headers: getHeaders(),
    });
    const topicsData = await res.json();
    const topicsList = document.getElementById("topicsList");
    if (!topicsList) return;

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
  } catch (e) {
    console.error("Erro topics", e);
  }
}

// --- [NOVO] Função para buscar os Textos da IA ---
async function loadReport() {
  try {
    const res = await fetch(`${API_URL}/dashboard/report`, {
      headers: getHeaders(),
    });

    if (res.ok) {
      const report = await res.json();

      // Front deve ter elementos com esses IDs
      const elAnalysis = document.getElementById("reportAnalysis");
      const elSuggestion = document.getElementById("reportSuggestion");

      if (elAnalysis)
        elAnalysis.innerText = report.analysis || "Análise pendente...";
      if (elSuggestion)
        elSuggestion.innerText = report.suggestion || "Sugestão pendente...";

      // Atualiza o sentimento se ainda não tiver
      if (report.sentiment) updateSentimentBadge(report.sentiment);
    }
  } catch (e) {
    console.error("Erro report", e);
  }
}

async function loadFeed(page) {
  try {
    const limit = 5;
    const res = await fetch(
      `${API_URL}/dashboard/feed?page=${page}&limit=${limit}`,
      { headers: getHeaders() }
    );
    const feedData = await res.json();
    const feedList = document.getElementById("feedList");
    if (!feedList) return;

    feedList.innerHTML = "";

    const totalPages = feedData.meta ? feedData.meta.lastPage : 1;
    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.innerText = `Página ${page} de ${totalPages}`;

    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    if (btnPrev) btnPrev.disabled = page <= 1;
    if (btnNext) btnNext.disabled = page >= totalPages;

    if (!feedData.data || feedData.data.length === 0) {
      feedList.innerHTML =
        '<p class="text-muted text-center p-3">Nenhum dado encontrado.</p>';
      return;
    }

    feedData.data.forEach((item) => {
      let badgeColor = "secondary";
      if (item.sentiment === "POSITIVE") badgeColor = "success";
      if (item.sentiment === "NEGATIVE") badgeColor = "danger";

      const fullText = item.content || "";
      const shortText =
        fullText.length > 120 ? fullText.substring(0, 120) + "..." : fullText;
      const hasMore = fullText.length > 120;
      const title = item.source || "Fonte Web"; // Título agora é a fonte

      feedList.innerHTML += `
        <div class="card mb-2 shadow-sm">
            <div class="card-body py-2">
                <h6 class="card-title d-flex justify-content-between align-items-center">
                    <span> ${title}</span>
                    <span class="badge bg-${badgeColor}">${
        item.sentiment
      }</span>
                </h6>
                
                <div class="card-text small text-muted mb-1 mt-2">
                    <span class="short-text">${shortText}</span>
                    ${
                      hasMore
                        ? `<span class="full-text d-none">${fullText}</span>`
                        : ""
                    }
                    ${
                      hasMore
                        ? `<br><a href="#" class="text-primary text-decoration-none" style="font-size:0.85em" onclick="toggleReadMore(this); return false;">Ler mais</a>`
                        : ""
                    }
                </div>
                
                <div class="d-flex justify-content-between mt-2">
                   <small class="text-muted" style="font-size: 0.7em">${new Date(
                     item.createdAt
                   ).toLocaleDateString()}</small>
                   ${
                     item.originalUrl && item.originalUrl !== "Google Search"
                       ? `<a href="${item.originalUrl}" target="_blank" style="font-size: 0.7em"> </a>`
                       : ""
                   }
                </div>
            </div>
        </div>`;
    });
  } catch (e) {
    console.error("Erro feed", e);
  }
}

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

// --- Cooldown e UI ---
const COOLDOWN_TIME = 60 * 60 * 1000;
let cooldownInterval = null;

function getStorageKey() {
  if (!currentUserId) return null;
  return `last_refresh_time_${currentUserId}`;
}

function checkRefreshCooldown() {
  const btn = document.getElementById("btnRefresh");
  if (!btn) return;

  // 1. Pega a chave baseada no ID do usuário
  const storageKey = getStorageKey();

  // Se o usuário ainda não carregou, não faz nada
  if (!storageKey) return;

  const lastRefresh = localStorage.getItem(storageKey); // <--- Usa a chave dinâmica

  if (!lastRefresh) {
    btn.disabled = false;
    btn.innerHTML =
      '<i class="bi bi-arrow-clockwise"></i> Atualizar Dados (IA)';
    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-primary");
    return;
  }

  const now = Date.now();
  const timePassed = now - parseInt(lastRefresh);
  const timeLeft = COOLDOWN_TIME - timePassed;

  if (timeLeft > 0) {
    btn.disabled = true;
    btn.classList.remove("btn-primary", "btn-success");
    btn.classList.add("btn-secondary");
    updateButtonTimer(btn, timeLeft);

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
      // Recalcula o tempo
      const newTimeLeft = COOLDOWN_TIME - (Date.now() - parseInt(lastRefresh));

      if (newTimeLeft <= 0) {
        clearInterval(cooldownInterval);
        localStorage.removeItem(storageKey); // <--- Remove a chave dinâmica
        checkRefreshCooldown();
      } else {
        updateButtonTimer(btn, newTimeLeft);
      }
    }, 1000);
  } else {
    btn.disabled = false;
    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-primary");
    btn.innerHTML =
      '<i class="bi bi-arrow-clockwise"></i> Atualizar Dados (IA)';
    localStorage.removeItem(storageKey); // <--- Remove a chave dinâmica
  }
}

function updateButtonTimer(btn, ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  btn.innerHTML = `⏳ Aguarde ${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function updateSentimentBadge(sentiment) {
  const badge = document.getElementById("sentimentBadge");
  if (!badge || !sentiment) return;
  const map = {
    POSITIVE: { text: "😊 Positiva", color: "bg-success" },
    NEGATIVE: { text: "😡 Negativa", color: "bg-danger" },
    NEUTRAL: { text: "😐 Neutra", color: "bg-warning text-dark" },
  };
  const info = map[sentiment] || map["NEUTRAL"];
  badge.innerText = info.text;
  badge.className = `badge ms-2 ${info.color}`;
}

// Função para buscar a Amostra Grátis
async function fetchFreeSample(event) {
  // 1. Impede o formulário de recarregar a página
  if (event) event.preventDefault();

  const input = document.getElementById("sampleCompanyInput");
  const resultArea = document.getElementById("sampleResults");
  const btn = document.getElementById("btnSample");

  const companyName = input.value.trim();

  if (!companyName) {
    showToast("Por favor, digite o nome de uma empresa.");
    return;
  }

  // UI de Carregamento
  btn.disabled = true;
  const originalBtnText = btn.innerHTML; // Salva o texto original
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm"></span> Analisando...';

  resultArea.innerHTML = "";
  resultArea.classList.remove("d-none");

  try {
    // Certifique-se que API_URL está definida (ex: "http://localhost:3000")
    const res = await fetch(
      `${API_URL}/sample?company=${encodeURIComponent(companyName)}`
    );
    const response = await res.json();

    if (res.ok) {
      renderSampleResults(response.data);
    } else {
      resultArea.innerHTML = `<div class="alert alert-warning">Não encontramos dados para "${companyName}".</div>`;
    }
  } catch (error) {
    console.error(error);
    resultArea.innerHTML = `<div class="alert alert-danger">Erro de conexão com o servidor.</div>`;
  } finally {
    // Restaura o botão
    btn.disabled = false;
    btn.innerHTML = originalBtnText;
  }
}

// Função auxiliar para desenhar os cards (Pode manter a mesma de antes)
function renderSampleResults(reviews) {
  const container = document.getElementById("sampleResults");

  if (!reviews || reviews.length === 0) {
    container.innerHTML =
      '<p class="text-white text-center">Nenhuma avaliação encontrada.</p>';
    return;
  }

  let html =
    '<h5 class="mb-3 text-center text-white">🔎 Resultados da Análise Gratuita:</h5><div class="row g-3">';

  reviews.forEach((review) => {
    let badgeClass = "bg-secondary";
    if (review.sentiment === "POSITIVE") badgeClass = "bg-success";
    if (review.sentiment === "NEGATIVE") badgeClass = "bg-danger";

    html += `
      <div class="col-md-6">
        <div class="card h-100 shadow-sm border-0" style="background: rgba(255,255,255,0.95);">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="badge bg-light text-dark border"><i class="bi bi-globe"></i> ${
                review.source || "Web"
              }</span>
              <span class="badge ${badgeClass}">${review.sentiment}</span>
            </div>
            <p class="card-text small text-muted">"${review.content}"</p>
            <small class="text-secondary fw-bold">- ${
              review.author || "Anônimo"
            }</small>
          </div>
        </div>
      </div>
    `;
  });

  html += "</div>";

  // CTA para login
  html += `
    <div class="text-center mt-4 p-3 rounded" style="background: rgba(0,0,0,0.2);">
      <p class="text-white mb-2">Isso é apenas uma amostra do que a IA pode fazer!</p>
      <a href="index.html" class="btn btn-warning fw-bold px-4">
        🚀 Ver Análise Completa + Consultoria IA
      </a>
    </div>
  `;

  container.innerHTML = html;
}
