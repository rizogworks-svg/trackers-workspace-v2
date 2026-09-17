/* Hidden Superadmin console. Security is enforced again inside Supabase RPCs. */
(async function(){
 const gate=document.getElementById('saGate'), consoleEl=document.getElementById('saConsole'), rowsEl=document.getElementById('saRows'), userEl=document.getElementById('saUser'), search=document.getElementById('saSearch'), createForm=document.getElementById('saCreateUserForm'), createMsg=document.getElementById('saCreateMessage');
 const cfg=window.TRACKLY_CONFIG||{};
 if(!window.supabase?.createClient||!cfg.supabaseUrl||!cfg.supabasePublishableKey){gate.innerHTML='<span class="sa-error">Konfigurasi Supabase tidak tersedia.</span>';return}
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data:{session}}=await client.auth.getSession();
 if(!session?.user){gate.innerHTML='Login ke Trackers Workspace terlebih dahulu.';return}
 const {data:profile,error:pErr}=await client.from('profiles').select('user_id,email,full_name,role,access_enabled').eq('user_id',session.user.id).maybeSingle();
 if(pErr||!profile||profile.access_enabled===false||!['superadmin','owner'].includes(profile.role)){
   gate.innerHTML='<span class="sa-error">Akses tidak tersedia.</span>'; userEl.textContent=session.user.email||'User'; return
 }
 userEl.textContent=`${profile.full_name||profile.email||session.user.email} • ${profile.role}`;
 gate.hidden=true; consoleEl.hidden=false;
 let users=[];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'-';
 function render(){
   const q=(search.value||'').toLowerCase().trim();
   const list=users.filter(u=>!q||`${u.full_name||''} ${u.email||''}`.toLowerCase().includes(q));
   rowsEl.innerHTML=list.map(u=>`<tr><td><strong>${esc(u.full_name||u.email||'User')}</strong><div style="color:var(--muted);font-size:11px;margin-top:3px">${esc(u.email||'-')}</div></td><td><select data-role="${u.user_id}">${['superadmin','admin','project_manager','regional_pic','viewer'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`).join('')}${u.role==='owner'?'<option value="owner" selected>owner</option>':''}</select></td><td><button class="sa-btn ${u.access_enabled!==false?'accent':''}" data-access="${u.user_id}" data-enabled="${u.access_enabled!==false}">${u.access_enabled!==false?'Aktif':'Nonaktif'}</button></td><td><span class="sa-pill ${u.state_updated_at?'on':''}">${fmt(u.state_updated_at)}</span></td><td><button class="sa-btn danger" data-reset="${u.user_id}" data-name="${esc(u.email||u.full_name||'user')}">Reset data</button></td></tr>`).join('')||'<tr><td colspan="5" class="sa-state">Tidak ada user.</td></tr>';
   rowsEl.querySelectorAll('[data-role]').forEach(el=>el.onchange=()=>setRole(el.dataset.role,el.value));
   rowsEl.querySelectorAll('[data-access]').forEach(el=>el.onclick=()=>setAccess(el.dataset.access,el.dataset.enabled!=='true'));
   rowsEl.querySelectorAll('[data-reset]').forEach(el=>el.onclick=()=>resetUser(el.dataset.reset,el.dataset.name));
 }
 async function load(){
   rowsEl.innerHTML='<tr><td colspan="5" class="sa-state">Memuat…</td></tr>';
   const {data,error}=await client.rpc('trackers_superadmin_list_profiles');
   if(error){rowsEl.innerHTML=`<tr><td colspan="5" class="sa-state sa-error">${esc(error.message)}<br>Jalankan supabase/002_superadmin.sql.</td></tr>`;return}
   users=Array.isArray(data)?data:[];render();
 }
 async function setRole(id,role){const {error}=await client.rpc('trackers_superadmin_set_role',{target_user:id,new_role:role});if(error)alert(error.message);await load()}
 async function setAccess(id,enabled){const {error}=await client.rpc('trackers_superadmin_set_access',{target_user:id,enabled});if(error)alert(error.message);await load()}
 async function resetUser(id,name){if(!confirm(`Reset seluruh data workspace ${name}? Akun login tidak dihapus.`))return;const {error}=await client.rpc('trackers_superadmin_reset_user_state',{target_user:id});if(error)alert(error.message);else alert('Data workspace user dikosongkan.');await load()}

 async function inviteUser(e){
   e.preventDefault();
   const email=document.getElementById('saNewEmail').value.trim();
   const full_name=document.getElementById('saNewName').value.trim();
   const role=document.getElementById('saNewRole').value;
   const access_enabled=document.getElementById('saNewAccess').checked;
   if(!email)return;
   createMsg.className='sa-message';createMsg.textContent='Mengirim undangan…';
   const {data,error}=await client.functions.invoke('trackers-admin-create-user',{body:{email,full_name,role,access_enabled}});
   if(error||data?.error){createMsg.className='sa-message err';createMsg.textContent=data?.error||error?.message||'Gagal membuat user.';return}
   createMsg.className='sa-message ok';createMsg.textContent=`Undangan dikirim ke ${email}.`;
   createForm.reset();document.getElementById('saNewAccess').checked=true;document.getElementById('saNewRole').value='viewer';
   await load();
 }

 if(createForm)createForm.onsubmit=inviteUser;
 search.oninput=render; await load();
})();