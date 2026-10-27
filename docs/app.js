const $=s=>document.querySelector(s);
const toTW=OpenCC.Converter({from:'cn',to:'tw'});
const DEFAULT_FOLDER='uncat';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const INBOX_NAME='記錄高高手收件匣';
let updating=false;
function offerUpdate(worker){
  const b=$('#updatebanner');
  if(!b||!worker) return;
  b.hidden=false;
  b.onclick=()=>{updating=true;worker.postMessage({type:'skip-waiting'});};
}
function watchUpdates(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    const arm=w=>{if(!w) return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller) offerUpdate(reg.waiting||w);});};
    if(reg.waiting&&navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    arm(reg.installing);
    reg.addEventListener('updatefound',()=>arm(reg.installing));
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating) location.reload();});
}
watchUpdates();
function paintVersion(){
  const n=$('#appver');
  if(!n||!self.APP_RELEASE) return;
  const r=self.APP_RELEASE;
  n.textContent='版本 v'+r.version+'（'+r.date+'）';
}
paintVersion();
if(navigator.storage&&navigator.storage.persist) navigator.storage.persist();

const dbp=new Promise((ok,no)=>{
  const r=indexedDB.open('notes',4);
  r.onupgradeneeded=()=>{
    const db=r.result;
    if(!db.objectStoreNames.contains('e')) db.createObjectStore('e',{keyPath:'id'});
    if(!db.objectStoreNames.contains('folders')) db.createObjectStore('folders',{keyPath:'id'});
    if(!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox',{keyPath:'id'});
    if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
    if(!db.objectStoreNames.contains('gpx')) db.createObjectStore('gpx',{keyPath:'id'});
    if(!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks',{keyPath:'id'});
    if(!db.objectStoreNames.contains('trkpt')){
      const pts=db.createObjectStore('trkpt',{keyPath:'id'});
      pts.createIndex('trackId','trackId');
    }
  };
  r.onsuccess=()=>ok(r.result);
  r.onerror=()=>no(r.error);
});
function idb(store,mode,fn){
  return dbp.then(db=>new Promise((ok,no)=>{
    const t=db.transaction(store,mode);
    let req;
    try{req=fn(t.objectStore(store));}catch(err){no(err);return;}
    t.oncomplete=()=>ok(req?req.result:undefined);
    t.onerror=()=>no(t.error);
  }));
}
const putNote=e=>idb('e','readwrite',s=>s.put(e));
const delNote=id=>idb('e','readwrite',s=>s.delete(id));
const allNotes=()=>idb('e','readonly',s=>s.getAll());
const putFolder=f=>idb('folders','readwrite',s=>s.put(f));
const allFolders=()=>idb('folders','readonly',s=>s.getAll());
const putOutbox=e=>idb('outbox','readwrite',s=>s.put(e));
const allOutbox=()=>idb('outbox','readonly',s=>s.getAll());
const delOutbox=id=>idb('outbox','readwrite',s=>s.delete(id));
const getMeta=key=>idb('meta','readonly',s=>s.get(key));
const setMeta=(key,value)=>idb('meta','readwrite',s=>s.put({key,...value}));
const delMeta=key=>idb('meta','readwrite',s=>s.delete(key));
const putGpx=e=>idb('gpx','readwrite',s=>s.put(e));
const allGpx=()=>idb('gpx','readonly',s=>s.getAll());
const gpxIn=async folderId=>(await allGpx()).filter(g=>g.folderId===folderId);
const putTrack=t=>idb('tracks','readwrite',s=>s.put(t));
const getTrack=id=>idb('tracks','readonly',s=>s.get(id));
const allTracks=()=>idb('tracks','readonly',s=>s.getAll());
const delTrack=id=>idb('tracks','readwrite',s=>s.delete(id));
const putPoint=p=>idb('trkpt','readwrite',s=>s.put(p));
const tracksIn=async folderId=>(await allTracks()).filter(t=>t.folderId===folderId);
function pointsIn(trackId){
  return dbp.then(db=>new Promise((ok,no)=>{
    const t=db.transaction('trkpt','readonly');
    const req=t.objectStore('trkpt').index('trackId').getAll(trackId);
    t.oncomplete=()=>ok(req.result||[]);
    t.onerror=()=>no(t.error);
  }));
}
function updateNote(id,fn){
  return dbp.then(db=>new Promise((ok,no)=>{
    const t=db.transaction('e','readwrite');
    const s=t.objectStore('e');
    const g=s.get(id);
    g.onsuccess=()=>{if(!g.result)return;const cur=g.result;fn(cur);s.put(cur);};
    t.oncomplete=()=>ok();
    t.onerror=()=>no(t.error);
  }));
}

function taipeiParts(ts){
  const iso=new Date(ts+8*3600e3).toISOString();
  const date=iso.slice(0,10);
  const time=iso.slice(11,19);
  return {display:date+' '+time, compact:date.replace(/-/g,'')+'_'+time.replace(/:/g,''), date:date.replace(/-/g,'')};
}
const fmt=ts=>taipeiParts(ts).display;
const fname=ts=>taipeiParts(ts).compact;
function todayTW(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function safeName(name){
  const s=String(name||'').replace(/[\\/:*?"<>|#\u0000-\u001f]/g,'_').replace(/\s+/g,' ').replace(/^[.\s]+|[.\s]+$/g,'');
  return s||'資料夾';
}
function safeFileName(name){
  const base=String(name||'').split(/[/\\]/).pop();
  const s=base.replace(/[\u0000-\u001f\\/:*?"<>|]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'');
  return s||'track.gpx';
}
function dateFromFolderName(name){
  const s=String(name||'');
  let m=s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(!m) m=s.match(/(20\d{2})(\d{2})(\d{2})/);
  if(!m) return '';
  const mo=+m[2], d=+m[3];
  if(mo<1||mo>12||d<1||d>31) return '';
  return m[1]+String(mo).padStart(2,'0')+String(d).padStart(2,'0');
}
function folderDateCompact(folder, notes){
  const fromName=dateFromFolderName(folder&&folder.name);
  if(fromName) return fromName;
  const sorted=(notes||[]).filter(n=>n&&n.ts!=null).slice().sort((a,b)=>a.ts-b.ts);
  if(sorted.length) return taipeiParts(sorted[0].ts).date;
  if(folder&&folder.created) return taipeiParts(folder.created).date;
  return taipeiParts(Date.now()).date;
}
function zipBaseName(folder, notes){return `${folderDateCompact(folder, notes)}_${safeName(folder.name)}.zip`;}
function zipFileName(folder, ts){return zipBaseName(folder, ts!=null?[{ts}]:[]);}

const w=new Worker('worker.js',{type:'module'});const pend={};
const prog={};
const transcribing=new Set();
let rec=null,recNoteId=null;
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
function transcribe(blob){
  if(typeof window.__transcribeStub==='function') return Promise.resolve(window.__transcribeStub(blob));
  return decode16k(blob).then(audio=>new Promise(ok=>{const id=Math.random();pend[id]=ok;w.postMessage({type:'run',audio,id},[audio.buffer]);}));
}
function noteStatus(id){const s=document.querySelector(`[data-id="${CSS.escape(String(id))}"] .s`);return s;}

async function doTranscribe(id){
  const e=(await allNotes()).find(n=>n.id===id);
  if(!e||!e.audio) return {ok:false,reason:'no-audio'};
  if(!localStorage.modelReady&&!navigator.onLine){
    const s=noteStatus(id); if(s) s.textContent='模型尚未下載，請先連網下載';
    return {ok:false,reason:'no-model'};
  }
  if(transcribing.has(id)) return {ok:false,reason:'busy'};
  transcribing.add(id);
  const audio=e.audio;
  let message='';
  try{
    await render();
    const s=noteStatus(id); if(s) s.textContent='辨識中…（手機上可能需要數十秒）';
    const r=await transcribe(audio);
    if(!r||r.type==='error') throw new Error((r&&r.msg)||'辨識失敗');
    const text=toTW(String(r.text||'').trim());
    if(!text) throw new Error('沒有辨識到文字');
    await updateNote(id,cur=>{cur.transcript=text;delete cur.audio;});
    message='完成，已刪除錄音';
    return {ok:true,text};
  }catch(err){
    message='辨識失敗，已保留錄音：'+err.message;
    return {ok:false,reason:err.message};
  }finally{
    transcribing.delete(id);
    await render();
    const s=noteStatus(id); if(s&&message) s.textContent=message;
  }
}
async function attachRecording(id,blob){
  const e=(await allNotes()).find(n=>n.id===id);
  if(!e) return;
  e.audio=blob;
  await putNote(e);
  await render();
  if(localStorage.modelReady) return doTranscribe(id);
}

const geo=()=>new Promise(ok=>{if(!navigator.geolocation)return ok(null);navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy}),err=>ok({error:err.message}),{enableHighAccuracy:true,timeout:30000,maximumAge:0});});
const PHOTO_EDGE=4000;
const PHOTO_MAX=5*1024*1024;
async function readExifOrientation(file){
  try{
    const buf=await file.slice(0,131072).arrayBuffer();
    const v=new DataView(buf);
    if(v.byteLength<4||v.getUint16(0)!==0xFFD8) return 1;
    let o=2;
    while(o+4<v.byteLength){
      const marker=v.getUint16(o);
      if(marker===0xFFDA||marker===0xFFD9) break;
      if((marker&0xFF00)!==0xFF00) break;
      const size=v.getUint16(o+2);
      if(marker===0xFFE1&&size>=16&&o+10<v.byteLength&&v.getUint32(o+4)===0x45786966){
        const n=exifOrient(v,o+10);
        if(n) return n;
      }
      if(size<2) break;
      o+=2+size;
    }
  }catch(e){}
  return 1;
}
function exifOrient(v,tiff){
  if(tiff+8>v.byteLength) return 0;
  const le=v.getUint16(tiff)===0x4949;
  const ifd=tiff+v.getUint32(tiff+4,le);
  if(ifd+2>v.byteLength) return 0;
  const n=v.getUint16(ifd,le);
  for(let i=0;i<n;i++){
    const e=ifd+2+i*12;
    if(e+12>v.byteLength) break;
    if(v.getUint16(e,le)===0x0112){
      const val=v.getUint16(e+8,le);
      return val>=1&&val<=8?val:1;
    }
  }
  return 0;
}
let knownExif=null;
function exifProbeBlob(){
  const c=document.createElement('canvas');
  c.width=8; c.height=2;
  const g=c.getContext('2d');
  g.fillStyle='#f00'; g.fillRect(0,0,8,2);
  return new Promise((ok,no)=>c.toBlob(async b=>{
    try{
      const bytes=new Uint8Array(await b.arrayBuffer());
      const tiff=new Uint8Array([0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x12,0x01,0x03,0x00,0x01,0x00,0x00,0x00,0x06,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);
      const size=2+6+tiff.length;
      const app=new Uint8Array(2+size);
      app[0]=0xff; app[1]=0xe1; app[2]=size>>8; app[3]=size&255;
      app.set([0x45,0x78,0x69,0x66,0,0],4);
      app.set(tiff,10);
      const out=new Uint8Array(bytes.length+app.length);
      out[0]=0xff; out[1]=0xd8; out.set(app,2); out.set(bytes.subarray(2),2+app.length);
      ok(new Blob([out],{type:'image/jpeg'}));
    }catch(e){no(e);}
  },'image/jpeg',0.92));
}
async function browserAppliesExif(){
  if(knownExif!==null) return knownExif;
  try{
    if(typeof createImageBitmap!=='function'){knownExif=true;return true;}
    const bmp=await createImageBitmap(await exifProbeBlob());
    knownExif=bmp.height>bmp.width;
    if(bmp.close) bmp.close();
  }catch(e){knownExif=true;}
  return knownExif;
}
async function loadBitmap(file){
  const manual=!(await browserAppliesExif());
  if(typeof createImageBitmap==='function'){
    try{return {source:await createImageBitmap(file), raw:manual};}
    catch(e){}
  }
  const source=await new Promise((ok,no)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);ok(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);no(new Error('無法讀取照片'));};
    img.src=url;
  });
  return {source, raw:manual};
}
function canvasBlob(canvas,quality){
  return new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('無法壓縮照片')),'image/jpeg',quality));
}
function drawOriented(source,orientation,edge){
  const w=source.width,h=source.height;
  const swap=orientation>=5&&orientation<=8;
  const ow=swap?h:w, oh=swap?w:h;
  const long=Math.max(ow,oh);
  const scale=long>edge?edge/long:1;
  const cw=Math.max(1,Math.round(ow*scale)), ch=Math.max(1,Math.round(oh*scale));
  const canvas=document.createElement('canvas');
  canvas.width=cw; canvas.height=ch;
  const ctx=canvas.getContext('2d');
  ctx.setTransform(scale,0,0,scale,0,0);
  switch(orientation){
    case 2: ctx.transform(-1,0,0,1,ow,0); break;
    case 3: ctx.transform(-1,0,0,-1,ow,oh); break;
    case 4: ctx.transform(1,0,0,-1,0,oh); break;
    case 5: ctx.transform(0,1,1,0,0,0); break;
    case 6: ctx.transform(0,1,-1,0,ow,0); break;
    case 7: ctx.transform(0,-1,-1,0,ow,oh); break;
    case 8: ctx.transform(0,-1,1,0,0,oh); break;
    default: break;
  }
  ctx.drawImage(source,0,0,w,h);
  return canvas;
}
async function compressPhoto(file,opts){
  const maxBytes=(opts&&opts.maxBytes)||PHOTO_MAX;
  let edge=(opts&&opts.maxEdge)||PHOTO_EDGE;
  const loaded=await loadBitmap(file);
  const source=loaded.source;
  let orientation=1;
  try{if(loaded.raw) orientation=await readExifOrientation(file);}catch(e){orientation=1;}
  let quality=0.85;
  let blob=await canvasBlob(drawOriented(source,orientation,edge),quality);
  for(let guard=0;guard<20&&blob.size>=maxBytes;guard++){
    if(quality>0.4) quality=Math.round((quality-0.1)*10)/10;
    else{
      const next=Math.round(edge*0.75);
      if(next<240) break;
      edge=next;
      quality=0.65;
    }
    blob=await canvasBlob(drawOriented(source,orientation,edge),quality);
  }
  if(source.close) source.close();
  return blob;
}
function setCapMsg(t){const n=$('#capmsg');if(n)n.textContent=t||'';}
let thumbUrl='';
function setRecThumb(blob){
  const img=$('#recthumb');
  if(!img) return;
  if(thumbUrl) URL.revokeObjectURL(thumbUrl);
  thumbUrl='';
  if(!blob){img.removeAttribute('src');return;}
  thumbUrl=URL.createObjectURL(blob);
  img.src=thumbUrl;
}
function captureStamp(file){
  const now=Date.now();
  const modified=file&&file.lastModified;
  if(modified&&modified>now-120000&&modified<=now+5000) return modified;
  return now;
}
$('#cam').onchange=async ev=>{
  onVisible();
  const f=ev.target.files&&ev.target.files[0];
  ev.target.value='';
  if(!f) return;
  if(rec){setCapMsg('請先按停止錄音，再拍下一張。');return;}
  await takePhoto(f);
};
async function takePhoto(file){
  let ts=captureStamp(file);
  setCapMsg('處理照片…');
  let photo=file;
  try{photo=await compressPhoto(file);}
  catch(e){setCapMsg('照片無法壓縮，已用原檔。');}
  setRecThumb(photo);
  const folder=await activeFolder();
  const used=new Set((await allNotes()).map(n=>n.id));
  while(used.has(ts)) ts+=1;
  await putNote({id:ts,ts,photo,loc:{pending:true},transcript:'',folderId:folder.id});
  voiceNoteId=null;
  const locPromise=geo().then(loc=>updateNote(ts,cur=>{cur.loc=loc;}));
  await render();
  const card=document.querySelector(`[data-id="${CSS.escape(String(ts))}"]`);
  if(card) card.scrollIntoView({block:'nearest'});
  void locPromise.then(()=>{if(!rec) render();});
  void afterPhoto(ts);
}
async function afterPhoto(ts){
  const ok=await startVoice(ts);
  if(recNoteId===ts){voiceNoteId=null;setCapMsg('');}
  else if(!ok){voiceNoteId=ts;setCapMsg('無法自動開始錄音。請按「開始錄音」。');}
  paintDock();
}

