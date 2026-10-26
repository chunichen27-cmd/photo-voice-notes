const $=s=>document.querySelector(s);
const toTW=OpenCC.Converter({from:'cn',to:'tw'});
const DEFAULT_FOLDER='uncat';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const INBOX_NAME='記錄高高手收件匣';
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if(navigator.storage&&navigator.storage.persist) navigator.storage.persist();

const dbp=new Promise((ok,no)=>{
  const r=indexedDB.open('notes',2);
  r.onupgradeneeded=()=>{
    const db=r.result;
    if(!db.objectStoreNames.contains('e')) db.createObjectStore('e',{keyPath:'id'});
    if(!db.objectStoreNames.contains('folders')) db.createObjectStore('folders',{keyPath:'id'});
    if(!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox',{keyPath:'id'});
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

const fmt=ts=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(ts));
const fname=ts=>new Date(ts+8*3600e3).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','_');
function todayTW(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function safeName(name){return String(name||'').replace(/[\\/:*?"<>|]/g,'_').trim()||'資料夾';}
function zipFileName(folder,ts){return `${safeName(folder.name)}_${fname(ts)}.zip`;}

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
$('#cam').onchange=async ev=>{
  const f=ev.target.files&&ev.target.files[0];
  ev.target.value='';
  if(!f) return;
  const ts=Date.now();
  const folder=await activeFolder();
  await putNote({id:ts,ts,photo:f,loc:{pending:true},transcript:'',folderId:folder.id});
  await render();
  const loc=await geo();
  await updateNote(ts,cur=>{cur.loc=loc;});
  await render();
};

const mapl=l=>l&&l.lat!=null?`https://www.google.com/maps?q=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`:'';
function txt(e){return [`時間：${fmt(e.ts)}（台北時間）`,e.loc&&e.loc.lat!=null?`位置：${e.loc.lat.toFixed(6)}, ${e.loc.lng.toFixed(6)}（精確度 ±${Math.round(e.loc.acc)} 公尺）\n地圖：${mapl(e.loc)}`:'位置：無法取得',`逐字稿：\n${e.transcript||'（無）'}`].join('\n');}
function folderTxt(folder,notes){
  const body=notes.slice().sort((a,b)=>a.ts-b.ts).map(txt).join('\n\n----------\n\n');
  return `資料夾：${folder.name}\n\n${body}`;
}
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function share(blob,name){const file=new File([blob],name,{type:blob.type||'application/octet-stream'});if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file]});return;}catch(x){if(x.name==='AbortError')return;}}save(blob,name);}
function ext(b){
  const part=((b&&b.type)||'').split('/')[1]||'bin';
  return part.split(';')[0].replace('jpeg','jpg').replace('x-m4a','m4a')||'bin';
}
async function buildFolderZip(folder,notes){
  const z=new JSZip();
  const sorted=notes.slice().sort((a,b)=>a.ts-b.ts);
  z.file('筆記.txt',folderTxt(folder,sorted));
  const used=new Set();
  for(const e of sorted){
    if(e.photo){
      let n=`${fname(e.ts)}_照片.jpg`;
      if(used.has(n)) n=`${fname(e.ts)}_${e.id}_照片.jpg`;
      used.add(n);
      z.file(n,e.photo);
    }
    if(e.audio) z.file(`${fname(e.ts)}_錄音.${ext(e.audio)}`,e.audio);
  }
  return z.generateAsync({type:'blob'});
}
async function notesIn(folderId){return (await allNotes()).filter(n=>n.folderId===folderId);}
async function exportFolderTxt(folder){
  const notes=await notesIn(folder.id);
  await share(new Blob([folderTxt(folder,notes)],{type:'text/plain'}),`${safeName(folder.name)}_${fname(Date.now())}.txt`);
}
async function exportFolderZip(folder){
  const notes=await notesIn(folder.id);
  await share(await buildFolderZip(folder,notes),zipFileName(folder,Date.now()));
}

async function migrate(){
  const folders=await allFolders();
  if(!folders.some(f=>f.id===DEFAULT_FOLDER)) await putFolder({id:DEFAULT_FOLDER,name:'未分類',created:0});
  for(const e of await allNotes()){
    if(!e.folderId){e.folderId=DEFAULT_FOLDER;await putNote(e);}
  }
  const ids=new Set((await allFolders()).map(f=>f.id));
  if(!localStorage.activeFolder||!ids.has(localStorage.activeFolder)) localStorage.activeFolder=DEFAULT_FOLDER;
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

let recStream=null;
async function record(e,button){
  if(rec){rec.stop();return;}
  if(recNoteId===e.id){recNoteId=null;await render();return;}
  if(transcribing.has(e.id)){alert('正在轉成文字，請稍候');return;}
  recNoteId=e.id;
  if(button) button.textContent='⏹ 停止錄音';
  let st;
  try{st=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch(x){recNoteId=null;alert('無法使用麥克風：'+x.message);await render();return;}
  if(recNoteId!==e.id){st.getTracks().forEach(t=>t.stop());return;}
  recStream=st;
  const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'';
  rec=new MediaRecorder(st,type?{mimeType:type}:{});const ch=[];
  rec.ondataavailable=d=>{if(d.data&&d.data.size)ch.push(d.data);};
  const noteId=e.id;
  rec.onstop=async()=>{st.getTracks().forEach(t=>t.stop());rec=null;recNoteId=null;recStream=null;const blob=new Blob(ch,{type:ch[0]?.type||type||'audio/mp4'});await attachRecording(noteId,blob);};
  rec.start(1000);
  await render();
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
async function inboxId(token){
  const auth={Authorization:'Bearer '+token};
  const saved=localStorage.driveInboxId;
  if(saved){
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(saved)+'?fields=id,name,trashed',{headers:auth});
    if(r.ok){const j=await r.json();if(j&&j.id&&!j.trashed) return j.id;}
    else if(r.status===401){sessionStorage.removeItem('driveToken');throw new Error('授權已失效，請再點一次');}
  }
  const q="mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '"+INBOX_NAME+"'";
  const listUrl='https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name)',spaces:'drive',pageSize:'10'});
  const list=await driveJson(listUrl,{headers:auth});
  if(list.files&&list.files[0]){localStorage.driveInboxId=list.files[0].id;return list.files[0].id;}
  const created=await driveJson('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({name:INBOX_NAME,mimeType:'application/vnd.google-apps.folder'})});
  localStorage.driveInboxId=created.id;
  return created.id;
}
async function sendZip(token,name,blob){
  const parent=await inboxId(token);
  const boundary='pvn'+Math.random().toString(16).slice(2);
  const meta=JSON.stringify({name,parents:[parent]});
  const body=new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ]);
  return driveJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},
    body
  });
}
async function uploadFolder(folderId){
  if(!clientIdValue()){
    const msg='請先貼上 Google OAuth Client ID 並按儲存';
    setUpStatus(msg);
    throw new Error(msg);
  }
  const folder=(await allFolders()).find(f=>f.id===folderId);
  if(!folder) throw new Error('找不到資料夾');
  const name=zipFileName(folder,Date.now());
  const zipBlob=await buildFolderZip(folder,await notesIn(folder.id));
  if(!navigator.onLine){
    await putOutbox({id:'q'+Date.now()+Math.random().toString(16).slice(2),folderId:folder.id,name,zip:zipBlob,created:Date.now()});
    setUpStatus('目前沒有網路，已排入待上傳。連線後會自動再試；若需要重新授權，請再點一次。');
    return {queued:true,name};
  }
  setUpStatus('上傳中…');
  const token=await ensureToken(true);
  await sendZip(token,name,zipBlob);
  setUpStatus('已送到「'+INBOX_NAME+'」：'+name);
  return {ok:true,name};
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
      await sendZip(token,item.name,item.zip);
      await delOutbox(item.id);
      setUpStatus('已送到「'+INBOX_NAME+'」：'+item.name);
    }catch(err){
      setUpStatus('上傳失敗：'+err.message);
      return;
    }
  }
}

