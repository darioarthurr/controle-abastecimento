let session = null;
let currentView = "loginView";
let formDirty = false;
let currentVehicles = [];
let currentUsers = [];
let currentFuel = [];

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {

  await AppDB.open();

  registerPWA();
  setupNavigationProtection();
  setupPhotoPreview();
  setupForms();

  const saved = await AppDB.get(
    "session",
    "current"
  );

  if (saved?.session) {

    session = saved.session;

    await showDashboard();

  } else {

    showView("loginView");

  }

  updateConnection();

  window.addEventListener(
    "online",
    async () => {

      updateConnection();

      if (session) {
        await syncPending();
      }

    }
  );

  window.addEventListener(
    "offline",
    updateConnection
  );

  setInterval(
    () => {
      if (session && navigator.onLine) {
        syncPending();
      }
    },
    APP_CONFIG.SYNC_INTERVAL_MS
  );

});


/* =====================================================
   PWA
===================================================== */

function registerPWA() {

  if ("serviceWorker" in navigator) {

    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(console.error);

  }

}


/* =====================================================
   CONEXÃO
===================================================== */

function updateConnection() {

  const el = $("connectionStatus");

  if (!el) return;

  el.textContent =
    navigator.onLine
      ? "● Online"
      : "● Offline — dados locais";

}


/* =====================================================
   NAVEGAÇÃO
===================================================== */

function showView(id) {

  document
    .querySelectorAll(".view")
    .forEach(v =>
      v.classList.add("hidden")
    );

  const target = $(id);

  if (!target) return;

  target.classList.remove("hidden");

  currentView = id;

  window.scrollTo(0, 0);

}


function applyRoleUI() {

  const isMgmt =
    session.role === "GESTAO" ||
    session.role === "ADM";

  document
    .querySelectorAll(".management-only")
    .forEach(el =>
      el.classList.toggle(
        "hidden",
        !isMgmt
      )
    );

}


/* =====================================================
   DASHBOARD
===================================================== */

async function showDashboard() {

  $("logoutButton")
    .classList.remove("hidden");

  $("welcomeTitle")
    .textContent =
    `Olá, ${session.name || session.username}`;

  $("roleLabel")
    .textContent =
    `Perfil: ${session.role}`;

  applyRoleUI();

  showView("dashboardView");

  await loadDashboard();

}


async function loadDashboard() {

  renderLocalKPIs();

  if (
    navigator.onLine &&
    (
      session.role === "ADM" ||
      session.role === "GESTAO"
    )
  ) {

    try {

      const result =
        await API.request(
          "dashboard",
          {}
        );

      renderServerDashboard(
        result
      );

    } catch (err) {

      console.warn(
        "Dashboard remoto:",
        err
      );

    }

  }

  await renderVehiclePerformance();

}


function renderLocalKPIs() {

  AppDB.getAll("fuel")
    .then(rows => {

      const totalLiters =
        rows.reduce(
          (sum, r) =>
            sum + Number(r.liters || 0),
          0
        );

      const totalCost =
        rows.reduce(
          (sum, r) =>
            sum + Number(r.totalValue || 0),
          0
        );

      const pending =
        rows.filter(
          r =>
            r.syncStatus !== "SYNCED"
        ).length;

      const avgPrice =
        totalLiters > 0
          ? totalCost / totalLiters
          : 0;

      $("kpiGrid").innerHTML = `

        <div class="kpi">
          <div class="label">
            Abastecimentos
          </div>
          <div class="value">
            ${rows.length}
          </div>
        </div>

        <div class="kpi">
          <div class="label">
            Litros
          </div>
          <div class="value">
            ${totalLiters.toFixed(2)} L
          </div>
        </div>

        <div class="kpi">
          <div class="label">
            Custo
          </div>
          <div class="value">
            ${formatMoney(totalCost)}
          </div>
        </div>

        <div class="kpi">
          <div class="label">
            Preço médio/L
          </div>
          <div class="value">
            ${formatMoney(avgPrice)}
          </div>
        </div>

        <div class="kpi">
          <div class="label">
            Pendentes
          </div>
          <div class="value">
            ${pending}
          </div>
        </div>

      `;

    });

}


