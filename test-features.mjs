import {readFile} from 'fs/promises';
import {chromium} from 'playwright-core';

const base = process.env.BASE_URL || 'http://localhost:8765/';
const fail = msg => { throw new Error(msg); };
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx = await b.newContext({
  acceptDownloads: true,
  permissions: ['geolocation'],
  geolocation: {latitude: 25.0478, longitude: 121.517, accuracy: 10}
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
p.setDefaultTimeout(30000);

const uploads = [];
const apiPosts = [];
const takenNames = new Set();
await p.route('https://www.googleapis.com/**', async route => {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const auth = req.headers()['authorization'] || '';
  if (!auth.includes('test-token')) fail('missing bearer on ' + method + ' ' + url);
  if (method !== 'GET' && method !== 'POST') fail('must not ' + method + ' ' + url);
  if (url.includes('/upload/drive/')) {
    const buf = req.postDataBuffer();
    uploads.push(buf);
    const sent = (buf.toString('utf8').match(/"name":"([^"]+\.zip)"/) || [])[1];
    if (sent) takenNames.add(sent);
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: 'file' + uploads.length, name: sent || 'ok.zip'})});
    return;
  }
  if (method === 'POST') {
    apiPosts.push(req.postData() || '');
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: 'inbox1', name: '記錄高高手收件匣'})});
    return;
  }
  if (method === 'GET' && url.includes('/drive/v3/files?')) {
    const q = decodeURIComponent(url.replace(/\+/g, ' '));
    const wanted = (q.match(/name = '((?:\\'|[^'])*)'/) || [])[1];
    if (q.includes('in parents') && wanted && takenNames.has(wanted.replace(/\\'/g, "'"))) {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({files: [{id: 'oldzip', name: wanted}]})});
      return;
    }
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({files: []})});
    return;
  }
  if (method === 'GET' && url.includes('/drive/v3/files/inbox1')) {
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: 'inbox1', name: '記錄高高手收件匣', trashed: false, mimeType: 'application/vnd.google-apps.folder'})});
    return;
  }
  await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: {message: 'unexpected ' + method + ' ' + url}})});
});

await p.goto(base);
await p.waitForFunction(() => document.querySelector('#activeName')?.textContent === '未分類');
const paths = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const shellKeys = (await caches.keys()).filter(k => k.startsWith('shell-'));
  const cache = await caches.open(shellKeys[0]);
  const urls = (await cache.keys()).map(r => new URL(r.url).pathname);
  return {scope: reg.scope, shells: shellKeys, urls};
});
console.log('sw', JSON.stringify(paths));
const expectedScope = new URL('./', base).href;
if (paths.scope !== expectedScope) fail('scope ' + paths.scope);
if (paths.shells.join() !== 'shell-v5') fail('cache ' + paths.shells.join());
if (!paths.urls.some(u => u.endsWith('/config.js'))) fail('config.js not precached');

const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
if (await p.inputValue('#folderName') !== today) fail('default folder name ' + await p.inputValue('#folderName'));

const migrated = await p.evaluate(async () => {
  const audio = () => new Blob(['keep-me'], {type: 'audio/webm'});
  const photo = new Blob(['pic'], {type: 'image/jpeg'});
  await pvn.putNote({id: 1, ts: 1, photo, transcript: '已經寫好的逐字稿', audio: audio(), loc: null});
  await pvn.putNote({id: 2, ts: 2, photo, transcript: '', audio: audio(), loc: null});
  await pvn.putNote({id: 3, ts: 3, photo, transcript: '   ', audio: audio(), loc: null});
  await pvn.migrate();
  const notes = await pvn.allNotes();
  return notes.filter(n => n.id <= 3).map(n => ({id: n.id, folderId: n.folderId, hasAudio: !!n.audio && n.audio.size > 0, transcript: n.transcript}));
});
console.log('migrated', JSON.stringify(migrated));
for (const n of migrated) {
  if (n.folderId !== 'uncat') fail('legacy note folder ' + n.id);
  if (!n.hasAudio) fail('migration deleted audio on note ' + n.id);
}
await p.evaluate(async () => { await pvn.delNote(1); await pvn.delNote(2); await pvn.delNote(3); await render(); });