const mapl=l=>l&&l.lat!=null?`https://www.google.com/maps?q=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`:'';
function notePhotos(e){
  if(e&&Array.isArray(e.photos)){
    const list=e.photos.filter(Boolean);
    if(list.length) return list;
  }
  return e&&e.photo?[e.photo]:[];
}
function planFiles(notes){
  const sorted=(notes||[]).slice().sort((a,b)=>a.ts-b.ts);
  const used=new Set();
  return sorted.map(e=>{
    const photos=[];
    notePhotos(e).forEach((blob,i)=>{
      const base=fname(e.ts);
      let n=`${base}_照片.jpg`;
      if(used.has(n)) n=`${base}_${e.id}_照片.jpg`;
      let k=2;
      while(used.has(n)){n=`${base}_${e.id}_${i}_${k}_照片.jpg`;k++;}
      used.add(n);
      photos.push({name:n, blob});
    });
    return {note:e, photos};
  });
}
function txt(e, photoNames){
  const voice=e&&e.kind==='voice';
  const names=voice?[]:(photoNames||planFiles([e])[0].photos.map(p=>p.name));
  const lines=[`時間：${fmt(e.ts)}（台北時間）`];
  if(voice) lines.push('類型：語音筆記');
  else for(const n of names) lines.push('照片：'+n);
  lines.push(`逐字稿：\n${e.transcript||'（無）'}`);
  if(e.loc&&e.loc.lat!=null){
    const acc=Number.isFinite(Number(e.loc.acc))?`（精確度 ±${Math.round(e.loc.acc)} 公尺）`:'';
    lines.push(`位置：${e.loc.lat.toFixed(6)}, ${e.loc.lng.toFixed(6)}${acc}`);
    lines.push(`地圖：${mapl(e.loc)}`);
  }else lines.push('位置：無法取得');
  return lines.join('\n');
}
function folderTxt(folder,notes){
  const body=planFiles(notes).map(item=>txt(item.note, item.photos.map(p=>p.name))).join('\n\n----------\n\n');
  return `資料夾：${folder.name}\n\n${body}`;
}
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function share(blob,name){const file=new File([blob],name,{type:blob.type||'application/octet-stream'});if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file]});return;}catch(x){if(x.name==='AbortError')return;}}save(blob,name);}
function ext(b){
  const part=((b&&b.type)||'').split('/')[1]||'bin';
  return part.split(';')[0].replace('jpeg','jpg').replace('x-m4a','m4a')||'bin';
}
function uniqueZipName(name, used){
  if(!used.has(name)&&name!=='筆記.txt') return name;
  const dot=name.lastIndexOf('.');
  const stem=dot>0?name.slice(0,dot):name;
  const extn=dot>0?name.slice(dot):'';
  let k=2, final=name;
  while(used.has(final)||final==='筆記.txt'){final=stem+'_'+k+extn;k++;}
  return final;
}
async function buildFolderZip(folder,notes){
  const z=new JSZip();
  const plan=planFiles(notes);
  z.file('筆記.txt',folderTxt(folder,notes));
  const used=new Set(['筆記.txt']);
  for(const item of plan){
    for(const p of item.photos){z.file(p.name,p.blob);used.add(p.name);}
    if(item.note.audio&&item.note.kind!=='voice'){
      const n=uniqueZipName(`${fname(item.note.ts)}_錄音.${ext(item.note.audio)}`, used);
      used.add(n);
      z.file(n,item.note.audio);
    }
  }
  const files=(await gpxIn(folder.id)).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-Hant'));
  for(const g of files){
    const n=uniqueZipName(safeFileName(g.name), used);
    used.add(n);
    z.file(n,g.file);
  }
  const recorded=(await tracksIn(folder.id)).slice().sort((a,b)=>a.started-b.started);
  for(const t of recorded){
    const pts=await pointsIn(t.id);
    if(!pts.length) continue;
    const n=uniqueZipName(t.name||trackGpxName(t), used);
    used.add(n);
    z.file(n,gpxText(t,pts));
  }
  return z.generateAsync({type:'blob'});
}
async function notesIn(folderId){return (await allNotes()).filter(n=>n.folderId===folderId);}
async function exportFolderTxt(folder){
  const notes=await notesIn(folder.id);
  await share(new Blob([folderTxt(folder,notes)],{type:'text/plain'}),`${folderDateCompact(folder,notes)}_${safeName(folder.name)}.txt`);
}
async function exportFolderZip(folder){
  const notes=await notesIn(folder.id);
  await share(await buildFolderZip(folder,notes),zipBaseName(folder,notes));
}
async function addGpxFile(folderId, file){
  let name=safeFileName(file.name||'track.gpx');
  const used=new Set((await gpxIn(folderId)).map(g=>g.name));
  const dot=name.lastIndexOf('.');
  const stem=dot>0?name.slice(0,dot):name;
  const extn=dot>0?name.slice(dot):'';
  let k=2;
  while(used.has(name)){name=stem+'_'+k+extn;k++;}
  const rec={id:'g'+Date.now()+Math.random().toString(16).slice(2),folderId,name,file,added:Date.now()};
  await putGpx(rec);
  return rec;
}

