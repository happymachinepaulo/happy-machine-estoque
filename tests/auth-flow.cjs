// Uses the real bundled SDK against isolated browser mocks. No cloud account is touched.
const {chromium}=require('C:/Users/Happy Machine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const uid='11111111-1111-4111-8111-111111111111';
const jwt=aal=>encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,email:'qa@example.test',aal,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aud:'authenticated',role:'authenticated',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]})+'.isolated-test-signature';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let verified=false,privateEarly=false;
 const user=()=>({id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.test',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},factors:verified?[{id:'factor-test',factor_type:'totp',status:'verified',friendly_name:'Test'}]:[]});
 const session=aal=>({access_token:jwt(aal),token_type:'bearer',expires_in:3600,refresh_token:'isolated-refresh-token',user:user()});
 const profile={id:uid,email:'qa@example.test',name:'Administrador de teste',role:'admin',active:true};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return json({});
  if(p==='/api/config')return json({supabaseUrl:'https://hm-isolated-test.supabase.co',supabaseAnonKey:'isolated-public-key'});
  if(url.hostname==='hm-isolated-test.supabase.co'){
   if(p==='/auth/v1/token')return json(session('aal1'));
   if(p==='/auth/v1/user')return json(user());
   if(p==='/auth/v1/factors')return json({id:'factor-test',type:'totp',friendly_name:'Test',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/></svg>',secret:'ISOLATEDTESTSECRET',uri:'otpauth://totp/TEST?secret=ISOLATEDTESTSECRET'}});
   if(p.endsWith('/challenge'))return json({id:'challenge-test',expires_at:Math.floor(Date.now()/1000)+300});
   if(p.endsWith('/verify')){
    if(req.postDataJSON().code!=='123456')return json({msg:'Invalid TOTP',code:'mfa_verification_failed'},400);
    verified=true;return json(session('aal2'));
   }
   throw Error('Unexpected isolated Auth request: '+p);
  }
  if(p.startsWith('/api/')){
   if(!verified){privateEarly=true;return json({error:'MFA required'},403);}
   if(p==='/api/auth/session')return json(profile);
   if(p==='/api/stats')return json({products:0,units:0,low:0,no_photo:0,pending:0,review_photos:0});
   if(['/api/products','/api/categories','/api/admin/users'].includes(p))return json([]);
   return json([]);
  }
  return route.continue();
 });
 const check=(label,value)=>{if(!value)throw Error(label);};
 try{
  await page.goto('http://127.0.0.1:8770',{waitUntil:'networkidle'});
  check('Login conceals application',!await page.locator('.topbar').isVisible());
  await page.locator('#authEmail').fill('qa@example.test');await page.locator('#authPassword').fill('Unused-Isolated-Test-Password9!');
  await page.locator('#loginForm button').click();await page.locator('#mfaStep').waitFor({state:'visible'});
  check('Mandatory enrollment visible',await page.locator('#mfaSetup').isVisible());
  check('Password alone conceals stock',!await page.locator('.topbar').isVisible());
  await page.screenshot({path:path.join(__dirname,'mfa-enrollment.png')});
  await page.locator('#authCode').fill('000000');await page.locator('#mfaCodeForm button').click();
  await page.locator('#authMessage.error').waitFor();check('Wrong code still locks stock',!await page.locator('.topbar').isVisible());
  await page.locator('#authCode').fill('123456');await page.locator('#mfaCodeForm button').click();
  await page.locator('.topbar').waitFor({state:'visible'});await page.locator('#products[aria-busy="false"]').waitFor({state:'attached'});
  check('Verified admin gets user management',await page.locator('#usersNav').isVisible());
  await page.locator('#usersNav').click();await page.locator('#view-users.active').waitFor();
  await page.screenshot({path:path.join(__dirname,'users-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'users-mobile.png')});
  check('Mobile page has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check('No private request before MFA',!privateEarly);check('No JS error',!errors.length);
  fs.writeFileSync(path.join(__dirname,'auth-flow.json'),JSON.stringify({passed:true,realSDK:true,backend:'isolated mocks',wrongCodeRejected:true,mfaRequired:true,privateEarly,errors},null,2));
  console.log('OK: SDK real, configuração TOTP, código errado mantém bloqueio, código correto libera interface e painel de usuários.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
