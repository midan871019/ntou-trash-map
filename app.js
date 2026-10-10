require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Marker = require("./models/Marker");
const UserProfile = require("./models/UserProfile");

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

function parseBool(value) {
  return String(value || "").toLowerCase() === "true";
}

function uploadedImagePaths(files) {
  return (files || []).map((file) => `/uploads/${file.filename}`);
}

function sanitizeUrl(value) {
  const url = String(value || "").trim().slice(0, 500);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

function sanitizeEmail(value) {
  return String(value || "").trim().slice(0, 160);
}

function sanitizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

const validTrashTypes = new Set([
  "一般塑膠",
  "保麗龍",
  "玻璃金屬",
  "漁網繩索",
  "易燃毒化物質",
  "醫療廢棄物",
  "爆裂物軍火",
  "動物屍體",
  "海龜鯨豚",
  "疑似豬屍",
  "大量魚群死亡或水質污染"
]);

const highRiskTrashTypes = new Set(["易燃毒化物質", "醫療廢棄物", "動物屍體", "大量魚群死亡或水質污染"]);
const extremeRiskTrashTypes = new Set(["爆裂物軍火", "海龜鯨豚", "疑似豬屍"]);

function parseTrashTypes(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => sanitizeText(item, 80)).filter((item) => validTrashTypes.has(item));
}

function calculateRiskLevel(trashTypes) {
  if (trashTypes.some((item) => extremeRiskTrashTypes.has(item))) return "extreme";
  if (trashTypes.some((item) => highRiskTrashTypes.has(item))) return "high";
  return "low";
}

function parseQuantity(value) {
  const quantity = Number(value || 0);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function parseWeightKg(value) {
  const weightKg = Number(value || 0);
  return Number.isFinite(weightKg) ? Math.max(0, weightKg) : 0;
}

function parseCarbonSaved(value) {
  const carbonSaved = Number(value || 0);
  return Number.isFinite(carbonSaved) ? Math.max(0, carbonSaved) : 0;
}

function carbonSavedForTrashTypes(value, trashTypes) {
  return trashTypes.includes("一般塑膠") ? parseCarbonSaved(value) : 0;
}

function sanitizeDisplayName(value) {
  return String(value || "匿名使用者").trim().slice(0, 80) || "匿名使用者";
}

function sanitizeBio(value) {
  return String(value || "").trim().slice(0, 500);
}

function publicUserProfile(profile) {
  if (!profile) return null;
  return {
    userKey: profile.userKey,
    displayName: profile.displayName,
    bio: profile.bio,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

async function ensureUserProfile(userKey, displayName, bio) {
  const trimmedUserKey = String(userKey || "").trim();
  if (!trimmedUserKey) return null;

  const update = {
    $set: {
      lastSeenAt: new Date()
    },
    $setOnInsert: {
      userKey: trimmedUserKey
    }
  };

  if (displayName) {
    update.$set.displayName = sanitizeDisplayName(displayName);
  } else {
    update.$setOnInsert.displayName = "匿名使用者";
  }

  if (bio !== undefined) update.$set.bio = sanitizeBio(bio);
  else update.$setOnInsert.bio = "";

  return UserProfile.findOneAndUpdate({ userKey: trimmedUserKey }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  });
}

async function getCleanThreshold() {
  const websiteUserCount = await UserProfile.countDocuments();
  return Math.max(1, Math.ceil(websiteUserCount / 100));
}

async function markerWithThreshold(marker) {
  return {
    ...marker,
    cleanThreshold: await getCleanThreshold()
  };
}

function canEditMarker(marker, userKey) {
  return marker.creatorUserKey && marker.creatorUserKey === String(userKey || "").trim();
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

async function autoArchiveExpiredEvents() {
  const now = new Date();
  await Marker.updateMany(
    {
      category: { $in: ["activity", "beach-clean"] },
      status: "active",
      endAt: { $ne: null, $lt: now }
    },
    {
      $set: { status: "expired" }
    }
  );
}

function activeMarkerQuery(req) {
  const now = new Date();
  const includeExpired = parseBool(req.query.includeExpired);
  const startDate = parseDate(req.query.startDate);
  const endDate = parseDate(req.query.endDate);
  const query = {};

  if (!includeExpired) {
    query.$or = [
      { category: "trash" },
      { category: { $in: ["activity", "beach-clean"] }, $or: [{ endAt: null }, { endAt: { $gte: now } }] }
    ];
  }

  if (startDate || endDate) {
    query.startAt = {};
    if (startDate) query.startAt.$gte = startDate;
    if (endDate) query.startAt.$lte = endDate;
  }

  return query;
}

async function fetchJsonFromUrl(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "天氣資料暫時無法取得。");
  }
  return data;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get(
  "/api/weather",
  asyncRoute(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "座標格式不正確。" });
    }

    if (!apiKey) {
      return res.status(503).json({ message: "尚未設定 OPENWEATHER_API_KEY，無法取得即時天氣。" });
    }

    const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lng);
    url.searchParams.set("exclude", "minutely,hourly,alerts");
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "zh_tw");
    url.searchParams.set("appid", apiKey);

    const data = await fetchJsonFromUrl(url);
    res.json({
      source: "OpenWeatherMap",
      days: (data.daily || []).slice(0, 4).map((day) => ({
        date: new Date(day.dt * 1000).toISOString(),
        rainProbability: Math.round(Number(day.pop || 0) * 100),
        windSpeed: day.wind_speed || 0,
        summary: day.weather && day.weather[0] ? day.weather[0].description : "無描述",
        tide: "潮汐資料需串接中央氣象署潮汐 API 或另設定潮汐資料源"
      }))
    });
  })
);

