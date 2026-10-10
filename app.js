require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Marker = require("./models/Marker");

const app = express();
const uploadDir = path.join(__dirname, "public", "uploads");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("圖片格式不正確，請上傳圖片檔。"));
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadDir));

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCleanThreshold() {
  const websiteUserCount = Math.max(0, Number(process.env.WEBSITE_USER_COUNT || 0));
  return Math.max(3, Math.ceil(websiteUserCount / 100));
}

async function autoCleanExpiredTrash() {
  const now = new Date();
  const lightExpiresAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const mediumExpiresAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  await Marker.updateMany(
    {
      category: "trash",
      status: "active",
      $or: [
        { trashLevel: "light", createdAt: { $lte: lightExpiresAt } },
        { trashLevel: "medium", createdAt: { $lte: mediumExpiresAt } }
      ]
    },
    {
      $set: {
        status: "cleaned",
        cleanedAt: now,
        cleanedBy: "system-auto"
      }
    }
  );
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get(
  "/api/markers",
  asyncRoute(async (req, res) => {
    await autoCleanExpiredTrash();
    const threshold = getCleanThreshold();
    const markers = (await Marker.find().sort({ createdAt: -1 }).lean()).map((marker) => ({
      ...marker,
      cleanThreshold: threshold
    }));
    res.json(markers);
  })
);

app.post(
  "/api/markers",
  upload.single("image"),
  asyncRoute(async (req, res) => {
    const category = String(req.body.category || "").trim();
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const trashLevel = category === "trash" ? String(req.body.trashLevel || "").trim() : null;

    const marker = await Marker.create({
      category,
      trashLevel,
      title,
      description,
      lat,
      lng,
      imagePath: req.file ? `/uploads/${req.file.filename}` : "",
      startAt: parseDate(req.body.startAt),
      endAt: parseDate(req.body.endAt)
    });

    res.status(201).json(marker);
  })
);

app.post(
  "/api/markers/:id/comments",
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const text = String(req.body.text || "").trim();
    const author = String(req.body.author || "匿名使用者").trim() || "匿名使用者";

    if (!text) {
      return res.status(400).json({ message: "留言內容不可空白。" });
    }

    if (text.length > 500) {
      return res.status(400).json({ message: "留言最多 500 字。" });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    marker.comments.push({ text, author });
    await marker.save();
    res.status(201).json(marker.comments[marker.comments.length - 1]);
  })
);

app.post(
  "/api/markers/:id/confirm-clean",
  upload.single("image"),
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const userKey = String(req.body.userKey || "").trim();
    const author = String(req.body.author || "匿名使用者").trim() || "匿名使用者";
    const note = String(req.body.note || "").trim();

    if (!userKey) {
      return res.status(400).json({ message: "缺少使用者識別，請重新整理後再試。" });
    }

    if (note.length > 500) {
      return res.status(400).json({ message: "清理回報留言最多 500 字。" });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    if (marker.category !== "trash") {
      return res.status(400).json({ message: "只有垃圾回報可以確認清理。" });
    }

    if (marker.status === "cleaned") {
      return res.json({
        marker,
        threshold: getCleanThreshold(),
        confirmationCount: marker.cleanConfirmations.length,
        remaining: 0,
        message: "這筆垃圾回報已在清除區。"
      });
    }

    const hasConfirmed = marker.cleanConfirmations.some((item) => item.userKey === userKey);
    if (hasConfirmed) {
      return res.status(409).json({ message: "你已經確認過這筆清理回報。" });
    }

    marker.cleanConfirmations.push({
      userKey,
      author,
      note,
      imagePath: req.file ? `/uploads/${req.file.filename}` : ""
    });

    const threshold = getCleanThreshold();
    const confirmationCount = marker.cleanConfirmations.length;
    if (confirmationCount >= threshold) {
      marker.status = "cleaned";
      marker.cleanedAt = new Date();
      marker.cleanedBy = author;
    }

    await marker.save();

    res.status(201).json({
      marker,
      threshold,
      confirmationCount,
      remaining: Math.max(0, threshold - confirmationCount),
      message:
        marker.status === "cleaned"
          ? "已達清理確認門檻，標記已移至清除區。"
          : `已收到清理確認，還需要 ${Math.max(0, threshold - confirmationCount)} 人確認。`
    });
  })
);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "圖片不可超過 5MB。" : "圖片上傳失敗。";
    return res.status(400).json({ message });
  }

  if (err.message && err.message.includes("圖片格式")) {
    return res.status(400).json({ message: err.message });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ message: Object.values(err.errors)[0].message });
  }

  console.error(err);
  res.status(500).json({ message: "伺服器暫時無法處理，請稍後再試。" });
});

module.exports = app;
