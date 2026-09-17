
const KEY="tracklyMidnightCleanV2";

const CLOUD_CONFIG_KEY="tracklySupabaseConfigV1";
const CLOUD_LOCAL_UPDATED_KEY="tracklyCloudLocalUpdatedAt";
const CLOUD_SYNCED_USER_KEY="tracklyCloudSyncedUser";
const CLOUD_TABLE="trackly_user_state";
const PKBON_CLOUD_KEYS=[
  "pkbon_history","pkbon_settings","pkbon_sites","pkbon_banks",
  "pkbon_templates","pkbon_officers"
];

let cloudClient=null;
let cloudSession=null;
let cloudPushTimer=null;
let cloudApplying=false;
let cloudReconciling=false;
let cloudLastError="";

const SUPABASE_URL=window.TRACKLY_CONFIG?.supabaseUrl||"";
const SUPABASE_PUBLISHABLE_KEY=window.TRACKLY_CONFIG?.supabasePublishableKey||"";

function cloudConfig(){
  return {url:SUPABASE_URL,key:SUPABASE_PUBLISHABLE_KEY}
}
function cloudConfigured(){
  return !!(SUPABASE_URL&&SUPABASE_PUBLISHABLE_KEY)
}
function cloudSetStatus(mode,label,sub=""){
  const syncLabel={
    local:"Belum Terhubung",
    syncing:"Menyinkronkan...",
    online:"Tersinkron",
    error:"Gagal Sinkron"
  }[mode]||label||"";
  if($("cloudSyncStatus"))$("cloudSyncStatus").textContent=syncLabel;
  if($("cloudSyncTime")&&sub)$("cloudSyncTime").textContent=sub
}
function cloudLocalTouch(){
  if(cloudApplying)return;
  localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY,new Date().toISOString())
}
function cloudHasLocalData(){
  const hasTrackly=state.sites.length||state.clients.length||state.bastProcesses.length;
  let hasPkbon=false;
  try{
    const h=JSON.parse(localStorage.getItem("pkbon_history")||"[]");
    hasPkbon=Array.isArray(h)&&h.length>0
  }catch{}
  return !!(hasTrackly||hasPkbon)
}
function cloudReadPkbon(){
  const out={};
  PKBON_CLOUD_KEYS.forEach(k=>{
    const raw=localStorage.getItem(k);
    if(raw===null)return;
    try{out[k]=JSON.parse(raw)}catch{out[k]=raw}
  });
  return out
}
function cloudSnapshot(){
  return {
    version:44,
    trackly:JSON.parse(JSON.stringify(state)),
    pkbon:cloudReadPkbon(),
    saved_at:new Date().toISOString()
  }
}
function cloudApplySnapshot(snapshot){
  if(!snapshot||typeof snapshot!=="object")return false;
  cloudApplying=true;
  try{
    if(snapshot.trackly){
      localStorage.setItem(KEY,JSON.stringify(snapshot.trackly))
    }
    const pk=snapshot.pkbon&&typeof snapshot.pkbon==="object"?snapshot.pkbon:{};
    // Reset-aware sync: keys omitted from cloud snapshot must also be removed locally.
    PKBON_CLOUD_KEYS.forEach(k=>localStorage.removeItem(k));
    Object.entries(pk).forEach(([k,v])=>{
      if(!PKBON_CLOUD_KEYS.includes(k))return;
      localStorage.setItem(k,typeof v==="string"?v:JSON.stringify(v))
    });
    localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY,snapshot.saved_at||new Date().toISOString());
    return true
  }finally{
    cloudApplying=false
  }
}
function scheduleCloudPush(reason="change"){
  if(cloudApplying||!cloudSession||!cloudClient)return;
  cloudLocalTouch();
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(()=>cloudPush(reason),1200)
}
async function cloudPush(reason="manual"){
  if(!cloudSession||!cloudClient)return false;
  cloudSetStatus("syncing","SYNCING","Mengirim data...");
  const snap=cloudSnapshot();
  const payload={
    user_id:cloudSession.user.id,
    snapshot:snap,
    updated_at:snap.saved_at
  };
  const {error}=await cloudClient.from(CLOUD_TABLE).upsert(payload,{onConflict:"user_id"});
  if(error){
    cloudLastError=error.message||String(error);
    cloudSetStatus("error","ERROR","Cloud gagal");
    if($("cloudSyncTime"))$("cloudSyncTime").textContent=cloudLastError;
    return false
  }
  localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY,snap.saved_at);
  localStorage.setItem(CLOUD_SYNCED_USER_KEY,cloudSession.user.id);
  cloudSetStatus("online","CLOUD","Tersimpan");
  if($("cloudSyncTime"))$("cloudSyncTime").textContent="Terakhir sync "+new Date().toLocaleString("id-ID");
  return true
}
async function cloudGetRow(){
  if(!cloudSession||!cloudClient)return null;
  const {data,error}=await cloudClient.from(CLOUD_TABLE)
    .select("snapshot,updated_at")
    .eq("user_id",cloudSession.user.id)
    .maybeSingle();
  if(error){
    cloudLastError=error.message||String(error);
    throw error
  }
  return data||null
}
function cloudReloadFromSnapshot(snapshot,updatedAt){
  if(!cloudApplySnapshot(snapshot))return;
  if(updatedAt)localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY,updatedAt);
  localStorage.setItem(CLOUD_SYNCED_USER_KEY,cloudSession.user.id);
  location.reload()
}
async function cloudReconcile(){
  if(cloudReconciling||!cloudSession||!cloudClient)return;
  cloudReconciling=true;
  cloudSetStatus("syncing","SYNCING","Mengecek cloud...");
  try{
    const row=await cloudGetRow();
    const localHas=cloudHasLocalData();
    const syncedUser=localStorage.getItem(CLOUD_SYNCED_USER_KEY);
    const localTs=Date.parse(localStorage.getItem(CLOUD_LOCAL_UPDATED_KEY)||"")||0;
    const cloudTs=Date.parse(row?.updated_at||"")||0;

    if(!row){
      await cloudPush("first-upload");
      return
    }

    if(syncedUser!==cloudSession.user.id&&localHas){
      $("cloudConflictModal").classList.add("open");
      cloudSetStatus("syncing","PILIH DATA","Sinkronisasi pertama");
      return
    }

    if(cloudTs>localTs){
      cloudReloadFromSnapshot(row.snapshot,row.updated_at);
      return
    }

    if(localTs>cloudTs){
      await cloudPush("local-newer");
      return
    }

    localStorage.setItem(CLOUD_SYNCED_USER_KEY,cloudSession.user.id);
    cloudSetStatus("online","CLOUD","Sinkron");
    if($("cloudSyncTime"))$("cloudSyncTime").textContent="Data cloud sudah sinkron.";
  }catch(err){
    cloudSetStatus("error","ERROR","Cloud gagal");
    if($("cloudSyncTime"))$("cloudSyncTime").textContent=err?.message||String(err)
  }finally{
    cloudReconciling=false
  }
}
function cloudUpdateAccountUI(){
  const u=cloudSession?.user;
  const meta=u?.user_metadata||{};
  const name=meta.full_name||meta.name||u?.email?.split("@")[0]||"Trackers Workspace";
  const email=u?.email||"";
  const initial=(name||"T").slice(0,1).toUpperCase();

  if($("cloudUserName"))$("cloudUserName").textContent=u?name:"Trackers Workspace";
  if($("cloudUserEmail"))$("cloudUserEmail").textContent=u?email:"Belum login";
  if($("cloudAvatar"))$("cloudAvatar").textContent=initial;
  if($("cloudAvatarMini"))$("cloudAvatarMini").textContent=initial;
  if($("cloudAccountLabel"))$("cloudAccountLabel").textContent=u?name:"TRACKERS";
  if($("cloudAccountSub"))$("cloudAccountSub").textContent=u?(currentAccessProfile?roleLabel(currentAccessProfile.role):email):"Masuk";
}
function cloudShowAuth(show){
  $("cloudAuthGate")?.classList.toggle("show",!!show)
}
function setLoginInline(message="",type="info"){
  const el=$("loginInlineStatus");if(!el)return;
  el.textContent=message||"";
  el.className="login-inline-status"+(message?" show "+type:"")
}
function setLoginBusy(busy){
  const btn=$("loginSubmitBtn");if(!btn)return;
  btn.disabled=!!busy;
  btn.textContent=busy?"Memeriksa...":"Masuk"
}
function friendlyAuthError(err){
  const raw=String(err?.message||err||"").toLowerCase();
  if(raw.includes("invalid login credentials"))return "Email atau password tidak cocok.";
  if(raw.includes("email not confirmed"))return "Email belum dikonfirmasi.";
  if(raw.includes("failed to fetch")||raw.includes("network")||raw.includes("load failed"))
    return "Tidak bisa terhubung ke Supabase. Periksa koneksi internet.";
  if(raw.includes("rate limit"))return "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.";
  return "Login gagal. Periksa email, password, dan koneksi internet."
}
function authTimeout(promise,ms=15000){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Login timeout")),ms))
  ])
}
async function ensureSupabaseSdk(){
  if(window.supabase?.createClient)return true;
  const urls=[
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"
  ];
  for(const src of urls){
    try{
      await new Promise((resolve,reject)=>{
        const s=document.createElement("script");
        s.src=src;s.async=true;
        s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s)
      });
      if(window.supabase?.createClient)return true
    }catch(_){}
  }
  return false
}
async function cloudHandleSession(session){
  cloudSession=session||null;
  cloudUpdateAccountUI();

  if(!cloudSession){
    currentAccessProfile=null;
    cloudSetStatus("local","LOGIN","Masukkan email & password");
    setLoginBusy(false);
    cloudShowAuth(true);
    return
  }

  const allowed=await ensureCurrentUserAccess();
  if(!allowed)return;

  cloudShowAuth(false);
  await cloudReconcile()
}
async function cloudInit(){
  const localMode=["file:","content:"].includes(location.protocol);
  if($("localTestHint"))$("localTestHint").style.display=localMode?"block":"none";

  const lastEmail=localStorage.getItem("tracklyLastLoginEmail")||"";
  if(lastEmail&&$("loginEmail")&&!$("loginEmail").value)$("loginEmail").value=lastEmail;

  const sdkReady=await ensureSupabaseSdk();
  if(!sdkReady){
    cloudSetStatus("error","ERROR","Library login gagal dimuat.");
    setLoginInline("Komponen login gagal dimuat. Pastikan internet aktif lalu refresh halaman.","error");
    cloudShowAuth(true);
    return
  }

  const c=cloudConfig();
  cloudClient=window.supabase.createClient(c.url,c.key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });

  const {data,error}=await cloudClient.auth.getSession();
  if(error){
    cloudSetStatus("error","ERROR","Sesi login gagal.");
    setLoginInline("Sesi login gagal dibaca. Refresh halaman lalu coba lagi.","error");
    cloudShowAuth(true);
    return
  }

  await cloudHandleSession(data.session);

  cloudClient.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      recoveryMode=true;
      setTimeout(()=>openModal("resetPasswordModal"),0);
      return
    }
    setTimeout(()=>cloudHandleSession(session),0)
  })
}
let currentAccessProfile=null;
let recoveryMode=false;

