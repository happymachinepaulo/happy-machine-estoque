(()=>{
 'use strict';
 const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
 const ease=n=>n*n*(3-2*n),mix=(a,b,t)=>a+(b-a)*t;
 const sections=qa('.scrollScene'),hero=q('.hero'),header=q('.presentationHeader');
 let targetScroll=scrollY,smoothedScroll=scrollY,raf=0,last=0,pointer={x:0,y:0},cursor={x:0,y:0};
 const range=(p,start,end)=>ease(clamp((p-start)/(end-start)));
 function request(){if(!raf&&!document.hidden)raf=requestAnimationFrame(render);}
 function transform(el,x=0,y=0,z=0,rotation=0,scale=1,opacity=1,tilt=0){el.style.transform=`translate3d(${x}px,${y}px,${z}px) rotateY(${tilt}deg) rotateZ(${rotation}deg) scale(${scale})`;el.style.opacity=opacity;}
 function render(t){raf=0;const a=1-Math.pow(.77,Math.min(3,(t-last)/16||1));last=t;
  smoothedScroll=mix(smoothedScroll,targetScroll,a);cursor.x=mix(cursor.x,pointer.x,a);cursor.y=mix(cursor.y,pointer.y,a);
  const mobile=innerWidth<701,doc=document.documentElement;
  doc.style.setProperty('--progress',clamp(targetScroll/Math.max(1,doc.scrollHeight-innerHeight)));
  const active=sections.findIndex(s=>s.getBoundingClientRect().top<=innerHeight*.4&&s.getBoundingClientRect().bottom>innerHeight*.4);
  const paper=active===0||active===2||active===4;header.classList.toggle('onPaper',paper);q('.chapterRail').classList.toggle('atHero',active<0);
  q('#currentChapter').textContent=active<0?'POR DENTRO DO SISTEMA':sections[active].dataset.chapter;q('#railNumber').textContent=active<0?'00':String(active+1).padStart(2,'0');
  const bear=q('.bearWrap');bear.style.setProperty('--bear-turn',cursor.x*10+'deg');bear.style.setProperty('--bear-tilt',-cursor.y*5+'deg');
  if(!reduced.matches){
   const h=clamp(smoothedScroll/Math.max(1,hero.offsetHeight-innerHeight));
   transform(q('.heroCopy'),0,-h*(mobile?45:90),0,0,1-h*.035,1-h*.8);
   transform(q('.heroPlayground'),0,-h*60,0,0,1+h*.08,1-h*.35);
   transform(q('.tagParts'),cursor.x*-8-h*40,cursor.y*-5-h*65,0,-3+h*8,1,1-h*.8);
   transform(q('.tagHistory'),cursor.x*10+h*60,cursor.y*7-h*30,0,3-h*9,1,1-h*.7);
   q('.brandRibbon>div').style.transform=`translateX(${-smoothedScroll*.48}px)`;
   sections.forEach((section,index)=>{
    const top=section.offsetTop,p=clamp((smoothedScroll-top)/Math.max(1,section.offsetHeight-innerHeight));
    const entering=range(p,0,.2),leaving=range(p,.83,1);section.style.setProperty('--scene-progress',p.toFixed(4));
    const heading=section.querySelector('h2');transform(heading,0,(1-entering)*32-leaving*45,0,0,1-leaving*.025,.65+entering*.35-leaving*.65);
    const copy=section.querySelector('.sceneCopy>p');if(copy)transform(copy,0,(1-entering)*22-leaving*35,0,0,1,.7+entering*.3-leaving*.7);
    const stage=section.querySelector('.visualStage');if(stage)stage.style.transform=mobile?'':`translate3d(${cursor.x*5}px,${cursor.y*4}px,0) rotateX(${-cursor.y*1.7}deg) rotateY(${cursor.x*2.7}deg)`;
    if(index===0){
     transform(q('.catalogueBack'),0,-p*25,0,0,1,1,8-p*12);
     qa('.pieceCard').forEach((card,i)=>{const enter=range(p,i*.055,.28+i*.075),exit=range(p,.77+i*.025,.99);const dir=i===1?1:-1;transform(card,(1-enter)*dir*(mobile?160:310)+exit*dir*160,(1-enter)*100-p*25-exit*90,enter*30,[ -7,6,-3][i]+(1-enter)*dir*12-p*4, .87+enter*.13-exit*.1,clamp(enter*2)*(1-exit), (1-enter)*dir*24);});
    }
    if(index===1){
     const incoming=range(p,.03,.29),outgoing=range(p,.34,.59),done=range(p,.61,.86);
     transform(q('.balanceMachine'),0,-p*22,0,-2+p*4,1,1);q('.balanceMachine').style.marginLeft=-(q('.balanceMachine').offsetWidth/2)+'px';
     transform(q('.entryNote'),(1-incoming)*-190-done*70,(1-incoming)*55-done*80,0,-5+incoming*3-done*9,1,incoming*(1-done));
     transform(q('.exitNote'),(1-outgoing)*190+done*70,(1-outgoing)*55-done*80,0,5-outgoing*3+done*9,1,outgoing*(1-done));
     transform(q('.historySlip'),0,(1-done)*80-p*5,0,-3+done*3,1,done);q('.historySlip').style.marginLeft=-(q('.historySlip').offsetWidth/2)+'px';
     q('#demoBalance').textContent=p<.24?'12':p<.55?'15':'13';q('#balancePhase').textContent=p<.24?'Antes da movimentação':p<.55?'Reposição registrada':'Saída registrada';
    }
    if(index===2){
     transform(q('.reviewWindow'),(1-entering)*40,-p*20,0,2-p*4,.97+entering*.03,1,8-p*12);
     q('.scanLine').style.transform=`translateY(${clamp(p/.55)*q('.reviewImage').offsetHeight}px)`;
     qa('.countedPart').forEach((el,i)=>{const enter=range(p,.1+i*.09,.27+i*.09);transform(el,0,0,0,0,.93+enter*.07,enter);});
     const confirm=range(p,.4,.72);transform(q('.reviewDecision'),(1-confirm)*80,(1-confirm)*70-p*12,0,5-confirm*5, .92+confirm*.08,confirm*(1-leaving));
     qa('.reviewSteps>div').forEach((el,i)=>{const v=range(p,i*.1,.2+i*.1);transform(el,(1-v)*15,0,0,0,1,.5+v*.5);});
    }
    if(index===3){qa('.benchCard').forEach((el,i)=>{const enter=range(p,i*.13,.27+i*.13),exit=range(p,.81+i*.025,1);transform(el,(1-enter)*(mobile?100:200)-exit*100,(1-enter)*55-p*12-exit*80,0,-6+enter*6+(i-1)*p*3,.88+enter*.12,clamp(enter*2)*(1-exit), (1-enter)*-18);});}
    if(index===4){qa('.accessCard').forEach((el,i)=>{const enter=range(p,i*.07,.22+i*.07),exit=range(p,.82+i*.025,1);transform(el,0,(1-enter)*110-p*10-exit*65,0,0,.93+enter*.07,clamp(enter*2)*(1-exit),(1-enter)*(i-1)*10);});qa('.codeGraphic>span').forEach((el,i)=>{el.style.transform=`translateY(${Math.sin(p*7-i*.7)*3}px)`;});}
    if(index===5){
     transform(q('.closingContent'),0,(1-entering)*40-p*35,0,0,1+p*.015,1-leaving*.45);
     transform(q('.closingStar'),0,-p*110,0,p*110,.72+p*.45,1);
     q('.closingOrbit').style.transform=`translateX(${-p*70}px) scale(${.8+p*.4})`;
    }
   });
  }
  if(Math.abs(targetScroll-smoothedScroll)>.2||Math.abs(pointer.x-cursor.x)+Math.abs(pointer.y-cursor.y)>.001)request();
 }
 addEventListener('scroll',()=>{targetScroll=scrollY;request();},{passive:true});addEventListener('resize',()=>{targetScroll=scrollY;request();},{passive:true});
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer={x:clamp(e.clientX/innerWidth*2-1,-1,1),y:clamp(e.clientY/innerHeight*2-1,-1,1)};request();},{passive:true});
 document.addEventListener('pointerleave',()=>{pointer={x:0,y:0};request();});document.addEventListener('visibilitychange',request);
 reduced.addEventListener('change',()=>location.reload());request();
})();
