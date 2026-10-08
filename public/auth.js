/* Password + email OTP. The API and PostgreSQL require a server-issued session grant. */
(()=>{
 'use strict';
 const q=s=>document.querySelector(s);
 let client=null,profile=null,challenge=null,appLoaded=false,refreshCookie=null;
 const nativeFetch=window.fetch.bind(window);
 const message=(text,error=false)=>{q('#authMessage').textContent=text;q('#authMessage').classList.toggle('error',error);};
 function screen(name){q('#loginStep').hidden=name!=='login';q('#mfaStep').hidden=name!=='mfa';document.body.dataset.auth='locked';}
 function lock(text='Sua sessão terminou. Entre novamente.'){
  profile=null;screen('login');q('#authPassword').value='';message(text,true);
  q('#authCode').value='';challenge=null;
  q('#credentialPassword').textContent='';q('#credentialEmail').textContent='';q('#userCredential').hidden=true;
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 }
 async function token(){const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session)throw Error('Faça login para continuar.');return data.session.access_token;}
 async function request(url,options={}){
  const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+await token());
  const response=await nativeFetch(url,{...options,headers,credentials:'same-origin'});
  if(response.status===401)lock();
  return response;
 }
 async function syncCookie(){
  const response=await request('/api/auth/session',{method:'POST'}),data=await response.json();
  if(!response.ok)throw Error(data.error||'Acesso não autorizado.');
  profile=data;return data;
 }
 async function unlock(){
  await syncCookie();
  q('#accountName').textContent=profile.name||profile.email;
  q('#usersNav').hidden=profile.role!=='admin';
  document.body.dataset.auth='ready';message('');
  q('#authCode').value='';challenge=null;
  if(!appLoaded){
   appLoaded=true;const s=document.createElement('script');s.src='/app.js?v=online-1';document.body.append(s);
  }else if(typeof window.refresh==='function')await window.refresh();
 }
 async function authPost(path,body){
  const r=await nativeFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível entrar.');return data;
 }
 async function busy(form,fn){const button=form.querySelector('button[type="submit"]');button.disabled=true;try{message('');await fn();}catch(e){message(e.message||'Não foi possível entrar.',true);}finally{button.disabled=false;}}
 q('#loginForm').addEventListener('submit',e=>{e.preventDefault();busy(e.target,async()=>{
  if(!client)throw Error('Aguarde a configuração da conexão.');
  let data;try{data=await authPost('/api/auth/login',{email:q('#authEmail').value.trim(),password:q('#authPassword').value});}finally{q('#authPassword').value='';}
  challenge=data.challenge;screen('mfa');q('#mfaCodeForm').reset();
  q('#mfaTitle').textContent='Confira seu e-mail';
  q('#mfaDescription').textContent='Enviamos um código de 6 dígitos para '+q('#authEmail').value.trim()+'. Ele vale por 10 minutos. Confira também a pasta de spam.';
  message('');q('#authCode').focus();
 });});
 q('#mfaCodeForm').addEventListener('submit',e=>{e.preventDefault();busy(e.target,async()=>{
  const code=q('#authCode').value.trim();if(!/^\d{6}$/.test(code))throw Error('Digite os 6 dígitos enviados ao e-mail.');
  const session=await authPost('/api/auth/verify',{challenge,code});
  const {error}=await client.auth.setSession(session);if(error)throw error;
  await unlock();
 });});
 async function signOut(){
  try{await request('/api/auth/logout',{method:'POST'});}catch(e){}
  if(client)await client.auth.signOut({scope:'local'});window.location.reload();
 }
 q('#authBack').onclick=signOut;q('#logoutButton').onclick=signOut;
 window.HMAuth={request,get profile(){return profile;},lock};
 async function init(){
  try{
   const r=await nativeFetch('/api/config',{cache:'no-store'}),config=await r.json();if(!r.ok)throw Error(config.error);
   const sdkFetch=(url,options={})=>{const headers=new Headers(options.headers||{});if(/^Bearer sb_(publishable|secret)_/.test(headers.get('Authorization')||''))headers.delete('Authorization');return nativeFetch(url,{...options,headers});};
   client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey,{global:{fetch:sdkFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'happy-machine-auth'}});
   client.auth.onAuthStateChange((event)=>{
    if(event==='TOKEN_REFRESHED'&&profile){clearTimeout(refreshCookie);refreshCookie=setTimeout(()=>syncCookie().catch(()=>lock()),0);}
    if(event==='SIGNED_OUT'&&profile)lock();
   });
   const {data}=await client.auth.getSession();
   if(data.session){try{await unlock();}catch(e){lock('Sua sessão expirou. Entre novamente para receber um novo código.');}}else message('');
  }catch(e){message(e.message||'Não foi possível conectar ao serviço.',true);}
 }
 init();
})();