function renderServerDashboard(data) {

  if (!data?.kpis) return;

  const k = data.kpis;

  $("kpiGrid").innerHTML = `

    <div class="kpi">
      <div class="label">
        Veículos ativos
      </div>
      <div class="value">
        ${k.vehicles || 0}
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Abastecimentos
      </div>
      <div class="value">
        ${k.fuels || 0}
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Litros
      </div>
      <div class="value">
        ${Number(k.liters || 0).toFixed(2)} L
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Custo total
      </div>
      <div class="value">
        ${formatMoney(k.cost)}
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Preço médio/L
      </div>
      <div class="value">
        ${formatMoney(k.pricePerLiter)}
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Consumo médio
      </div>
      <div class="value">
        ${Number(k.averageConsumption || 0).toFixed(2)} km/L
      </div>
    </div>

    <div class="kpi">
      <div class="label">
        Anomalias
      </div>
      <div class="value">
        ${k.anomalies || 0}
      </div>
    </div>

  `;

  renderAnomalies(
    data.anomalies || []
  );

}


function renderAnomalies(anomalies) {

  if (!anomalies.length) {

    $("anomalySummary").innerHTML =
      `<div class="status-ok">
        ✓ Nenhuma anomalia identificada.
      </div>`;

    return;

  }

  $("anomalySummary").innerHTML =
    anomalies.map(a => `

      <div class="anomaly">

        <strong>
          ⚠️ ${escapeHtml(a.plate)}
        </strong>

        <div>
          Consumo:
          ${Number(a.consumption).toFixed(2)}
          km/L
        </div>

        <div>
          Mínimo esperado:
          ${Number(a.expectedMin).toFixed(2)}
          km/L
        </div>

      </div>

    `).join("");

}


/* =====================================================
   DESEMPENHO
===================================================== */

async function renderVehiclePerformance() {

  if (
    session.role !== "ADM" &&
    session.role !== "GESTAO"
  ) return;

  const vehicles =
    await AppDB.getAll("vehicles");

  const fuels =
    await AppDB.getAll("fuel");

  if (!vehicles.length) {

    $("vehiclePerformance").innerHTML =
      "Nenhum veículo cadastrado.";

    return;

  }

  const html =
    vehicles
      .filter(v => v.active !== false)
      .map(v => {

        const rows =
          fuels
            .filter(
              f =>
                f.vehicleId === v.id
            )
            .sort(
              (a,b) =>
                Number(b.odometerKm || 0) -
                Number(a.odometerKm || 0)
            );

        const latest =
          rows[0];

        const consumption =
          latest?.consumption || 0;

        let status =
          "NORMAL";

        let statusClass =
          "status-ok";

        if (
          v.expectedMinKmL > 0 &&
          consumption > 0 &&
          consumption <
          v.expectedMinKmL
        ) {

          status = "ATENÇÃO";
          statusClass =
            "status-warning";

        }

        if (
          v.expectedMinKmL > 0 &&
          consumption > 0 &&
          consumption <
          v.expectedMinKmL * .7
        ) {

          status = "CRÍTICO";
          statusClass =
            "status-critical";

        }

        return `

          <div class="vehicle-performance">

            <div>

              <strong>
                ${escapeHtml(v.plate)}
              </strong>

              <div>
                ${escapeHtml(v.brand)}
                ${escapeHtml(v.model)}
              </div>

            </div>

            <div class="${statusClass}">

              ${
                consumption
                  ? consumption.toFixed(2) +
                    " km/L"
                  : "-"
              }

              <br>

              ${status}

            </div>

          </div>

        `;

      })
      .join("");

  $("vehiclePerformance")
    .innerHTML = html;

}


/* =====================================================
   FORMULÁRIOS
===================================================== */

