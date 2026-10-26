const $=s=>document.querySelector(s);
const toTW=OpenCC.Converter({from:'cn',to:'tw'});
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if(navigator.storage&&navigator.storage.persist) navigator.storage.persist();
// IndexedDB
const dbp=new Promise((ok,no)=>{const r=indexedDB.open('notes',1);r.onupgradeneeded=()=>r.result.createObjectStore('e',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const tx=async(m,f)=>{const db=await dbp;return new Promise((ok,no)=>{const t=db.transaction('e',m);const r=f(t.objectStore('e'));t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error);});};
const put=e=>tx('readwrite',s=>s.put(e)), del=id=>tx('readwrite',s=>s.delete(id)), all=()=>tx('readonly',s=>s.getAll());
const fmt=ts=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(ts));
const fname=ts=>new Date(ts+8*3600e3).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','_');
// model worker
const w=new Worker('worker.js',{type:'module'});const pend={};
const prog={};
w.onmessage=e=>{const d=e.data;
  if(d.type==='progress'){const p=d.p;if(p.status==='progress'){prog[p.file]=[p.loaded,p.total];let l=0,t=0;for(const k in prog){l+=prog[k][0];t+=prog[k][1];}$('#mstat').textContent=`下載中 ${(l/1e6).toFixed(1)} / ${(t/1e6).toFixed(1)} MB`;}}
  else if(d.type==='ready'){localStorage.modelReady='1';$('#mstat').textContent='✅ 已就緒（可離線使用）';$('#dl').hidden=true;}
  else if(pend[d.id]){pend[d.id](d);delete pend[d.id];}
  else if(d.type==='error'){$('#mstat').textContent='❌ 載入失敗：'+d.msg;}
};
$('#mstat').textContent=localStorage.modelReady?'載入中…':'尚未下載';
if(localStorage.modelReady){$('#dl').hidden=true;w.postMessage({type:'load'});}
$('#dl').onclick=()=>{$('#mstat').textContent='開始下載…';w.postMessage({type:'load'});};
async function decode16k(blob){const buf=await blob.arrayBuffer();const AC=window.AudioContext||window.webkitAudioContext;const ac=new AC();
  const ab=await new Promise((ok,no)=>ac.decodeAudioData(buf,ok,no));ac.close&&ac.close();
  const oc=new OfflineAudioContext(1,Math.ceil(ab.duration*16000),16000);const s=oc.createBufferSource();s.buffer=ab;s.connect(oc.destination);s.start();return (await oc.startRendering()).getChannelData(0);}
function transcribe(blob){return decode16k(blob).then(audio=>new Promise(ok=>{const id=Math.random();pend[id]=ok;w.postMessage({type:'run',audio,id},[audio.buffer]);}));}
// capture
const geo=()=>new Promise(ok=>{if(!navigator.geolocation)return ok(null);navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy}),err=>ok({error:err.message}),{enableHighAccuracy:true,timeout:30000,maximumAge:0});});
$('#cam').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;const ts=Date.now();
  const e={id:ts,ts,photo:f,loc:{pending:true},transcript:''};await put(e);render();
  e.loc=await geo();await put(e);render();ev.target.value='';};
