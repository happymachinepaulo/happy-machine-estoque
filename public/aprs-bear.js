import * as THREE from './assets/vendor/three/three.module.min.js';

// A local, articulated mesh: the head, eyes and shoulder rotate independently.
const host=document.querySelector('.bearWrap');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
try {
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.35;
 renderer.domElement.setAttribute('aria-label','Urso Happy em 3D, com cabeça e olhos que acompanham o mouse');
 host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,100);
 camera.position.set(0,1.6,7.6);camera.lookAt(0,1.5,0);
 scene.add(new THREE.HemisphereLight(0xfff5e2,0x9b5269,2.2));
 const light=new THREE.DirectionalLight(0xfff4df,3.2);light.position.set(-3,6,5);scene.add(light);
 const rim=new THREE.DirectionalLight(0x91b8ff,2);rim.position.set(4,3,-3);scene.add(rim);
 const grain=document.createElement('canvas');grain.width=grain.height=128;
 const ctx=grain.getContext('2d'),data=ctx.createImageData(128,128);
 let seed=12;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=120+(seed>>>27)*3;data.data.set([v,v,v,255],i);}ctx.putImageData(data,0,0);
 const texture=new THREE.CanvasTexture(grain);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(8,8);
 const mat=(color,roughness=.86)=>new THREE.MeshStandardMaterial({color,roughness,bumpMap:texture,bumpScale:.014});
 const red=mat('#ed2146'),cream=mat('#fff0de'),yellow=mat('#ffdc3b'),dark=mat('#271822',.32),white=mat('#ffffff',.2);
 const sphere=new THREE.SphereGeometry(1,48,32),bear=new THREE.Group();scene.add(bear);
 function ball(parent,material,x,y,z,sx,sy,sz){const m=new THREE.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
 ball(bear,red,0,.8,0,.77,.96,.57);ball(bear,cream,0,.78,.5,.48,.65,.13);
 for(const side of [-1,1]){ball(bear,red,side*.55,-.04,.24,.43,.3,.49);ball(bear,cream,side*.55,-.09,.72,.27,.19,.12);}
 const arms=[];for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.7,1.32,0);arm.rotation.z=side*.24;bear.add(arm);ball(arm,red,side*.16,-.43,0,.3,.62,.32);ball(arm,cream,side*.2,-.84,.2,.21,.19,.17);arms.push(arm);}
 const head=new THREE.Group();head.position.set(0,2.05,0);bear.add(head);
 ball(head,red,0,0,0,.94,.83,.68);
 for(const side of [-1,1]){ball(head,red,side*.74,.64,-.05,.35,.35,.24);ball(head,cream,side*.74,.66,.16,.21,.22,.06);ball(head,yellow,side*.64,-.22,.56,.12,.12,.045);}
 ball(head,cream,0,-.27,.63,.34,.4,.18);ball(head,dark,0,-.02,.8,.115,.095,.08);
 const eyes=[];for(const side of [-1,1]){const eye=new THREE.Group();eye.position.set(side*.37,.12,.61);head.add(eye);ball(eye,dark,0,0,0,.105,.125,.07);ball(eye,white,-.023,.037,.063,.028,.033,.014);eyes.push(eye);}
 function curve(points){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));head.add(new THREE.Mesh(new THREE.TubeGeometry(path,24,.021,8,false),dark));}
 curve([[0,-.1,.82],[0,-.25,.823]]);curve([[-.17,-.3,.79],[-.13,-.41,.80],[-.055,-.43,.82],[0,-.34,.83],[.055,-.43,.82],[.13,-.41,.80],[.17,-.3,.79]]);
 // Sewn label follows the belly instead of floating as a flat image.
 const label=document.createElement('canvas');label.width=512;label.height=160;const lc=label.getContext('2d');lc.fillStyle='#ffdc3b';lc.fillRect(0,0,512,160);lc.strokeStyle='#b58a24';lc.lineWidth=5;lc.setLineDash([7,9]);lc.strokeRect(12,12,488,136);lc.fillStyle='#ad1334';lc.font='900 92px Arial';lc.textAlign='center';lc.fillText('HAPPY',256,115);
 const badge=new THREE.Mesh(new THREE.PlaneGeometry(.79,.25),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(label),roughness:1,side:THREE.DoubleSide}));badge.position.set(0,.88,.65);badge.rotation.z=.08;bear.add(badge);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(1.15,64),new THREE.MeshBasicMaterial({color:0xd6a7b0,transparent:true,opacity:.35}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-.36,0);scene.add(floor);
 host.classList.add('has3d');host.dataset.renderer='webgl';
 let target={x:0,y:0},smooth={x:0,y:0},raf=0,waveUntil=0,visible=true,last=0;
 function request(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(draw);}
 function draw(t){raf=0;const dt=Math.min(3,(t-last)/16||1);last=t;const a=1-Math.pow(.83,dt);smooth.x+=(target.x-smooth.x)*a;smooth.y+=(target.y-smooth.y)*a;
  const scroll=Math.min(1,Math.max(0,-document.querySelector('.hero').getBoundingClientRect().top/innerHeight));
  bear.rotation.y=smooth.x*.48+scroll*.3;bear.rotation.x=smooth.y*.1;head.rotation.y=smooth.x*.24;head.rotation.x=smooth.y*.16;
  eyes.forEach(e=>{e.rotation.y=smooth.x*.17;e.rotation.x=smooth.y*.13;});
  const waving=t<waveUntil;arms[1].rotation.z=waving?-1.9+Math.sin(t*.013)*.3:.24;
  bear.position.y=reduced.matches?0:Math.sin(t*.0017)*.035;bear.rotation.z=waving?Math.sin(t*.005)*.035:0;
  renderer.render(scene,camera);host.dataset.turn=bear.rotation.y.toFixed(3);
  if(!reduced.matches||waving||Math.abs(target.x-smooth.x)+Math.abs(target.y-smooth.y)>.001)request();
 }
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=host.getBoundingClientRect();target.x=THREE.MathUtils.clamp((e.clientX-r.left-r.width/2)/(innerWidth*.38),-1,1);target.y=THREE.MathUtils.clamp((e.clientY-r.top-r.height/2)/(innerHeight*.5),-1,1);request();},{passive:true});
 host.addEventListener('pointermove',e=>{if(e.pointerType==='touch'){const r=host.getBoundingClientRect();target.x=(e.clientX-r.left)/r.width*2-1;request();}});
 document.addEventListener('pointerleave',()=>{target={x:0,y:0};request();});
 host.addEventListener('click',()=>{waveUntil=performance.now()+2000;request();});
 host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){waveUntil=performance.now()+2000;request();}});
 const resize=new ResizeObserver(()=>{const width=host.clientWidth;renderer.setSize(width,width*1.11,false);camera.aspect=1/1.11;camera.updateProjectionMatrix();request();});resize.observe(host);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(host);
 document.addEventListener('visibilitychange',request);addEventListener('scroll',request,{passive:true});reduced.addEventListener('change',request);request();
} catch(error) {
 host.dataset.renderer='fallback';
 // The existing illustration stays available when WebGL is disabled.
 const canvas=host.querySelector('canvas');if(canvas)canvas.remove();
}