function setupForms() {

  $("loginForm")
    .addEventListener(
      "submit",
      login
    );

  $("logoutButton")
    .onclick = logout;

  $("newFuelButton")
    .onclick = async () => {

      await loadVehicles();

      formDirty = false;

      showView("fuelView");

    };

  $("historyButton")
    .onclick = async () => {

      await loadHistory();

      showView("historyView");

    };

  $("vehiclesButton")
    .onclick = async () => {

      await loadVehiclesManagement();

      showView("vehiclesView");

    };

  $("usersButton")
    .onclick = async () => {

      await loadUsersManagement();

      showView("usersView");

    };

  $("refreshDashboardButton")
    .onclick = loadDashboard;

  document
    .querySelectorAll("[data-back]")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          if (
            currentView === "fuelView" &&
            formDirty
          ) {

            if (
              !confirm(
                "Existe um abastecimento em andamento. Deseja sair?"
              )
            ) return;

          }

          formDirty = false;

          showView(
            btn.dataset.back
          );

        }
      );

    });


  $("cancelFuelButton")
    .onclick = () => {

      if (
        formDirty &&
        !confirm(
          "O lançamento não foi salvo. Deseja sair?"
        )
      ) return;

      formDirty = false;

      showDashboard();

    };


  $("fuelForm")
    .addEventListener(
      "input",
      () => {

        formDirty = true;

        $("draftStatus")
          .textContent =
          "Rascunho salvo no dispositivo.";

        saveDraft();

      }
    );


  $("fuelForm")
    .addEventListener(
      "submit",
      saveFuel
    );


  $("vehicleForm")
    .addEventListener(
      "submit",
      saveVehicle
    );


  $("cancelVehicleEdit")
    .onclick =
    clearVehicleForm;


  $("userForm")
    .addEventListener(
      "submit",
      saveUser
    );


  $("cancelUserEdit")
    .onclick =
    clearUserForm;


  $("historySearch")
    .addEventListener(
      "input",
      renderHistoryTable
    );


  $("historyFuelFilter")
    .addEventListener(
      "change",
      renderHistoryTable
    );

}


/* =====================================================
   LOGIN
===================================================== */

async function login(e) {

  e.preventDefault();

  $("loginMessage")
    .textContent =
    "Autenticando...";

  try {

    const result =
      await API.request(
        "login",
        {
          username:
            $("loginUser").value.trim(),

          password:
            $("loginPassword").value
        }
      );

    session =
      result.session;

    await AppDB.put(
      "session",
      {
        key: "current",
        session
      }
    );

    $("loginForm")
      .reset();

    $("loginMessage")
      .textContent = "";

    await showDashboard();

  } catch (err) {

    $("loginMessage")
      .textContent =
      err.message;

  }

}


/* =====================================================
   LOGOUT
===================================================== */

async function logout() {

  try {

    if (navigator.onLine) {

      await API.request(
        "logout",
        {}
      );

    }

  } catch (e) {}

  session = null;

  await AppDB.put(
    "session",
    {
      key: "current",
      session: null
    }
  );

  $("logoutButton")
    .classList.add("hidden");

  showView("loginView");

}


/* =====================================================
   VEÍCULOS
===================================================== */

async function loadVehicles() {

  let vehicles =
    await AppDB.getAll("vehicles");

  if (
    navigator.onLine &&
    APP_CONFIG.API_URL
  ) {

    try {

      const result =
        await API.request(
          "vehicles.list",
          {}
        );

      vehicles =
        result.vehicles || [];

      for (const v of vehicles) {

        await AppDB.put(
          "vehicles",
          v
        );

      }

    } catch (e) {

      console.warn(e);

    }

  }

  currentVehicles =
    vehicles.filter(
      v => v.active !== false
    );

  $("vehicleId").innerHTML =
    currentVehicles
      .map(v => `

        <option
          value="${escapeHtml(v.id)}"
          data-plate="${escapeHtml(v.plate)}"
        >

          ${escapeHtml(v.plate)}
          —
          ${escapeHtml(v.brand)}
          ${escapeHtml(v.model)}

        </option>

      `)
      .join("")
      ||
      `<option value="">
        Nenhum veículo cadastrado
      </option>`;

}


async function loadVehiclesManagement() {

  if (!navigator.onLine) {

    currentVehicles =
      await AppDB.getAll("vehicles");

  } else {

    try {

      const result =
        await API.request(
          "vehicles.list",
          {}
        );

      currentVehicles =
        result.vehicles || [];

      for (
        const v of currentVehicles
      ) {
        await AppDB.put(
          "vehicles",
          v
        );
      }

    } catch (e) {

      currentVehicles =
        await AppDB.getAll(
          "vehicles"
        );

    }

  }

  renderVehiclesTable();

}