async function migrate(){
  const folders=await allFolders();
  if(!folders.some(f=>f.id===DEFAULT_FOLDER)) await putFolder({id:DEFAULT_FOLDER,name:'未分類',created:0});
  for(const e of await allNotes()){
    if(!e.folderId){e.folderId=DEFAULT_FOLDER;await putNote(e);}
  }
  const ids=new Set((await allFolders()).map(f=>f.id));
  if(!localStorage.activeFolder||!ids.has(localStorage.activeFolder)) localStorage.activeFolder=DEFAULT_FOLDER;
  if(localStorage.driveInboxId){
    if(!(await getMeta('driveInbox'))) await setMeta('driveInbox',{id:localStorage.driveInboxId});
    localStorage.removeItem('driveInboxId');
  }
}
async function activeFolder(){
  const folders=await allFolders();
  return folders.find(f=>f.id===localStorage.activeFolder)||folders.find(f=>f.id===DEFAULT_FOLDER)||folders[0];
}
async function createFolder(name){
  name=String(name||'').trim();
  if(!name) throw new Error('請輸入資料夾名稱');
  const folder={id:'f'+Date.now(),name,created:Date.now()};
  await putFolder(folder);
  localStorage.activeFolder=folder.id;
  await render();
  return folder;
}
async function renameFolder(id,name){
  name=String(name||'').trim();
  if(!name) return;
  const f=(await allFolders()).find(x=>x.id===id);
  if(!f) return;
  f.name=name;
  await putFolder(f);
  await render();
}
async function useFolder(id){localStorage.activeFolder=id;await render();}

