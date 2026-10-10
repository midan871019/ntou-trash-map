# 海大海廢社群地圖

這是一個學習用途的 MVP 網站，讓使用者在國立臺灣海洋大學與基隆周邊地圖上回報海洋廢棄物、活動與淨灘資訊。

## 已完成功能

- Leaflet 互動式地圖，預設中心在海洋大學附近。
- 「我的位置」按鈕可使用裝置 GPS 定位，並將地圖移到目前位置。
- 「新增標記」可選擇使用當前 GPS 位置或地圖手動點擊。
- 分類篩選：全部、活動、垃圾、淨灘。
- 可勾選「顯示已清理區」，即時切換已清理垃圾點位。
- 垃圾程度欄位只在垃圾分類顯示。
- 垃圾圖標會依嚴重程度顯示不同顏色，已清理點位會改用綠色勾勾。
- 垃圾標記可送出「回報已清除」，達到多人確認門檻後自動轉入清除區。
- 輕度垃圾 2 天、中度垃圾 3 天後會自動轉入清除區；重度垃圾不自動清理。
- 活動與淨灘可填開始與結束時間。
- 圖片上傳，限制圖片 MIME type 與 5MB 大小。
- 側欄顯示淨灘活動，並依開始時間排序。
- 標記彈窗與淨灘清單都能留言。
- 前端顯示使用 `escapeHtml` 避免把留言當成 HTML 執行。
- 後端使用 Express、Mongoose、Multer 與 dotenv。

## 啟動方式

1. 安裝依賴：

   ```bash
   npm install
   ```

2. 建立 `.env`：

   ```bash
   copy .env.example .env
   ```

3. 確認 MongoDB 已啟動，並視需要修改 `.env` 的 `MONGODB_URI`。

   `WEBSITE_USER_COUNT` 可填網站曾使用人數，用來計算清理確認門檻。門檻公式是 `max(3, ceil(WEBSITE_USER_COUNT / 100))`。

4. 啟動伺服器：

   ```bash
   npm start
   ```

5. 開啟 `http://localhost:3000`。

## API

- `GET /api/markers`
- `POST /api/markers`
- `POST /api/markers/:id/comments`
- `POST /api/markers/:id/confirm-clean`

詳細欄位請看 `SCHEMA.md`。

## 分工建議

- 前端：地圖互動、表單、版面與錯誤提示。
- 後端：API、資料驗證、圖片上傳與錯誤處理。
- 文件：README、資料結構、測試紀錄與展示說明。

## 目前限制

- 尚未完成登入、權限與使用者身分管理。
- 目前使用瀏覽器 `localStorage` 產生 `userKey` 防止同一裝置重複清理確認；正式版應改成登入帳號。
- 尚未加入 rate limit。
- 尚未加入正式 HTTPS 部署設定。
- 圖片目前存放在本機 `public/uploads`，正式部署時建議改用雲端儲存。
- 尚未加入自動化測試與管理員審核流程。