function renderVehiclesTable() {

  $("vehiclesTable")
    .innerHTML =
    currentVehicles.map(v => `

      <tr>

        <td>
          <strong>
            ${escapeHtml(v.plate)}
          </strong>
        </td>

        <td>
          ${escapeHtml(v.brand)}
          ${escapeHtml(v.model)}
        </td>

        <td>
          ${escapeHtml(v.fuelType)}
        </td>

        <td>
          ${Number(v.tankCapacity || 0).toFixed(1)} L
        </td>

        <td>
          ${
            v.active !== false
              ? `<span class="active-badge">Ativo</span>`
              : `<span class="inactive-badge">Inativo</span>`
          }
        </td>

        <td>

          <button
            class="secondary action-small"
            onclick="editVehicle('${escapeJs(v.id)}')"
          >
            Editar
          </button>

          <button
            class="secondary action-small"
            onclick="toggleVehicle('${escapeJs(v.id)}')"
          >
            ${
              v.active !== false
                ? "Desativar"
                : "Ativar"
            }
          </button>

        </td>

      </tr>

    `).join("")
    ||
    `<tr>
      <td colspan="6">
        Nenhum veículo cadastrado.
      </td>
    </tr>`;

}


window.editVehicle = function(id) {

  const v =
    currentVehicles.find(
      x => x.id === id
    );

  if (!v) return;

  $("vehicleEditId").value =
    v.id;

  $("vehiclePlate").value =
    v.plate;

  $("vehicleBrand").value =
    v.brand;

  $("vehicleModel").value =
    v.model;

  $("vehicleYear").value =
    v.year;

  $("vehicleFuelType").value =
    v.fuelType;

  $("tankCapacity").value =
    v.tankCapacity;

  $("expectedMinKmL").value =
    v.expectedMinKmL || "";

  $("expectedMaxKmL").value =
    v.expectedMaxKmL || "";

  $("vehicleFormTitle")
    .textContent =
    "Editar veículo";

  window.scrollTo(0,0);

};


async function saveVehicle(e) {

  e.preventDefault();

  if (
    session.role !== "ADM" &&
    session.role !== "GESTAO"
  ) {

    alert(
      "Sem permissão."
    );

    return;

  }

  const vehicle = {

    id:
      $("vehicleEditId").value ||
      crypto.randomUUID(),

    plate:
      $("vehiclePlate")
        .value
        .trim()
        .toUpperCase(),

    brand:
      $("vehicleBrand")
        .value
        .trim(),

    model:
      $("vehicleModel")
        .value
        .trim(),

    year:
      Number(
        $("vehicleYear").value
      ),

    fuelType:
      $("vehicleFuelType").value,

    tankCapacity:
      Number(
        $("tankCapacity").value
      ),

    expectedMinKmL:
      Number(
        $("expectedMinKmL").value || 0
      ),

    expectedMaxKmL:
      Number(
        $("expectedMaxKmL").value || 0
      ),

    active: true

  };

  try {

    if (navigator.onLine) {

      const result =
        await API.request(
          "vehicles.save",
          { vehicle }
        );

      await AppDB.put(
        "vehicles",
        result.vehicle
      );

    } else {

      await AppDB.put(
        "vehicles",
        vehicle
      );

      alert(
        "Veículo salvo localmente. Será sincronizado quando houver conexão."
      );

    }

    clearVehicleForm();

    await loadVehiclesManagement();

  } catch (err) {

    alert(err.message);

  }

}


window.toggleVehicle = async function(id) {

  if (!navigator.onLine) {

    alert(
      "Ative a conexão com a internet para alterar o cadastro."
    );

    return;

  }

  try {

    const result =
      await API.request(
        "vehicles.toggle",
        { id }
      );

    const v =
      currentVehicles.find(
        x => x.id === id
      );

    if (v) {
      v.active =
        result.active;
    }

    await AppDB.put(
      "vehicles",
      v
    );

    renderVehiclesTable();

  } catch (err) {

    alert(err.message);

  }

};


function clearVehicleForm() {

  $("vehicleForm")
    .reset();

  $("vehicleEditId")
    .value = "";

  $("vehicleFormTitle")
    .textContent =
    "Novo veículo";

}


/* =====================================================
   USUÁRIOS
===================================================== */

async function loadUsersManagement() {

  try {

    const result =
      await API.request(
        "users.list",
        {}
      );

    currentUsers =
      result.users || [];

    for (
      const u of currentUsers
    ) {

      await AppDB.put(
        "users",
        u
      );

    }

  } catch (err) {

    currentUsers =
      await AppDB.getAll(
        "users"
      );

  }

  renderUsersTable();

}