async function render(){
  const folders=(await allFolders()).sort((a,b)=>(a.created||0)-(b.created||0));
  const active=await activeFolder();
  $('#activeName').textContent=active?active.name:'未分類';
  const box=$('#folders');
  box.replaceChildren();
  for(const f of folders){
    const row=el('div','folder-row');
    row.dataset.folder=f.id;
    row.append(el('div','fname',(active&&f.id===active.id?'● ':'')+f.name));
    if(!active||f.id!==active.id) row.append(button('sec use','使用',()=>useFolder(f.id)));
    else row.append(el('small','', '使用中'));
    row.append(button('sec rename','重新命名',()=>{
      const name=prompt('新的資料夾名稱',f.name);
      if(name&&name.trim()) renameFolder(f.id,name.trim());
    }));
    row.append(button('sec txtf','匯出 .txt',()=>exportFolderTxt(f).catch(err=>alert(err.message))));
    row.append(button('sec zipf','匯出 .zip',()=>exportFolderZip(f).catch(err=>alert(err.message))));
    row.append(button('drive','☁️ 送到記錄高高手',()=>onUpload(f.id)));
    box.append(row);
  }
  const notes=active?(await notesIn(active.id)).sort((a,b)=>b.ts-a.ts):[];
  const L=$('#list');
  L.replaceChildren();
  if(!notes.length){L.append(el('p','empty','此資料夾還沒有筆記。'));return;}
  for(const e of notes){
    const c=el('div','card');
    c.dataset.id=String(e.id);
    if(e.photo){const img=document.createElement('img');img.alt='照片';img.src=URL.createObjectURL(e.photo);c.append(img);}
    c.append(el('div','', '🕒 '+fmt(e.ts)));
    const loc=el('div');
    if(e.loc?.pending) loc.textContent='📍 定位中…';
    else if(e.loc?.lat!=null){
      loc.append('📍 '+e.loc.lat.toFixed(6)+', '+e.loc.lng.toFixed(6)+'（±'+Math.round(e.loc.acc)+' 公尺） ');
      const a=document.createElement('a');a.href=mapl(e.loc);a.target='_blank';a.rel='noopener';a.textContent='地圖';loc.append(a);
    }else loc.textContent='📍 無法取得位置'+(e.loc?.error?'（'+e.loc.error+'）':'');
    c.append(loc);
    const au=el('div','au');
    if(e.audio){
      const a=document.createElement('audio');a.controls=true;a.src=URL.createObjectURL(e.audio);au.append(a);
      au.append(el('small','', '錄音保留中（轉成文字成功後會刪除）'));
    }
    c.append(au);
    const rb=button('r',e.audio?'🎙 重新錄音':'🎙 錄音',ev=>record(e,ev.target));
    if(recNoteId===e.id) rb.textContent='⏹ 停止錄音';
    c.append(rb);
    const tb=button('t','📝 轉成文字',()=>doTranscribe(e.id));
    if(!e.audio) tb.hidden=true;
    c.append(tb);
    const ta=document.createElement('textarea');
    ta.placeholder='逐字稿（可編輯）';
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
}

window.pvn={allNotes,allFolders,allOutbox,migrate,activeFolder,createFolder,buildFolderZip,folderTxt,uploadFolder,attachRecording,doTranscribe,notesIn,delNote,putNote,zipFileName,fname};

function saveClient(){
  const v=$('#clientId').value.trim();
  if(v) localStorage.gdriveClientId=v;
  else localStorage.removeItem('gdriveClientId');
  sessionStorage.removeItem('driveToken');
  localStorage.removeItem('driveInboxId');
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
  window.addEventListener('online',()=>{flushOutbox();});
  await render();
  if(navigator.onLine) flushOutbox();
})();
