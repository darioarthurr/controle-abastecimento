let session = null;
let currentView = "loginView";
let formDirty = false;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  await AppDB.open();
  registerPWA();
  setupNavigationProtection();
  setupPhotoPreview();
  setupForms();

  const saved = await AppDB.get("session","current");
  if (saved?.session) {
    session = saved.session;
    await showDashboard();
  } else {
    showView("loginView");
  }

  updateConnection();
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
});

function registerPWA(){
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);
}

function updateConnection(){
  $("connectionStatus").textContent = navigator.onLine ? "● Online" : "● Offline — dados locais";
}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(id).classList.remove("hidden");
  currentView=id;
  window.scrollTo(0,0);
}

function applyRoleUI(){
  const isMgmt = session.role === "GESTAO" || session.role === "ADM";
  document.querySelectorAll(".management-only").forEach(el => el.classList.toggle("hidden", !isMgmt));
}

async function showDashboard(){
  $("logoutButton").classList.remove("hidden");
  $("welcomeTitle").textContent = `Olá, ${session.name || session.username}`;
  $("roleLabel").textContent = `Perfil: ${session.role}`;
  applyRoleUI();
  showView("dashboardView");
  renderKPIs();
  renderHistory();
}

function renderKPIs(){
  $("kpiGrid").innerHTML = `
    <div class="kpi"><div class="label">Abastecimentos locais</div><div class="value" id="kpiFuel">0</div></div>
    <div class="kpi"><div class="label">Litros registrados</div><div class="value" id="kpiLiters">0 L</div></div>
    <div class="kpi"><div class="label">Custo registrado</div><div class="value" id="kpiCost">R$ 0,00</div></div>
    <div class="kpi"><div class="label">Pendências</div><div class="value" id="kpiPending">0</div></div>`;
  AppDB.getAll("fuel").then(rows=>{
    $("kpiFuel").textContent=rows.length;
    $("kpiLiters").textContent=rows.reduce((s,r)=>s+Number(r.liters||0),0).toFixed(2)+" L";
    $("kpiCost").textContent=rows.reduce((s,r)=>s+Number(r.totalValue||0),0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    $("kpiPending").textContent=rows.filter(r=>r.syncStatus!=="SYNCED").length;
  });
}

async function renderHistory(){
  const rows=await AppDB.getAll("fuel");
  $("historyTable").innerHTML=rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(r=>`
    <tr>
      <td>${new Date(r.createdAt).toLocaleString("pt-BR")}</td>
      <td>${escapeHtml(r.plate||r.vehicleId||"-")}</td>
      <td>${Number(r.odometerKm).toLocaleString("pt-BR")}</td>
      <td>${Number(r.liters).toFixed(2)}</td>
      <td>${r.consumption ? Number(r.consumption).toFixed(2)+" km/L" : "-"}</td>
      <td class="${r.syncStatus==="SYNCED"?"status-synced":"status-pending"}">${r.syncStatus||"PENDENTE"}</td>
    </tr>`).join("") || `<tr><td colspan="6">Nenhum abastecimento registrado.</td></tr>`;
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function setupForms(){
  $("loginForm").addEventListener("submit", async e=>{
    e.preventDefault();
    $("loginMessage").textContent="Autenticando...";
    try{
      let result;
      if (APP_CONFIG.API_URL) {
        result=await API.request("login",{username:$("loginUser").value.trim(),password:$("loginPassword").value});
      } else {
        result={session:{username:$("loginUser").value.trim(),name:$("loginUser").value.trim(),role:"ADM",demo:true}};
      }
      session=result.session;
      await AppDB.put("session",{key:"current",session});
      await showDashboard();
    }catch(err){$("loginMessage").textContent=err.message}
  });

  $("logoutButton").onclick=async()=>{
    session=null;
    await AppDB.put("session",{key:"current",session:null});
    $("logoutButton").classList.add("hidden");
    showView("loginView");
  };

  $("newFuelButton").onclick=async()=>{
    await loadVehicles();
    formDirty=false;
    showView("fuelView");
  };

  $("historyButton").onclick=()=>{renderHistory();showView("historyView")};
  $("vehiclesButton").onclick=()=>showView("vehiclesView");
  $("usersButton").onclick=()=>showView("usersView");

  $("cancelFuelButton").onclick=()=>{
    if(!formDirty || confirm("O lançamento não foi salvo. Deseja sair?")){
      formDirty=false; showDashboard();
    }
  };

  $("fuelForm").addEventListener("input",()=>{
    formDirty=true;
    $("draftStatus").textContent="Rascunho salvo no dispositivo automaticamente.";
    saveDraft();
  });

  $("fuelForm").addEventListener("submit",saveFuel);

  $("vehicleForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const vehicle={
      id:crypto.randomUUID(),plate:$("vehiclePlate").value.toUpperCase().trim(),
      brand:$("vehicleBrand").value.trim(),model:$("vehicleModel").value.trim(),
      year:Number($("vehicleYear").value),fuelType:$("vehicleFuelType").value,
      tankCapacity:Number($("tankCapacity").value),createdAt:new Date().toISOString()
    };
    await AppDB.put("vehicles",vehicle);
    alert("Veículo salvo localmente. A sincronização com o backend será adicionada na próxima etapa.");
    e.target.reset();
  });

  $("userForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(session.role!=="ADM"){alert("Somente ADM pode cadastrar usuários.");return}
    alert("Cadastro de usuários será conectado ao backend na próxima etapa.");
  });
}