let micStream=null;
let micWarm=null;
let voiceNoteId=null;
let sharedAudio=null;
function releaseMic(){
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
  micWarm=null;
}
function liveMic(){
  if(micStream&&micStream.getAudioTracks().some(t=>t.readyState==='live')) return micStream;
  micStream=null;
  return null;
}
function armMic(){
  const live=liveMic();
  if(live) return Promise.resolve(live);
  if(micWarm) return micWarm;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('這台瀏覽器不能錄音'));
  micWarm=navigator.mediaDevices.getUserMedia({audio:true}).then(st=>{
    micStream=st;
    micWarm=null;
    st.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{if(micStream===st) micStream=null;}));
    return st;
  }).catch(err=>{micWarm=null;throw err;});
  return micWarm;
}
function unlockAudio(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) return;
  try{
    if(!sharedAudio) sharedAudio=new AC();
    if(sharedAudio.state==='suspended') sharedAudio.resume();
  }catch(e){}
}
function beginRecorder(noteId,st){
  const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'';
  const mr=new MediaRecorder(st,type?{mimeType:type}:{});
  const ch=[];
  mr.ondataavailable=d=>{if(d.data&&d.data.size)ch.push(d.data);};
  mr.onstop=async()=>{
    if(rec===mr) rec=null;
    recNoteId=null;
    voiceNoteId=null;
    paintDock();
    const blob=new Blob(ch,{type:(ch[0]&&ch[0].type)||type||'audio/mp4'});
    await attachRecording(noteId,blob);
  };
  rec=mr;
  recNoteId=noteId;
  mr.start(250);
  paintDock();
}
async function startVoice(noteId){
  if(rec) return recNoteId===noteId;
  if(transcribing.has(noteId)){setCapMsg('正在轉成文字，請稍候');return false;}
  let st=liveMic();
  if(!st){
    try{st=await armMic();}
    catch(e){return false;}
  }
  try{beginRecorder(noteId,st);return true;}
  catch(e){rec=null;recNoteId=null;return false;}
}
async function record(e){
  if(rec&&recNoteId===e.id){unlockAudio();rec.stop();return;}
  if(rec) return;
  unlockAudio();
  voiceNoteId=null;
  const ok=await startVoice(e.id);
  if(!ok){voiceNoteId=e.id;setCapMsg('無法自動開始錄音。請按「開始錄音」。');}
  paintDock();
  await render();
}