await p.fill('#folderName', '2026-10-26 新店山路');
await p.click('#createFolder');
await p.waitForFunction(() => document.querySelector('#activeName').textContent === '2026-10-26 新店山路');
const folderId = await p.evaluate(async () => (await pvn.activeFolder()).id);

await p.setInputFiles('#cam', 'docs/icon-192.png');
await p.setInputFiles('#cam', 'docs/icon-512.png');
await p.waitForFunction(() => {
  const cards = [...document.querySelectorAll('#list .card')];
  return cards.length === 2 && cards.every(c => c.innerText.includes('25.047800'));
});
await p.click('[data-folder="uncat"] button.use');
await p.waitForFunction(() => document.querySelector('#activeName').textContent === '未分類' && document.querySelector('#list .empty'));
await p.click(`[data-folder="${folderId}"] button.use`);
await p.waitForFunction(() => document.querySelectorAll('#list .card').length === 2);

p.once('dialog', d => d.accept('新店溪散步'));
await p.click(`[data-folder="${folderId}"] button.rename`);
await p.waitForFunction(() => document.querySelector('#activeName').textContent === '新店溪散步');

const packed = await p.evaluate(async () => {
  const folder = await pvn.activeFolder();
  const notes = await pvn.notesIn(folder.id);
  const blob = await pvn.buildFolderZip(folder, notes);
  const z = await JSZip.loadAsync(blob);
  const names = Object.keys(z.files);
  const body = await z.file('筆記.txt').async('string');
  const one = window.txt(notes.slice().sort((a, b) => a.ts - b.ts)[0]);
  return {names, txt: body, one, folder: folder.name};
});
console.log('zip names', packed.names.join(', '));
if (!packed.txt.startsWith('資料夾：新店溪散步\n\n')) fail('zip header:\n' + packed.txt.slice(0, 80));
if (!packed.txt.includes('\n\n----------\n\n')) fail('missing separator');
for (const label of ['時間：', '（台北時間）', '位置：', '25.047800, 121.517000', '地圖：https://www.google.com/maps?q=25.047800,121.517000', '逐字稿：']) {
  if (!packed.txt.includes(label)) fail('txt missing ' + label);
}
if (packed.one.startsWith('資料夾：')) fail('single note txt should keep the old format');
if (!/時間：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（台北時間）/.test(packed.txt)) fail('time format:\n' + packed.txt.slice(0, 200));
const photos = packed.names.filter(n => n.endsWith('_照片.jpg'));
if (photos.length !== 2 || photos.some(n => !/^\d{8}_\d{6}(_\d+)?_照片\.jpg$/.test(n))) fail('photo names ' + photos.join(','));
const photoLines = [...packed.txt.matchAll(/照片：(\S+)/g)].map(m => m[1]);
if (photoLines.length !== photos.length || photoLines.some(n => !packed.names.includes(n))) fail('photo lines ' + photoLines.join(','));
for (const line of photoLines) {
  const m = line.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m || !packed.txt.includes(`時間：${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}（台北時間）`)) fail('time does not match ' + line);
}
if (packed.names.some(n => n.includes('錄音'))) fail('zip had audio before recording');
const shaped = await p.evaluate(() => {
  const ts = Date.parse('2026-10-26T04:37:05Z');
  const note = {id: 99, ts, photo: new Blob(['a'], {type: 'image/jpeg'}), transcript: '山路', loc: null};
  const plan = pvn.planFiles([note]);
  const text = window.txt(note, plan[0].photos.map(x => x.name));
  const two = {id: 100, ts, photos: [new Blob(['b']), new Blob(['c'])], transcript: '', loc: null};
  const plan2 = pvn.planFiles([two]);
  const text2 = window.txt(two, plan2[0].photos.map(x => x.name));
  return {
    text,
    names: plan[0].photos.map(x => x.name),
    text2,
    names2: plan2[0].photos.map(x => x.name),
    base: pvn.zipBaseName({name: '打鐵寮古道'}, [{ts: Date.parse('2026-10-26T01:00:00Z')}]),
    embedded: pvn.zipBaseName({name: '2026-10-26 新店山路'}, []),
    dirty: pvn.zipBaseName({name: 'a/b:c*?'}, [{ts}]),
    bare: window.txt({id: 1, ts, transcript: '', loc: null})
  };
});
if (!shaped.text.includes('時間：2026-10-26 12:37:05（台北時間）')) fail(shaped.text);
if (shaped.bare.includes('照片：')) fail('photo line without a photo');
if (!shaped.text.includes('照片：20261026_123705_照片.jpg') || shaped.names[0] !== '20261026_123705_照片.jpg') fail(shaped.names.join(','));
const lines2 = [...shaped.text2.matchAll(/照片：(\S+)/g)].map(m => m[1]);
if (shaped.names2.length !== 2 || new Set(shaped.names2).size !== 2 || lines2.join() !== shaped.names2.join()) fail('multi photo ' + lines2.join(','));
if (shaped.base !== '20261026_打鐵寮古道.zip') fail('base name ' + shaped.base);
if (shaped.embedded !== '20261026_2026-10-26 新店山路.zip') fail('embedded date ' + shaped.embedded);
if (shaped.dirty !== '20261026_a_b_c__.zip') fail('sanitize ' + shaped.dirty);

