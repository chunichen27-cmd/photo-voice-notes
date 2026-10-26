# 離線筆記 PWA

Static site in `docs/` (no build step). GitHub Pages serves that folder at <https://chunichen27-cmd.github.io/photo-voice-notes/>.

`docs/.nojekyll` is required. Without it, Pages runs Jekyll, and Jekyll does not publish the `vendor/` directory (the on-device transcription runtime, including the ONNX wasm).

Local test: put a short `sample.wav` in `docs/`, then `cd docs && python3 -m http.server 8765` and, from the repo root, `node test.mjs` (headless Chrome, online and offline transcription). To mimic the project-site subpath, serve a parent folder that contains `photo-voice-notes` pointing at `docs/`, and run `BASE_URL=http://localhost:8765/photo-voice-notes/ node test.mjs`.

Model: Xenova/whisper-base (q8, ~80 MB) downloaded from huggingface.co on first tap, cached in Cache Storage "transformers-cache".

Pages source, after this is on `main`: Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: **main** → Folder: **/docs**.

## 使用說明

用手機瀏覽器打開：<https://chunichen27-cmd.github.io/photo-voice-notes/>

打開後請加到主畫面，之後從主畫面的「離線筆記」圖示進入。

### 加到主畫面

**iPhone（請用 Safari）**

1. 用 Safari 打開上面的網址。
2. 點畫面底部的「分享」按鈕。
3. 點「加入主畫面」，再點右上角「加入」。

**Android（請用 Chrome）**

1. 用 Chrome 打開上面的網址。
2. 點右上角選單（三個點）。
3. 點「加到主畫面」或「安裝應用程式」，再按確認。

### 第一次要先下載語音模型

模型大約 80 MB，只會下載一次，下載時需要網路（建議用 Wi-Fi）。

1. 打開「離線筆記」。
2. 點「下載模型（約 80 MB，僅需一次）」。
3. 等到畫面顯示「已就緒」再繼續。下載時不要關掉這個頁面。

### 之後沒有網路也能用

模型下載完成後，飛航模式或沒有 Wi-Fi 也可以拍照、錄音、把語音轉成文字。辨識在這支手機上進行，錄音不會上傳。

1. 點「拍照新增」拍一張照片。若手機詢問，請允許相機、麥克風和定位。
2. 在那一筆筆記上點「錄音」，說完再點「停止錄音」。
3. 點「轉成文字」。手機上可能要等幾十秒。轉出來的文字可以直接修改。

### 匯出筆記

- 只匯出一筆：在該筆筆記點「匯出 .txt」（純文字）或「匯出 .zip」（文字、照片和錄音）。
- 一次匯出全部：點上方「匯出全部 .txt」或「匯出全部 .zip（含照片錄音）」。
- 手機會跳出分享畫面，可以存到「檔案」、用 AirDrop 傳出，或送到訊息、郵件。
