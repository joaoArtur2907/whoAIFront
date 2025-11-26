const API_URL = "http://localhost:3000";
let currentPage = 1;

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
        document.getElementById("alertBox").innerText = "As senhas não conferem!";
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
      if (!res.ok) throw new Error(data.message || data.error || "Erro na autenticação");

      if (isLogin) {
        localStorage.setItem("who_token", data.token);
        window.location.href = "dashboard.html";
      } else {
        alert("Conta criada! Agora faça login.");
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
  // Se estiver na página dashboard, carrega infos
  if (document.getElementById("setupSection")) {
    await loadCompanyInfo();
    // Recupera sentimento salvo para não piscar
    const savedSentiment = localStorage.getItem("last_sentiment");
    if(savedSentiment) updateSentimentBadge(savedSentiment);
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
      if(titleEl) titleEl.innerText = data.name;
      
      loadDashboardData(1); // Inicia carregamento dos dados
      checkRefreshCooldown(); // Verifica se botão deve estar bloqueado
    }
  } catch (err) {
    console.error(err);
  }
}

// --- [NOVO] Função de Excluir Empresa (Reset) ---
async function deleteCompany() {
  if (!confirm("Tem certeza? Isso apagará todos os dados coletados e permitirá cadastrar outra empresa.")) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/company`, {
      method: "DELETE",
      headers: getHeaders()
    });

    if (res.ok) {
      localStorage.removeItem("last_sentiment");
      localStorage.removeItem("last_refresh_time");
      location.reload(); // Recarrega para cair no setupSection
    } else {
      alert("Erro ao excluir empresa.");
    }
  } catch (err) {
    alert("Erro de conexão.");
  }
}

async function createCompany() {
  const name = document.getElementById("companyName").value;
  if (!name) return alert("Digite um nome!");

  if (!confirm(`Confirmar criação da empresa "${name}"?`)) return;

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
  if (document.getElementById("btnRefresh").disabled) return;

  const loading = document.getElementById("loadingOverlay");
  if(loading) loading.classList.remove("d-none");

  try {
    const res = await fetch(`${API_URL}/data/refresh`, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await res.json();
    if (res.ok) {
      alert(`Sucesso! Análise concluída.`);

      // Atualiza sentimento visualmente
      if (data.overallSentiment) {
        localStorage.setItem("last_sentiment", data.overallSentiment);
        updateSentimentBadge(data.overallSentiment);
      }

      // Bloqueia botão
      localStorage.setItem("last_refresh_time", Date.now().toString());
      checkRefreshCooldown();
      
      // Recarrega TUDO (Gráficos, Feed e RELATÓRIO DE TEXTO)
      loadDashboardData(1);
      
    } else {
      alert("Erro ao atualizar dados: " + (data.error || "Erro desconhecido"));
    }
  } catch (err) {
    alert("Erro de conexão (Timeout ou Falha no Servidor).");
  } finally {
    if(loading) loading.classList.add("d-none");
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
    const res = await fetch(`${API_URL}/dashboard/stats?period=30`, { headers: getHeaders() });
    const stats = await res.json();
    document.getElementById("statTotal").innerText = stats.total || 0;
    document.getElementById("statPositive").innerText = stats.positive || 0;
    document.getElementById("statNegative").innerText = stats.negative || 0;
    document.getElementById("statNeutral").innerText = stats.neutral || 0;
  } catch(e) { console.error("Erro stats", e); }
}

async function loadTopics() {
  try {
    const res = await fetch(`${API_URL}/dashboard/topics?period=30`, { headers: getHeaders() });
    const topicsData = await res.json();
    const topicsList = document.getElementById("topicsList");
    if(!topicsList) return;
    
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
  } catch(e) { console.error("Erro topics", e); }
}

// --- [NOVO] Função para buscar os Textos da IA ---
async function loadReport() {
  try {
    const res = await fetch(`${API_URL}/dashboard/report`, { headers: getHeaders() });
    
    if (res.ok) {
      const report = await res.json();
      
      // Front deve ter elementos com esses IDs
      const elAnalysis = document.getElementById("reportAnalysis");
      const elSuggestion = document.getElementById("reportSuggestion");

      if (elAnalysis) elAnalysis.innerText = report.analysis || "Análise pendente...";
      if (elSuggestion) elSuggestion.innerText = report.suggestion || "Sugestão pendente...";
      
      // Atualiza o sentimento se ainda não tiver
      if (report.sentiment) updateSentimentBadge(report.sentiment);
    }
  } catch(e) { 
    console.error("Erro report", e); 
  }
}

async function loadFeed(page) {
  try {
    const limit = 5;
    const res = await fetch(`${API_URL}/dashboard/feed?page=${page}&limit=${limit}`, { headers: getHeaders() });
    const feedData = await res.json();
    const feedList = document.getElementById("feedList");
    if(!feedList) return;
    
    feedList.innerHTML = "";

    const totalPages = feedData.meta ? feedData.meta.lastPage : 1;
    const pageInfo = document.getElementById("pageInfo");
    if(pageInfo) pageInfo.innerText = `Página ${page} de ${totalPages}`;
    
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    if(btnPrev) btnPrev.disabled = page <= 1;
    if(btnNext) btnNext.disabled = page >= totalPages;

    if (!feedData.data || feedData.data.length === 0) {
      feedList.innerHTML = '<p class="text-muted text-center p-3">Nenhum dado encontrado.</p>';
      return;
    }

    feedData.data.forEach((item) => {
      let badgeColor = "secondary";
      if (item.sentiment === "POSITIVE") badgeColor = "success";
      if (item.sentiment === "NEGATIVE") badgeColor = "danger";

      const fullText = item.content || "";
      const shortText = fullText.length > 120 ? fullText.substring(0, 120) + "..." : fullText;
      const hasMore = fullText.length > 120;
      const title = item.source || "Fonte Web"; // Título agora é a fonte

      feedList.innerHTML += `
        <div class="card mb-2 shadow-sm">
            <div class="card-body py-2">
                <h6 class="card-title d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-globe"></i> ${title}</span>
                    <span class="badge bg-${badgeColor}">${item.sentiment}</span>
                </h6>
                
                <div class="card-text small text-muted mb-1 mt-2">
                    <span class="short-text">${shortText}</span>
                    ${hasMore ? `<span class="full-text d-none">${fullText}</span>` : ""}
                    ${hasMore ? `<br><a href="#" class="text-primary text-decoration-none" style="font-size:0.85em" onclick="toggleReadMore(this); return false;">Ler mais</a>` : ""}
                </div>
                
                <div class="d-flex justify-content-between mt-2">
                   <small class="text-muted" style="font-size: 0.7em">${new Date(item.createdAt).toLocaleDateString()}</small>
                   ${item.originalUrl && item.originalUrl !== 'Google Search' ? `<a href="${item.originalUrl}" target="_blank" style="font-size: 0.7em"><i class="bi bi-box-arrow-up-right"></i> Link original</a>` : ''}
                </div>
            </div>
        </div>`;
    });
  } catch(e) { console.error("Erro feed", e); }
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

function checkRefreshCooldown() {
  const btn = document.getElementById("btnRefresh");
  if (!btn) return;

  const lastRefresh = localStorage.getItem("last_refresh_time");
  if (!lastRefresh) {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Atualizar Dados (IA)';
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
      const newTimeLeft = COOLDOWN_TIME - (Date.now() - parseInt(lastRefresh));
      if (newTimeLeft <= 0) {
        clearInterval(cooldownInterval);
        localStorage.removeItem("last_refresh_time");
        checkRefreshCooldown();
      } else {
        updateButtonTimer(btn, newTimeLeft);
      }
    }, 1000);
  } else {
    btn.disabled = false;
    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-primary");
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Atualizar Dados (IA)';
    localStorage.removeItem("last_refresh_time");
  }
}

function updateButtonTimer(btn, ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  btn.innerHTML = `⏳ Aguarde ${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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