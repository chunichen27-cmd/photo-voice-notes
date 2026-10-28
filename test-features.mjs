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

const googleHits = [];
p.on('request', req => {
  const url = req.url();
  if (/accounts\.google\.com|googleapis\.com|gsi\/client/i.test(url)) googleHits.push(url);
});

await p.setViewportSize({width: 390, height: 844});
await p.goto(base);
await p.waitForFunction(() => document.querySelector('#activeName')?.textContent === '未分類');
const paths = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const shellKeys = (await caches.keys()).filter(k => k.startsWith('shell-'));
  const cache = await caches.open(shellKeys[0]);
  const urls = (await cache.keys()).map(r => new URL(r.url).pathname);
  return {scope: reg.scope, shells: shellKeys, urls, cache: self.APP_CACHE, version: self.APP_RELEASE.version, date: self.APP_RELEASE.date, label: document.querySelector('#appver').textContent};
});
console.log('sw', JSON.stringify(paths));
const expectedScope = new URL('./', base).href;
if (paths.scope !== expectedScope) fail('scope ' + paths.scope);
const expectedCache = 'shell-v' + paths.version + '-' + paths.date.replace(/-/g, '');
if (paths.cache !== expectedCache || paths.shells.join() !== expectedCache) fail('cache ' + paths.shells.join() + ' vs ' + paths.cache);
if (paths.label !== '版本 v' + paths.version + '（' + paths.date + '）') fail('version label ' + paths.label);
if (paths.urls.some(u => u.endsWith('/privacy.html') || u.endsWith('/terms.html'))) fail('legal pages precached');
const footer = await p.evaluate(() => ({
  privacy: document.querySelector('a[href="privacy.html"]')?.textContent || '',
  terms: document.querySelector('a[href="terms.html"]')?.textContent || ''
}));
if (!footer.privacy.includes('隱私') || !footer.terms.includes('使用條款')) fail('footer links ' + JSON.stringify(footer));
for (const name of ['version.js', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon-32.png']) {
  if (!paths.urls.some(u => u.endsWith('/' + name))) fail(name + ' not precached');
}
const manifest = await (await fetch(new URL('manifest.webmanifest', base))).json();
if (manifest.theme_color !== '#9d1e19' || manifest.background_color !== '#9d1e19') fail('theme ' + manifest.theme_color);
const purposes = manifest.icons.map(i => i.purpose + ' ' + i.src).sort();
if (JSON.stringify(purposes) !== JSON.stringify(['any icon-192.png', 'any icon-512.png', 'maskable icon-512-maskable.png'])) fail('icons ' + purposes.join(','));
const apple = await p.locator('link[rel="apple-touch-icon"]').getAttribute('href');
const icon = await p.locator('link[rel="icon"]').first().getAttribute('href');
if (apple !== 'apple-touch-icon.png' || !icon.includes('favicon')) fail('head icons ' + apple + ' ' + icon);
if (await p.locator('#updatebanner').getAttribute('hidden') === null) fail('update banner visible before an update');
await p.evaluate(() => offerUpdate({postMessage(msg){ window.__updateMsg = msg; }}));
if (await p.locator('#updatebanner').innerText() !== '有新版，點此更新') fail('banner text');
await p.click('#updatebanner');
if ((await p.evaluate(() => window.__updateMsg && window.__updateMsg.type)) !== 'skip-waiting') fail('banner did not activate the waiting worker');

const shown = await p.evaluate(() => {
  const visible = sel => {
    let n = document.querySelector(sel);
    while (n) {
      if (n.hidden) return false;
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return !!document.querySelector(sel);
  };
  const scroller = document.scrollingElement;
  return {
    scroll: scroller.scrollHeight - scroller.clientHeight,
    overflow: getComputedStyle(document.body).overflow,
    home: visible('#home'),
    folder: visible('#folderPage'),
    list: visible('#list'),
    folders: visible('#folders'),
    client: !!document.querySelector('#clientId'),
    shoot: visible('#shoot'),
    vnote: visible('#vnote'),
    zip: visible('#saveZip'),
    start: visible('#startTrack'),
    zipText: document.querySelector('#saveZip')?.textContent || ''
  };
});
if (shown.scroll > 1) fail('main screen scrolls ' + shown.scroll);
if (shown.overflow !== 'hidden') fail('body overflow ' + shown.overflow);
if (!shown.home || shown.folder || shown.list || shown.folders || shown.client) fail('main shows the wrong pieces ' + JSON.stringify(shown));
if (!shown.shoot || !shown.vnote || !shown.zip || !shown.start) fail('main missing controls ' + JSON.stringify(shown));
if (shown.zipText !== '💾 匯出 zip') fail('zip label ' + shown.zipText);
await p.evaluate(() => { const b = document.querySelector('#updatebanner'); if (b) b.hidden = true; });
await p.screenshot({path: '/opt/cursor/artifacts/main_screen_idle.png'});
if (await p.inputValue('#folderName') !== '') fail('folder name should start empty, got ' + await p.inputValue('#folderName'));
await p.click('#openFolders');

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

await p.evaluate(() => {
  window.__micCalls = 0;
  window.__micMode = 'reject';
  const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micCalls++;
    if (window.__micMode === 'reject') { const err = new Error('denied'); err.name = 'NotAllowedError'; throw err; }
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    return dest.stream;
  };
  window.__origGetUserMedia = ask;
});
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
if (!shaped.text.includes('照片：20261026_123705_照片.jpg\n逐字稿：\n山路') || shaped.names[0] !== '20261026_123705_照片.jpg') fail(shaped.text);
if (shaped.text.includes('類型：')) fail('photo note type line ' + shaped.text);
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

await p.locator('#list .card').first().scrollIntoViewIfNeeded();
await p.screenshot({path: '/opt/cursor/artifacts/folder_page_notes.png'});
await p.click('#backHome');
const homeText = await p.locator('#home').innerText();
if (homeText.includes('這是測試') || homeText.includes('匯出 .zip') || homeText.includes('OAuth')) fail('main screen lists notes or drive: ' + homeText.slice(0, 180));
if ((await p.locator('#openFiles').getAttribute('href')) !== 'shareddocuments://') fail('files url');
const beforeNotes = await p.evaluate(async () => (await pvn.allNotes()).length);
await ctx.setOffline(true);
const beforeGoogle = googleHits.length;
const zipSaved = await p.evaluate(async () => {
  window.__fetches = 0;
  const orig = window.fetch;
  window.fetch = (...args) => { window.__fetches++; return orig(...args); };
  const share = async payload => {
    const file = payload.files[0];
    const buf = new Uint8Array(await file.arrayBuffer());
    const z = await JSZip.loadAsync(file);
    window.__shared = {
      name: file.name,
      type: file.type,
      size: file.size,
      head: [...buf.slice(0, 4)],
      names: Object.keys(z.files),
      txt: await z.file('筆記.txt').async('string')
    };
  };
  Object.defineProperty(navigator, 'canShare', {configurable: true, value: data => !!(data && data.files && data.files.length)});
  Object.defineProperty(navigator, 'share', {configurable: true, value: share});
  document.querySelector('#saveZip').click();
  for (let i = 0; i < 50 && !window.__shared; i++) await new Promise(ok => setTimeout(ok, 50));
  return {shared: window.__shared, fetches: window.__fetches};
});
console.log('offline zip', zipSaved.shared && zipSaved.shared.name);
if (!zipSaved.shared) fail('share was not called');
if (!/^\d{8}_新店溪散步\.zip$/.test(zipSaved.shared.name) || zipSaved.shared.type !== 'application/zip') fail('zip file ' + zipSaved.shared.name + ' ' + zipSaved.shared.type);
if (zipSaved.shared.head.join(',') !== '80,75,3,4') fail('zip header');
if (!zipSaved.shared.txt.includes('資料夾：新店溪散步') || !zipSaved.shared.txt.includes('逐字稿：')) fail('zip txt');
if (!zipSaved.shared.names.some(n => /^\d{8}_\d{6}(_\d+)?_照片\.jpg$/.test(n)) || !zipSaved.shared.names.includes('打鐵寮.gpx')) fail('zip contents ' + zipSaved.shared.names.join(','));
if (zipSaved.fetches !== 0) fail('export used the network');
if (googleHits.length !== beforeGoogle) fail('google request during export');
const afterNotes = await p.evaluate(async () => (await pvn.allNotes()).length);
if (afterNotes !== beforeNotes) fail('export deleted notes ' + beforeNotes + ' -> ' + afterNotes);
await p.evaluate(() => { delete navigator.canShare; delete navigator.share; });
const [zipDownload] = await Promise.all([
  p.waitForEvent('download'),
  p.evaluate(() => document.querySelector('#saveZip').click())
]);
if (!/^\d{8}_新店溪散步\.zip$/.test(zipDownload.suggestedFilename())) fail('download name ' + zipDownload.suggestedFilename());
const zipBytes = await readFile(await zipDownload.path());
if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) fail('downloaded file is not a zip');
console.log('offline zip download', zipDownload.suggestedFilename());
await ctx.setOffline(false);

