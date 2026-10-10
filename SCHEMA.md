# 資料結構說明

本專案目前只有一個 MongoDB collection：`markers`。

## Marker

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `category` | String | 必填，只能是 `activity`、`trash`、`beach-clean` |
| `trashLevel` | String 或 null | 垃圾回報使用，只能是 `light`、`medium`、`heavy` 或 null |
| `title` | String | 必填，最多 120 字 |
| `description` | String | 選填，最多 2000 字 |
| `lat` | Number | 必填，範圍 -90 到 90 |
| `lng` | Number | 必填，範圍 -180 到 180 |
| `imagePath` | String | 上傳圖片在網站中的路徑 |
| `startAt` | Date 或 null | 活動與淨灘的開始時間 |
| `endAt` | Date 或 null | 活動與淨灘的結束時間 |
| `status` | String | `active` 或 `cleaned`，預設 `active` |
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

## Comment

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `text` | String | 必填，最多 500 字 |
| `author` | String | 留言者，未輸入時使用匿名使用者 |
| `createdAt` | Date | 建立時間 |

## API

- `GET /api/markers`：取得全部標記，依建立時間由新到舊排序。
- `POST /api/markers`：新增標記，使用 `multipart/form-data`，圖片欄位名稱是 `image`。
- `POST /api/markers/:id/comments`：新增留言，接收 JSON 的 `text` 與 `author`。
- `POST /api/markers/:id/confirm-clean`：新增清理確認，使用 `multipart/form-data`，欄位包含 `userKey`、`author`、`note`、圖片欄位 `image`。

## 清理門檻與自動清理

- 清理確認門檻為 `max(3, ceil(WEBSITE_USER_COUNT / 100))`。
- 若同一個 `userKey` 已確認過同一標記，API 會拒絕重複確認。
- 輕度垃圾回報建立超過 2 天會在讀取標記時自動轉為 `cleaned`。
- 中度垃圾回報建立超過 3 天會在讀取標記時自動轉為 `cleaned`。
- 重度垃圾不會自動清理，需要多人確認。