function paintDock(){
  const recording=!!rec;
  const fallback=!recording&&!!voiceNoteId;
  const halt=$('#halt'), speak=$('#speak'), shoot=$('#shoot'), vnote=$('#vnote'), ind=$('#recind'), thumb=$('#recthumb');
  if(halt) halt.hidden=!recording;
  if(ind) ind.hidden=!recording;
  if(thumb) thumb.hidden=!recording||!thumb.getAttribute('src');
  if(speak) speak.hidden=!fallback;
  if(shoot) shoot.hidden=recording||fallback;
  if(vnote) vnote.hidden=recording||fallback;
}
function freshTrackFix(){
  if(!activeTrackId||!lastPoint) return null;
  if(!Number.isFinite(lastPoint.lat)||!Number.isFinite(lastPoint.lon)) return null;
  if(!Number.isFinite(lastPoint.time)||Date.now()-lastPoint.time>=30000) return null;
  const loc={lat:lastPoint.lat,lng:lastPoint.lon};
  if(Number.isFinite(lastPoint.acc)) loc.acc=lastPoint.acc;
  return loc;
}
function askNoteLoc(){
  const fix=freshTrackFix();
  if(fix) return Promise.resolve(fix);
  return new Promise(ok=>{
    if(!navigator.geolocation) return ok(null);
    let done=false;
    const finish=v=>{if(!done){done=true;ok(v);}};
    navigator.geolocation.getCurrentPosition(
      p=>finish({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy}),
      ()=>finish(null),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
  });
}
async function startVoiceNote(locPromise){
  if(rec){setCapMsg('請先按停止錄音。');return;}
  const ts=Date.now();
  const folder=await activeFolder();
  const used=new Set((await allNotes()).map(n=>n.id));
  let id=ts;
  while(used.has(id)) id+=1;
  const seeded=freshTrackFix();
  await putNote({id,ts,kind:'voice',transcript:'',folderId:folder.id,loc:seeded||{pending:true}});
  setRecThumb(null);
  voiceNoteId=null;
  const ok=await startVoice(id);
  if(recNoteId===id) setCapMsg('');
  else if(!ok){voiceNoteId=id;setCapMsg('無法自動開始錄音。請按「開始錄音」。');}
  if(!seeded){
    (locPromise||askNoteLoc()).then(async loc=>{
      await updateNote(id,cur=>{cur.loc=loc&&loc.lat!=null?loc:null;});
      await render();
    });
  }
  await render();
  const card=document.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if(card) card.scrollIntoView({block:'nearest'});
  paintDock();
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function button(cls,text,onclick){const b=el('button',cls,text);b.type='button';b.onclick=onclick;return b;}
function setUpStatus(t){const n=$('#upstat');if(n)n.textContent=t;}

function clientIdValue(){
  const saved=(localStorage.gdriveClientId||'').trim();
  if(saved) return saved;
  return String((window.APP_CONFIG&&window.APP_CONFIG.GOOGLE_CLIENT_ID)||'').trim();
}
function readToken(){
  try{
    const saved=JSON.parse(sessionStorage.getItem('driveToken')||'null');
    if(saved&&saved.access_token&&saved.exp>Date.now()) return saved.access_token;
  }catch(e){}
  return null;
}
function saveToken(resp){
  const exp=Date.now()+Math.max(30,(resp.expires_in||3600)-60)*1000;
  sessionStorage.setItem('driveToken',JSON.stringify({access_token:resp.access_token,exp}));
}
function loadGis(){
  if(window.google&&google.accounts&&google.accounts.oauth2) return Promise.resolve();
  return new Promise((ok,no)=>{
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';
    s.async=true;
    s.onload=()=>ok();
    s.onerror=()=>no(new Error('無法載入 Google 登入元件'));
    document.head.appendChild(s);
  });
}
function requestToken(clientId,prompt){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const done=(fn,v)=>{if(settled)return;settled=true;fn(v);};
    const client=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:DRIVE_SCOPE,
      callback:resp=>{
        if(resp&&resp.access_token) done(resolve,resp);
        else done(reject,new Error((resp&&resp.error)||'授權失敗'));
      },
      error_callback:err=>done(reject,new Error((err&&(err.message||err.type))||'授權失敗'))
    });
    client.requestAccessToken({prompt});
  });
}
async function ensureToken(interactive){
  const cached=readToken();
  if(cached) return cached;
  const clientId=clientIdValue();
  if(!clientId) throw new Error('請先貼上 Google OAuth Client ID 並按儲存');
  if(!navigator.onLine) throw new Error('目前沒有網路');
  await loadGis();
  try{
    const resp=await requestToken(clientId,'none');
    saveToken(resp);
    return resp.access_token;
  }catch(err){
    if(!interactive) throw err;
    const resp=await requestToken(clientId,'');
    saveToken(resp);
    return resp.access_token;
  }
}
async function driveJson(url,opts){
  const r=await fetch(url,opts);
  if(r.status===401){sessionStorage.removeItem('driveToken');throw new Error('授權已失效，請再點一次');}
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error((data.error&&data.error.message)||('HTTP '+r.status));
  return data;
}
function driveQueryEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
async function rememberInbox(id){await setMeta('driveInbox',{id});return id;}
async function inboxId(token){
  const auth={Authorization:'Bearer '+token};
  const saved=await getMeta('driveInbox');
  if(saved&&saved.id){
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(saved.id)+'?fields=id,name,trashed,mimeType',{headers:auth});
    if(r.ok){
      const j=await r.json();
      if(j&&j.id&&!j.trashed&&j.name===INBOX_NAME&&j.mimeType==='application/vnd.google-apps.folder') return j.id;
    }else if(r.status===401){sessionStorage.removeItem('driveToken');throw new Error('授權已失效，請再點一次');}
  }
  const q="mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '"+INBOX_NAME+"'";
  const listUrl='https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name)',spaces:'drive',pageSize:'10'});
  const list=await driveJson(listUrl,{headers:auth});
  if(list.files&&list.files[0]) return rememberInbox(list.files[0].id);
  const created=await driveJson('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({name:INBOX_NAME,mimeType:'application/vnd.google-apps.folder'})});
  return rememberInbox(created.id);
}
async function nameTaken(token, parent, name){
  const q="trashed = false and name = '"+driveQueryEscape(name)+"' and '"+driveQueryEscape(parent)+"' in parents";
  const url='https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name)',spaces:'drive',pageSize:'1'});
  const list=await driveJson(url,{headers:{Authorization:'Bearer '+token}});
  return !!(list.files&&list.files.length);
}
function collisionName(baseName, ts){
  const stamp=taipeiParts(ts).compact.split('_')[1];
  return baseName.replace(/\.zip$/i,'_'+stamp+'.zip');
}
async function chooseUploadName(token, parent, baseName){
  if(!(await nameTaken(token, parent, baseName))) return baseName;
  let name=collisionName(baseName, Date.now());
  if(!(await nameTaken(token, parent, name))) return name;
  const stem=name.replace(/\.zip$/i,'');
  for(let i=2;i<100;i++){
    const alt=stem+'_'+i+'.zip';
    if(!(await nameTaken(token, parent, alt))) return alt;
  }
  return stem+'_'+Date.now()+'.zip';
}
async function sendZip(token,name,blob){
  const parent=await inboxId(token);
  const finalName=await chooseUploadName(token, parent, name);
  const boundary='pvn'+Math.random().toString(16).slice(2);
  const meta=JSON.stringify({name:finalName,parents:[parent]});
  const body=new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ]);
  const sent=await driveJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},
    body
  });
  return {id:sent.id, name:sent.name||finalName};
}
async function uploadFolder(folderId){
  if(!clientIdValue()){
    const msg='請先貼上 Google OAuth Client ID 並按儲存';
    setUpStatus(msg);
    throw new Error(msg);
  }
  const folder=(await allFolders()).find(f=>f.id===folderId);
  if(!folder) throw new Error('找不到資料夾');
  const notes=await notesIn(folder.id);
  const name=zipBaseName(folder,notes);
  const zipBlob=await buildFolderZip(folder,notes);
  if(!navigator.onLine){
    await putOutbox({id:'q'+Date.now()+Math.random().toString(16).slice(2),folderId:folder.id,name,zip:zipBlob,created:Date.now()});
    setUpStatus('目前沒有網路，已排入待上傳。連線後會自動再試；若需要重新授權，請再點一次。');
    return {queued:true,name};
  }
  setUpStatus('上傳中…');
  const token=await ensureToken(true);
  const sent=await sendZip(token,name,zipBlob);
  setUpStatus('已送到「'+INBOX_NAME+'」：'+sent.name);
  return {ok:true,name:sent.name};
}
const uploading=new Set();
async function onUpload(id){
  if(uploading.has(id)) return;
  uploading.add(id);
  try{await uploadFolder(id);}
  catch(err){
    const cur=$('#upstat')?$('#upstat').textContent:'';
    if(!cur.includes(err.message)) setUpStatus('上傳失敗：'+err.message);
  }finally{uploading.delete(id);}
}
async function flushOutbox(){
  if(!navigator.onLine) return;
  const items=await allOutbox();
  if(!items.length) return;
  if(!clientIdValue()){setUpStatus('有待上傳的檔案。請先貼上 Google OAuth Client ID 再點一次。');return;}
  let token;
  try{token=await ensureToken(false);}
  catch(e){setUpStatus('已恢復網路。請再點「☁️ 送到記錄高高手」完成上傳。');return;}
  for(const item of items){
    try{
      const sent=await sendZip(token,item.name,item.zip);
      await delOutbox(item.id);
      setUpStatus('已送到「'+INBOX_NAME+'」：'+sent.name);
    }catch(err){
      setUpStatus('上傳失敗：'+err.message);
      return;
    }
  }
}