const shapedTrack = await p.evaluate(() => {
  const started = Date.parse('2026-10-26T04:37:05Z');
  const name = pvn.trackGpxName({started});
  const gpx = pvn.gpxText({started, name}, [{lat: 25.0478, lon: 121.517, ele: 12.5, time: started, acc: 5}]);
  return {
    name,
    gpx,
    keep: pvn.acceptFix(null, {lat: 25, lon: 121, acc: 50}),
    bad: pvn.acceptFix(null, {lat: 25, lon: 121, acc: 51}),
    dup: pvn.acceptFix({lat: 25, lon: 121}, {lat: 25.000001, lon: 121, acc: 5})
  };
});
if (shapedTrack.name !== '20261026_123705_軌跡.gpx') fail('track name ' + shapedTrack.name);
if (!shapedTrack.gpx.includes('version="1.1"') || !shapedTrack.gpx.includes('<trkpt lat="25.047800" lon="121.517000">') || !shapedTrack.gpx.includes('<ele>12.5</ele>') || !shapedTrack.gpx.includes('<time>2026-10-26T04:37:05.000Z</time>')) fail('gpx shape ' + shapedTrack.gpx);
if (!shapedTrack.keep || shapedTrack.bad || shapedTrack.dup) fail('acceptFix ' + JSON.stringify(shapedTrack));
if (!(await p.locator('#tracknote').innerText()).includes('不要鎖定螢幕')) fail('iphone note missing');

