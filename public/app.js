const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let selectedProduct = null;
let cameraStream = null;
let cameraBlob = null;
let searchTimer = null;
let productRequest = 0;
let productController = null;
let reviewRequest = 0;
let detailRequest = 0;
let categoryRows = [];
let lastStats = null;
let previewObjectURL = null;
let reviewRows = [];
let history = [];
let catalogue = [];
let reviewPhotoForCreation = null;
let photoPage=0;
const photoPageSize=24;
const saving=new Set();
const photoLinks=new Map();
const photoBlobs=new Map();
const photoPlaceholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#f1f3f5"/></svg>');
const photoSource=id=>photoBlobs.get(Number(id))||photoPlaceholder;
const photoDownloads=new Map();
const photoQueue=[];
let photoWorkers=0;
async function downloadPhoto(id){
  id=Number(id);
  if(photoBlobs.has(id))return photoBlobs.get(id);
  if(photoDownloads.has(id))return photoDownloads.get(id);
  const pending=(async()=>{
    let response;
    const link=photoLinks.get(id);
    if(link&&link.expires>Date.now()){
      try{response=await fetch(link.url,{credentials:'omit',referrerPolicy:'no-referrer'});}catch(e){}
    }
    if(!response?.ok)response=await window.HMAuth.request(`/api/photos/${id}`);
    if(!response.ok||!response.headers.get('Content-Type')?.startsWith('image/'))throw Error('Não foi possível carregar a foto.');
    const url=URL.createObjectURL(await response.blob());photoBlobs.set(id,url);return url;
  })();
  photoDownloads.set(id,pending);
  try{return await pending;}finally{photoDownloads.delete(id);}
}
function drainPhotos(){
  while(photoWorkers<4&&photoQueue.length){
    const img=photoQueue.shift(),id=img.dataset.privatePhoto;
    if(!img.isConnected)continue;
    photoWorkers++;
    downloadPhoto(id).then(url=>{if(img.isConnected&&img.dataset.privatePhoto===id){img.src=url;img.classList.remove('photoFailed');}})
      .catch(()=>{img.classList.add('photoFailed');img.alt='Foto indisponível. Atualize a página para tentar novamente.';})
      .finally(()=>{photoWorkers--;drainPhotos();});
  }
}
const photoObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){photoObserver.unobserve(entry.target);photoQueue.push(entry.target);}
  drainPhotos();
},{rootMargin:'250px'});
function observePhotos(node){
  if(node.nodeType!==1)return;
  if(node.matches('img[data-private-photo]'))photoObserver.observe(node);
  node.querySelectorAll('img[data-private-photo]').forEach(img=>photoObserver.observe(img));
}
new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')observePhotos(record.target);else record.addedNodes.forEach(observePhotos);}})
 .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-private-photo']});