app.get(
  "/api/markers",
  asyncRoute(async (req, res) => {
    await autoCleanExpiredTrash();
    await autoArchiveExpiredEvents();
    const threshold = await getCleanThreshold();
    const markers = (await Marker.find(activeMarkerQuery(req)).sort({ createdAt: -1 }).lean()).map((marker) => ({
      ...marker,
      cleanThreshold: threshold
    }));
    res.json(markers);
  })
);

app.get(
  "/api/markers/me",
  asyncRoute(async (req, res) => {
    const userKey = String(req.query.userKey || "").trim();
    if (!userKey) {
      return res.status(400).json({ message: "缺少使用者識別。" });
    }

    await ensureUserProfile(userKey);
    const threshold = await getCleanThreshold();
    const markers = (await Marker.find({ creatorUserKey: userKey }).sort({ createdAt: -1 }).lean()).map((marker) => ({
      ...marker,
      cleanThreshold: threshold
    }));
    res.json(markers);
  })
);

app.get(
  "/api/users/me",
  asyncRoute(async (req, res) => {
    const userKey = String(req.query.userKey || "").trim();
    if (!userKey) {
      return res.status(400).json({ message: "缺少使用者識別。" });
    }

    const profile = await ensureUserProfile(userKey);
    res.json(publicUserProfile(profile));
  })
);

app.put(
  "/api/users/me",
  asyncRoute(async (req, res) => {
    const userKey = String(req.body.userKey || "").trim();
    if (!userKey) {
      return res.status(400).json({ message: "缺少使用者識別。" });
    }

    const profile = await ensureUserProfile(userKey, req.body.displayName, req.body.bio);
    await Marker.updateMany({ creatorUserKey: userKey }, { $set: { creatorName: profile.displayName } });
    res.json(publicUserProfile(profile));
  })
);

app.get(
  "/api/users/:userKey",
  asyncRoute(async (req, res) => {
    const userKey = String(req.params.userKey || "").trim();
    const profile = await UserProfile.findOne({ userKey }).lean();
    if (!profile) {
      return res.status(404).json({ message: "找不到使用者資料。" });
    }
    res.json(publicUserProfile(profile));
  })
);

app.get(
  "/api/markers/:id/participants",
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const userKey = String(req.query.userKey || "").trim();
    const marker = await Marker.findById(req.params.id).lean();
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    if (marker.category !== "beach-clean") {
      return res.status(400).json({ message: "只有淨灘活動有參加者資訊。" });
    }

    if (!canEditMarker(marker, userKey)) {
      return res.status(403).json({ message: "只有發起人可以查看參加者資訊。" });
    }

    const profiles = await UserProfile.find({ userKey: { $in: marker.participants || [] } }).lean();
    const profileMap = new Map(profiles.map((profile) => [profile.userKey, profile]));
    res.json(
      (marker.participants || []).map((participantKey) => {
        const profile = profileMap.get(participantKey);
        return {
          userKey: participantKey,
          displayName: profile ? profile.displayName : "匿名使用者",
          bio: profile ? profile.bio : ""
        };
      })
    );
  })
);