await p.addInitScript(() => {
  window.__wake = 0;
  window.__watched = 0;
  window.__geoOpts = null;
  window.__micCalls = 0;
  if (!window.__micMode) window.__micMode = 'reject';
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micCalls++;
    if (window.__micMode === 'reject') { const err = new Error('denied'); err.name = 'NotAllowedError'; throw err; }
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    return dest.stream;
  };
  const watch = function (ok, err, opts) {
    window.__geoOk = ok;
    window.__geoErr = err;
    window.__geoOpts = opts;
    window.__watched += 1;
    return 7;
  };
  const clear = function () { window.__cleared = (window.__cleared || 0) + 1; };
  const geo = navigator.geolocation;
  try { geo.watchPosition = watch; geo.clearWatch = clear; }
  catch (e) {
    Object.defineProperty(geo, 'watchPosition', {configurable: true, value: watch});
    Object.defineProperty(geo, 'clearWatch', {configurable: true, value: clear});
  }
  const request = async () => {
    window.__wake += 1;
    return {release: async () => { window.__wakeReleased = (window.__wakeReleased || 0) + 1; }, addEventListener() {}};
  };
  try {
    Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {request}});
  } catch (e) {
    if (navigator.wakeLock) navigator.wakeLock.request = request;
  }
});
await p.reload();
await p.waitForFunction(() => window.pvn && document.querySelector('#startTrack') && !document.querySelector('#startTrack').hidden);
await p.evaluate(() => window.scrollTo(0, 0));
const wakesBefore = await p.evaluate(() => window.__wake);
await p.click('#startTrack');
await p.waitForFunction(() => window.__geoOk && window.__geoOpts && window.__geoOpts.enableHighAccuracy === true);
if (await p.evaluate(() => window.__wake) <= wakesBefore) fail('wake lock was not requested');
const t0 = Date.parse('2026-10-26T04:37:05Z');
await p.evaluate(async (t0) => {
  const send = async (lat, lon, acc, ele, time) => {
    window.__geoOk({timestamp: time, coords: {latitude: lat, longitude: lon, accuracy: acc, altitude: ele}});
    await pvn.flushFixes();
  };
  await send(25.0478, 121.517, 5, 20, t0);
  await send(25.05, 121.517, 80, 1, t0 + 1000);
  await send(25.047801, 121.517, 5, 20, t0 + 2000);
  await send(25.0488, 121.517, 8, 22, t0 + 10000);
}, t0);
await p.waitForFunction(() => {
  const t = document.querySelector('#trackstat').textContent;
  return t.includes('錄製中') && t.includes('2 點') && t.includes('公尺');
});
const live = await p.evaluate(async () => {
  const tracks = await pvn.allTracks();
  const open = tracks.find(t => t.recording);
  const pts = await pvn.pointsIn(open.id);
  return {folderId: open.folderId, active: (await pvn.activeFolder()).id, n: pts.length, acc: pts.map(p => p.acc), ele: pts.map(p => p.ele)};
});
console.log('live track', JSON.stringify(live));
if (live.n !== 2 || live.folderId !== live.active || live.acc.some(a => a > 50)) fail('points were not filtered');
const watched = await p.evaluate(() => window.__watched);
await p.reload();
await p.waitForFunction(() => document.querySelector('#trackresume') && !document.querySelector('#trackresume').hidden && document.querySelector('#trackresume').innerText.includes('繼續記錄'));
if (await p.evaluate(() => window.__watched) !== 0) fail('reload resumed without asking');
await p.click('#trackresume button.resume');
await p.waitForFunction(() => window.__watched === 1 && document.querySelector('#trackstat').textContent.includes('錄製中'));
await p.evaluate(async (t0) => {
  window.__geoOk({timestamp: t0 + 20000, coords: {latitude: 25.0498, longitude: 121.517, accuracy: 6, altitude: 30}});
  await pvn.flushFixes();
}, t0);
await p.evaluate(() => pvn.onVisible());
await p.waitForFunction(() => window.__wake >= 2 && window.__watched >= 2);
await p.click('#stopTrack');
await p.waitForFunction(() => document.querySelector('#startTrack') && !document.querySelector('#startTrack').hidden && document.querySelector('#tracklist').innerText.includes('匯出 GPX'));
const saved = await p.evaluate(async () => {
  const tracks = (await pvn.allTracks()).filter(t => !t.recording);
  const pts = await pvn.pointsIn(tracks[0].id);
  return {n: tracks.length, points: pts.length, name: tracks[0].name, stopped: !!tracks[0].stopped};
});
if (saved.n !== 1 || saved.points !== 3 || !/^\d{8}_\d{6}_軌跡\.gpx$/.test(saved.name) || !saved.stopped) fail('saved track ' + JSON.stringify(saved));
await p.evaluate(() => {
  try { Object.defineProperty(Navigator.prototype, 'canShare', {configurable: true, value: () => false}); } catch (e) {}
});
await p.click('#openFolders');
const [gpxDownload] = await Promise.all([
  p.waitForEvent('download'),
  p.click('#tracklist button.gpxout')
]);
await p.click('#backHome');
const gpxBody = await readFile(await gpxDownload.path(), 'utf8');
if (gpxDownload.suggestedFilename() !== saved.name) fail('download ' + gpxDownload.suggestedFilename());
if (!gpxBody.includes('<trkseg>') || (gpxBody.match(/<trkpt /g) || []).length !== 3 || !gpxBody.includes('<time>') || !gpxBody.includes('Z</time>')) fail('downloaded gpx ' + gpxBody.slice(0, 240));
const zipped = await p.evaluate(async () => {
  const folder = await pvn.activeFolder();
  const z = await JSZip.loadAsync(await pvn.buildFolderZip(folder, await pvn.notesIn(folder.id)));
  const tracks = (await pvn.allTracks()).filter(t => t.folderId === folder.id);
  const names = tracks.map(t => t.name);
  const text = await z.file(names[0]).async('string');
  return {names: Object.keys(z.files), text, wanted: names[0]};
});
if (!zipped.names.includes(zipped.wanted) || !zipped.text.includes('<trkpt ') || !zipped.names.includes('打鐵寮.gpx')) fail('zip tracks ' + zipped.names.join(','));
console.log('track zip', zipped.wanted);