window.addEventListener('pagehide',()=>{for(const url of photoBlobs.values())URL.revokeObjectURL(url);photoBlobs.clear();});
async function preparePhotoLinks(data,url){
  const ids=[];
  if(url.startsWith('/api/products')){
    for(const item of Array.isArray(data)?data:[data]){
      if(item.photo_id)ids.push(item.photo_id);
      for(const photo of item.photos||[])ids.push(photo.id);
    }
  }else if(url.startsWith('/api/photo-review'))for(const photo of data)ids.push(photo.id);
  const needed=[...new Set(ids)].filter(id=>!photoLinks.has(id)||photoLinks.get(id).expires<Date.now());
  if(!needed.length)return;
  const r=await window.HMAuth.request('/api/photos/urls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:needed})});
  if(!r.ok)return;
  const links=await r.json();
  for(const [id,link] of Object.entries(links))photoLinks.set(Number(id),{url:link,expires:Date.now()+540000});
}
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const numberFormat = new Intl.NumberFormat('pt-BR');
const displayNumber = value => numberFormat.format(Number(value) || 0);
const isBrokenReference = product => String(product.notes || '').includes('Este cadastro tem ZERO unidades disponíveis');
const quantityUnit = product => product.quantity_unit === 'm' || String(product.notes || '').toLocaleLowerCase('pt-BR').includes('unidade de medida: metros.') ? 'm' : 'un';
const isUnknown = product => product.review_status === 'pendente' && Number(product.quantity) === 0 && !isBrokenReference(product);

function animateIn(element, distance=12){
  if(!element || reducedMotion.matches || !element.animate)return;
  element.getAnimations().forEach(animation=>animation.cancel());
  element.animate([{opacity:.35,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});
}
function animateNumber(element, value){
  const target=Number(value)||0, previous=element._value;
  element._value=target;
  if(element._frame)cancelAnimationFrame(element._frame);
  if(previous===undefined || previous===target || reducedMotion.matches){element.textContent=displayNumber(target);return;}
  const start=performance.now();
  const tick=now=>{
    const progress=Math.min((now-start)/420,1), eased=1-Math.pow(1-progress,3);
    element.textContent=displayNumber(Math.round(previous+(target-previous)*eased));
    if(progress<1)element._frame=requestAnimationFrame(tick);
  };
  element._frame=requestAnimationFrame(tick);
}
function replacePreview(source){
  delete $('#photoPreview').dataset.privatePhoto;
  if(previewObjectURL){URL.revokeObjectURL(previewObjectURL);previewObjectURL=null;}
  if(source instanceof Blob){previewObjectURL=URL.createObjectURL(source);$('#photoPreview').src=previewObjectURL;}
  else if(source)$('#photoPreview').src=source;
  else $('#photoPreview').removeAttribute('src');
}
function showDialog(dialog){if(!dialog.open){dialog.showModal();animateIn(dialog,10);}}

async function api(url, opts={}){
  const write=opts.method&&opts.method!=='GET';
  if(write&&saving.has(url))throw new Error('Aguarde a gravação em andamento.');
  if(write){saving.add(url);document.body.classList.add('saving')}
  try{
    const r = await window.HMAuth.request(url, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    if(!r.ok) throw new Error(data?.error || data || `Erro ${r.status}`);
    if(!write)await preparePhotoLinks(data,url);
    return data;
  }finally{if(write){saving.delete(url);if(!saving.size)document.body.classList.remove('saving')}}
}
function toast(msg, error=false){ const t=$('#toast'); t.textContent=msg; t.className='toast show'+(error?' error':''); clearTimeout(t._x); t._x=setTimeout(()=>t.className='toast',2800); }
function esc(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s){ if(!s) return '-'; const d=new Date(s.replace(' ','T')); return isNaN(d)?s:d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }
function kindLabel(k){ return ({entrada:'Entrada',saida:'Saída',ajuste:'Ajuste',cadastro:'Cadastro'})[k]||k; }
function delta(v){ const n=Number(v); return n>0?`+${n}`:`${n}`; }

async function loadStats(){
  const stats=await api('/api/stats');lastStats=stats;
  const items=[
    {key:'products',label:'Peças conferidas',meta:'Tipos de peça no estoque',icon:'box',tone:''},
    {key:'units',label:'Unidades em estoque',meta:'Contagens confirmadas',icon:'grid',tone:'featured'},
    {key:'low',label:'Estoque baixo',meta:'No mínimo definido',icon:'warning',tone:'warn'},
    {key:'no_photo',label:'Sem foto confirmada',meta:'Galerias para completar',icon:'photo',tone:''}
  ];
  if(!$('#stats .statValue'))$('#stats').innerHTML=items.map((item,index)=>`<div class="stat ${item.tone}" style="--order:${index}"><span class="statIcon">${icon(item.icon)}</span><span class="statLabel">${item.label}</span><strong class="statValue" data-stat="${item.key}"></strong><small class="statMeta">${item.meta}</small></div>`).join('');
  items.forEach(item=>animateNumber($(`[data-stat="${item.key}"]`),stats[item.key]));
  $('#photoBadge').textContent=stats.review_photos||'';
  $('#photoBadge').classList.toggle('hidden',!stats.review_photos);
  if($('#heroReviewCount'))$('#heroReviewCount').textContent=displayNumber(stats.review_photos);
  $('#reviewNotice').classList.toggle('hidden',!stats.pending);
  $('#reviewNotice').innerHTML=`<span class="noticeIcon">${icon('warning')}</span><span><strong>${displayNumber(stats.pending)} ${stats.pending===1?'peça precisa':'peças precisam'} de conferência</strong><small>Confira nomes e quantidades para incluir esses itens no total.</small></span><button id="seePending" class="btn">Conferir peças ${icon('arrow')}</button>`;
  $('#seePending').onclick=()=>{showView('estoque');$('#statusEstoque').value='pendente';loadProducts();$('#products').scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});};
  updateReviewSummary();
}
function renderCategoryChips(){
  const container=$('#categoryChips');if(!container)return;
  const current=$('#categoria').value;
  const popular=[...categoryRows].sort((a,b)=>b.qty-a.qty).slice(0,7);
  const selected=categoryRows.find(row=>row.category===current);
  if(selected && !popular.includes(selected))popular.push(selected);
  container.innerHTML=`<button type="button" class="categoryChip ${!current?'active':''}" data-category="" aria-pressed="${!current}">Todas</button>`+popular.map(row=>`<button type="button" class="categoryChip ${current===row.category?'active':''}" data-category="${esc(row.category)}" aria-pressed="${current===row.category}">${esc(row.category)} <span>${displayNumber(row.qty)}</span></button>`).join('');
  container.querySelectorAll('button').forEach(button=>button.onclick=()=>{$('#categoria').value=button.dataset.category;loadProducts();});
}
function updateFilterState(){
  const count=Number(Boolean($('#busca').value.trim()))+Number(Boolean($('#categoria').value))+Number($('#statusEstoque').value!=='todos')+Number($('#somenteBaixo').checked)+Number($('#semFoto').checked);
  if($('#activeFilterCount')){$('#activeFilterCount').textContent=count?`${count} ${count===1?'filtro ativo':'filtros ativos'}`:'';$('#activeFilterCount').classList.toggle('hidden',!count);}
  if($('#resetFilters'))$('#resetFilters').classList.toggle('hidden',!count);
  renderCategoryChips();
}
async function loadCategories(){
  categoryRows=await api('/api/categories');
  const select=$('#categoria'),current=select.value;
  select.innerHTML='<option value="">Todas as categorias</option>'+categoryRows.map(row=>`<option value="${esc(row.category)}">${esc(row.category)} (${row.qty})</option>`).join('');
  select.value=categoryRows.some(row=>row.category===current)?current:'';
  $('#categoryList').innerHTML=categoryRows.map(row=>`<option value="${esc(row.category)}"></option>`).join('');
  renderCategoryChips();
}
async function loadProducts(){
  const request=++productRequest, el=$('#products');
  if(productController)productController.abort();
  productController=new AbortController();
  el.setAttribute('aria-busy','true');updateFilterState();
  const loadingTimer=setTimeout(()=>{
    if(request!==productRequest)return;
    el.classList.add('isLoading');
    if(!el.children.length)el.innerHTML=Array.from({length:8},()=>'<div class="productSkeleton" aria-hidden="true"><div class="skeletonPhoto"></div><div class="skeletonLine"></div><div class="skeletonLine short"></div></div>').join('');
  },180);
  try{
    const p=new URLSearchParams({status:$('#statusEstoque').value});
    if($('#busca').value.trim())p.set('q',$('#busca').value.trim());
    if($('#categoria').value)p.set('category',$('#categoria').value);
    if($('#somenteBaixo').checked)p.set('low','1');
    if($('#semFoto').checked)p.set('no_photo','1');
    const rows=await api('/api/products?'+p,{signal:productController.signal}); if(request!==productRequest)return;
    const sort=$('#sortProducts').value;
    rows.sort((a,b)=>sort==='quantity-desc'?b.quantity-a.quantity:sort==='quantity-asc'?a.quantity-b.quantity:sort==='updated'?b.updated_at.localeCompare(a.updated_at):a.name.localeCompare(b.name,'pt-BR'));
    $('#resultCount').textContent=`${rows.length} ${rows.length===1?'peça encontrada':'peças encontradas'}`;
    $('#emptyProducts').classList.toggle('hidden',rows.length!==0);
    el.innerHTML=rows.map(x=>{
      const pending=x.review_status==='pendente',unknown=isUnknown(x),low=!pending&&x.min_quantity>0&&x.quantity<=x.min_quantity;
      const amountLabel=unknown?'quantidade a contar':`${x.quantity} ${quantityUnit(x)==='m'?'metros':'unidades'}${pending?', contagem a conferir':''}`;
      return `<article class="productCard ${pending?'needsReview':''}" data-id="${x.id}" tabindex="0" role="button" aria-label="Abrir ${esc(x.name)}, ${amountLabel}"><div class="productPhoto">${x.photo_id?`<img loading="lazy" decoding="async" src="${esc(photoSource(x.photo_id))}" data-private-photo="${x.photo_id}" alt="${esc(x.name)}">`:`<div class="noPhoto productPhotoPlaceholder">${icon('photo')}<small>Foto a adicionar</small></div>`}${pending?'<span class="statusLabel pending">A conferir</span>':low?`<span class="lowBadge">${icon('warning')} Estoque baixo</span>`:''}${x.photo_count>1?`<span class="photoCountBadge">${icon('photo')} ${x.photo_count}</span>`:''}<span class="cardPhotoAction" aria-hidden="true">${icon('arrow')}</span></div><div class="productBody"><div class="category"><span>${esc(x.category||'Sem categoria')}</span><span class="itemCode">#${String(x.id).padStart(3,'0')}</span></div><h3>${esc(x.name)}</h3><div class="cardBottom"><div class="stock ${unknown?'isUnknown':''}"><strong>${unknown?'A contar':displayNumber(x.quantity)}</strong><span class="stockUnit">${unknown?'quantidade pendente':isBrokenReference(x)?'disponíveis · modelo quebrado':quantityUnit(x)==='m'?'metros':pending?'unid. · a conferir':x.quantity===1?'unidade':'unidades'}</span></div><span class="cardOpen" aria-hidden="true">Ver peça ${icon('arrow')}</span></div></div></article>`;
    }).join('');
    $$('.productCard').forEach((p,i)=>p.style.setProperty('--order',Math.min(i,8)));
    $$('.productCard').forEach(card=>{
      card.addEventListener('click',()=>openDetail(card.dataset.id));
      card.addEventListener('keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openDetail(card.dataset.id);}});
    });
  }catch(e){if(e.name!=='AbortError')toast('Não foi possível carregar as peças: '+e.message,true)}finally{clearTimeout(loadingTimer);if(request===productRequest){el.setAttribute('aria-busy','false');el.classList.remove('isLoading');el.querySelectorAll('.productSkeleton').forEach(s=>s.remove());}}
}
async function refresh(){const button=$('#btnRecarregar');button.classList.add('refreshing');button.disabled=true;try{await Promise.all([loadStats(),loadCategories(),loadProducts()]);$('#lastSync').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch(error){toast(error.message,true)}finally{button.classList.remove('refreshing');button.disabled=false;}}

function showView(name){
  const view=$(`#view-${name}`);if(!view)return;
  const changed=!view.classList.contains('active');
  $$('.view').forEach(section=>section.classList.toggle('active',section===view));
  $$('.nav').forEach(button=>{const active=button.dataset.view===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('#workspaceTitle').textContent=({estoque:'Estoque',fotos:'Revisão de fotos',historico:'Movimentações',consertos:'Consertos',dados:'Backup e dados',users:'Usuários'})[name];
  if(changed){animateIn(view,14);window.scrollTo({top:0,behavior:'instant'});}
  if(name==='consertos')window.HMRepairs.load();if(name==='historico')loadHistory();if(name==='fotos')loadReview();
}
$$('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

const productCounter=new window.HMPhotoCounter($('#productCounter'),$('#quantity'));
$('#productDialog').addEventListener('close',()=>productCounter.clear());
function resetProductForm(){ productCounter.clear(); reviewPhotoForCreation=null; $('#productForm .photoActions').classList.remove('hidden'); $('#productForm').reset(); $('#productId').value=''; $('#quantity').value='0'; $('#min_quantity').value='0'; $('#qtyField').classList.remove('hidden'); $('#productTitle').textContent='Nova peça'; $('#productSubtitle').textContent='Foto, nome e quantidade.'; $('#photoName').textContent='Nenhuma nova foto selecionada'; $('#photoPreviewWrap').classList.add('hidden'); replacePreview(null); cameraBlob=null; }
$('#btnNovo').addEventListener('click',()=>{resetProductForm();showDialog($('#productDialog'));$('#name').focus();});
$$('.closeDialog').forEach(b=>b.addEventListener('click',()=>$('#productDialog').close()));
$('#photo').addEventListener('change',e=>{const file=e.target.files[0];cameraBlob=null;if(!file)return;$('#photoName').textContent=file.name;replacePreview(file);if(!$('#productId').value)productCounter.load(file);$('#photoPreviewWrap').classList.remove('hidden');});
$('#productForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try {
    const id=$('#productId').value, photoId=reviewPhotoForCreation, fd=new FormData();
    fd.set('name',$('#name').value); fd.set('category',$('#category').value);
    fd.set('min_quantity',$('#min_quantity').value); fd.set('notes',$('#notes').value);
    if(!id)fd.set('quantity',$('#quantity').value);
    const file=$('#photo').files[0];
    if(photoId)fd.set('existing_photo_id',photoId);
    else if(cameraBlob)fd.set('photo',cameraBlob,'camera.jpg');
    else if(file)fd.set('photo',file);
    const result=await api(id?`/api/products/${id}/update`:'/api/products',{method:'POST',body:fd});
    $('#productDialog').close();reviewPhotoForCreation=null;
    toast(photoId?'Peça criada e foto vinculada':id?'Peça atualizada':'Peça cadastrada');
    await refresh();
    if(photoId){await loadReview();await openDetail(result.id)}
    else if(id && selectedProduct?.id==id)openDetail(id);
  }catch(err){toast(err.message,true)}
});

function photoSuggestion(photo){
  const note=String(photo.review_note||'');
  const field=label=>note.split('\n').find(line=>line.startsWith(label+': '))?.slice(label.length+2)||'';
  return {name:field('Nome sugerido'),category:field('Categoria sugerida'),count:field('Contagem sugerida'),selected:field('Seleção').startsWith('Melhor foto')};
}
function createFromReviewPhoto(photo){
  resetProductForm();reviewPhotoForCreation=photo.id;
  $('#productTitle').textContent='Criar peça com esta foto';
  $('#productSubtitle').textContent='Identifique a peça da imagem e informe a quantidade contada.';
  $('#quantity').value='';replacePreview(photoSource(photo.id));$('#photoPreview').dataset.privatePhoto=String(photo.id);
  const suggestion=photoSuggestion(photo);
  if(suggestion.name){$('#name').value=suggestion.name;$('#category').value=suggestion.category;$('#notes').value=photo.review_note;$('#productSubtitle').textContent='Nome sugerido pela análise. Confira a identificação e informe a quantidade contada.';}
  $('#photoPreviewWrap').classList.remove('hidden');
  $('#productForm .photoActions').classList.add('hidden');
  showDialog($('#productDialog'));$('#name').focus();
  productCounter.load(async()=>{const response=await window.HMAuth.request(`/api/photos/${photo.id}`);if(!response.ok)throw Error('Foto indisponível');return response.blob();});
}

function enlargePhoto(id,caption){$('#fullImage').dataset.privatePhoto=String(id);$('#fullImage').src=photoSource(id);$('#imageCaption').textContent=caption;$('#fullImage').alt=caption;showDialog($('#imageDialog'));}
$('#closeImage').onclick=()=>$('#imageDialog').close();
async function photoAction(id,status,pid,primary=true){await api(`/api/photos/${id}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,product_id:pid,primary})});}
async function openDetail(id){ try{
  const request=++detailRequest,p=await api(`/api/products/${id}`);if(request!==detailRequest)return;selectedProduct=p;
  $('#detailName').textContent=p.name; $('#detailCategory').textContent=`${p.category||'Sem categoria'} · #${String(p.id).padStart(3,'0')}`;
  $('#detailQty').textContent=isUnknown(p)?'A contar':displayNumber(p.quantity)+(quantityUnit(p)==='m'?' m':'');$('#detailQty').classList.toggle('isUnknown',isUnknown(p));$('#detailReview').classList.toggle('hidden',p.review_status!=='pendente');
  $('#detailMin').textContent=p.min_quantity>0?`Estoque mínimo: ${p.min_quantity}`:'Sem estoque mínimo definido'; $('#detailNotes').textContent=p.notes||'Sem observações.';
  $('#detailPhotos').innerHTML=p.photos.length?p.photos.map(ph=>`<figure class="photoTile"><button class="photoZoom" data-photo="${ph.id}" aria-label="Ampliar foto de ${esc(p.name)}"><img loading="lazy" decoding="async" src="${esc(photoSource(ph.id))}" data-private-photo="${ph.id}" alt="${esc(p.name)}"><span class="zoomHint">${icon('search')} Ampliar</span></button><figcaption>${ph.is_primary?`<span class="photoTag">${icon('check')} Principal</span>`:`<button class="textBtn setPrimary" data-photo="${ph.id}">Usar como principal</button>`}<button class="textBtn reviewPhoto" data-photo="${ph.id}">Revisar vínculo</button></figcaption></figure>`).join(''):`<div class="emptyPhoto">${icon('photo')}<p>Esta peça ainda não tem foto</p><button id="detailAddPhoto" class="btn">${icon('plus')} Adicionar foto</button></div>`;
  $$('.photoZoom').forEach(b=>b.onclick=()=>enlargePhoto(b.dataset.photo,p.name));
  $$('.setPrimary').forEach(b=>b.onclick=async()=>{try{await photoAction(b.dataset.photo,'confirmada',p.id);await openDetail(p.id);await refresh()}catch(e){toast(e.message,true)}});
  $$('.reviewPhoto').forEach(b=>b.onclick=async()=>{try{await photoAction(b.dataset.photo,'pendente',p.id,false);await openDetail(p.id);await refresh();toast('Foto enviada para revisão')}catch(e){toast(e.message,true)}});
  if($('#detailAddPhoto'))$('#detailAddPhoto').onclick=()=>$('#btnEditar').click();
  $('#detailHistory').innerHTML=historyRows(p.movements,false);showDialog($('#detailDialog'));
}catch(e){toast(e.message,true)} }
$('#confirmProduct').onclick=async()=>{if(!selectedProduct)return;try{await api(`/api/products/${selectedProduct.id}/confirm`,{method:'POST'});await openDetail(selectedProduct.id);await refresh();toast('Item e contagem confirmados')}catch(e){toast(e.message,true)}};
$$('.closeDetail').forEach(b=>b.addEventListener('click',()=>$('#detailDialog').close()));
$('#btnEditar').addEventListener('click',()=>{ if(!selectedProduct)return; const p=selectedProduct; resetProductForm(); $('#productId').value=p.id; $('#name').value=p.name; $('#category').value=p.category; $('#min_quantity').value=p.min_quantity; $('#notes').value=p.notes; $('#qtyField').classList.add('hidden'); $('#productTitle').textContent='Editar peça'; $('#productSubtitle').textContent='Para mudar a quantidade, use Entrada, Saída ou Ajustar.'; $('#detailDialog').close();showDialog($('#productDialog')); });
$('#btnExcluir').addEventListener('click',async()=>{ if(!selectedProduct)return; if(!confirm(`Excluir "${selectedProduct.name}"?\n\nO histórico desta peça será apagado. As fotos serão preservadas para revisão.`))return; try{await api(`/api/products/${selectedProduct.id}`,{method:'DELETE'});$('#detailDialog').close();toast('Peça excluída');refresh();}catch(e){toast(e.message,true)} });

function openMovement(kind){
  if(!selectedProduct)return;
  const unknown=isUnknown(selectedProduct);
  $('#movementKind').value=kind;
  $('#movementProduct').textContent=`${selectedProduct.name} · Estoque atual: ${unknown?'A contar':displayNumber(selectedProduct.quantity)}`;
  $('#movementTitle').textContent=({entrada:'Registrar entrada',saida:'Registrar saída',ajuste:'Ajustar contagem'})[kind]||kindLabel(kind);
  $('#movementAmount').value='1';$('#movementAmount').required=kind!=='ajuste';
  $('#newQuantity').value=unknown?'':selectedProduct.quantity;$('#newQuantity').required=kind==='ajuste';
  $('#movementNote').value='';
  $('#movementAmountField').classList.toggle('hidden',kind==='ajuste');$('#adjustField').classList.toggle('hidden',kind!=='ajuste');
  showDialog($('#movementDialog'));$(kind==='ajuste'?'#newQuantity':'#movementAmount').focus();
}
$('#btnEntrada').addEventListener('click',()=>openMovement('entrada')); $('#btnSaida').addEventListener('click',()=>openMovement('saida')); $('#btnAjuste').addEventListener('click',()=>openMovement('ajuste')); $$('.closeMovement').forEach(b=>b.addEventListener('click',()=>$('#movementDialog').close()));
$('#movementForm').addEventListener('submit',async e=>{e.preventDefault(); if(!selectedProduct)return; const kind=$('#movementKind').value; const body={kind,note:$('#movementNote').value}; if(kind==='ajuste') body.new_quantity=Number($('#newQuantity').value); else body.amount=Number($('#movementAmount').value); try{await api(`/api/products/${selectedProduct.id}/movement`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('#movementDialog').close();toast('Estoque atualizado');await refresh();await openDetail(selectedProduct.id);}catch(err){toast(err.message,true)} });

function historyRows(rows,withName=true){return rows.map(m=>`<tr><td class="historyDate">${esc(fmtDate(m.created_at))}</td>${withName?`<td class="historyProduct">${esc(m.product_name)}</td>`:''}<td><span class="kind ${esc(m.kind)}">${kindLabel(m.kind)}</span></td><td><span class="delta ${m.amount>0?'plus':m.amount<0?'minus':''}">${delta(m.amount)}</span></td><td class="historyQty">${displayNumber(m.before_qty)}</td><td class="historyQty">${displayNumber(m.after_qty)}</td><td class="historyNote">${esc(m.note||'—')}</td></tr>`).join('')||`<tr><td colspan="${withName?7:6}" class="tableEmpty">${icon('history')}<strong>Nenhuma movimentação encontrada</strong><span>As entradas, saídas e contagens aparecem aqui.</span></td></tr>`;}
function foldText(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function renderHistory(){
  const query=foldText($('#historySearch').value),kind=$('#historyTypeFilter')?.value||'all';
  const rows=history.filter(m=>(kind==='all'||kind===''||m.kind===kind)&&foldText(`${m.product_name} ${kindLabel(m.kind)} ${m.note}`).includes(query));
  $('#historyBody').innerHTML=historyRows(rows,true);
  if($('#historyCount'))$('#historyCount').textContent=`${displayNumber(rows.length)} ${rows.length===1?'movimentação':'movimentações'}`;
}
async function loadHistory(){ try{history=await api('/api/history?limit=500');renderHistory()}catch(e){toast(e.message,true)} }
$('#historySearch').oninput=renderHistory;
if($('#historyTypeFilter'))$('#historyTypeFilter').onchange=renderHistory;

async function loadReview(){try{
  const request=++reviewRequest;$('#photoReview').setAttribute('aria-busy','true');
  const [photos,products]=await Promise.all([api('/api/photo-review?status='+$('#photoStatus').value),api('/api/products?status=todos')]);
  if(request!==reviewRequest)return;reviewRows=photos;catalogue=products;
  $('#photoProductList').innerHTML=catalogue.map(p=>`<option value="${p.id} · ${esc(p.name)}"></option>`).join('');
  photoPage=0;renderReview();
}catch(e){toast(e.message,true)}finally{$('#photoReview').setAttribute('aria-busy','false');}}
function updateReviewSummary(visibleCount){
  const summary=$('#reviewSummary');if(!summary)return;
  const count=visibleCount??reviewRows.length;
  summary.innerHTML=`<div class="reviewMetric"><strong>${displayNumber(lastStats?.review_photos??reviewRows.filter(photo=>photo.review_status==='pendente').length)}</strong><span>fotos para revisar</span></div><div class="reviewMetric"><strong>${displayNumber(lastStats?.pending??0)}</strong><span>peças a conferir</span></div><div class="reviewMetric"><strong>${displayNumber(count)}</strong><span>fotos na seleção</span></div>`;
}
function renderReview(){
  const q=foldText($('#photoSearch').value),origin=$('#photoOrigin').value;
  const rows=reviewRows.filter(p=>(origin==='all'||p.filename.startsWith('Paulo_20261008_'))&&foldText(`${p.filename} ${p.product_name||''} ${p.review_note}`).includes(q));
  $('#photoCount').textContent=`${displayNumber(rows.length)} ${rows.length===1?'foto':'fotos'}`;updateReviewSummary(rows.length);
  const pages=Math.max(1,Math.ceil(rows.length/photoPageSize));photoPage=Math.min(photoPage,pages-1);
  $('#photoPagination').classList.toggle('hidden',pages<=1);$('#photoPrev').disabled=photoPage===0;$('#photoNext').disabled=photoPage===pages-1;$('#photoPageLabel').textContent=`Página ${photoPage+1} de ${pages}`;
  $('#photoReview').innerHTML=rows.slice(photoPage*photoPageSize,(photoPage+1)*photoPageSize).map((p,index)=>`<article class="reviewCard" data-photo="${p.id}" style="--order:${Math.min(index,5)}"><button class="reviewZoom" data-photo="${p.id}" aria-label="Ampliar ${esc(p.filename)}"><img loading="lazy" decoding="async" src="${esc(photoSource(p.id))}" data-private-photo="${p.id}" alt="${esc(p.product_name||'Foto sem identificação')}"/><span class="zoomHint">${icon('search')} Ampliar foto</span></button><div class="reviewBody"><div class="reviewCardTop"><span class="photoTag ${p.review_status}">${({confirmada:'Associada',pendente:'Para revisar',oculta:'Oculta'})[p.review_status]||'Para revisar'}</span><span class="reviewPhotoIndex">FOTO ${String(p.id).padStart(3,'0')}</span></div><h3>${esc(p.product_name||photoSuggestion(p).name||'Qual é esta peça?')}</h3><p class="photoFilename" title="${esc(p.filename)}">${esc(p.filename)}</p>${photoSuggestion(p).count?`<div class="suggestionCount"><strong>${photoSuggestion(p).selected?'Foto de exemplo selecionada':'Sugestão para conferir'}</strong><span>${esc(photoSuggestion(p).count)}</span></div>`:''}<details class="reviewContext"><summary>Contexto da identificação</summary><p>${esc(p.review_note||'Identifique a peça e confirme a imagem no catálogo.')}</p></details><label class="field"><span>Vincular a uma peça existente</span><input class="photoAssignment" list="photoProductList" placeholder="Busque pelo nome ou código…" value="${p.product_id?`${p.product_id} · ${esc(p.product_name||'')}`:''}" aria-label="Peça da foto ${p.id}"></label><div class="reviewActions"><button type="button" class="btn primary assignPhoto">${icon('check')} Confirmar vínculo</button><button type="button" class="btn hidePhoto">${p.review_status==='oculta'?'Revisar':'Ocultar'}</button></div>${p.review_status!=='confirmada'?`<button type="button" class="btn createFromPhoto">${icon('plus')} Criar peça com esta foto</button>`:''}</div></article>`).join('')||`<div class="empty">${icon('photo')}<strong>${$('#photoStatus').value==='pendente'&&!q?'Todas as fotos foram revisadas':'Nenhuma foto nesta seleção'}</strong><p>${q?'Experimente outro nome ou código.':'Escolha outra situação para consultar as imagens.'}</p></div>`;
  $$('.reviewZoom').forEach(b=>b.onclick=()=>enlargePhoto(b.dataset.photo,reviewRows.find(p=>p.id==b.dataset.photo)?.filename||'Foto'));
  $$('.reviewCard').forEach(card=>{
    const photo=reviewRows.find(p=>p.id==card.dataset.photo);
    if(photo.review_status!=='confirmada'){
      card.querySelector('.createFromPhoto').onclick=()=>createFromReviewPhoto(photo);
    }
    card.querySelector('.assignPhoto').onclick=async()=>{
      const value=card.querySelector('.photoAssignment').value, match=catalogue.find(p=>`${p.id} · ${p.name}`===value||String(p.id)===value||foldText(p.name)===foldText(value));
      if(!match)return toast('Escolha uma peça da lista antes de confirmar.',true);
      try{await photoAction(card.dataset.photo,'confirmada',match.id);toast('Foto associada a '+match.name);await loadReview();await refresh()}catch(e){toast(e.message,true)}
    };
    card.querySelector('.hidePhoto').onclick=async()=>{const p=reviewRows.find(p=>p.id==card.dataset.photo);try{await photoAction(p.id,p.review_status==='oculta'?'pendente':'oculta',p.product_id,false);toast(p.review_status==='oculta'?'Foto devolvida à revisão':'Foto ocultada e preservada');await loadReview();await refresh()}catch(e){toast(e.message,true)}};
  });
}
$('#photoStatus').onchange=loadReview;$('#photoSearch').oninput=()=>{photoPage=0;renderReview()};
$('#photoOrigin').onchange=()=>{photoPage=0;renderReview()};
function movePhotoPage(direction){photoPage+=direction;renderReview();$('#photoReview').scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});}
$('#photoPrev').onclick=()=>movePhotoPage(-1);$('#photoNext').onclick=()=>movePhotoPage(1);
$$('.iconBtn').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Fechar janela')});



$('#busca').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadProducts,250)}); $('#categoria').addEventListener('change',loadProducts); $('#somenteBaixo').addEventListener('change',loadProducts); $('#btnRecarregar').addEventListener('click',refresh);
$('#statusEstoque').onchange=loadProducts;$('#sortProducts').onchange=loadProducts;$('#semFoto').onchange=loadProducts;
$('#clearFilters').onclick=()=>{$('#busca').value='';$('#categoria').value='';$('#statusEstoque').value='todos';$('#somenteBaixo').checked=false;$('#semFoto').checked=false;loadProducts()};
function changeLayout(list){$('#products').classList.toggle('listMode',list);$('#gridView').classList.toggle('active',!list);$('#listView').classList.toggle('active',list);$('#gridView').setAttribute('aria-pressed',String(!list));$('#listView').setAttribute('aria-pressed',String(list));try{localStorage.setItem('estoqueLayout',list?'list':'grid')}catch(e){}}
$('#resetFilters').onclick=()=>$('#clearFilters').click();
$('#commandButton').onclick=()=>{showView('estoque');$('#busca').focus();};
$('#heroReviewButton').onclick=()=>showView('fotos');
$('#headerDate').textContent=new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
$('#gridView').onclick=()=>changeLayout(false);$('#listView').onclick=()=>changeLayout(true);
try{changeLayout(localStorage.getItem('estoqueLayout')==='list')}catch(e){}
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();showView('estoque');$('#busca').focus()}});

$('#btnCamera').addEventListener('click',async()=>{ try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});$('#cameraVideo').srcObject=cameraStream;showDialog($('#cameraDialog'));}catch(e){toast('Não foi possível acessar a câmera. Você pode escolher uma foto do computador.',true)} });
function stopCamera(){ if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;} $('#cameraDialog').close(); }
$$('.closeCamera').forEach(b=>b.addEventListener('click',stopCamera));
$('#cameraDialog').addEventListener('cancel',stopCamera);
$('#capturePhoto').addEventListener('click',()=>{const v=$('#cameraVideo'),c=$('#cameraCanvas'); if(!v.videoWidth)return; const max=1600,scale=Math.min(1,max/v.videoWidth);c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext('2d').drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{cameraBlob=blob;$('#photo').value='';$('#photoName').textContent='Foto tirada pela câmera';replacePreview(blob);if(!$('#productId').value)productCounter.load(blob);$('#photoPreviewWrap').classList.remove('hidden');stopCamera();},'image/jpeg',.88);});

window.HMRepairs.init({api,esc,toast,showDialog,fmtDate});
refresh();