app.post(
  "/api/markers",
  upload.array("images", 6),
  asyncRoute(async (req, res) => {
    const category = String(req.body.category || "").trim();
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const trashLevel = category === "trash" ? String(req.body.trashLevel || "").trim() : null;
    const trashTypes = category === "trash" ? parseTrashTypes(req.body.trashTypes) : [];
    const creatorUserKey = String(req.body.userKey || "").trim();
    const creatorName = sanitizeDisplayName(req.body.displayName);
    const images = uploadedImagePaths(req.files);

    if (!creatorUserKey) {
      return res.status(400).json({ message: "缺少使用者識別，請重新整理後再試。" });
    }

    await ensureUserProfile(creatorUserKey, creatorName);

    const marker = await Marker.create({
      category,
      trashLevel,
      quantity: category === "trash" ? parseQuantity(req.body.quantity) : 0,
      weightKg: category === "trash" ? parseWeightKg(req.body.weightKg) : 0,
      carbonSaved: category === "trash" ? carbonSavedForTrashTypes(req.body.carbonSaved, trashTypes) : 0,
      trashTypes,
      riskLevel: category === "trash" ? calculateRiskLevel(trashTypes) : "low",
      title,
      description,
      lat,
      lng,
      imagePath: images[0] || "",
      imagePaths: images,
      creatorUserKey,
      creatorName,
      startAt: parseDate(req.body.startAt),
      endAt: parseDate(req.body.endAt),
      organizer: sanitizeText(req.body.organizer, 120),
      organizerEmail: sanitizeEmail(req.body.organizerEmail),
      locationName: sanitizeText(req.body.locationName, 160),
      eventUrl: sanitizeUrl(req.body.eventUrl),
      maxParticipants: Math.max(0, Number(req.body.maxParticipants || 0))
    });

    res.status(201).json(marker);
  })
);

app.put(
  "/api/markers/:id",
  upload.array("images", 6),
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const userKey = String(req.body.userKey || "").trim();
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    if (!canEditMarker(marker, userKey)) {
      return res.status(403).json({ message: "只有原發文裝置可以編輯這筆標記。" });
    }

    const category = String(req.body.category || "").trim();
    const trashTypes = category === "trash" ? parseTrashTypes(req.body.trashTypes) : [];
    marker.category = category;
    marker.trashLevel = category === "trash" ? String(req.body.trashLevel || "").trim() : null;
    marker.quantity = category === "trash" ? parseQuantity(req.body.quantity) : 0;
    marker.weightKg = category === "trash" ? parseWeightKg(req.body.weightKg) : 0;
    marker.carbonSaved = category === "trash" ? carbonSavedForTrashTypes(req.body.carbonSaved, trashTypes) : 0;
    marker.trashTypes = trashTypes;
    marker.riskLevel = category === "trash" ? calculateRiskLevel(trashTypes) : "low";
    marker.title = String(req.body.title || "").trim();
    marker.description = String(req.body.description || "").trim();
    marker.creatorName = sanitizeDisplayName(req.body.displayName);
    marker.startAt = parseDate(req.body.startAt);
    marker.endAt = parseDate(req.body.endAt);
    marker.organizer = sanitizeText(req.body.organizer, 120);
    marker.organizerEmail = sanitizeEmail(req.body.organizerEmail);
    marker.locationName = sanitizeText(req.body.locationName, 160);
    marker.eventUrl = sanitizeUrl(req.body.eventUrl);
    marker.maxParticipants = Math.max(0, Number(req.body.maxParticipants || 0));
    const images = uploadedImagePaths(req.files);
    if (images.length) {
      marker.imagePath = images[0];
      marker.imagePaths = images;
    }

    await marker.save();
    res.json(await markerWithThreshold(marker.toObject()));
  })
);

app.post(
  "/api/markers/:id/join",
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const userKey = String(req.body.userKey || "").trim();
    const displayName = sanitizeDisplayName(req.body.displayName);
    if (!userKey) {
      return res.status(400).json({ message: "缺少使用者識別，請重新整理後再試。" });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    if (marker.category !== "beach-clean") {
      return res.status(400).json({ message: "只有淨灘活動可以報名。" });
    }

    if (marker.status === "expired" || (marker.endAt && marker.endAt < new Date())) {
      marker.status = "expired";
      await marker.save();
      return res.status(400).json({ message: "這場活動已結束，無法報名。" });
    }

    await ensureUserProfile(userKey, displayName);
    const index = marker.participants.indexOf(userKey);
    if (index >= 0) {
      marker.participants.splice(index, 1);
    } else {
      if (marker.maxParticipants > 0 && marker.participants.length >= marker.maxParticipants) {
        return res.status(409).json({ message: "報名人數已額滿。" });
      }
      marker.participants.push(userKey);
    }

    await marker.save();
    res.json(await markerWithThreshold(marker.toObject()));
  })
);

app.delete(
  "/api/markers/:id",
  asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "標記 ID 格式不正確。" });
    }

    const userKey = String(req.body.userKey || req.query.userKey || "").trim();
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: "找不到這筆標記。" });
    }

    if (!canEditMarker(marker, userKey)) {
      return res.status(403).json({ message: "只有原發文裝置可以刪除這筆標記。" });
    }

    await marker.deleteOne();
    res.json({ ok: true });
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
        threshold: await getCleanThreshold(),
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

    await ensureUserProfile(userKey, author);
    const threshold = await getCleanThreshold();
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