function renderUsersTable() {

  $("usersTable")
    .innerHTML =
    currentUsers.map(u => `

      <tr>

        <td>
          ${escapeHtml(u.name)}
        </td>

        <td>
          ${escapeHtml(u.username)}
        </td>

        <td>
          ${escapeHtml(u.role)}
        </td>

        <td>
          ${
            u.active
              ? `<span class="active-badge">Ativo</span>`
              : `<span class="inactive-badge">Inativo</span>`
          }
        </td>

        <td>

          <button
            class="secondary action-small"
            onclick="editUser('${escapeJs(u.id)}')"
          >
            Editar
          </button>

          <button
            class="secondary action-small"
            onclick="toggleUser('${escapeJs(u.id)}')"
          >
            ${
              u.active
                ? "Desativar"
                : "Ativar"
            }
          </button>

        </td>

      </tr>

    `).join("")
    ||
    `<tr>
      <td colspan="5">
        Nenhum usuário cadastrado.
      </td>
    </tr>`;

}


window.editUser = function(id) {

  const u =
    currentUsers.find(
      x => x.id === id
    );

  if (!u) return;

  if (
    session.role === "GESTAO" &&
    u.role === "ADM"
  ) {

    alert(
      "Gestão não pode editar usuário ADM."
    );

    return;

  }

  $("userEditId").value =
    u.id;

  $("newUserName").value =
    u.name;

  $("newUsername").value =
    u.username;

  $("newPassword").value =
    "";

  $("newRole").value =
    u.role;

  $("userFormTitle")
    .textContent =
    "Editar usuário";

};


async function saveUser(e) {

  e.preventDefault();

  const id =
    $("userEditId").value;

  const existing =
    currentUsers.find(
      x => x.id === id
    );

  const password =
    $("newPassword").value;

  if (!id && !password) {

    alert(
      "Informe uma senha para o novo usuário."
    );

    return;

  }

  const user = {

    id:
      id || crypto.randomUUID(),

    name:
      $("newUserName").value.trim(),

    username:
      $("newUsername").value.trim(),

    password,

    role:
      $("newRole").value,

    active:
      existing?.active !== false

  };

  try {

    const result =
      await API.request(
        "users.save",
        { user }
      );

    await AppDB.put(
      "users",
      result.user
    );

    clearUserForm();

    await loadUsersManagement();

  } catch (err) {

    alert(err.message);

  }

}


window.toggleUser = async function(id) {

  if (!navigator.onLine) {

    alert(
      "É necessária conexão para alterar usuários."
    );

    return;

  }

  try {

    const result =
      await API.request(
        "users.toggle",
        { id }
      );

    const u =
      currentUsers.find(
        x => x.id === id
      );

    if (u) {

      u.active =
        result.active;

      await AppDB.put(
        "users",
        u
      );

    }

    renderUsersTable();

  } catch (err) {

    alert(err.message);

  }

};


function clearUserForm() {

  $("userForm")
    .reset();

  $("userEditId")
    .value = "";

  $("userFormTitle")
    .textContent =
    "Novo usuário";

}


/* =====================================================
   HISTÓRICO
===================================================== */