function roleLabel(role){
  return {
    owner:"Owner",
    superadmin:"Superadmin",
    admin:"Admin",
    project_manager:"Project Manager",
    regional_pic:"PIC Regional",
    viewer:"Viewer"
  }[role]||role||"-"
}
function isAdminRole(role){
  return role==="owner"||role==="superadmin"||role==="admin"
}
async function fetchCurrentAccessProfile(){
  if(!cloudClient||!cloudSession?.user)return null;
  const {data,error}=await cloudClient
    .from("profiles")
    .select("user_id,email,full_name,role,access_enabled")
    .eq("user_id",cloudSession.user.id)
    .maybeSingle();
  if(error)throw error;
  return data||null
}
async function ensureCurrentUserAccess(){
  try{
    currentAccessProfile=await fetchCurrentAccessProfile();
    const allowed=!!currentAccessProfile&&currentAccessProfile.access_enabled!==false;
    if(!allowed){
      cloudShowAuth(false);
      openModal("accessDeniedModal");
      return false
    }
    if($("userAccessSubtitle")){
      $("userAccessSubtitle").textContent=isAdminRole(currentAccessProfile.role)
        ? roleLabel(currentAccessProfile.role)+" • Kelola akses"
        : roleLabel(currentAccessProfile.role)+" • Tidak dapat mengelola user"
    }
    cloudUpdateAccountUI();
    return true
  }catch(err){
    console.error(err);
    cloudSetStatus("error","ERROR","Gagal memeriksa akses.");
    return false
  }
}
async function emailPasswordLogin(email,password){
  if(!cloudClient)throw new Error("Supabase client belum siap");
  const normalizedEmail=String(email||"").trim().toLowerCase();
  if(!normalizedEmail||!password)throw new Error("Email dan password wajib diisi");

  cloudSetStatus("syncing","LOGIN","Memeriksa akun...");
  setLoginInline("Menghubungkan ke server...","info");
  setLoginBusy(true);

  try{
    const {data,error}=await authTimeout(
      cloudClient.auth.signInWithPassword({email:normalizedEmail,password}),
      15000
    );
    if(error)throw error;
    localStorage.setItem("tracklyLastLoginEmail",normalizedEmail);
    setLoginInline("Login berhasil. Membuka Trackers Workspace...","info");
    return data
  }catch(err){
    cloudSetStatus("error","ERROR","Login gagal");
    setLoginInline(friendlyAuthError(err),"error");
    throw err
  }finally{
    setLoginBusy(false)
  }
}
async function requestPasswordReset(email){
  if(!cloudClient)return;
  const redirectTo=location.origin&&location.origin!=="null"
    ? location.origin+location.pathname
    : location.href.split("#")[0].split("?")[0];
  const {error}=await cloudClient.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error
}
async function setNewPassword(password){
  if(!cloudClient)return;
  const {error}=await cloudClient.auth.updateUser({password});
  if(error)throw error
}
async function loadAdminUsers(){
  const wrap=$("adminUserList");if(!wrap)return;
  if(!currentAccessProfile||!isAdminRole(currentAccessProfile.role)){
    wrap.innerHTML='<div class="admin-user-empty">Hanya Owner/Admin yang dapat mengelola akses user.</div>';
    return
  }
  wrap.innerHTML='<div class="admin-user-empty">Memuat user...</div>';
  const {data,error}=await cloudClient.rpc("trackly_admin_list_profiles");
  if(error){
    wrap.innerHTML='<div class="admin-user-empty">Gagal memuat user. Jalankan SQL v44 terlebih dahulu.</div>';
    return
  }
  const rows=Array.isArray(data)?data:[];
  wrap.innerHTML=rows.length?rows.map(u=>`
    <div class="admin-user-row">
      <div class="admin-user-main">
        <strong>${esc(u.full_name||u.email||"User")}</strong>
        <small>${esc(u.email||"-")}</small>
      </div>
      <select class="admin-role-select" data-admin-role="${esc(u.user_id)}" ${u.role==="owner"?"disabled":""}>
        ${["admin","project_manager","regional_pic","viewer"].map(r=>
          `<option value="${r}" ${u.role===r?"selected":""}>${roleLabel(r)}</option>`
        ).join("")}
        ${u.role==="owner"?'<option value="owner" selected>Owner</option>':""}
      </select>
      <div class="admin-user-status">${u.access_enabled===false?"Nonaktif":"Aktif"}</div>
    </div>`).join("")
    :'<div class="admin-user-empty">Belum ada user.</div>';

  document.querySelectorAll("[data-admin-role]").forEach(sel=>sel.onchange=async()=>{
    const userId=sel.dataset.adminRole;
    const role=sel.value;
    const {error}=await cloudClient.rpc("trackly_admin_set_role",{target_user:userId,new_role:role});
    if(error){
      toast("Gagal ubah role: "+error.message);
      await loadAdminUsers();
      return
    }
    toast("Role user diperbarui")
  })
}
async function cloudSignOut(){
  if(!cloudClient)return;
  await cloudClient.auth.signOut();
  localStorage.removeItem(CLOUD_SYNCED_USER_KEY);
  cloudSession=null;
  cloudUpdateAccountUI();
  cloudShowAuth(true);
  closeModal("cloudAccountModal")
}


const BAST=["BOQ","PO","BAUT","BAPWP","BAST","GR"];
function clearBundledDemoDataOnce(){
  const marker="tracklyCleanMidnightV2DataReset";
  try{
    if(localStorage.getItem(marker)==="1")return;
    [
      "tracklyReviewV3","tracklyMidnightCleanV2",
      "pkbon_history","pkbon_settings","pkbon_sites","pkbon_banks","pkbon_templates","pkbon_officers"
    ].forEach(k=>localStorage.removeItem(k));
    localStorage.setItem(marker,"1")
  }catch(_){ }
}
clearBundledDemoDataOnce();
