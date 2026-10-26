# 離線筆記 PWA

Static site in `docs/` (no build step). GitHub Pages serves that folder at <https://chunichen27-cmd.github.io/photo-voice-notes/>.

`docs/.nojekyll` is required. Without it, Pages runs Jekyll, and Jekyll does not publish the `vendor/` directory (the on-device transcription runtime, including the ONNX wasm).

Local test: put a short `sample.wav` in `docs/`, then `cd docs && python3 -m http.server 8765` and, from the repo root, `node test.mjs` (headless Chrome, online and offline transcription). `node test-features.mjs` checks folders, export text, audio deletion, and a mocked Drive upload without downloading the model. To mimic the project-site subpath, serve a parent folder that contains `photo-voice-notes` pointing at `docs/`, and set `BASE_URL=http://localhost:8765/photo-voice-notes/`.

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

### 先選資料夾

拍照前記得先選資料夾，同一天或同一趟行程放在一起。

1. 在「新資料夾名稱」會先帶入今天的日期（台北時間），可以改成例如「2026-10-26 新店山路」。
2. 點「建立並使用」。上方「目前資料夾」會顯示這個名稱。
3. 之後新的照片、錄音、逐字稿和定位都會進這個資料夾，直到你改用別的資料夾。
4. 舊筆記會放在「未分類」。可以點「使用」切換，或點「重新命名」。

### 之後沒有網路也能用

模型下載完成後，飛航模式或沒有 Wi-Fi 也可以拍照、錄音、把語音轉成文字。辨識在這支手機上進行，錄音不會上傳。

1. 點「拍照新增」拍一張照片。若手機詢問，請允許相機、麥克風和定位。
2. 在那一筆筆記上點「錄音」，說完再點「停止錄音」。
3. 若模型已經下載，停下來就會自動轉成文字。手機上可能要等幾十秒。
4. 轉成功後只留下逐字稿，錄音會從這台手機刪除。轉失敗則保留錄音，可再點「📝 轉成文字」。
5. 模型還沒下載時，不會自動轉，請先下載模型，或稍後再點「📝 轉成文字」。文字可以直接修改。

### 匯出筆記

- 某個資料夾：在該資料夾按「匯出 .txt」或「匯出 .zip」。壓縮檔裡有 `筆記.txt`（開頭是資料夾名稱，接著是每一筆的時間、位置、地圖、逐字稿），以及 `日期時間_照片.jpg`。已經轉成文字的筆記不會再附錄音。
- 單筆：在該筆筆記點「匯出 .txt」或「匯出 .zip」。
- 手機會跳出分享畫面，可以存到「檔案」、用 AirDrop 傳出，或送到訊息、郵件。

### 送到 Google Drive

每個資料夾有「☁️ 送到記錄高高手」。需要網路，而且要先做好下面的 Google 設定、貼上 Client ID。檔案會上傳到你自己的 Google Drive，資料夾名稱是「記錄高高手收件匣」。沒有網路時會先排入待上傳，連線後再送；若要重新授權，再點一次按鈕即可。

## 設定 Google Drive 上傳

上傳用的是瀏覽器裡的 Google 登入（Google Identity Services），沒有自己的伺服器。範圍只申請 `drive.file`，App 只能看到它自己建立的檔案。Client ID 可以貼在 App 的「Google Drive」欄位（存在這台手機的 localStorage），或寫進 `docs/config.js` 的 `GOOGLE_CLIENT_ID`。欄位有值時以欄位為準。

授權的 JavaScript 來源是網址的「協定 + 網域」，**不要**加上 `/photo-voice-notes`：

`https://chunichen27-cmd.github.io`

若 Console 已經改版成「Google Auth platform」，對照最後一節的新名稱即可。

### 1. 建立專案並啟用 Drive API

1. 用要接收檔案的 Gmail 打開 <https://console.cloud.google.com/>。
2. 上方專案選單 →「新增專案」。名稱可填「離線筆記」，建立後確認目前選到這個專案。
3. 左側「API 和服務」→「程式庫」（Enabled APIs & services → Library）。
4. 搜尋「Google Drive API」→ 點進去 →「啟用」。

### 2. OAuth 同意畫面（維持測試模式）

1. 「API 和服務」→「OAuth 同意畫面」（OAuth consent screen）。
2. User type 選「外部」（External）→ 建立。
3. 應用程式名稱填「離線筆記」。使用者支援電子郵件、開發人員聯絡電子郵件都填自己的 Gmail → 儲存並繼續。
4. 範圍（Scopes）→「新增或移除範圍」。加入 `https://www.googleapis.com/auth/drive.file`。清單裡沒有就用手動新增。更新 → 儲存並繼續。
5. 測試使用者（Test users）→ Add users → 加入自己的 Gmail → 儲存。
6. 確認發布狀態是「Testing」（測試中）。不要按「發布應用程式」。測試模式只允許列在測試使用者裡的帳號授權。

### 3. 建立網頁用的 OAuth Client ID

1. 「API 和服務」→「憑證」（Credentials）→「建立憑證」→「OAuth 用戶端 ID」。
2. 應用程式類型選「網頁應用程式」。名稱可填「離線筆記網頁」。
3. 「已授權的 JavaScript 來源」按新增，填入：`https://chunichen27-cmd.github.io`
4. 「已授權的重新導向 URI」留空。這個 App 用的是 token 彈出視窗，不需要重新導向網址。
5. 建立。複製用戶端 ID，結尾是 `.apps.googleusercontent.com`。

在電腦上用 `http://localhost:8765` 試上傳時，要把這個網址也加進 JavaScript 來源。正式用手機打開 GitHub Pages 時，來源仍必須有上面的 `github.io`。

### 4. 貼上 Client ID 並上傳

1. 手機用 Chrome 或 Safari 打開 <https://chunichen27-cmd.github.io/photo-voice-notes/>（建議從主畫面圖示進入）。
2. 在「Google Drive」貼上用戶端 ID →「儲存 Client ID」。
3. 打開某個資料夾，點「☁️ 送到記錄高高手」。
4. 第一次會跳出 Google 授權。請用剛才加入的測試使用者登入並允許。
5. 成功時畫面會寫已送到「記錄高高手收件匣」，檔名像「資料夾名_日期時間.zip」。
6. 之後憑證還有效時，再按一次就會直接上傳，不必再選帳號。憑證過期時，同一下按鈕會安靜換發新憑證；若 Google 要求重新同意，才會再跳出視窗。
7. 到 Google Drive 查看「記錄高高手收件匣」。

沒有網路就按上傳時，筆記會先留在手機的待上傳清單，連線後自動再試。若當時需要重新登入，畫面上會請你再點一次。

### 介面若已改成 Google Auth platform

- 品牌（Branding）：應用程式名稱與電子郵件。
- 目標對象（Audience）：外部、測試中，並新增測試使用者 Gmail。
- 資料存取（Data Access）：新增範圍 `https://www.googleapis.com/auth/drive.file`。
- 用戶端（Clients）：建立「網頁應用程式」，JavaScript 來源填 `https://chunichen27-cmd.github.io`。