async function loadHistory() {

  let rows =
    await AppDB.getAll("fuel");

  if (
    navigator.onLine &&
    session
  ) {

    try {

      const result =
        await API.request(
          "fuel.list",
          {}
        );

      rows =
        result.fuels || [];

      for (const r of rows) {

        await AppDB.put(
          "fuel",
          r
        );

      }

    } catch (err) {

      console.warn(
        "Histórico remoto:",
        err
      );

    }

  }

  calculateLocalConsumption(rows);

  currentFuel =
    rows.sort(
      (a,b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

  renderHistoryTable();

}


function renderHistoryTable() {

  const search =
    $("historySearch")
      .value
      .trim()
      .toUpperCase();

  const fuelFilter =
    $("historyFuelFilter")
      .value;

  const rows =
    currentFuel.filter(r => {

      const matchPlate =
        !search ||
        String(r.plate || "")
          .toUpperCase()
          .includes(search);

      const matchFuel =
        !fuelFilter ||
        r.fuelType === fuelFilter;

      return (
        matchPlate &&
        matchFuel
      );

    });

  $("historyTable")
    .innerHTML =
    rows.map(r => `

      <tr>

        <td>
          ${formatDate(r.createdAt)}
        </td>

        <td>
          ${escapeHtml(r.plate || "-")}
        </td>

        <td>
          ${Number(r.odometerKm || 0)
            .toLocaleString("pt-BR")}
        </td>

        <td>
          ${Number(r.liters || 0)
            .toFixed(2)}
        </td>

        <td>
          ${formatMoney(r.pricePerLiter)}
        </td>

        <td>
          ${
            r.consumption
              ? Number(r.consumption)
                  .toFixed(2) +
                " km/L"
              : "-"
          }
        </td>

        <td>

          <span
            class="sync-status ${
              r.syncStatus === "SYNCED"
                ? "status-synced"
                : "status-pending"
            }"
          >

            ${
              r.syncStatus === "SYNCED"
                ? "SINCRONIZADO"
                : "PENDENTE"
            }

          </span>

        </td>

        <td>

          ${
            session.role === "ADM"
              ? `
                <button
                  class="secondary action-small"
                  onclick="editFuel('${escapeJs(r.id)}')"
                >
                  Corrigir
                </button>
              `
              : "-"
          }

        </td>

      </tr>

    `).join("")
    ||
    `<tr>
      <td colspan="8">
        Nenhum registro encontrado.
      </td>
    </tr>`;

}


function calculateLocalConsumption(rows) {

  const grouped = {};

  rows.forEach(r => {

    if (!grouped[r.vehicleId]) {
      grouped[r.vehicleId] = [];
    }

    grouped[r.vehicleId].push(r);

  });

  Object.values(grouped)
    .forEach(list => {

      list.sort(
        (a,b) =>
          Number(a.odometerKm) -
          Number(b.odometerKm)
      );

      for (
        let i = 1;
        i < list.length;
        i++
      ) {

        const distance =
          Number(
            list[i].odometerKm
          ) -
          Number(
            list[i-1].odometerKm
          );

        const liters =
          Number(
            list[i].liters
          );

        if (
          distance > 0 &&
          liters > 0
        ) {

          list[i].consumption =
            distance / liters;

        }

      }

    });

}


/* =====================================================
   ABASTECIMENTO
===================================================== */

async function saveDraft() {

  const draft = {

    id: "current",

    vehicleId:
      $("vehicleId").value,

    odometerKm:
      $("odometerKm").value,

    fuelType:
      $("fuelType").value,

    liters:
      $("liters").value,

    totalValue:
      $("totalValue").value,

    updatedAt:
      new Date().toISOString()

  };

  await AppDB.put(
    "drafts",
    draft
  );

}


async function saveFuel(e) {

  e.preventDefault();

  const button =
    $("saveFuelButton");

  if (button.disabled) return;

  const option =
    $("vehicleId")
      .selectedOptions[0];

  if (!option?.value) {

    alert(
      "Selecione um veículo."
    );

    return;

  }

  const odometer =
    Number(
      $("odometerKm").value
    );

  const liters =
    Number(
      $("liters").value
    );

  const totalValue =
    Number(
      $("totalValue").value
    );

  if (
    !Number.isFinite(odometer) ||
    odometer < 0
  ) {

    alert(
      "Informe uma quilometragem válida."
    );

    return;

  }

  if (
    !Number.isFinite(liters) ||
    liters <= 0
  ) {

    alert(
      "Informe uma quantidade válida de litros."
    );

    return;

  }

  const vehicle =
    currentVehicles.find(
      v => v.id === option.value
    );

  if (
    vehicle?.tankCapacity > 0 &&
    liters >
      vehicle.tankCapacity * 1.10
  ) {

    alert(
      `Quantidade acima da capacidade do tanque (${vehicle.tankCapacity} L).`
    );

    return;

  }

  const odometerPhoto =
    $("odometerPhoto")
      .files[0];

  const receiptPhoto =
    $("receiptPhoto")
      .files[0];

  if (
    !odometerPhoto ||
    !receiptPhoto
  ) {

    alert(
      "As duas fotos são obrigatórias."
    );

    return;

  }

  button.disabled = true;
  button.textContent =
    "Processando...";

  try {

    const photos =
      await Promise.all([
        compressImage(
          odometerPhoto
        ),
        compressImage(
          receiptPhoto
        )
      ]);

    const gps =
      await getGPS();

    const record = {

      id:
        crypto.randomUUID(),

      plate:
        option.dataset.plate,

      vehicleId:
        option.value,

      odometerKm:
        odometer,

      fuelType:
        $("fuelType").value,

      liters,

      totalValue,

      pricePerLiter:
        totalValue / liters,

      createdAt:
        new Date().toISOString(),

      userId:
        session.username,

      latitude:
        gps?.latitude || "",

      longitude:
        gps?.longitude || "",

      gpsAccuracy:
        gps?.accuracy || "",

      syncStatus:
        "PENDING",

      odometerPhoto:
        photos[0],

      receiptPhoto:
        photos[1]

    };

    // Salva imediatamente no dispositivo.
    await AppDB.put(
      "fuel",
      record
    );

    await AppDB.put(
      "syncQueue",
      {
        id: record.id,
        type: "fuel.create",
        recordId: record.id,
        createdAt:
          new Date().toISOString()
      }
    );

    formDirty = false;

    await AppDB.put(
      "drafts",
      {
        id: "current",
        updatedAt: null
      }
    );

    $("draftStatus")
      .textContent =
      "Abastecimento salvo no dispositivo.";

    if (navigator.onLine) {

      await syncPending();

    }

    alert(
      "Abastecimento registrado com sucesso."
    );

    resetFuelForm();

    await showDashboard();

  } catch (err) {

    alert(
      err.message ||
      "Não foi possível salvar o abastecimento."
    );

  } finally {

    button.disabled = false;
    button.textContent =
      "Salvar abastecimento";

  }

}


/* =====================================================
   SINCRONIZAÇÃO
===================================================== */

async function syncPending() {

  if (
    !navigator.onLine ||
    !session
  ) return;

  const queue =
    await AppDB.getAll(
      "syncQueue"
    );

  for (const item of queue) {

    try {

      const record =
        await AppDB.get(
          "fuel",
          item.recordId
        );

      if (!record) {

        await AppDB.remove(
          "syncQueue",
          item.id
        );

        continue;

      }

      const payload = {

        fuel: {

          id: record.id,

          vehicleId:
            record.vehicleId,

          plate:
            record.plate,

          odometerKm:
            record.odometerKm,

          fuelType:
            record.fuelType,

          liters:
            record.liters,

          totalValue:
            record.totalValue,

          createdAt:
            record.createdAt,

          latitude:
            record.latitude,

          longitude:
            record.longitude,

          gpsAccuracy:
            record.gpsAccuracy,

          odometerPhoto:
            record.odometerPhoto,

          receiptPhoto:
            record.receiptPhoto

        }

      };

      const result =
        await API.request(
          "fuel.create",
          payload
        );

      record.syncStatus =
        "SYNCED";

      record.serverAt =
        result.fuel?.serverAt ||
        new Date().toISOString();

      record.consumption =
        result.fuel?.consumption ||
        record.consumption ||
        null;

      // Depois de sincronizado,
      // mantém o registro, mas remove
      // os dados pesados das fotos locais.
      delete record.odometerPhoto;
      delete record.receiptPhoto;

      await AppDB.put(
        "fuel",
        record
      );

      await AppDB.remove(
        "syncQueue",
        item.id
      );

    } catch (err) {

      console.warn(
        "Falha de sincronização:",
        item.id,
        err
      );

      // Não remove da fila.
      // Tenta novamente posteriormente.

    }

  }

  renderLocalKPIs();

}


/* =====================================================
   FOTOS
===================================================== */

function setupPhotoPreview() {

  [
    [
      "odometerPhoto",
      "odometerPreview"
    ],
    [
      "receiptPhoto",
      "receiptPreview"
    ]
  ]
  .forEach(
    ([input, img]) => {

      $(input)
        .addEventListener(
          "change",
          () => {

            const file =
              $(input)
                .files[0];

            if (!file) return;

            $(img).src =
              URL.createObjectURL(
                file
              );

            $(img)
              .classList
              .remove("hidden");

          }
        );

    }
  );

}


function compressImage(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload = () => {

        const img =
          new Image();

        img.onload = () => {

          let width =
            img.width;

          let height =
            img.height;

          const max =
            APP_CONFIG.MAX_PHOTO_WIDTH;

          if (width > max) {

            height =
              height *
              (max / width);

            width = max;

          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            width;

          canvas.height =
            height;

          const ctx =
            canvas.getContext(
              "2d"
            );

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          const dataUrl =
            canvas.toDataURL(
              "image/jpeg",
              APP_CONFIG.PHOTO_QUALITY
            );

          resolve({

            name:
              file.name,

            mimeType:
              "image/jpeg",

            data:
              dataUrl.split(",")[1]

          });

        };

        img.onerror =
          () =>
            reject(
              new Error(
                "Não foi possível processar a imagem."
              )
            );

        img.src =
          reader.result;

      };

      reader.onerror =
        () =>
          reject(
            reader.error
          );

      reader.readAsDataURL(
        file
      );

    }
  );

}


/* =====================================================
   GPS
===================================================== */

function getGPS() {

  return new Promise(
    resolve => {

      if (
        !navigator.geolocation
      ) {

        resolve(null);
        return;

      }

      navigator.geolocation.getCurrentPosition(
        position => {

          resolve({

            latitude:
              position.coords.latitude,

            longitude:
              position.coords.longitude,

            accuracy:
              position.coords.accuracy

          });

        },
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000
        }
      );

    }
  );

}


