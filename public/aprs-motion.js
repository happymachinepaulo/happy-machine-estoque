(()=>{
 'use strict';
 const root=document.documentElement;
 let saved=null;try{saved=localStorage.getItem('happy-aprs-motion');}catch{}
 // This presentation explicitly supports full motion, with a persistent stop control.
 let enabled=saved!=='reduced';
 window.HMPresentationMotion={get enabled(){return enabled;}};
 const button=document.querySelector('#motionToggle');
 function reflect(){root.classList.toggle('motion-enabled',enabled);root.classList.toggle('motion-reduced',!enabled);button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Reduzir animações':'Ativar animações');button.querySelector('.motionLabel').textContent=enabled?'Reduzir movimento':'Ativar animações';button.querySelector('[aria-hidden]').textContent=enabled?'Ⅱ':'▷';}
 reflect();
 button.addEventListener('click',()=>{enabled=!enabled;try{localStorage.setItem('happy-aprs-motion',enabled?'full':'reduced');}catch{}reflect();dispatchEvent(new CustomEvent('happy-motion-change'));});
 if(!window.gsap||!window.ScrollTrigger)return;
 gsap.registerPlugin(ScrollTrigger);
 let context;
 function rebuild(){
  context?.revert();context=null;
  if(!enabled)return;
  context=gsap.context(()=>{
   // Separate wrappers prevent scroll and intro timelines from owning the same transform.
   const title=document.querySelector('.heroCopy h1');
   if(!title.querySelector('.titleLine')){
    title.innerHTML='<span class="titleClip"><span class="titleLine">Toda peça</span></span><span class="titleClip"><span class="titleLine">tem seu <em>lugar.</em></span></span>';
   }
   const intro=gsap.timeline({defaults:{ease:'power3.out'}});
   if(scrollY<innerHeight*.25){
    intro.fromTo('.titleLine',{yPercent:110,rotation:4},{yPercent:0,rotation:0,duration:1.25,stagger:.13},.1)
     .fromTo('.heroCopy>.eyebrow,.heroCopy>p,.heroFoot',{y:24,opacity:0},{y:0,opacity:1,duration:.9,stagger:.13},.25)
     .fromTo('.bearWrap',{scale:.78,opacity:0,y:65},{scale:1,opacity:1,y:0,duration:1.5,ease:'back.out(1.25)'},.15)
     .fromTo('.floatingTag strong,.floatingTag>span:first-child,.bearCaption',{y:16,opacity:0},{y:0,opacity:1,duration:.8,stagger:.09},.85);
   }
   document.querySelectorAll('.scrollScene').forEach((section,index)=>{
    const interior=section.querySelector('.sceneInterior');
    gsap.fromTo(interior,{clipPath:'inset(9% 5% 0% 5% round 34px)',scale:.91,y:65},{clipPath:'inset(0% 0% 0% 0% round 0px)',scale:1,y:0,ease:'none',scrollTrigger:{trigger:section,start:'top 95%',end:'top top',scrub:.55,invalidateOnRefresh:true}});
    gsap.to(interior,{opacity:.25,scale:.95,y:-45,ease:'none',scrollTrigger:{trigger:section,start:'bottom 110%',end:'bottom 5%',scrub:.55,invalidateOnRefresh:true}});
    // Typography arrives line by line before the stage's own scroll sequence.
    const label=section.querySelector('.sceneTop'),foot=section.querySelector('.sceneBottom');
    gsap.fromTo([label,foot],{opacity:0,y:18},{opacity:1,y:0,duration:.75,stagger:.12,ease:'power2.out',scrollTrigger:{trigger:section,start:'top 70%',toggleActions:'play reverse play reverse'}});
   });
   gsap.to('.bearAura',{scale:1.32,opacity:.65,duration:3.5,repeat:-1,yoyo:true,ease:'sine.inOut'});
   gsap.to('.captionLine',{scaleX:.5,transformOrigin:'right center',duration:1.5,repeat:-1,yoyo:true,ease:'sine.inOut'});
  });
  document.fonts.ready.then(()=>ScrollTrigger.refresh());
 }
 addEventListener('happy-motion-change',rebuild);rebuild();
})();