await p.click('#startTrack');
await p.waitForFunction(() => window.__watched >= 3);
await p.evaluate(() => window.__geoErr({code: 1, message: 'denied'}));
await p.waitForFunction(() => document.querySelector('#trackmsg').textContent.includes('定位被拒絕'));
const denied = await p.evaluate(async () => (await pvn.allTracks()).filter(t => t.recording && !t.stopped).length);
if (denied !== 0) fail('denied track still recording');
await p.click('#startTrack');
await p.waitForFunction(() => window.__geoOk);
await p.evaluate(async (t0) => {
  window.__geoOk({timestamp: t0 + 60000, coords: {latitude: 25.06, longitude: 121.52, accuracy: 4, altitude: null}});
  await pvn.flushFixes();
}, t0);
await p.click('#stopTrack');
await p.waitForFunction(() => document.querySelectorAll('#tracklist .track-row').length === 2);
console.log('two tracks');
if (watched < 1) fail('watch was not started');

const compressed = await p.evaluate(async () => {
  const paint = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 13) & 255;
      img.data[i + 1] = (i * 29) & 255;
      img.data[i + 2] = (i * 7) & 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#00f';
    g.fillRect(0, 0, Math.max(4, Math.round(w * 0.12)), h);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.92));
  };
  const big = await paint(3000, 1600);
  const shrunk = await pvn.compressPhoto(big);
  const bmp = await createImageBitmap(shrunk);
  const wideC = document.createElement('canvas');
  wideC.width = 4800; wideC.height = 1200;
  const wg = wideC.getContext('2d');
  wg.fillStyle = '#c45c3a';
  wg.fillRect(0, 0, 4800, 1200);
  const wide = await new Promise(ok => wideC.toBlob(ok, 'image/jpeg', 0.92));
  const capped = await createImageBitmap(await pvn.compressPhoto(wide));
  const tight = await pvn.compressPhoto(big, {maxBytes: 20000, maxEdge: 800});
  const raw = await paint(80, 30);
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const tiff = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);
  const size = 2 + 6 + tiff.length;
  const app = new Uint8Array(2 + size);
  app[0] = 0xff; app[1] = 0xe1; app[2] = size >> 8; app[3] = size & 255;
  app.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app.set(tiff, 10);
  const out = new Uint8Array(bytes.length + app.length);
  out[0] = 0xff; out[1] = 0xd8;
  out.set(app, 2);
  out.set(bytes.subarray(2), 2 + app.length);
  const turned = new Blob([out], {type: 'image/jpeg'});
  const orient = await pvn.readExifOrientation(turned);
  const fixed = await pvn.compressPhoto(turned);
  const upright = await createImageBitmap(fixed);
  const px = document.createElement('canvas');
  px.width = upright.width; px.height = upright.height;
  const ctx = px.getContext('2d');
  ctx.drawImage(upright, 0, 0);
  const top = ctx.getImageData(Math.floor(upright.width / 2), 2, 1, 1).data;
  return {
    type: shrunk.type, bytes: shrunk.size, w: bmp.width, h: bmp.height,
    capW: capped.width, capH: capped.height,
    tight: tight.size, orient, fw: upright.width, fh: upright.height, top: [top[0], top[1], top[2]]
  };
});
console.log('photo compress', JSON.stringify(compressed));
if (compressed.type !== 'image/jpeg' || compressed.bytes >= 5 * 1024 * 1024) fail('jpeg size ' + compressed.bytes);
if (Math.max(compressed.w, compressed.h) !== 3000) fail('long edge ' + compressed.w + 'x' + compressed.h);
if (compressed.capW !== 4000 || compressed.capH !== 1000) fail('cap edge ' + compressed.capW + 'x' + compressed.capH);
if (compressed.tight >= 20000) fail('quality not reduced ' + compressed.tight);
if (compressed.orient !== 6 || compressed.fw >= compressed.fh) fail('orientation ' + JSON.stringify(compressed));
if (compressed.top[2] <= compressed.top[0]) fail('blue strip not rotated to the top ' + compressed.top.join(','));