/* =====================================================
   RESET
===================================================== */

function resetFuelForm() {

  $("fuelForm")
    .reset();

  $("odometerPreview")
    .classList
    .add("hidden");

  $("receiptPreview")
    .classList
    .add("hidden");

  $("gpsStatus")
    .textContent = "";

  $("draftStatus")
    .textContent = "";

}


/* =====================================================
   NAVEGAÇÃO / PULL REFRESH
===================================================== */

function setupNavigationProtection() {

  history.pushState(
    null,
    "",
    location.href
  );

  window.addEventListener(
    "popstate",
    () => {

      history.pushState(
        null,
        "",
        location.href
      );

      if (
        currentView ===
        "fuelView"
      ) {

        if (
          formDirty &&
          !confirm(
            "Existe um abastecimento em andamento. Deseja sair?"
          )
        ) {

          return;

        }

        formDirty = false;

      }

      if (
        currentView !==
        "dashboardView"
      ) {

        showDashboard();

      }

    }
  );


  window.addEventListener(
    "beforeunload",
    e => {

      if (formDirty) {

        e.preventDefault();
        e.returnValue = "";

      }

    }
  );


  let touchStartY = 0;

  document.addEventListener(
    "touchstart",
    e => {

      if (
        currentView === "fuelView" &&
        e.touches.length === 1
      ) {

        touchStartY =
          e.touches[0].clientY;

      }

    },
    { passive: true }
  );


  document.addEventListener(
    "touchmove",
    e => {

      if (
        currentView !== "fuelView" ||
        e.touches.length !== 1
      ) return;

      const currentY =
        e.touches[0].clientY;

      const delta =
        currentY -
        touchStartY;

      if (
        window.scrollY <= 0 &&
        delta > 0
      ) {

        e.preventDefault();

      }

    },
    { passive: false }
  );

}


