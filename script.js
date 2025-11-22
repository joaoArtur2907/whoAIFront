const API_URL = "http://localhost:3000";

// --- Funções Auxiliares ---

// Pega o token salvo
const getToken = () => localStorage.getItem("who_token");

// Faz headers com autorização
const getHeaders = () => {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
};

// Logout
function logout() {
  localStorage.removeItem("who_token");
  window.location.href = "index.html";
}

// --- Lógica do Login/Registro (index.html) ---

const authForm = document.getElementById("authForm");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const endpoint = isLogin ? "/auth/login" : "/auth/register";

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
        toggleAuth("login");
      }
    } catch (err) {
      const alertBox = document.getElementById("alertBox");
      alertBox.innerText = err.message;
      alertBox.classList.remove("d-none");
    }
  });
}

// --- Lógica do Dashboard (dashboard.html) ---

async function checkAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }
  // Se estiver no dashboard, carrega dados iniciais
  if (document.getElementById("setupSection")) {
    await loadCompanyInfo();
  }
}

async function loadCompanyInfo() {
  try {
    const res = await fetch(`${API_URL}/company/me`, { headers: getHeaders() });

    if (res.status === 404) {
      // Usuário não tem empresa, mostra setup
      document.getElementById("setupSection").classList.remove("d-none");
    } else if (res.ok) {
      const data = await res.json();
      document.getElementById("dashboardSection").classList.remove("d-none");
      document.getElementById("companyTitle").innerText = data.name;
      loadDashboardData();
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao carregar perfil.");
  }
}

async function createCompany() {
  const name = document.getElementById("companyName").value;
  if (!name) return alert("Digite um nome!");

  try {
    const res = await fetch(`${API_URL}/company`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      location.reload(); // Recarrega para ir pro dashboard
    } else {
      alert("Erro ao criar empresa");
    }
  } catch (err) {
    console.error(err);
  }
}

// AÇÃO PESADA: Dispara o Scraper + IA
async function refreshData() {
  const loading = document.getElementById("loadingOverlay");
  loading.classList.remove("d-none"); // Mostra Spinner

  try {
    const res = await fetch(`${API_URL}/data/refresh`, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await res.json();
    if (res.ok) {
      alert(`Sucesso! ${data.totalSaved} novas reclamações analisadas.`);
      loadDashboardData();
    } else {
      alert("Erro ao atualizar dados. Verifique o backend.");
    }
  } catch (err) {
    alert("Erro de conexão ou Timeout.");
  } finally {
    loading.classList.add("d-none"); // Esconde Spinner
  }
}

async function loadDashboardData() {
  // 1. Carregar Stats
  const resStats = await fetch(`${API_URL}/dashboard/stats?period=30`, {
    headers: getHeaders(),
  });
  const stats = await resStats.json();

  document.getElementById("statTotal").innerText = stats.total || 0;
  document.getElementById("statPositive").innerText = stats.positive || 0;
  document.getElementById("statNegative").innerText = stats.negative || 0;
  document.getElementById("statNeutral").innerText = stats.neutral || 0;

  // 2. Carregar Tópicos
  const resTopics = await fetch(`${API_URL}/dashboard/topics?period=30`, {
    headers: getHeaders(),
  });
  const topicsData = await resTopics.json();
  const topicsList = document.getElementById("topicsList");
  topicsList.innerHTML = "";

  // Transforma objeto em array e ordena
  const sortedTopics = Object.entries(topicsData.topics || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // Top 5

  if (sortedTopics.length === 0)
    topicsList.innerHTML = '<li class="list-group-item">Sem dados</li>';

  sortedTopics.forEach(([topic, count]) => {
    topicsList.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${topic}
                <span class="badge bg-primary rounded-pill">${count}</span>
            </li>`;
  });

  // 3. Carregar Feed
  const resFeed = await fetch(`${API_URL}/dashboard/feed?page=1&limit=5`, {
    headers: getHeaders(),
  });
  const feedData = await resFeed.json();
  const feedList = document.getElementById("feedList");
  feedList.innerHTML = "";

  if (!feedData.data || feedData.data.length === 0) {
    feedList.innerHTML =
      '<p class="text-muted">Nenhuma reclamação encontrada.</p>';
    return;
  }

  feedData.data.forEach((item) => {
    let badgeColor = "secondary";
    if (item.sentiment === "POSITIVE") badgeColor = "success";
    if (item.sentiment === "NEGATIVE") badgeColor = "danger";

    feedList.innerHTML += `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <h6 class="card-title d-flex justify-content-between">
                        ${item.title || "Sem título"}
                        <span class="badge bg-${badgeColor}">${
      item.sentiment
    }</span>
                    </h6>
                    <p class="card-text small text-muted mb-1">${item.content.substring(
                      0,
                      100
                    )}...</p>
                    <small class="text-muted" style="font-size: 0.7em">${new Date(
                      item.createdAt
                    ).toLocaleDateString()}</small>
                </div>
            </div>`;
  });
}