await p.evaluate(() => { window.__micMode = 'ok'; window.__micCalls = 0; window.__transcribeStub = async () => ({type: 'result', text: '這是圖說'}); localStorage.modelReady = '1'; });
await p.click('#startTrack');
await p.waitForFunction(() => window.__micCalls === 1 && document.querySelector('#trackstat').textContent.includes('錄製中'));
await p.locator('#shoot').dispatchEvent('pointerdown');
if (await p.evaluate(() => window.__micCalls) !== 1) fail('photo button asked for the mic again');
const watchedBeforePhoto = await p.evaluate(() => window.__watched);
await p.setInputFiles('#cam', 'docs/icon-192.png');
await p.waitForFunction(() => !document.querySelector('#halt').hidden && document.querySelector('#halt').textContent.includes('停止錄音') && !document.querySelector('#recind').hidden && document.querySelector('#recind').innerText.includes('錄音中') && document.querySelector('#shoot').hidden && !document.querySelector('#recthumb').hidden);
if (await p.evaluate(() => window.__micCalls) !== 1) fail('photo change asked for the mic again');
if ((await p.evaluate(() => window.__watched)) <= watchedBeforePhoto) fail('returning from the camera did not resume GPS');
await p.click('#halt');
await p.waitForFunction(() => {
  const card = document.querySelector('#list .card');
  const ta = card && card.querySelector('textarea');
  return ta && ta.value.includes('這是圖說') && !card.querySelector('audio') && document.querySelector('#halt').hidden && !document.querySelector('#shoot').hidden;
});
const still = await p.evaluate(async () => (await pvn.allTracks()).some(t => t.recording && !t.stopped));
if (!still) fail('voice stop ended the GPS track');
const calls = await p.evaluate(() => window.__micCalls);
await p.locator('#shoot').dispatchEvent('pointerdown');
if (await p.evaluate(() => window.__micCalls) !== calls) fail('warm mic was dropped');
await p.evaluate(() => { pvn.releaseMic(); window.__micMode = 'reject'; });
await p.locator('#shoot').dispatchEvent('pointerdown');
await p.setInputFiles('#cam', 'docs/icon-512.png');
await p.waitForFunction(() => !document.querySelector('#speak').hidden && document.querySelector('#capmsg').textContent.includes('開始錄音'));
await p.evaluate(() => { window.__micMode = 'ok'; });
await p.locator('#speak').dispatchEvent('pointerdown');
await p.click('#speak');
await p.waitForFunction(() => !document.querySelector('#halt').hidden);
await p.click('#halt');
await p.waitForFunction(() => document.querySelector('#halt').hidden);
console.log('field flow ok');
await p.waitForFunction(() => ![...document.querySelectorAll('#list .s')].some(s => s.textContent.includes('辨識中')));