await p.evaluate(() => {
  try { Object.defineProperty(Navigator.prototype, 'canShare', {configurable: true, value: () => false}); } catch (e) {}
});
const [download] = await Promise.all([
  p.waitForEvent('download'),
  p.click(`[data-folder="${folderId}"] button.txtf`)
]);
const downloaded = await readFile(await download.path(), 'utf8');
if (!download.suggestedFilename().includes('新店溪散步') || !download.suggestedFilename().endsWith('.txt')) fail('download name ' + download.suggestedFilename());
if (downloaded !== packed.txt) fail('downloaded txt differs');
console.log('txt download', download.suggestedFilename());

await p.setInputFiles(`[data-folder="${folderId}"] input.gpx`, {
  name: '打鐵寮.gpx',
  mimeType: 'application/gpx+xml',
  buffer: Buffer.from('<gpx>hi</gpx>')
});
await p.waitForFunction(id => document.querySelector(`[data-folder="${id}"]`)?.innerText.includes('打鐵寮.gpx'), folderId);
const gpxPacked = await p.evaluate(async () => {
  const folder = await pvn.activeFolder();
  const z = await JSZip.loadAsync(await pvn.buildFolderZip(folder, await pvn.notesIn(folder.id)));
  const file = z.file('打鐵寮.gpx');
  return {has: !!file, text: file ? await file.async('string') : '', names: Object.keys(z.files)};
});
console.log('gpx', gpxPacked.names.join(', '));
if (!gpxPacked.has || gpxPacked.text !== '<gpx>hi</gpx>') fail('gpx missing ' + gpxPacked.text);

const ids = await p.evaluate(async () => (await pvn.notesIn((await pvn.activeFolder()).id)).sort((a, b) => a.ts - b.ts).map(n => n.id));
const kept = await p.evaluate(async id => {
  await pvn.attachRecording(id, new Blob(['raw'], {type: 'audio/webm'}));
  const n = (await pvn.allNotes()).find(x => x.id === id);
  const btn = document.querySelector(`[data-id="${id}"] button.t`);
  return {hasAudio: !!n.audio, transcript: n.transcript, buttonHidden: !btn || btn.hidden, hint: document.querySelector(`[data-id="${id}"]`).innerText.includes('錄音保留中')};
}, ids[0]);
console.log('kept before model', kept);
if (!kept.hasAudio || kept.transcript || kept.buttonHidden || !kept.hint) fail('untranscribed audio was not kept');