/* =====================================================
   UTILITÁRIOS
===================================================== */

function formatMoney(value) {

  return Number(value || 0)
    .toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    );

}


function formatDate(value) {

  if (!value) return "-";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) return "-";

  return date.toLocaleString(
    "pt-BR"
  );

}


function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[c])
    );

}


function escapeJs(value) {

  return String(value)
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    );

}


window.editFuel = async function(id) {

  if (
    session.role !== "ADM"
  ) {

    alert(
      "Somente ADM pode corrigir abastecimentos."
    );

    return;

  }

  const fuel =
    currentFuel.find(
      x => x.id === id
    );

  if (!fuel) return;

  const km =
    prompt(
      "Nova quilometragem:",
      fuel.odometerKm
    );

  if (km === null) return;

  const liters =
    prompt(
      "Nova quantidade de litros:",
      fuel.liters
    );

  if (liters === null) return;

  const total =
    prompt(
      "Novo valor total:",
      fuel.totalValue
    );

  if (total === null) return;

  try {

    await API.request(
      "fuel.update",
      {
        fuel: {
          id,
          odometerKm:
            Number(km),
          liters:
            Number(liters),
          totalValue:
            Number(total)
        }
      }
    );

    alert(
      "Abastecimento corrigido pelo ADM."
    );

    await loadHistory();

  } catch (err) {

    alert(err.message);

  }

};
