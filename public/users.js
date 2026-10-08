(()=>{
 const q=s=>document.querySelector(s);let users=[];
 const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function json(url,options){const r=await HMAuth.request(url,options);const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
 function notify(text){q('#usersMessage').textContent=text;}
 async function load(){try{users=await json('/api/admin/users');render();}catch(e){notify(e.message);}}
 function render(){q('#usersBody').innerHTML=users.map(u=>`<tr><td><strong>${escape(u.name||'Sem nome')}</strong></td><td>${escape(u.email)}</td><td>${u.role==='admin'?'Administrador':'Operador'}</td><td>${u.active?'Ativo':'Desativado'}</td><td class="userRowActions">${u.role==='admin'?'<span class="muted">Conta principal</span>':`<button class="btn ${u.active?'danger':''}" data-user="${u.id}">${u.active?'Desativar':'Ativar'}</button>`}</td></tr>`).join('');
 q('#usersBody').querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{const u=users.find(x=>x.id===b.dataset.user);b.disabled=true;try{await json('/api/admin/users/'+u.id+'/active',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!u.active})});await load();notify('Acesso atualizado.');}catch(e){notify(e.message);b.disabled=false;}});}
 q('#usersNav').addEventListener('click',load);
 q('#newUserForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;notify('');q('#userCredential').hidden=true;try{
 const data=await json('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:q('#newUserName').value.trim(),email:q('#newUserEmail').value.trim()})});
 q('#credentialEmail').textContent=data.email;q('#credentialPassword').textContent=data.password;q('#userCredential').hidden=false;e.target.reset();await load();notify('Usuário criado. O 2FA será obrigatório no primeiro acesso.');
 }catch(e){notify(e.message);}finally{b.disabled=false;}});
 q('#dismissCredential').onclick=()=>{q('#credentialPassword').textContent='';q('#credentialEmail').textContent='';q('#userCredential').hidden=true;};
})();