// text export
const mapl=l=>l&&l.lat!=null?`https://www.google.com/maps?q=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`:'';
const txt=e=>[`時間：${fmt(e.ts)}（台北時間）`,e.loc&&e.loc.lat!=null?`位置：${e.loc.lat.toFixed(6)}, ${e.loc.lng.toFixed(6)}（精確度 ±${Math.round(e.loc.acc)} 公尺）\n地圖：${mapl(e.loc)}`:'位置：無法取得',`逐字稿：\n${e.transcript||'（無）'}`].join('\n');
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function share(blob,name){const file=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file]});return;}catch(x){if(x.name==='AbortError')return;}}save(blob,name);}
const ext=b=>(b.type.split('/')[1]||'bin').split(';')[0].replace('jpeg','jpg').replace('x-m4a','m4a');
$('#expAll').onclick=async()=>{const es=(await all()).sort((a,b)=>a.ts-b.ts);share(new Blob([es.map(txt).join('\n\n----------\n\n')],{type:'text/plain'}),`筆記_全部_${fname(Date.now())}.txt`);};
async function zip(es,name){const z=new JSZip();z.file('筆記.txt',es.map(txt).join('\n\n----------\n\n'));for(const e of es){const n=fname(e.ts);if(e.photo)z.file(`${n}_照片.${ext(e.photo)}`,e.photo);if(e.audio)z.file(`${n}_錄音.${ext(e.audio)}`,e.audio);}share(await z.generateAsync({type:'blob'}),name);}
$('#zipAll').onclick=async()=>zip((await all()).sort((a,b)=>a.ts-b.ts),`筆記_全部_${fname(Date.now())}.zip`);
// recording
let rec=null;
async function record(e,btn){if(rec){rec.stop();return;}
  let st;try{st=await navigator.mediaDevices.getUserMedia({audio:true});}catch(x){alert('無法使用麥克風：'+x.message);return;}
  const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'';
  rec=new MediaRecorder(st,type?{mimeType:type}:{});const ch=[];rec.ondataavailable=d=>d.data.size&&ch.push(d.data);
  rec.onstop=async()=>{st.getTracks().forEach(t=>t.stop());rec=null;e.audio=new Blob(ch,{type:ch[0]?.type||type||'audio/mp4'});await put(e);render();};
  rec.start(1000);btn.textContent='⏹ 停止錄音';}
async function render(){const es=(await all()).sort((a,b)=>b.ts-a.ts);const L=$('#list');L.innerHTML='';
 for(const e of es){const c=document.createElement('div');c.className='card';
  const loc=e.loc?.pending?'📍 定位中…':e.loc?.lat!=null?`📍 ${e.loc.lat.toFixed(6)}, ${e.loc.lng.toFixed(6)}（±${Math.round(e.loc.acc)} 公尺） <a href="${mapl(e.loc)}" target="_blank">地圖</a>`:`📍 無法取得位置${e.loc?.error?'（'+e.loc.error+'）':''}`;
  c.innerHTML=`<img><div>🕒 ${fmt(e.ts)}</div><div>${loc}</div><div class="au"></div>
  <button class="r">🎙 ${e.audio?'重新錄音':'錄音'}</button><button class="t" ${e.audio?'':'hidden'}>📝 轉成文字</button>
  <textarea placeholder="逐字稿（可編輯）"></textarea><small class="s"></small><br>
  <button class="sec x">匯出 .txt</button><button class="sec z">匯出 .zip</button><button class="sec g">重新定位</button><button class="sec d">刪除</button>`;
  c.querySelector('img').src=URL.createObjectURL(e.photo);
  if(e.audio){const a=document.createElement('audio');a.controls=true;a.src=URL.createObjectURL(e.audio);c.querySelector('.au').append(a);}
  const ta=c.querySelector('textarea');ta.value=e.transcript||'';ta.onchange=()=>{e.transcript=ta.value;put(e);};
  c.querySelector('.r').onclick=ev=>record(e,ev.target);
  c.querySelector('.t').onclick=async ev=>{const s=c.querySelector('.s');if(!localStorage.modelReady&&!navigator.onLine){s.textContent='模型尚未下載，請先連網下載';return;}
    ev.target.disabled=true;s.textContent='辨識中…（手機上可能需要數十秒）';const t0=Date.now();
    try{const r=await transcribe(e.audio);if(r.type==='error')throw new Error(r.msg);e.transcript=toTW(r.text.trim());ta.value=e.transcript;await put(e);s.textContent=`完成（${((Date.now()-t0)/1000).toFixed(0)} 秒）`;}catch(x){s.textContent='辨識失敗：'+x.message;}ev.target.disabled=false;};
  c.querySelector('.x').onclick=()=>share(new Blob([txt(e)],{type:'text/plain'}),`筆記_${fname(e.ts)}.txt`);
  c.querySelector('.z').onclick=()=>zip([e],`筆記_${fname(e.ts)}.zip`);
  c.querySelector('.g').onclick=async()=>{e.loc={pending:true};render();e.loc=await geo();await put(e);render();};
  c.querySelector('.d').onclick=async()=>{if(confirm('確定刪除這筆紀錄？')){await del(e.id);render();}};
  L.append(c);}}
render();