const voicePlan = await p.evaluate(() => {
  const photo = (ts, text) => ({id: ts, ts, photo: new Blob(['p']), transcript: text, loc: null});
  const voice = {id: 20, ts: Date.parse('2026-10-26T02:00:00Z'), kind: 'voice', transcript: '語音乙', loc: {lat: 24.5, lng: 121.5, acc: 6}};
  const notes = [photo(Date.parse('2026-10-26T03:00:00Z'), '照片丙'), voice, photo(Date.parse('2026-10-26T01:00:00Z'), '照片甲')];
  return pvn.folderTxt({name: '測試'}, notes);
});
const voiceParts = voicePlan.split('\n\n----------\n\n');
if (voiceParts.length !== 3 || !voiceParts[0].includes('照片甲') || !voiceParts[1].includes('類型：語音筆記') || voiceParts[1].includes('照片：') || !voiceParts[1].includes('逐字稿：\n語音乙') || !voiceParts[2].includes('照片丙')) fail('voice order ' + voicePlan);

await p.evaluate(async () => {
  window.__geoCurrent = 0;
  window.__micMode = 'ok';
  window.__transcribeStub = async () => ({type: 'result', text: '只是一段語音'});
  const geo = navigator.geolocation;
  const orig = geo.getCurrentPosition.bind(geo);
  geo.getCurrentPosition = function(ok, err, opts) {
    window.__geoCurrent++;
    window.__lastGeoOpts = opts;
    return orig(ok, err, opts);
  };
  window.__geoOk({timestamp: Date.now(), coords: {latitude: 25.111, longitude: 121.555, accuracy: 8, altitude: 10}});
  await pvn.flushFixes();
});
await p.click('#vnote');
await p.waitForFunction(() => !document.querySelector('#halt').hidden && document.querySelector('#vnote').hidden && document.querySelector('#shoot').hidden);
if (await p.evaluate(() => window.__geoCurrent) !== 0) fail('fresh track fix still called getCurrentPosition');
await p.click('#halt');
await p.waitForFunction(() => {
  const card = document.querySelector('#list .card');
  return card && card.innerText.includes('🎙 語音筆記') && card.querySelector('textarea').value.includes('只是一段語音') && card.innerText.includes('25.111000') && card.querySelector('a') && !card.querySelector('audio');
});
const voiceZip = await p.evaluate(async () => {
  const folder = await pvn.activeFolder();
  const notes = await pvn.notesIn(folder.id);
  const voice = notes.find(n => n.kind === 'voice' && n.transcript.includes('只是一段語音'));
  const z = await JSZip.loadAsync(await pvn.buildFolderZip(folder, notes));
  return {txt: pvn.folderTxt(folder, notes), names: Object.keys(z.files), audio: !!(voice && voice.audio), fname: pvn.fname(voice.ts)};
});
if (!voiceZip.txt.includes('類型：語音筆記') || !voiceZip.txt.includes('逐字稿：\n只是一段語音') || !voiceZip.txt.includes('25.111000, 121.555000')) fail('voice txt ' + voiceZip.txt.slice(0, 500));
const voiceBlock = voiceZip.txt.split('\n\n----------\n\n').find(s => s.includes('類型：語音筆記') && s.includes('只是一段語音'));
if (!voiceBlock || voiceBlock.includes('照片：') || !voiceBlock.includes('類型：語音筆記\n逐字稿：')) fail('voice block ' + voiceBlock);
if (voiceZip.audio) fail('successful voice note kept audio');
if (voiceZip.names.some(n => n.includes(voiceZip.fname) && n.includes('錄音'))) fail('voice audio in zip ' + voiceZip.names.join(','));
if (voiceZip.txt.includes('類型：語音筆記') && voiceZip.txt.includes('這是圖說') && voiceZip.txt.split('類型：語音筆記').length !== 2) fail('photo notes marked as voice');

