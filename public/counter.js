/* A suggestion becomes a quantity only after the user presses "Usar contagem". */
(()=>{
 'use strict';
 class PhotoCounter {
  constructor(host,input){
   this.host=host;this.input=input;this.serial=0;this.boxes=[];this.roi=null;this.worker=null;this.image=null;
   host.className='photoCounter hidden';host.innerHTML=`<div class="counterHeading"><div><strong>Contar pela foto</strong><small>Sugestão visual • confira as marcações</small></div><span class="counterNumber" aria-live="polite">—</span></div><p class="counterStatus" role="status">Analisando imagem…</p><canvas class="counterCanvas" aria-label="Foto com marcações da contagem. Toque para adicionar ou remover uma marca." tabindex="0"></canvas><div class="counterOptions"><label class="field"><span>Separação das peças</span><select class="counterMode"><option value="auto">Automática</option><option value="dark">Peças escuras / fundo claro</option><option value="light">Peças claras / fundo escuro</option><option value="edges">Contornos / bordas</option></select></label><label class="field"><span>Tamanho mínimo <output>0,15%</output></span><input class="counterSize" type="range" min="5" max="300" value="15" aria-label="Tamanho mínimo dos objetos"></label></div><div class="counterActions"><button type="button" class="btn counterRegion">Selecionar área</button><button type="button" class="btn counterAgain">Recontar</button><button type="button" class="btn primary counterUse" disabled>Usar contagem</button></div><p class="counterHelp">Clique numa marca para removê-la ou numa peça sem marca para incluí-la. Em pilhas e peças misturadas, ajuste a área ou conte manualmente. A foto não revela unidades escondidas.</p>`;
   this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
   host.querySelector('.counterMode').onchange=()=>this.analyze();
   host.querySelector('.counterSize').oninput=e=>{host.querySelector('output').textContent=(e.target.value/100).toLocaleString('pt-BR')+'%';clearTimeout(this.timer);this.timer=setTimeout(()=>this.analyze(),180);};
   host.querySelector('.counterAgain').onclick=()=>this.analyze();
   host.querySelector('.counterRegion').onclick=()=>{this.selecting=!this.selecting;host.querySelector('.counterRegion').textContent=this.selecting?'Arraste na foto':'Selecionar área';this.canvas.classList.toggle('selectRegion',this.selecting);};
   host.querySelector('.counterUse').onclick=()=>{input.value=this.boxes.length;input.dispatchEvent(new Event('input',{bubbles:true}));this.status(`Sugestão de ${this.boxes.length} unidade(s) aplicada. Você pode editar antes de salvar.`);};
   this.canvas.onpointerdown=e=>{if(this.selecting){this.start=this.point(e);this.canvas.setPointerCapture(e.pointerId);}};
   this.canvas.onpointermove=e=>{if(this.start){const end=this.point(e);this.draw();this.ctx.strokeStyle='#ea2146';this.ctx.lineWidth=3;this.ctx.strokeRect(this.start.x,this.start.y,end.x-this.start.x,end.y-this.start.y);}};
   this.canvas.onpointerup=e=>{
    if(!this.image)return;const end=this.point(e);
    if(this.start){const start=this.start;this.start=null;this.roi={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)};if(this.roi.w<15||this.roi.h<15)this.roi=null;this.selecting=false;host.querySelector('.counterRegion').textContent='Selecionar área';this.canvas.classList.remove('selectRegion');this.analyze();return;}
    const i=this.boxes.findIndex(b=>end.x>=b.x-5&&end.x<=b.x+b.w+5&&end.y>=b.y-5&&end.y<=b.y+b.h+5);
    if(i>=0)this.boxes.splice(i,1);else if(this.boxes.length<300)this.boxes.push({x:Math.max(0,end.x-12),y:Math.max(0,end.y-12),w:24,h:24,manual:true});
    this.draw();this.status('Marcações corrigidas manualmente. Confira e use a contagem.');
   };
  }
  point(e){const r=this.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*this.canvas.width/r.width,y:(e.clientY-r.top)*this.canvas.height/r.height};}
  status(text){this.host.querySelector('.counterStatus').textContent=text;}
  clear(){++this.serial;this.worker?.terminate();this.worker=null;clearTimeout(this.timer);this.image=null;this.roi=null;this.start=null;this.selecting=false;this.boxes=[];this.host.classList.add('hidden');}
  async load(source){
   this.clear();const serial=this.serial;this.host.classList.remove('hidden');this.host.querySelector('.counterUse').disabled=true;this.host.querySelector('.counterNumber').textContent='—';this.status('Analisando a foto…');
   try{
    const blob=typeof source==='function'?await source():source;
    if(serial!==this.serial)return;
    const bitmap=await createImageBitmap(blob);if(serial!==this.serial){bitmap.close();return;}
    const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));this.canvas.width=Math.max(1,Math.round(bitmap.width*scale));this.canvas.height=Math.max(1,Math.round(bitmap.height*scale));this.ctx.drawImage(bitmap,0,0,this.canvas.width,this.canvas.height);bitmap.close();
    this.image=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
    this.host.querySelector('.counterMode').value='auto';this.host.querySelector('.counterSize').value='15';this.host.querySelector('output').textContent='0,15%';
    this.worker=new Worker('/counter-worker.js?v=1');this.worker.onmessage=e=>{if(serial!==this.serial||e.data.request!==this.request)return;if(e.data.error){this.status(e.data.error);return;}this.boxes=e.data.boxes;this.draw();this.status(this.boxes.length?`${this.boxes.length} região(ões) candidata(s). Confira se cada marca representa uma peça inteira${e.data.truncated?' — limite de 300 marcas atingido':''}.`:'Não consegui separar as peças. Ajuste o método/área ou marque as unidades na foto.');};this.worker.onerror=()=>this.status('A análise automática falhou. Informe a quantidade manualmente.');
    this.analyze();
   }catch(error){if(serial===this.serial)this.status('Não foi possível ler a foto. Informe a quantidade manualmente.');}
  }
  analyze(){if(!this.image||!this.worker)return;this.request=(this.request||0)+1;this.status('Separando objetos e contando…');this.host.querySelector('.counterUse').disabled=true;this.worker.postMessage({request:this.request,rgba:this.image.data,width:this.canvas.width,height:this.canvas.height,mode:this.host.querySelector('.counterMode').value,minArea:this.host.querySelector('.counterSize').value/10000,roi:this.roi});}
  draw(){
   if(!this.image)return;this.ctx.putImageData(this.image,0,0);this.ctx.lineWidth=2;this.ctx.font='bold 14px sans-serif';
   this.boxes.forEach((b,i)=>{this.ctx.strokeStyle=b.manual?'#ffdc3b':'#e52249';this.ctx.strokeRect(b.x,b.y,b.w,b.h);const y=Math.max(17,b.y);this.ctx.fillStyle='#201c23';this.ctx.fillRect(b.x,y-17,25,18);this.ctx.fillStyle='white';this.ctx.fillText(String(i+1),b.x+3,y-3);});
   if(this.roi){this.ctx.strokeStyle='#2867df';this.ctx.setLineDash([6,4]);this.ctx.strokeRect(this.roi.x,this.roi.y,this.roi.w,this.roi.h);this.ctx.setLineDash([]);}
   this.host.querySelector('.counterNumber').textContent=this.boxes.length;this.host.querySelector('.counterUse').disabled=!this.boxes.length;
  }
 }
 window.HMPhotoCounter=PhotoCounter;
})();
