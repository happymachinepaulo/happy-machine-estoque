/* Password + mandatory TOTP. The API and PostgreSQL independently enforce aal2. */
(()=>{
 'use strict';
 const q=s=>document.querySelector(s);
 let client=null,profile=null,factorId=null,appLoaded=false,refreshCookie=null;
 const nativeFetch=window.fetch.bind(window);
 const message=(text,error=false)=>{q('#authMessage').textContent=text;q('#authMessage').classList.toggle('error',error);};
 function screen(name){q('#loginStep').hidden=name!=='login';q('#mfaStep').hidden=name!=='mfa';document.body.dataset.auth='locked';}
 function lock(text='Sua sessão terminou. Entre novamente.'){
  profile=null;screen('login');q('#authPassword').value='';message(text,true);
  q('#authCode').value='';q('#mfaSecret').textContent='';q('#mfaQr').removeAttribute('src');
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
  q('#authCode').value='';q('#mfaSecret').textContent='';q('#mfaQr').removeAttribute('src');
  if(!appLoaded){
   appLoaded=true;const s=document.createElement('script');s.src='/app.js?v=online-1';document.body.append(s);
  }else if(typeof window.refresh==='function')await window.refresh();
 }
 async function nextStep(){
  const {data:level,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
  if(level.currentLevel==='aal2')return unlock();
  const {data:factors,error:factorError}=await client.auth.mfa.listFactors();if(factorError)throw factorError;
  const existing=factors.totp.find(f=>f.status==='verified');
  screen('mfa');q('#mfaCodeForm').reset();q('#mfaSetup').hidden=!!existing;
  if(existing){factorId=existing.id;q('#mfaTitle').textContent='Confirme que é você';q('#mfaDescription').textContent='Digite o código de 6 dígitos do seu aplicativo autenticador.';}
  else{
   q('#mfaTitle').textContent='Proteja seu acesso';q('#mfaDescription').textContent='Escaneie o QR code no seu aplicativo autenticador e digite o código para ativar o 2FA.';
   // Remove only abandoned, never-verified enrollments so reloads don't exhaust the factor limit.
   for(const factor of factors.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){
    const {error:cleanupError}=await client.auth.mfa.unenroll({factorId:factor.id});if(cleanupError)throw cleanupError;
   }
   const {data:enrolled,error:enrollError}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Happy Machine '+Date.now(),issuer:'Happy Machine'});
   if(enrollError)throw enrollError;
   factorId=enrolled.id;
   // Supabase's SVG is shown as an image, never injected as executable HTML.
   q('#mfaQr').src=enrolled.totp.qr_code.startsWith('data:')?enrolled.totp.qr_code:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(enrolled.totp.qr_code);
   q('#mfaSecret').textContent=enrolled.totp.secret;
  }
  message('');q('#authCode').focus();
 }
 async function busy(form,fn){const button=form.querySelector('button[type="submit"]');button.disabled=true;try{message('');await fn();}catch(e){message(e.message||'Não foi possível entrar.',true);}finally{button.disabled=false;}}
 q('#loginForm').addEventListener('submit',e=>{e.preventDefault();busy(e.target,async()=>{
  if(!client)throw Error('Aguarde a configuração da conexão.');
  const {error}=await client.auth.signInWithPassword({email:q('#authEmail').value.trim(),password:q('#authPassword').value});
  q('#authPassword').value='';
  if(error)throw Error(error.status===429?'Muitas tentativas. Aguarde antes de tentar novamente.':'E-mail ou senha inválidos.');
  await nextStep();
 });});
 q('#mfaCodeForm').addEventListener('submit',e=>{e.preventDefault();busy(e.target,async()=>{
  const code=q('#authCode').value.trim();if(!/^\d{6}$/.test(code))throw Error('Digite os 6 dígitos do autenticador.');
  const {error}=await client.auth.mfa.challengeAndVerify({factorId,code});if(error)throw Error('Código inválido ou expirado. Use o código atual do autenticador.');
  await unlock();
 });});
 async function signOut(){
  try{await request('/api/auth/logout',{method:'POST'});}catch(e){}
  if(client)await client.auth.signOut();window.location.reload();
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
   if(data.session)await nextStep();else message('');
  }catch(e){message(e.message||'Não foi possível conectar ao serviço.',true);}
 }
 init();
})();