await p.click('#stopTrack');
await p.waitForFunction(() => !document.querySelector('#startTrack').hidden);
await p.evaluate(() => {
  window.__micMode = 'ok';
  window.__transcribeStub = async () => ({type: 'error', msg: '太吵'});
  navigator.geolocation.getCurrentPosition = function(ok, err, opts) {
    window.__geoCurrent++;
    window.__lastGeoOpts = opts;
    err({code: 1, message: 'denied'});
  };
});
await p.click('#vnote');
await p.waitForFunction(() => !document.querySelector('#halt').hidden);
await p.click('#halt');
await p.waitForFunction(() => {
  const card = document.querySelector('#list .card');
  return card && card.innerText.includes('無法取得位置') && card.innerText.includes('辨識失敗');
});
const voiceKept = await p.evaluate(async () => {
  const folder = await pvn.activeFolder();
  const notes = await pvn.notesIn(folder.id);
  const voice = notes.filter(n => n.kind === 'voice' && n.audio);
  const z = await JSZip.loadAsync(await pvn.buildFolderZip(folder, notes));
  const names = Object.keys(z.files);
  return {n: voice.length, leaked: voice.some(n => names.some(name => name.includes(pvn.fname(n.ts)) && name.includes('錄音')))};
});
if (voiceKept.n < 1 || voiceKept.leaked) fail('voice failure audio ' + JSON.stringify(voiceKept));

