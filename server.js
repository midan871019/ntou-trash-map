const mongoose = require("mongoose");
const app = require("./app");

const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("缺少 MONGODB_URI，請先建立 .env。");
  process.exit(1);
}

mongoose
  .connect(uri)
  .then(() => {
    app.listen(port, () => {
      console.log(`海大海廢社群地圖已啟動：http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB 連線失敗，請確認 MONGODB_URI 與資料庫狀態。");
    console.error(error.message);
    process.exit(1);
  });
