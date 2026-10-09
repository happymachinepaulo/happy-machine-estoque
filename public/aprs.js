(()=>{
 'use strict';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
 const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
 const ease=n=>n*n*(3-2*n);
 const mix=(a,b,n)=>a+(b-a)*n;
 const chapters=qa('.reviewStory,.repairPresentation,.teamStory,.closing');
 chapters.forEach(section=>{
  const interior=document.createElement('div');interior.className='sceneInterior';
  while(section.firstChild)interior.append(section.firstChild);
  section.append(interior);section.classList.add('continuousScene');
  section.querySelectorAll('.reveal').forEach(el=>el.classList.remove('reveal'));
 });
 const hero=q('.hero'),bear=q('.bearWrap'),scene=q('.inventoryStory'),move=q('.movementStory');
 const cards=qa('.pieceCard'),entry=q('.entryNote'),exit=q('.exitNote'),receipt=q('.historySlip');
 let pointer={x:0,y:0},smooth={x:0,y:0},frame=null,dirty=true,last=0;
 const progress=section=>clamp(-section.getBoundingClientRect().top/Math.max(1,section.offsetHeight-innerHeight));
 function request(){dirty=true;if(!frame)frame=requestAnimationFrame(render);}
 function render(time){
  frame=null;
  const t=clamp((time-last)/16,0,3);last=time;
  const amount=1-Math.pow(.86,t||1);
  smooth.x=mix(smooth.x,pointer.x,amount);smooth.y=mix(smooth.y,pointer.y,amount);
  if(hero.getBoundingClientRect().bottom>0){
   bear.style.setProperty('--bear-turn',smooth.x*13+'deg');bear.style.setProperty('--bear-tilt',-smooth.y*8+'deg');
   bear.style.setProperty('--head-x',smooth.x*8+'px');bear.style.setProperty('--head-y',smooth.y*5+'px');bear.style.setProperty('--head-turn',smooth.x*5+'deg');
   bear.style.setProperty('--eye-x',smooth.x*5+'px');bear.style.setProperty('--eye-y',smooth.y*4+'px');
   const leaving=clamp(-hero.getBoundingClientRect().top/innerHeight);
   bear.style.setProperty('--bear-y',leaving*-90+'px');
   q('.miniTicket').style.transform=`translateY(${leaving*110}px) rotate(${-9+leaving*18}deg)`;
  }
  if(dirty){
   dirty=false;
   document.documentElement.style.setProperty('--progress',clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)));
   if(!reduced.matches){
    const h=clamp(-hero.getBoundingClientRect().top/innerHeight);
    q('.heroCopy').style.transform=`translateY(${-h*110}px) scale(${1-h*.08})`;
    q('.heroCopy').style.opacity=1-h*.85;
    q('.brandRibbon>div').style.transform=`translateX(${-scrollY*.38}px)`;
    qa('.orbit').forEach((el,i)=>el.style.rotate=(scrollY*.035*(i%2?-1:1))+'deg');
    chapters.forEach((section,index)=>{
     const p=progress(section),enter=ease(clamp(p/.22)),leave=ease(clamp((p-.82)/.18));
     section.style.setProperty('--scene-progress',p);
     const copy=section.querySelector('h2');copy.style.transform=`translate3d(0,${(1-enter)*65-leave*70}px,0) scale(${.96+enter*.04-leave*.04})`;copy.style.opacity=.3+enter*.7-leave*.65;
     let items;
     if(index===0)items=[...section.querySelectorAll('.polaroid,.reviewDecision,.reviewSteps>div')];
     if(index===1)items=[...section.querySelectorAll('.benchCard')];
     if(index===2)items=[...section.querySelectorAll('.accessCard')];
     if(index===3)items=[...section.querySelectorAll('.closingBrand,.closingStar,.closing p')];
     items.forEach((el,i)=>{
      const a=ease(clamp((p-i*.065)/.32)),b=ease(clamp((p-.8-i*.018)/.15)),direction=i%2?1:-1;
      let rotate=(1-a)*direction*18+b*direction*15;
      if(el.classList.contains('polaroid'))rotate+=el.classList.contains('polaroidFront')?8:-12;
      el.style.transform=`translate3d(${(1-a)*direction*(innerWidth<700?70:180)+b*direction*90}px,${(1-a)*110-b*110}px,0) rotate(${rotate}deg) scale(${.88+a*.12-b*.08})`;
      el.style.opacity=clamp(a*2)*(1-b*.85);
     });
     const orbit=section.querySelector('.closingOrbit');if(orbit)orbit.style.transform=`scale(${.7+p*.7}) rotate(${p*80}deg)`;
    });
    const p=progress(scene),mobile=innerWidth<=700;
    cards.forEach((card,i)=>{
     const enter=ease(clamp((p-i*.12)/.34)),leave=ease(clamp((p-.84)/.16));
     const base=[-10,8,-5][i],direction=i===1?1:-1;
     card.style.transform=`translate3d(${(1-enter)*direction*(mobile?160:390)+leave*direction*90}px,${(1-enter)*(mobile?120:230)-leave*130}px,0) rotate(${base+(1-enter)*direction*24+leave*direction*20}deg) scale(${mix(.8,1,enter)-leave*.07})`;
     card.style.opacity=clamp(enter*2)*(1-leave*.85);
    });
    q('.catalogueBack').style.transform=`rotate(${mix(-8,0,p)}deg) scale(${mix(.94,1,p)})`;
    const m=progress(move),incoming=ease(clamp(m/.32)),outgoing=ease(clamp((m-.37)/.32)),done=ease(clamp((m-.64)/.3));
    entry.style.transform=`translate(${mix(-260,0,incoming)-done*70}px,${done*-100}px) rotate(${-9+incoming*4-done*15}deg)`;entry.style.opacity=incoming*(1-done*.85);
    exit.style.transform=`translate(${mix(260,0,outgoing)+done*65}px,${done*-100}px) rotate(${9-outgoing*4+done*15}deg)`;exit.style.opacity=outgoing*(1-done*.85);
    receipt.style.transform=`translate(-50%,${mix(120,0,done)}px) rotate(${mix(-12,3,done)}deg)`;receipt.style.opacity=done;
    q('#demoBalance').textContent=m<.26?'12':m<.61?'15':'13';
    q('.balanceMachine').style.transform=`translateX(-50%) rotate(${Math.sin(m*Math.PI*4)*1.5}deg)`;
   }
  }
  if(Math.abs(smooth.x-pointer.x)+Math.abs(smooth.y-pointer.y)>.002)frame=requestAnimationFrame(render);
 }
 addEventListener('scroll',request,{passive:true});addEventListener('resize',request,{passive:true});
 addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return;
  const rect=q('.heroPlayground').getBoundingClientRect();
  pointer.x=clamp((e.clientX-rect.left-rect.width/2)/(rect.width/2),-1,1);
  pointer.y=clamp((e.clientY-rect.top-rect.height/2)/(rect.height/2),-1,1);request();
 },{passive:true});
 document.addEventListener('pointerleave',()=>{pointer={x:0,y:0};request();});
 function greet(){bear.classList.remove('greeting');void bear.offsetWidth;bear.classList.add('greeting');setTimeout(()=>bear.classList.remove('greeting'),2000);}
 bear.addEventListener('click',greet);bear.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();greet();}});
 const observer=new IntersectionObserver(entries=>{for(const e of entries)e.target.classList.toggle('isVisible',e.isIntersecting);},{threshold:.12});
 qa('.reveal').forEach(el=>observer.observe(el));
 qa('.accessCard').forEach(card=>{
  card.addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;const r=card.getBoundingClientRect();card.style.transform=`perspective(800px) rotateX(${-(e.clientY-r.top-r.height/2)/r.height*8}deg) rotateY(${(e.clientX-r.left-r.width/2)/r.width*10}deg) translateY(-5px)`;});
  card.addEventListener('pointerleave',()=>card.style.transform='');
 });
 reduced.addEventListener('change',()=>location.reload());request();
})();