const failed = await p.evaluate(async id => {
  localStorage.modelReady = '1';
  window.__transcribeStub = async () => ({type: 'error', msg: '麥克風太吵'});
  const r = await pvn.doTranscribe(id);
  const n = (await pvn.allNotes()).find(x => x.id === id);
  return {r, hasAudio: !!n.audio, status: document.querySelector(`[data-id="${id}"] .s`).textContent};
}, ids[0]);
console.log('transcribe fail', JSON.stringify(failed));
if (failed.r.ok || !failed.hasAudio || !failed.status.includes('已保留錄音')) fail('failed transcription removed audio');

const ok = await p.evaluate(async id => {
  window.__transcribeStub = async () => ({type: 'result', text: '你好，這是測試'});
  const r = await pvn.doTranscribe(id);
  const n = (await pvn.allNotes()).find(x => x.id === id);
  const folder = await pvn.activeFolder();
  const z = await JSZip.loadAsync(await pvn.buildFolderZip(folder, await pvn.notesIn(folder.id)));
  return {r, hasAudio: !!n.audio, transcript: n.transcript, names: Object.keys(z.files), status: document.querySelector(`[data-id="${id}"] .s`).textContent};
}, ids[0]);
console.log('transcribe ok', ok.transcript, ok.status, ok.names.join(','));
if (!ok.r.ok || ok.hasAudio || !ok.transcript.includes('你好') || ok.names.some(n => n.includes('錄音')) || !ok.status.includes('已刪除錄音')) fail('successful transcription did not drop audio');

const auto = await p.evaluate(async id => {
  window.__transcribeStub = async () => ({type: 'result', text: '自動轉好的句子'});
  await pvn.attachRecording(id, new Blob(['more'], {type: 'audio/webm'}));
  const n = (await pvn.allNotes()).find(x => x.id === id);
  return {hasAudio: !!n.audio, transcript: n.transcript, status: document.querySelector(`[data-id="${id}"] .s`).textContent};
}, ids[1]);
console.log('auto', auto.transcript, auto.status);
if (auto.hasAudio || !auto.transcript.includes('自動轉好的句子') || !auto.status.includes('已刪除錄音')) fail('auto transcribe failed');

await p.click('[data-folder="uncat"] button.drive');
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('請先貼上 Google OAuth Client ID'));
await p.fill('#clientId', '123456-abc.apps.googleusercontent.com');
await p.click('#saveClient');
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('已儲存 Client ID'));
await p.evaluate(() => {
  window.__tokenPrompts = [];
  window.__scopes = [];
  window.__clientIds = [];
  window.__allowSilent = false;
  window.google = {accounts: {oauth2: {initTokenClient(cfg) {
    window.__scopes.push(cfg.scope);
    window.__clientIds.push(cfg.client_id);
    return {requestAccessToken(opts) {
      const prompt = opts ? opts.prompt : '';
      window.__tokenPrompts.push(prompt);
      if (prompt === 'none' && !window.__allowSilent) { cfg.callback({error: 'interaction_required'}); return; }
      cfg.callback({access_token: 'test-token', expires_in: 3600});
    }};
  }}}};
});
await p.click(`[data-folder="${folderId}"] button.drive`);
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('已送到「記錄高高手收件匣」'));
const firstAuth = await p.evaluate(() => ({prompts: window.__tokenPrompts.slice(), scopes: window.__scopes.slice(), ids: window.__clientIds.slice()}));
console.log('auth', JSON.stringify(firstAuth), 'uploads', uploads.length, 'posts', apiPosts);
if (JSON.stringify(firstAuth.prompts) !== JSON.stringify(['none', ''])) fail('token prompts ' + firstAuth.prompts.join(','));
if (firstAuth.scopes[0] !== 'https://www.googleapis.com/auth/drive.file') fail('scope ' + firstAuth.scopes[0]);
if (firstAuth.ids[0] !== '123456-abc.apps.googleusercontent.com') fail('client id not passed');
if (!apiPosts.some(body => body.includes('記錄高高手收件匣'))) fail('inbox was not created');
const created = apiPosts.map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).find(j => j && j.name === '記錄高高手收件匣');
if (!created || created.mimeType !== 'application/vnd.google-apps.folder' || Object.prototype.hasOwnProperty.call(created, 'parents')) fail('inbox create ' + apiPosts[0]);
const inboxMeta = await p.evaluate(async () => pvn.getMeta('driveInbox'));
if (!inboxMeta || inboxMeta.id !== 'inbox1') fail('inbox id not stored ' + JSON.stringify(inboxMeta));
const body = uploads[0];
const firstName = body ? (body.toString('utf8').match(/"name":"([^"]+\.zip)"/) || [])[1] : '';
if (!body || !/^\d{8}_新店溪散步\.zip$/.test(firstName) || !body.includes(Buffer.from('inbox1'))) fail('upload metadata ' + firstName);
if (!body.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) fail('upload is not a zip');

