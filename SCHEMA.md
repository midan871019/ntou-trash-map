# 資料結構說明

本專案目前有兩個 MongoDB collection：`markers` 與 `userprofiles`。

## Marker

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `category` | String | 必填，只能是 `activity`、`trash`、`beach-clean` |
| `trashLevel` | String 或 null | 垃圾回報使用，只能是 `light`、`medium`、`heavy` 或 null |
| `quantity` | Number | 垃圾回報的預估袋數或數量 |
| `weightKg` | Number | 垃圾回報的預估重量，單位公斤 |
| `carbonSaved` | Number | 勾選一般塑膠時，前端依袋數估算並傳入的碳減量，單位 kg CO2e |
| `trashTypes` | Array | 垃圾具體類別或特殊垃圾勾選 |
| `riskLevel` | String | `low`、`high` 或 `extreme`，依特殊垃圾類別自動判定 |
| `title` | String | 必填，最多 120 字 |
| `description` | String | 選填，最多 2000 字 |
| `lat` | Number | 必填，範圍 -90 到 90 |
| `lng` | Number | 必填，範圍 -180 到 180 |
| `imagePath` | String | 主要上傳圖片在網站中的路徑 |
| `imagePaths` | Array | 多張上傳圖片在網站中的路徑 |
| `creatorUserKey` | String | 前端 localStorage 產生的裝置使用者識別 |
| `creatorName` | String | 發文者顯示暱稱 |
| `startAt` | Date 或 null | 活動與淨灘的開始時間 |
| `endAt` | Date 或 null | 活動與淨灘的結束時間 |
| `organizer` | String | 活動或淨灘的發起人員 / 主辦單位 |
| `organizerEmail` | String | 發起人員信箱 |
| `locationName` | String | 活動地點文字 |
| `eventUrl` | String | 活動或報名網址 |
| `maxParticipants` | Number | 淨灘報名人數上限，0 代表不限 |
| `participants` | Array | 已報名使用者的 localStorage `userKey` 清單 |
| `status` | String | `active`、`cleaned` 或 `expired`，預設 `active` |
| `cleanedAt` | Date 或 null | 正式進入清除區的時間 |
| `cleanedBy` | String | 達到門檻時最後一位確認者，或系統自動清理 |
| `cleanConfirmations` | Array | 多人確認清理的紀錄 |
| `comments` | Array | 留言清單 |
| `createdAt` | Date | Mongoose 自動建立 |
| `updatedAt` | Date | Mongoose 自動更新 |

## CleanConfirmation

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `userKey` | String | 前端產生並存於瀏覽器的使用者識別，用來避免同一裝置重複確認 |
| `author` | String | 確認者名稱，MVP 目前使用訪客 |
| `note` | String | 清理回報留言，最多 500 字 |
| `imagePath` | String | 清理證明圖片路徑 |
| `createdAt` | Date | 確認時間 |

## UserProfile

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `userKey` | String | 前端產生並存於 localStorage 的裝置使用者識別 |
| `displayName` | String | 顯示暱稱，最多 80 字 |
| `bio` | String | 個人敘述或聯繫方式，最多 500 字 |
| `lastSeenAt` | Date | 最近一次被 API 確認的時間 |
| `createdAt` | Date | Mongoose 自動建立 |
| `updatedAt` | Date | Mongoose 自動更新 |

## Comment

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `text` | String | 必填，最多 500 字 |
| `author` | String | 留言者，未輸入時使用匿名使用者 |
| `createdAt` | Date | 建立時間 |

## API

- `GET /api/markers`：取得全部標記，依建立時間由新到舊排序；預設隱藏已過期活動與淨灘。
- `GET /api/markers?includeExpired=true`：包含歷史活動與淨灘。
- `GET /api/markers?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`：依標記建立時間 `createdAt` 篩選日期範圍，垃圾回報與活動都會納入。
- `GET /api/markers/me?userKey=...`：取得該 localStorage 使用者發布過的所有標記。
- `POST /api/markers`：新增標記，使用 `multipart/form-data`，多張圖片欄位名稱是 `images`。
- `PUT /api/markers/:id`：編輯自己的標記，使用 `multipart/form-data` 並帶入 `userKey`。
- `DELETE /api/markers/:id`：刪除自己的標記，JSON body 或 query string 需帶入 `userKey`。
- `POST /api/markers/:id/join`：切換淨灘活動報名 / 取消報名，JSON body 需帶入 `userKey`。
- `GET /api/markers/:id/participants?userKey=...`：發起人查看淨灘參加者資訊。
- `GET /api/weather?lat=...&lng=...`：使用 OpenWeatherMap API 查詢座標天氣預報；需設定 `OPENWEATHER_API_KEY`。
- `GET /api/users/me?userKey=...`：取得或建立目前裝置的個人資料。
- `PUT /api/users/me`：更新目前裝置的顯示暱稱與個人敘述。
- `GET /api/users/:userKey`：取得公開個人資料。
- `POST /api/markers/:id/comments`：新增留言，接收 JSON 的 `text` 與 `author`。
- `POST /api/markers/:id/confirm-clean`：新增清理確認，使用 `multipart/form-data`，欄位包含 `userKey`、`author`、`note`、圖片欄位 `image`。

## 清理門檻與自動清理

- 清理確認門檻為 `max(1, ceil(網站曾使用人數 / 100))`，網站曾使用人數以 `userprofiles` 的數量計算。
- 若同一個 `userKey` 已確認過同一標記，API 會拒絕重複確認。
- 輕度垃圾回報建立超過 2 天會在讀取標記時自動轉為 `cleaned`。
- 中度垃圾回報建立超過 3 天會在讀取標記時自動轉為 `cleaned`。
- 重度垃圾不會自動清理，需要多人確認。

## 活動過期歸檔

- 分類為 `activity` 或 `beach-clean` 且 `endAt` 早於目前時間時，讀取標記會自動把 `status` 設為 `expired`。
- `GET /api/markers` 預設只回傳未過期活動；需要歷史活動時使用 `includeExpired=true`。

## 垃圾回報碳足跡與風險

- 前端可填 `quantity` 或 `weightKg`；只有勾選「一般塑膠」時，才以 `預估袋數 * 2.5` 估算 `carbonSaved`。
- `trashTypes` 包含易燃毒化物質、醫療廢棄物、動物屍體、大量魚群死亡或水質污染時判定為 `high`。
- `trashTypes` 包含爆裂物 / 軍火、海龜 / 鯨豚、疑似非洲豬瘟豬屍時判定為 `extreme`。
- 高風險與極高風險標記會在表單、Popup 與完整內容顯示「發現、觀察、判斷、處置」四步驟與通報專線。