await p.evaluate(() => {
  window.__geoCurrent = 0;
  window.__micMode = 'ok';
  window.__transcribeStub = async () => ({type: 'result', text: '另外定位'});
  navigator.geolocation.getCurrentPosition = function(ok, err, opts) {
    window.__geoCurrent++;
    window.__lastGeoOpts = opts;
    ok({coords: {latitude: 24.5, longitude: 121.2, accuracy: 12}, timestamp: Date.now()});
  };
});
await p.click('#vnote');
await p.click('#halt');
await p.waitForFunction(() => {
  const card = document.querySelector('#list .card');
  return card && card.querySelector('textarea') && card.querySelector('textarea').value.includes('另外定位') && card.innerText.includes('24.500000');
});
const geoOpts = await p.evaluate(() => window.__lastGeoOpts);
if (await p.evaluate(() => window.__geoCurrent) !== 1 || !geoOpts || geoOpts.enableHighAccuracy !== true || geoOpts.timeout !== 15000) fail('one-off geo ' + JSON.stringify(geoOpts));
console.log('voice notes ok');

await p.click('#openFolders');
await p.locator('a[href="privacy.html"]').click();
await p.waitForFunction(() => document.querySelector('h1')?.textContent === '隱私權政策');
const privacyText = await p.locator('body').innerText();
for (const bit of ['Chun-I Chen', 'IndexedDB', '不會上傳', 'chunichen27@gmail.com', '沒有廣告']) {
  if (!privacyText.includes(bit)) fail('privacy missing ' + bit);
}
if (privacyText.includes('drive.file') || privacyText.includes('送到記錄高高手')) fail('privacy still mentions drive');
const privacyH2 = await p.locator('h2').first().evaluate(el => getComputedStyle(el).color);
if (privacyH2 !== 'rgb(157, 30, 25)') fail('privacy color ' + privacyH2);
await p.locator('a[href="terms.html"]').click();
await p.waitForFunction(() => document.querySelector('h1')?.textContent === '使用條款');
const termsText = await p.locator('body').innerText();
for (const bit of ['個人', '依現況提供', '不附任何', '保證', 'Chun-I Chen']) {
  if (!termsText.includes(bit)) fail('terms missing ' + bit);
}
await p.locator('a[href="index.html"]').click();
await p.waitForFunction(() => (document.querySelector('#appver')?.textContent || '').includes('v' + self.APP_RELEASE.version));
console.log('legal pages ok');

if (errors.length) fail('page errors: ' + errors.join(' | '));
await b.close();
console.log('feature tests passed');
