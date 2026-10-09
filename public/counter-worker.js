/* Original browser implementation of blur -> Otsu/edges -> morphology ->
   hole filling -> external connected regions. See COUNTER.md for references. */
'use strict';
function otsu(values){
 const hist=new Uint32Array(256);for(const v of values)hist[v]++;
 let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
 let weight=0,total=0,best=-1,threshold=127;
 for(let i=0;i<255;i++){weight+=hist[i];if(!weight)continue;const other=values.length-weight;if(!other)break;total+=i*hist[i];const diff=total/weight-(sum-total)/other;const score=weight*other*diff*diff;if(score>best){best=score;threshold=i;}}
 return threshold;
}
function morphology(mask,w,h,dilate){
 const out=new Uint8Array(mask.length);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let value=dilate?0:1;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const v=mask[(y+dy)*w+x+dx];if(dilate)value|=v;else value&=v;
  }out[y*w+x]=value;
 }return out;
}
function fillHoles(mask,w,h){
 const seen=new Uint8Array(mask.length),queue=new Uint32Array(mask.length);let start=0,end=0;
 const add=p=>{if(!mask[p]&&!seen[p]){seen[p]=1;queue[end++]=p;}};
 for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
 while(start<end){const p=queue[start++],x=p%w;if(x)add(p-1);if(x<w-1)add(p+1);if(p>=w)add(p-w);if(p+w<mask.length)add(p+w);}
 return mask.map((v,i)=>v||!seen[i]?1:0);
}
function countObjects({rgba,width:w,height:h,mode='auto',minArea=.0015,roi=null}){
 const gray=new Uint8Array(w*h),blur=new Uint8Array(w*h);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);
 blur.set(gray);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const p=y*w+x;blur[p]=Math.round((gray[p-w-1]+2*gray[p-w]+gray[p-w+1]+2*gray[p-1]+4*gray[p]+2*gray[p+1]+gray[p+w-1]+2*gray[p+w]+gray[p+w+1])/16);
 }
 const region=roi||{x:0,y:0,w,h};
 const x0=Math.max(0,Math.floor(region.x)),y0=Math.max(0,Math.floor(region.y)),x1=Math.min(w,Math.ceil(region.x+region.w)),y1=Math.min(h,Math.ceil(region.y+region.h));
 const values=[];let border=0,nb=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const v=blur[y*w+x];values.push(v);if(x<x0+3||y<y0+3||x>x1-4||y>y1-4){border+=v;nb++;}}
 const threshold=otsu(values),dark=mode==='dark'||mode==='auto'&&(border/nb)>threshold;
 let mask=new Uint8Array(w*h);
 if(mode==='edges'){
  for(let y=y0+1;y<y1-1;y++)for(let x=x0+1;x<x1-1;x++){
   const p=y*w+x;const gx=-blur[p-w-1]+blur[p-w+1]-2*blur[p-1]+2*blur[p+1]-blur[p+w-1]+blur[p+w+1];
   const gy=-blur[p-w-1]-2*blur[p-w]-blur[p-w+1]+blur[p+w-1]+2*blur[p+w]+blur[p+w+1];
   mask[p]=Math.abs(gx)+Math.abs(gy)>100?1:0;
  }mask=morphology(mask,w,h,true);
 }else{
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const p=y*w+x;mask[p]=dark?blur[p]<=threshold?1:0:blur[p]>threshold?1:0;}
 }
 mask=morphology(morphology(mask,w,h,true),w,h,false);
 mask=fillHoles(mask,w,h);
 const seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),boxes=[];
 const regionArea=(x1-x0)*(y1-y0),minimum=Math.max(12,regionArea*minArea);
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;let head=0,tail=0,area=0,mx=w,my=h,ex=0,ey=0;
  queue[tail++]=p;seen[p]=1;
  while(head<tail){const q=queue[head++],x=q%w,y=Math.floor(q/w);area++;mx=Math.min(mx,x);my=Math.min(my,y);ex=Math.max(ex,x);ey=Math.max(ey,y);
   for(const d of [-w,w,-1,1]){const n=q+d;if(n<0||n>=mask.length||d===-1&&x===0||d===1&&x===w-1||!mask[n]||seen[n])continue;seen[n]=1;queue[tail++]=n;}
  }
  const bw=ex-mx+1,bh=ey-my+1;
  // Huge background regions and tiny electronic details are not unit detections.
  if(area>=minimum&&area<regionArea*.55&&bw>=4&&bh>=4&&!(bw>=(x1-x0)-3&&bh>=(y1-y0)-3))boxes.push({x:mx,y:my,w:bw,h:bh,area});
 }
 boxes.sort((a,b)=>a.y-b.y||a.x-b.x);
 return {boxes:boxes.slice(0,300),threshold,mode:mode==='auto'?(dark?'dark':'light'):mode,truncated:boxes.length>300};
}
if(typeof self!=='undefined')self.onmessage=e=>{try{self.postMessage({...countObjects(e.data),request:e.data.request});}catch(error){self.postMessage({error:'Não foi possível analisar esta imagem.',request:e.data.request});}};
if(typeof module!=='undefined')module.exports={countObjects,otsu};