async function loadVehicles(){
  let vehicles=await AppDB.getAll("vehicles");
  if(!vehicles.length && APP_CONFIG.API_URL){
    try{
      const result=await API.request("vehicles.list",{});
      for(const v of result.vehicles||[]) await AppDB.put("vehicles",v);
      vehicles=await AppDB.getAll("vehicles");
    }catch(e){}
  }
  $("vehicleId").innerHTML=vehicles.map(v=>`<option value="${escapeHtml(v.id)}" data-plate="${escapeHtml(v.plate)}">${escapeHtml(v.plate)} — ${escapeHtml(v.brand)} ${escapeHtml(v.model)}</option>`).join("") || `<option value="">Nenhum veículo cadastrado</option>`;
}

async function saveDraft(){
  const draft={
    id:"current",
    vehicleId:$("vehicleId").value,odometerKm:$("odometerKm").value,
    fuelType:$("fuelType").value,liters:$("liters").value,totalValue:$("totalValue").value,
    updatedAt:new Date().toISOString()
  };
  await AppDB.put("drafts",draft);
}

async function saveFuel(e){
  e.preventDefault();
  const option=$("vehicleId").selectedOptions[0];
  if(!option?.value){alert("Selecione um veículo.");return}

  const odometerPhoto=$("odometerPhoto").files[0];
  const receiptPhoto=$("receiptPhoto").files[0];
  if(!odometerPhoto || !receiptPhoto){alert("As duas fotos são obrigatórias.");return}

  const record={
    id:crypto.randomUUID(),
    plate:option.dataset.plate,
    vehicleId:option.value,
    odometerKm:Number($("odometerKm").value),
    fuelType:$("fuelType").value,
    liters:Number($("liters").value),
    totalValue:Number($("totalValue").value),
    pricePerLiter:Number($("totalValue").value)/Number($("liters").value),
    createdAt:new Date().toISOString(),
    userId:session.username,
    syncStatus:"PENDING",
    photos:{
      odometerName:odometerPhoto.name,
      receiptName:receiptPhoto.name
    }
  };

  await AppDB.put("fuel",record);
  formDirty=false;
  await AppDB.put("drafts",{id:"current",updatedAt:null});
  $("draftStatus").textContent="Abastecimento salvo no dispositivo.";
  alert("Abastecimento registrado localmente. A sincronização com o servidor será conectada na próxima etapa.");
  showDashboard();
}

function setupPhotoPreview(){
  [["odometerPhoto","odometerPreview"],["receiptPhoto","receiptPreview"]].forEach(([input,img])=>{
    $(input).addEventListener("change",()=>{
      const file=$(input).files[0];
      if(!file)return;
      $(img).src=URL.createObjectURL(file);
      $(img).classList.remove("hidden");
    });
  });
}

function setupNavigationProtection(){
  window.addEventListener("beforeunload",e=>{
    if(formDirty){
      e.preventDefault();
      e.returnValue="";
    }
  });

  history.pushState(null,"",location.href);
  window.addEventListener("popstate",()=>{
    if(currentView==="fuelView" && formDirty){
      const leave=confirm("Existe um abastecimento em andamento. Deseja sair?");
      if(!leave) history.pushState(null,"",location.href);
      else {formDirty=false;showDashboard()}
    } else {
      history.pushState(null,"",location.href);
      if(currentView!=="dashboardView") showDashboard();
    }
  });

  document.addEventListener("touchmove",e=>{
    if(currentView==="fuelView" && window.scrollY===0 && e.touches.length===1){
      // Mantém o comportamento de pull-to-refresh desabilitado no contexto do formulário.
    }
  },{passive:true});
}