const ACC_MAX=50;
const DUP_M=2;
let watchId=null;
let activeTrackId=null;
let openTrackId=null;
let lastPoint=null;
let liveCount=0;
let liveDistance=0;
let liveStarted=0;
let pointChain=Promise.resolve();
let ready=Promise.resolve();
let wakeLock=null;
function haversine(a,b){
  const R=6371000;
  const p1=a.lat*Math.PI/180, p2=b.lat*Math.PI/180;
  const dp=(b.lat-a.lat)*Math.PI/180, dl=(b.lon-a.lon)*Math.PI/180;
  const s=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function pathDistance(pts){
  let d=0;
  for(let i=1;i<pts.length;i++) d+=haversine(pts[i-1],pts[i]);
  return d;
}
function acceptFix(prev, fix){
  if(!fix||!Number.isFinite(fix.lat)||!Number.isFinite(fix.lon)) return false;
  if(Math.abs(fix.lat)>90||Math.abs(fix.lon)>180) return false;
  if(fix.acc!=null&&Number.isFinite(fix.acc)&&fix.acc>ACC_MAX) return false;
  if(prev&&haversine(prev,fix)<DUP_M) return false;
  return true;
}
function fmtDur(ms){
  const s=Math.max(0,Math.round(ms/1000));
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  if(h) return h+' 小時 '+m+' 分';
  if(m) return m+' 分 '+String(ss).padStart(2,'0')+' 秒';
  return ss+' 秒';
}
function fmtDist(m){
  if(!Number.isFinite(m)||m<1000) return Math.round(m||0)+' 公尺';
  return (m/1000).toFixed(2)+' 公里';
}
function trackGpxName(track){return `${fname(track.started)}_軌跡.gpx`;}
function xmlEsc(s){return String(s).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;','"':'&quot;'}[ch]));}
function gpxText(track, points){
  const body=(points||[]).slice().sort((a,b)=>a.time-b.time).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>{
    const ele=Number.isFinite(p.ele)?'<ele>'+p.ele+'</ele>':'';
    return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele}<time>${new Date(p.time).toISOString()}</time></trkpt>`;
  }).join('');
  const title=xmlEsc((track&&(track.name||trackGpxName(track)))||'軌跡').replace(/\.gpx$/,'');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="離線筆記" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${title}</name><trkseg>${body}</trkseg></trk>\n</gpx>\n`;
}
function setTrackMsg(t){const n=$('#trackmsg');if(n) n.textContent=t||'';}
function paintLive(){
  const n=$('#trackstat');
  if(!n) return;
  if(!activeTrackId){n.textContent='';return;}
  const elapsed=fmtDur(Date.now()-liveStarted);
  const dist=fmtDist(liveDistance);
  n.textContent=`錄製中　已經 ${elapsed}　${liveCount} 點　${dist}`;
  const row=document.querySelector(`[data-track="${CSS.escape(String(activeTrackId))}"] span`);
  if(row) row.textContent=`${fmt(liveStarted)}　${elapsed}　${dist}　錄製中`;
}
function stopWatch(){
  if(watchId!=null&&navigator.geolocation){
    try{navigator.geolocation.clearWatch(watchId);}catch(e){}
  }
  watchId=null;
}
function startWatch(){
  stopWatch();
  if(!navigator.geolocation){setTrackMsg('這台裝置沒有提供定位。');return;}
  watchId=navigator.geolocation.watchPosition(pos=>queueFix(pos), err=>{onGeoError(err);}, {enableHighAccuracy:true, maximumAge:0, timeout:20000});
}
function queueFix(pos){pointChain=pointChain.then(()=>ready).then(()=>handleFix(pos)).catch(()=>{});}
async function handleFix(pos){
  if(!activeTrackId||!pos||!pos.coords) return;
  const c=pos.coords;
  const fix={
    lat:c.latitude,
    lon:c.longitude,
    ele:Number.isFinite(c.altitude)?c.altitude:null,
    time:Number.isFinite(pos.timestamp)?pos.timestamp:Date.now(),
    acc:Number.isFinite(c.accuracy)?c.accuracy:null
  };
  if(!acceptFix(lastPoint, fix)) return;
  const pt={id:'p'+fix.time.toString(36)+Math.random().toString(16).slice(2), trackId:activeTrackId, lat:fix.lat, lon:fix.lon, ele:fix.ele, time:fix.time, acc:fix.acc};
  await putPoint(pt);
  if(!activeTrackId||pt.trackId!==activeTrackId) return;
  if(lastPoint) liveDistance+=haversine(lastPoint, fix);
  lastPoint=fix;
  liveCount++;
  paintLive();
}
async function acquireWakeLock(){
  if(!navigator.wakeLock||!activeTrackId) return;
  try{wakeLock=await navigator.wakeLock.request('screen');}
  catch(e){wakeLock=null;}
}
async function releaseWake(){
  if(!wakeLock) return;
  try{await wakeLock.release();}catch(e){}
  wakeLock=null;
}
function onVisible(){
  if(document.visibilityState==='hidden'||!activeTrackId) return;
  startWatch();
  void acquireWakeLock();
}
function beginLive(track, pts){
  const sorted=(pts||[]).slice().sort((a,b)=>a.time-b.time);
  activeTrackId=track.id;
  liveStarted=track.started;
  lastPoint=sorted[sorted.length-1]||null;
  liveCount=sorted.length;
  liveDistance=pathDistance(sorted);
  ready=Promise.resolve();
  setTrackMsg('');
  startWatch();
  void acquireWakeLock();
  paintLive();
}
async function startTrack(){
  unlockAudio();
  void armMic().catch(()=>setCapMsg('尚未取得麥克風。拍照後若沒有開始錄音，請按「開始錄音」。'));
  if(activeTrackId) return;
  if(openTrackId) return resumeTrack(openTrackId);
  if(!navigator.geolocation){setTrackMsg('這台裝置沒有提供定位。');return;}
  const track={id:'t'+Date.now(), folderId:localStorage.activeFolder||DEFAULT_FOLDER, started:Date.now(), stopped:null, recording:true};
  track.name=trackGpxName(track);
  beginLive(track, []);
  await putTrack(track);
  if(activeTrackId!==track.id){await delTrack(track.id);return;}
  await render();
}
async function resumeTrack(id){
  unlockAudio();
  void armMic().catch(()=>{});
  if(activeTrackId) return;
  if(!navigator.geolocation){setTrackMsg('這台裝置沒有提供定位。');return;}
  activeTrackId=id;
  liveStarted=Date.now();
  liveCount=0;
  liveDistance=0;
  lastPoint=null;
  ready=Promise.all([getTrack(id), pointsIn(id)]).then(async ([track, pts])=>{
    if(!track||activeTrackId!==id) return;
    const sorted=pts.slice().sort((a,b)=>a.time-b.time);
    liveStarted=track.started;
    lastPoint=sorted[sorted.length-1]||null;
    liveCount=sorted.length;
    liveDistance=pathDistance(sorted);
    track.recording=true;
    track.stopped=null;
    await putTrack(track);
    paintLive();
  });
  setTrackMsg('');
  startWatch();
  void acquireWakeLock();
  paintLive();
  await ready;
  await render();
}
async function finishTrack(id){
  const trackId=id||activeTrackId;
  if(!trackId) return;
  if(activeTrackId===trackId){
    stopWatch();
    activeTrackId=null;
    await releaseWake();
  }
  await pointChain;
  const t=await getTrack(trackId);
  if(t){
    t.recording=false;
    t.stopped=t.stopped||Date.now();
    await putTrack(t);
  }
  lastPoint=null;
  if(!rec) releaseMic();
  await render();
}
async function onGeoError(err){
  if(!err||err.code!==1) return;
  const id=activeTrackId;
  stopWatch();
  activeTrackId=null;
  await releaseWake();
  await pointChain;
  const pts=id?await pointsIn(id):[];
  if(id&&!pts.length) await delTrack(id);
  else if(id){
    const t=await getTrack(id);
    if(t){t.recording=false;t.stopped=Date.now();await putTrack(t);}
  }
  setTrackMsg('定位被拒絕。請允許這個網站使用定位後，再按開始記錄軌跡。');
  if(!rec) releaseMic();
  await render();
}
async function exportTrack(id){
  const t=await getTrack(id);
  if(!t) return;
  const pts=await pointsIn(id);
  const name=t.name||trackGpxName(t);
  await share(new Blob([gpxText(t, pts)],{type:'application/gpx+xml'}), name);
}
async function paintTrackPanel(){
  const active=await activeFolder();
  const all=await allTracks();
  const open=all.find(t=>t.recording&&!t.stopped&&t.id!==activeTrackId);
  openTrackId=open?open.id:null;
  const start=$('#startTrack'), stop=$('#stopTrack'), resume=$('#trackresume');
  if(start) start.hidden=!!activeTrackId||!!open;
  if(stop) stop.hidden=!activeTrackId;
  if(resume){
    resume.replaceChildren();
    if(open){
      resume.hidden=false;
      const n=await pointsIn(open.id);
      resume.append(el('div','', `有一段軌跡在重新載入前還沒停止（${n.length} 點）。要繼續記錄嗎？`));
      resume.append(button('resume','繼續記錄',()=>resumeTrack(open.id).catch(err=>setTrackMsg(err.message))));
      resume.append(button('sec endtrack','結束這段軌跡',()=>finishTrack(open.id).catch(err=>setTrackMsg(err.message))));
    }else resume.hidden=true;
  }
  paintLive();
  const list=$('#tracklist');
  if(!list) return;
  list.replaceChildren();
  const mine=all.filter(t=>active&&t.folderId===active.id).sort((a,b)=>b.started-a.started);
  if(!mine.length){list.append(el('p','hint','這個資料夾還沒有軌跡。'));return;}
  for(const t of mine){
    const pts=(await pointsIn(t.id)).sort((a,b)=>a.time-b.time);
    const row=el('div','track-row');
    row.dataset.track=t.id;
    const end=t.stopped||(t.id===activeTrackId?Date.now():(pts.length?pts[pts.length-1].time:t.started));
    const label=`${fmt(t.started)}　${fmtDur(end-t.started)}　${fmtDist(pathDistance(pts))}`+(t.recording&&!t.stopped?'　錄製中':'');
    row.append(el('span','', label));
    row.append(button('sec gpxout','匯出 GPX',()=>exportTrack(t.id).catch(err=>alert(err.message))));
    list.append(row);
  }
}

async function render(){
  const folders=(await allFolders()).sort((a,b)=>(a.created||0)-(b.created||0));
  const active=await activeFolder();
  const gpxAll=await allGpx();
  $('#activeName').textContent=active?active.name:'未分類';
  const box=$('#folders');
  box.replaceChildren();
  for(const f of folders){
    const row=el('div','folder-row');
    row.dataset.folder=f.id;
    row.append(el('div','fname',(active&&f.id===active.id?'● ':'')+f.name));
    const tracks=gpxAll.filter(g=>g.folderId===f.id);
    if(tracks.length) row.append(el('small','gpxnames','GPX：'+tracks.map(g=>g.name).join('、')));
    if(!active||f.id!==active.id) row.append(button('sec use','使用',()=>useFolder(f.id)));
    else row.append(el('small','', '使用中'));
    row.append(button('sec rename','重新命名',()=>{
      const name=prompt('新的資料夾名稱',f.name);
      if(name&&name.trim()) renameFolder(f.id,name.trim());
    }));
    row.append(button('sec txtf','匯出 .txt',()=>exportFolderTxt(f).catch(err=>alert(err.message))));
    row.append(button('sec zipf','匯出 .zip',()=>exportFolderZip(f).catch(err=>alert(err.message))));
    const gpxInput=document.createElement('input');
    gpxInput.type='file';
    gpxInput.className='gpx';
    gpxInput.accept='.gpx,application/gpx+xml';
    gpxInput.multiple=true;
    gpxInput.hidden=true;
    gpxInput.onchange=async ev=>{
      const list=[...(ev.target.files||[])];
      ev.target.value='';
      for(const file of list) await addGpxFile(f.id, file);
      await render();
    };
    row.append(gpxInput);
    row.append(button('sec gpxb','加入 GPX',()=>gpxInput.click()));
    row.append(button('drive','☁️ 送到記錄高高手',()=>onUpload(f.id)));
    box.append(row);
  }
  await paintTrackPanel();
  paintDock();
  const notes=active?(await notesIn(active.id)).sort((a,b)=>b.ts-a.ts):[];
  const L=$('#list');
  L.replaceChildren();
    if(!notes.length){L.append(el('p','empty','此資料夾還沒有筆記。'));paintDock();return;}
  for(const e of notes){
    const c=el('div','card');
    c.dataset.id=String(e.id);
    if(e.kind==='voice') c.append(el('div','kind','🎙 語音筆記'));
    else if(e.photo){const img=document.createElement('img');img.alt='照片';img.src=URL.createObjectURL(e.photo);c.append(img);}
    c.append(el('div','', '🕒 '+fmt(e.ts)));
    const loc=el('div');
    if(e.loc?.pending) loc.textContent='📍 定位中…';
    else if(e.loc?.lat!=null){
      const acc=Number.isFinite(Number(e.loc.acc))?'（±'+Math.round(e.loc.acc)+' 公尺）':'';
      loc.append('📍 '+e.loc.lat.toFixed(6)+', '+e.loc.lng.toFixed(6)+acc+' ');
      const a=document.createElement('a');a.href=mapl(e.loc);a.target='_blank';a.rel='noopener';a.textContent='地圖';loc.append(a);
    }else loc.textContent='📍 無法取得位置'+(e.loc?.error?'（'+e.loc.error+'）':'');
    c.append(loc);
    const au=el('div','au');
    if(e.audio){
      const a=document.createElement('audio');a.controls=true;a.src=URL.createObjectURL(e.audio);au.append(a);
      au.append(el('small','', '錄音保留中（轉成文字成功後會刪除）'));
    }
    c.append(au);
    if(e.audio) c.append(button('r','🎙 重新錄音',()=>record(e)));
    if(recNoteId===e.id) c.append(el('div','rec-ind','錄音中'));
    const tb=button('t','📝 轉成文字',()=>doTranscribe(e.id));
    if(!e.audio) tb.hidden=true;
    c.append(tb);
    const ta=document.createElement('textarea');
    ta.placeholder=e.kind==='voice'?'語音筆記（可編輯）':'說明，當作這張照片的圖說（可編輯）';
    ta.value=e.transcript||'';
    ta.onchange=()=>updateNote(e.id,cur=>{cur.transcript=ta.value;});
    c.append(ta);
    c.append(el('small','s',transcribing.has(e.id)?'辨識中…（手機上可能需要數十秒）':''));
    c.append(document.createElement('br'));
    c.append(button('sec x','匯出 .txt',()=>share(new Blob([txt(e)],{type:'text/plain'}),`筆記_${fname(e.ts)}.txt`)));
    c.append(button('sec z','匯出 .zip',async()=>{
      const folder=(await allFolders()).find(f=>f.id===e.folderId)||{id:e.folderId,name:'未分類'};
      share(await buildFolderZip(folder,[e]),zipFileName(folder,e.ts));
    }));
    c.append(button('sec g','重新定位',async()=>{
      await updateNote(e.id,cur=>{cur.loc={pending:true};});
      await render();
      const locv=await geo();
      await updateNote(e.id,cur=>{cur.loc=locv;});
      await render();
    }));
    c.append(button('sec d','刪除',async()=>{if(confirm('確定刪除這筆紀錄？')){await delNote(e.id);await render();}}));
    L.append(c);
  }
  paintDock();
}

window.pvn={allNotes,allFolders,allOutbox,allTracks,pointsIn,migrate,activeFolder,createFolder,buildFolderZip,folderTxt,uploadFolder,attachRecording,doTranscribe,notesIn,delNote,putNote,zipFileName,zipBaseName,fname,planFiles,getMeta,addGpxFile,gpxIn,startTrack,resumeTrack,finishTrack,acceptFix,gpxText,trackGpxName,haversine,pathDistance,onVisible,compressPhoto,readExifOrientation,releaseMic,freshTrackFix,askNoteLoc,flushFixes:()=>pointChain};

async function saveClient(){
  const v=$('#clientId').value.trim();
  if(v) localStorage.gdriveClientId=v;
  else localStorage.removeItem('gdriveClientId');
  sessionStorage.removeItem('driveToken');
  localStorage.removeItem('driveInboxId');
  await delMeta('driveInbox');
  setUpStatus(v?'已儲存 Client ID':'已清除 Client ID');
}

(async function init(){
  await migrate();
  const name=$('#folderName');
  if(name&&!name.value) name.value=todayTW();
  const preset=localStorage.gdriveClientId||(window.APP_CONFIG&&window.APP_CONFIG.GOOGLE_CLIENT_ID)||'';
  if($('#clientId')) $('#clientId').value=preset;
  $('#createFolder').onclick=async()=>{try{await createFolder($('#folderName').value);}catch(err){alert(err.message);}};
  $('#saveClient').onclick=saveClient;
  if($('#startTrack')) $('#startTrack').onclick=()=>startTrack().catch(err=>setTrackMsg(err.message));
  if($('#stopTrack')) $('#stopTrack').onclick=()=>finishTrack().catch(err=>setTrackMsg(err.message));
  if($('#sendDay')) $('#sendDay').onclick=()=>onUpload(localStorage.activeFolder||DEFAULT_FOLDER);
  if($('#shoot')) $('#shoot').addEventListener('pointerdown',()=>{unlockAudio();void armMic().catch(()=>{});});
  if($('#vnote')){
    $('#vnote').addEventListener('pointerdown',()=>{unlockAudio();void armMic().catch(()=>{});});
    $('#vnote').onclick=()=>{
      unlockAudio();
      void armMic().catch(()=>{});
      const locP=askNoteLoc();
      startVoiceNote(locP).catch(err=>setCapMsg(err.message||'無法開始錄音'));
    };
  }
  if($('#speak')){
    $('#speak').addEventListener('pointerdown',()=>{unlockAudio();void armMic().catch(()=>{});});
    $('#speak').onclick=async()=>{
      if(!voiceNoteId) return;
      unlockAudio();
      const id=voiceNoteId;
      const ok=await startVoice(id);
      if(ok){voiceNoteId=null;setCapMsg('');}
      else setCapMsg('仍無法錄音。請允許麥克風後再按一次。');
      paintDock();
    };
  }
  if($('#halt')) $('#halt').onclick=()=>{unlockAudio();if(rec&&rec.state==='recording'){try{rec.requestData();}catch(e){} rec.stop();}};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') onVisible();});
  window.addEventListener('pageshow',()=>onVisible());
  setInterval(()=>{if(activeTrackId) paintLive();},1000);
  window.addEventListener('online',()=>{flushOutbox();});
  await render();
  if(navigator.onLine) flushOutbox();
})();
