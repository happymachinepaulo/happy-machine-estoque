import * as THREE from './assets/vendor/three/three.module.min.js';

const host=document.querySelector('.bearWrap'),motion=()=>window.HMPresentationMotion?.enabled!==false;
let renderer;
try {
 renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-label','Mascote Happy em pelúcia 3D, com cabeça e olhos articulados');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(31,1,.1,30);
 camera.position.set(.16,1.38,6.8);camera.lookAt(0,1.21,0);
 scene.add(new THREE.HemisphereLight(0xffe9dc,0x633b48,1.8));
 const key=new THREE.DirectionalLight(0xfff0df,3.1);key.position.set(-3,5,5);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=4;key.shadow.camera.bottom=-1;key.shadow.camera.near=.1;key.shadow.camera.far=15;key.shadow.normalBias=.025;key.shadow.radius=5;scene.add(key);
 const rim=new THREE.DirectionalLight(0xb8c9ff,1.6);rim.position.set(3,3,-3);scene.add(rim);
 const fill=new THREE.DirectionalLight(0xff647b,.5);fill.position.set(2,1,4);scene.add(fill);
 let seed=7342;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const grain=document.createElement('canvas');grain.width=grain.height=128;const ctx=grain.getContext('2d'),pixels=ctx.createImageData(128,128);
 for(let i=0;i<pixels.data.length;i+=4){const v=80+random()*130;pixels.data.set([v,v,v,255],i);}ctx.putImageData(pixels,0,0);
 const texture=new THREE.CanvasTexture(grain);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,5);
 const plush=color=>new THREE.MeshStandardMaterial({color,roughness:.97,bumpMap:texture,bumpScale:.0035});
 const red=plush('#be1035'),cream=plush('#f9ead9'),yellow=plush('#f1ce34');
 const dark=new THREE.MeshPhysicalMaterial({color:'#21161a',roughness:.25,clearcoat:.6,clearcoatRoughness:.3});
 const glint=new THREE.MeshBasicMaterial({color:0xfff4e8});
 const sphere=new THREE.SphereGeometry(1,48,32),bear=new THREE.Group();scene.add(bear);
 const hairGeometry=new THREE.ConeGeometry(.0014,.008,4),hairMaterial=new THREE.MeshBasicMaterial({color:'#ee4867',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
 const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
 // Short fibres follow the surface normals of each sewn plush volume.
 function fibres(parent,position,scale,count){
  const hairs=new THREE.InstancedMesh(hairGeometry,hairMaterial,count);hairs.frustumCulled=false;
  for(let i=0;i<count;i++){const y=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-y*y),x=Math.cos(angle)*r,z=Math.sin(angle)*r;
   const normal=new THREE.Vector3(x/scale[0],y/scale[1],z/scale[2]).normalize();
   dummy.position.set(position[0]+x*scale[0],position[1]+y*scale[1],position[2]+z*scale[2]);dummy.position.addScaledVector(normal,.003);
   dummy.quaternion.setFromUnitVectors(up,normal);dummy.scale.setScalar(.7+random()*.6);dummy.updateMatrix();hairs.setMatrixAt(i,dummy.matrix);
  }parent.add(hairs);
 }
 function ball(parent,material,x,y,z,sx,sy,sz,fur=0){const mesh=new THREE.Mesh(sphere,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);if(fur)fibres(parent,[x,y,z],[sx,sy,sz],fur);return mesh;}
 // Compact seated silhouette, rounded shoulders and a broad, logo-like head.
 ball(bear,red,0,.64,0,.64,.7,.49,1200);
 ball(bear,cream,0,.61,.445,.39,.46,.105);
 for(const side of [-1,1]){
  ball(bear,red,side*.46,.02,.32,.34,.27,.41,550);
  const sole=ball(bear,cream,side*.46,-.015,.71,.22,.15,.055);sole.rotation.z=side*.12;
 }
 const arms=[];
 for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.6,.99,.03);arm.rotation.z=side*.15;bear.add(arm);
  ball(arm,red,side*.075,-.28,.035,.245,.405,.26,600);
  ball(arm,cream,side*.095,-.51,.225,.155,.145,.052);arms.push(arm);
 }
 const head=new THREE.Group();head.position.set(0,1.66,.015);bear.add(head);
 ball(head,red,0,0,0,.88,.77,.64,2500);
 for(const side of [-1,1]){
  ball(head,red,side*.66,.6,-.035,.29,.3,.24,350);
  ball(head,cream,side*.66,.615,.187,.176,.18,.037);
  ball(head,yellow,side*.59,-.19,.47,.105,.105,.041);
 }
 ball(head,cream,0,-.25,.568,.295,.345,.12);
 const nose=ball(head,dark,0,-.067,.684,.091,.073,.052);
 nose.rotation.z=.06;
 const eyes=[];
 for(const side of [-1,1]){const eye=new THREE.Group();eye.position.set(side*.33,.106,.565);head.add(eye);ball(eye,dark,0,0,0,.063,.069,.041);ball(eye,glint,-.015,.022,.037,.012,.013,.007);eyes.push(eye);}
 function stitch(points,radius=.013){const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));head.add(new THREE.Mesh(new THREE.TubeGeometry(curve,32,radius,7,false),dark));}
 stitch([[0,-.134,.701],[0,-.215,.701]]);
 stitch([[-.135,-.257,.678],[-.098,-.332,.689],[-.049,-.324,.697],[0,-.247,.704],[.049,-.324,.697],[.098,-.332,.689],[.135,-.257,.678]]);
 // Fabric label is wrapped over the belly's curvature to avoid a floating badge.
 const label=document.createElement('canvas');label.width=512;label.height=160;const lc=label.getContext('2d');lc.fillStyle='#f5d846';lc.fillRect(0,0,512,160);lc.strokeStyle='#c1a23d';lc.lineWidth=4;lc.setLineDash([5,8]);lc.strokeRect(10,10,492,140);lc.fillStyle='#ad1736';lc.textAlign='center';lc.font='800 85px Arial';lc.fillText('HAPPY',256,113);
 const badgeGeometry=new THREE.PlaneGeometry(.52,.16,24,4),pos=badgeGeometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i)+.65;pos.setZ(i,.445+.105*Math.sqrt(Math.max(0,1-(x/.39)**2-((y-.61)/.46)**2))+.008);}badgeGeometry.computeVertexNormals();
 const badge=new THREE.Mesh(badgeGeometry,new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(label),roughness:1,bumpMap:texture,bumpScale:.003}));badge.position.y=.65;bear.add(badge);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),grad=sc.createRadialGradient(64,64,5,64,64,64);grad.addColorStop(0,'rgba(0,0,0,.48)');grad.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=grad;sc.fillRect(0,0,128,128);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.65),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-.265,.08);scene.add(shadow);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.ShadowMaterial({opacity:.17}));ground.rotation.x=-Math.PI/2;ground.position.y=-.267;ground.receiveShadow=true;scene.add(ground);
 host.classList.add('has3d');host.dataset.renderer='webgl';
 let target={x:0,y:0},smooth={x:0,y:0},raf=0,waveUntil=0,visible=true,last=0,available=true;
 function request(){if(!raf&&visible&&available&&!document.hidden)raf=requestAnimationFrame(draw);}
 function draw(t){raf=0;const a=1-Math.pow(.86,Math.min(3,(t-last)/16||1));last=t;smooth.x+=(target.x-smooth.x)*a;smooth.y+=(target.y-smooth.y)*a;
  const hero=document.querySelector('.hero'),scroll=THREE.MathUtils.clamp(scrollY/Math.max(1,hero.offsetHeight-innerHeight),0,1),idle=motion()?Math.sin(t*.0014)*.02:0;
  bear.rotation.y=-.1+smooth.x*.34+scroll*.36;bear.rotation.x=smooth.y*.04;bear.rotation.z=idle*.3;
  head.rotation.y=smooth.x*.17;head.rotation.x=smooth.y*.12+idle*.4;
  eyes.forEach(e=>{e.rotation.y=smooth.x*.13;e.rotation.x=smooth.y*.09;});
  const waving=t<waveUntil;arms[1].rotation.z=waving?1.85+Math.sin(t*.012)*.24:.15;head.rotation.z=waving?-.06:idle*.5;
  bear.position.y=idle*.3;renderer.render(scene,camera);host.dataset.turn=bear.rotation.y.toFixed(3);
  if(motion()||waving||Math.abs(target.x-smooth.x)+Math.abs(target.y-smooth.y)>.001)request();
 }
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;target.x=THREE.MathUtils.clamp(e.clientX/innerWidth*2-1,-1,1);target.y=THREE.MathUtils.clamp(e.clientY/innerHeight*2-1,-1,1);request();},{passive:true});
 document.addEventListener('pointerleave',()=>{target={x:0,y:0};request();});
 function greet(){waveUntil=performance.now()+1800;request();}host.addEventListener('click',greet);host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();greet();}});
 const resize=new ResizeObserver(()=>{const w=host.clientWidth;renderer.setSize(w,w*1.11,false);camera.aspect=1/1.11;camera.updateProjectionMatrix();request();});resize.observe(host);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'50px'}).observe(host);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();available=false;cancelAnimationFrame(raf);raf=0;host.classList.remove('has3d');host.dataset.renderer='fallback';renderer.domElement.style.display='none';});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{available=true;renderer.domElement.style.display='';host.classList.add('has3d');host.dataset.renderer='webgl';request();});
 document.addEventListener('visibilitychange',request);addEventListener('scroll',request,{passive:true});addEventListener('happy-motion-change',request);request();
} catch(error) {host.dataset.renderer='fallback';host.classList.remove('has3d');host.querySelector('canvas')?.remove();renderer?.dispose();}