await p.evaluate(() => { document.querySelector('#upstat').textContent = ''; });
await p.click(`[data-folder="${folderId}"] button.drive`);
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('已送到「記錄高高手收件匣」'));
const reused = await p.evaluate(() => window.__tokenPrompts.length);
const secondName = (uploads[1].toString('utf8').match(/"name":"([^"]+\.zip)"/) || [])[1] || '';
console.log('second upload', secondName);
if (reused !== 2 || uploads.length !== 2) fail('token was not reused, prompts ' + reused + ' uploads ' + uploads.length);
if (!/^\d{8}_新店溪散步_\d{6}\.zip$/.test(secondName)) fail('collision name ' + secondName);

await p.evaluate(() => { sessionStorage.removeItem('driveToken'); window.__allowSilent = true; document.querySelector('#upstat').textContent = ''; });
await p.click(`[data-folder="${folderId}"] button.drive`);
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('已送到「記錄高高手收件匣」') && window.__tokenPrompts.length === 3 && window.__tokenPrompts[2] === 'none');
if (uploads.length !== 3) fail('silent reauth did not upload');
console.log('silent reauth ok');

const beforeOffline = await p.evaluate(() => window.__tokenPrompts.length);
await ctx.setOffline(true);
await p.click(`[data-folder="${folderId}"] button.drive`);
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('目前沒有網路'));
const queued = await p.evaluate(async () => (await pvn.allOutbox()).map(i => ({name: i.name, size: i.zip.size})));
console.log('queued', JSON.stringify(queued));
if (queued.length !== 1 || queued[0].size < 20 || !/^\d{8}_新店溪散步\.zip$/.test(queued[0].name)) fail('offline queue ' + JSON.stringify(queued));
if (await p.evaluate(() => window.__tokenPrompts.length) !== beforeOffline) fail('offline upload tried to auth');

await ctx.setOffline(false);
await p.waitForFunction(() => document.querySelector('#upstat').textContent.includes('已送到「記錄高高手收件匣」'), null, {timeout: 15000});
const left = await p.evaluate(async () => (await pvn.allOutbox()).length);
if (left !== 0 || uploads.length !== 4) fail('queued upload did not flush, left ' + left + ' uploads ' + uploads.length);
const queuedBody = uploads[3];
if (!queuedBody.includes(Buffer.from('新店溪散步')) || !queuedBody.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) fail('flushed body is not the queued zip');
console.log('offline flush ok');

if (errors.length) fail('page errors: ' + errors.join(' | '));
await b.close();
console.log('feature tests passed');
