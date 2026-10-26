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
5. 若這趟已有 GPX 檔，點該資料夾的「加入 GPX」。匯出或上傳時會以原檔名放進壓縮檔。

### 記錄軌跡

在目前資料夾按「開始記錄軌跡」，走完再按「停止記錄軌跡」。畫面會顯示錄製中、已經過的時間、點數和距離。每一個定位點會立刻寫進這台手機，重新載入後可以繼續同一段軌跡。一個資料夾可以有好幾段軌跡，每一段可按「匯出 GPX」。檔名是開始時間（台北時間），例如 `20261026_123705_軌跡.gpx`。送到記錄高高手的壓縮檔也會帶上這些軌跡。

iPhone 在鎖定螢幕、打開相機或把 App 切到背景時會暫停定位。回到這個畫面會自動繼續同一段軌跡，並重新要螢幕常亮。請不要鎖定螢幕。精確度太差（約超過 50 公尺）或和上一點幾乎重疊的定位會略過。

### 在路上的用法

一天的操作只有這幾下。模型下載完成後，飛航模式或沒有 Wi-Fi 也可以拍照、錄音、把語音轉成文字。

1. 選好資料夾（某一天或某一趟）。
2. 按「開始記錄軌跡」。這時會一併詢問麥克風，並把麥克風留著用一整天，避免每張照片都再問一次。軌跡會一直記到你按「停止記錄軌跡」。
3. 一整天重複：按「📷 拍照」。照片會縮成 JPEG，長邊大約 3000 到 4000 像素、品質約 0.85，必要時再降低直到小於 5 MB，方向會轉正。檔名用的時間是按下快門當下（相機若有帶拍攝時間，兩分鐘內以那個時間為準），不是壓縮完成的時間。
4. 拍完立刻錄音，不用再按一次。下方出現這張照片的縮圖、大的「停止錄音」和「錄音中」。說完按「停止錄音」。
5. 若模型已經下載，停止後會自動轉成繁體中文，寫進這張照片的圖說，並刪掉錄音。轉失敗則留下錄音，可再按「📝 轉成文字」。圖說可以事後修改。
6. 畫面回到拍照，可以拍下一張。軌跡繼續記。
7. 這一天結束：按「停止記錄軌跡」，再按同一個畫面裡的「☁️ 送到記錄高高手」。

`筆記.txt` 裡每一筆先寫 `時間` 和 `照片`，下一行就是既有的 `逐字稿`（圖說），位置和地圖接在圖說後面。

iPhone 的第一次麥克風權限必須由你按下去觸發，所以是按在「開始記錄軌跡」上，而不是等相機回來才問。拍照鍵按下去時若麥克風已經關掉，會再打開一次。若相機畫面回來時瀏覽器仍不允許自動錄音，會改成一顆「🎙 開始錄音」。打開相機等於把這個 App 暫時放到背景，回來後定位會自己繼續；鎖定螢幕或一直留在背景時，錄音和軌跡都會暫停。

### 之後沒有網路也能用

辨識在這支手機上進行，錄音不會上傳。模型還沒下載時，不會自動轉成文字，請先下載模型，或稍後再按「📝 轉成文字」。

### 匯出筆記

- 某個資料夾：在該資料夾按「匯出 .txt」或「匯出 .zip」。壓縮檔裡有 `筆記.txt`（開頭是資料夾名稱，每一筆以 `----------` 分隔）。每一筆先是 `時間：2026-10-26 12:37:05（台北時間）`，與照片檔名同一秒；有照片才接著 `照片：20261026_123705_照片.jpg`（多張就各一行，檔名不重複；沒有照片就省略）。圖說寫在既有的 `逐字稿`，緊接在時間和照片下面。再來才是位置和地圖。已經轉成文字的筆記不會再附錄音。資料夾裡匯入的 GPX 以原檔名放在壓縮檔根目錄，現場錄下的軌跡則是 `YYYYMMDD_HHMMSS_軌跡.gpx`。
- 單筆：在該筆筆記點「匯出 .txt」或「匯出 .zip」。
- 手機會跳出分享畫面，可以存到「檔案」、用 AirDrop 傳出，或送到訊息、郵件。

### 送到 Google Drive

每個資料夾有「☁️ 送到記錄高高手」。需要網路，而且要先做好下面的 Google 設定、貼上 Client ID。檔案會上傳到你自己的 Google Drive 裡、我的雲端硬碟根目錄的「記錄高高手收件匣」。App 只看得到自己建立的資料夾，會把這個收件匣的 id 記在這台手機，下次找不到才再建立一個。上傳之後 App 不會移動或刪除雲端上的任何檔案。沒有網路時會先排入待上傳，連線後再送；若要重新授權，再點一次按鈕即可。

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
5. 成功時畫面會寫已送到「記錄高高手收件匣」。檔名是 `YYYYMMDD_資料夾名稱.zip`，例如 `20261026_打鐵寮古道.zip`。日期優先用資料夾名稱裡的日期，否則用第一筆筆記的日期（都是台北時間）。收件匣裡已經有同名檔時，會改成加上傳當下的 `_HHMMSS`，例如 `20261026_打鐵寮古道_123705.zip`，不會覆寫。
6. 之後憑證還有效時，再按一次就會直接上傳，不必再選帳號。憑證過期時，同一下按鈕會安靜換發新憑證；若 Google 要求重新同意，才會再跳出視窗。
7. 到 Google Drive 的「我的雲端硬碟」查看「記錄高高手收件匣」。接收端會自行把處理過的 zip 移到收件匣裡的「已處理」；這個 App 不會代為移動或刪除。

沒有網路就按上傳時，筆記會先留在手機的待上傳清單，連線後自動再試。若當時需要重新登入，畫面上會請你再點一次。

### 介面若已改成 Google Auth platform

- 品牌（Branding）：應用程式名稱與電子郵件。
- 目標對象（Audience）：外部、測試中，並新增測試使用者 Gmail。
- 資料存取（Data Access）：新增範圍 `https://www.googleapis.com/auth/drive.file`。
- 用戶端（Clients）：建立「網頁應用程式」，JavaScript 來源填 `https://chunichen27-cmd.github.io`。
