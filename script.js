const NTOU = [25.1508, 121.7685];
const categoryText = {
  activity: "活動",
  trash: "垃圾",
  "beach-clean": "淨灘"
};
const categoryColor = {
  activity: "#a86510",
  trash: "#b23b32",
  "beach-clean": "#3f7f42"
};
const trashLevelText = {
  light: "輕微",
  medium: "中等",
  heavy: "嚴重"
};
const riskLevelText = {
  low: "一般風險",
  high: "高風險",
  extreme: "極高風險"
};
const trashLevelColor = {
  light: "#d5a437",
  medium: "#d56d28",
  heavy: "#b23b32"
};
const carbonPerBagKg = 2.5;
const highRiskTrashTypes = new Set(["易燃毒化物質", "醫療廢棄物", "動物屍體", "大量魚群死亡或水質污染"]);
const extremeRiskTrashTypes = new Set(["爆裂物軍火", "海龜鯨豚", "疑似豬屍"]);
const hotlineRules = [
  {
    types: ["爆裂物軍火"],
    label: "爆裂物 / 軍火：海巡署 118",
    tel: "118"
  },
  {
    types: ["易燃毒化物質", "醫療廢棄物", "動物屍體", "疑似豬屍"],
    label: "毒化物 / 醫療廢棄物 / 動物屍體 / 疑似豬屍：地方政府 1999",
    tel: "1999"
  },
  {
    types: ["海龜鯨豚"],
    label: "海龜、鯨豚等保育類動物：海巡署 118",
    tel: "118"
  },
  {
    types: ["大量魚群死亡或水質污染"],
    label: "大量魚群死亡或水質污染：環保局 0800-066-666",
    tel: "0800066666"
  }
];

const map = L.map("map").setView(NTOU, 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let markers = [];
let markerLayers = new Map();
let selectedLatLng = null;
let activeFilter = "all";
let pendingMarkerId = null;
let waitingForManualPick = false;
let userLocationLayer = null;
let showCleaned = false;
let showExpired = false;
let editingMarkerId = null;
let currentProfile = null;

const locationChoicePanel = document.querySelector("#locationChoicePanel");
const formPanel = document.querySelector("#formPanel");
const markerForm = document.querySelector("#markerForm");
const formTitle = document.querySelector("#formTitle");
const formError = document.querySelector("#formError");
const pickedLocation = document.querySelector("#pickedLocation");
const displayNameInput = document.querySelector("#displayNameInput");
const categorySelect = document.querySelector("#category");
const trashLevelField = document.querySelector("#trashLevelField");
const trashAdvancedFields = document.querySelector("#trashAdvancedFields");
const quantityInput = document.querySelector("#quantityInput");
const carbonSavedInput = document.querySelector("#carbonSavedInput");
const carbonPreview = document.querySelector("#carbonPreview");
const riskPreview = document.querySelector("#riskPreview");
const timeFields = document.querySelector("#timeFields");
const eventsList = document.querySelector("#eventsList");
const toast = document.querySelector("#toast");
const showCleanedToggle = document.querySelector("#showCleanedToggle");
const showExpiredToggle = document.querySelector("#showExpiredToggle");
const rangeStartInput = document.querySelector("#rangeStartInput");
const rangeEndInput = document.querySelector("#rangeEndInput");
const profilePanel = document.querySelector("#profilePanel");
const profileForm = document.querySelector("#profileForm");
const myMarkersList = document.querySelector("#myMarkersList");
const detailPanel = document.querySelector("#detailPanel");
const detailTitle = document.querySelector("#detailTitle");
const detailBody = document.querySelector("#detailBody");

function getUserKey() {
  const storageKey = "ntouTrashMapUserKey";
  let userKey = localStorage.getItem(storageKey);
  if (!userKey) {
    userKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(storageKey, userKey);
  }
  return userKey;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "未設定時間";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function markerImages(marker) {
  const images = Array.isArray(marker.imagePaths) && marker.imagePaths.length ? marker.imagePaths : [];
  if (!images.length && marker.imagePath) images.push(marker.imagePath);
  return images;
}

function selectedTrashTypes() {
  return [...markerForm.querySelectorAll('input[name="trashTypes"]:checked')].map((input) => input.value);
}

function calculateCarbonSaved(quantity) {
  return Math.round(Math.max(0, Number(quantity || 0)) * carbonPerBagKg * 10) / 10;
}

function calculateRiskLevel(trashTypes) {
  if (trashTypes.some((type) => extremeRiskTrashTypes.has(type))) return "extreme";
  if (trashTypes.some((type) => highRiskTrashTypes.has(type))) return "high";
  return "low";
}

function hotlineLinks(trashTypes) {
  return hotlineRules
    .filter((rule) => rule.types.some((type) => trashTypes.includes(type)))
    .map((rule) => `<a class="hotline-btn" href="tel:${rule.tel}">${escapeHtml(rule.label)}</a>`)
    .join("");
}

function riskAlertHtml(trashTypes, riskLevel) {
  if (!trashTypes.length || riskLevel === "low") return "";
  return `
    <div class="risk-alert ${riskLevel === "extreme" ? "extreme" : ""}">
      <strong>${riskLevelText[riskLevel]}安全警示</strong>
      <p>核心應變 4 步驟：1. 發現、2. 觀察、3. 判斷、4. 處置。切勿盲目觸碰、搬移或自行清除。</p>
      <div class="hotline-list">${hotlineLinks(trashTypes)}</div>
    </div>
  `;
}

function updateTrashAdvancedPreview() {
  const quantity = Math.max(0, Number(quantityInput.value || 0));
  const carbonSaved = calculateCarbonSaved(quantity);
  const trashTypes = selectedTrashTypes();
  const riskLevel = calculateRiskLevel(trashTypes);
  carbonSavedInput.value = carbonSaved;
  carbonPreview.textContent = `預估碳減量：${carbonSaved} kg CO2e`;
  riskPreview.innerHTML = riskAlertHtml(trashTypes, riskLevel);
  riskPreview.classList.toggle("hidden", !riskPreview.innerHTML);
}

function setTrashTypeChecks(values) {
  const selected = new Set(values || []);
  markerForm.querySelectorAll('input[name="trashTypes"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
  updateTrashAdvancedPreview();
}

function isBeachClean(marker) {
  return marker.category === "beach-clean";
}

function participantCount(marker) {
  return (marker.participants || []).length;
}

function participantLimit(marker) {
  return Number(marker.maxParticipants || 0);
}

function isJoined(marker) {
  return (marker.participants || []).includes(getUserKey());
}

function participantText(marker) {
  const count = participantCount(marker);
  const limit = participantLimit(marker);
  return limit > 0 ? `${count} / ${limit}` : `${count} 人已報名`;
}

function progressPercent(marker) {
  const limit = participantLimit(marker);
  if (limit <= 0) return participantCount(marker) > 0 ? 100 : 0;
  return Math.min(100, Math.round((participantCount(marker) / limit) * 100));
}

function eventMetaHtml(marker) {
  if (!["activity", "beach-clean"].includes(marker.category)) return "";
  const organizer = marker.organizer ? `<p class="event-meta">主辦：${escapeHtml(marker.organizer)}</p>` : "";
  const email = marker.organizerEmail ? `<p class="event-meta">信箱：${escapeHtml(marker.organizerEmail)}</p>` : "";
  const location = marker.locationName ? `<p class="event-meta">地點：${escapeHtml(marker.locationName)}</p>` : "";
  const url = marker.eventUrl ? `<p class="event-meta"><a href="${escapeHtml(marker.eventUrl)}" target="_blank" rel="noopener">活動 / 報名網址</a></p>` : "";
  const time = marker.startAt ? `<p class="event-meta">${formatDate(marker.startAt)} - ${formatDate(marker.endAt)}</p>` : "";
  return `${organizer}${email}${location}${url}${time}`;
}

function joinStatusHtml(marker) {
  if (!isBeachClean(marker)) return "";
  const full = participantLimit(marker) > 0 && participantCount(marker) >= participantLimit(marker);
  const disabled = marker.status === "expired" || (full && !isJoined(marker)) ? "disabled" : "";
  const buttonText = isJoined(marker) ? "取消報名" : "我要報名";
  return `
    <div class="join-box">
      <div class="join-row">
        <strong>報名人數</strong>
        <span>${participantText(marker)}</span>
      </div>
      <div class="progress"><span style="width:${progressPercent(marker)}%"></span></div>
      <button type="button" class="join-marker-btn" data-id="${marker._id}" ${disabled}>${buttonText}</button>
    </div>
  `;
}

function shortText(value, maxLength = 90) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 2600);
}

function setSelectedLocation(latlng, source) {
  selectedLatLng = latlng;
  pickedLocation.textContent = `${source}：${selectedLatLng.lat.toFixed(6)}, ${selectedLatLng.lng.toFixed(6)}`;
  formPanel.classList.remove("hidden");
  locationChoicePanel.classList.add("hidden");
  waitingForManualPick = false;
  formError.textContent = "";
}

function locateUser({ openForm }) {
  if (!navigator.geolocation) {
    showToast("這個瀏覽器不支援 GPS 定位。");
    return;
  }

  showToast("正在取得目前位置...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      map.flyTo([latlng.lat, latlng.lng], 16);

      if (userLocationLayer) {
        userLocationLayer.setLatLng(latlng);
      } else {
        userLocationLayer = L.circleMarker(latlng, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#106c8f",
          fillOpacity: 0.9
        })
          .addTo(map)
          .bindPopup("我的位置");
      }

      userLocationLayer.openPopup();
      showToast("已定位到目前位置。");

      if (openForm) {
        setSelectedLocation(latlng, "使用 GPS 位置");
      }
    },
    (error) => {
      const locationErrorMessage = {
        1: "定位權限被拒絕，請到瀏覽器設定允許定位。",
        2: "目前無法取得定位，請確認裝置定位、網路或 GPS 訊號。",
        3: "定位逾時，請移到訊號較好的地方後再試一次。"
      };
      showToast(locationErrorMessage[error.code] || "無法取得定位，請稍後再試。");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

function markerIcon(marker) {
  if (marker.status === "cleaned") {
    return L.divIcon({
      className: "custom-marker cleaned-marker",
      html: '<span class="cleaned-icon">✓</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  const color = marker.category === "trash" ? trashLevelColor[marker.trashLevel] || categoryColor.trash : categoryColor[marker.category];
  return L.divIcon({
    className: "custom-marker",
    html: `<span style="background:${color};width:18px;height:18px;border:3px solid #fff;border-radius:50%;display:block;box-shadow:0 2px 8px rgba(0,0,0,.35)"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "操作失敗，請稍後再試。");
  }
  return data;
}

async function loadProfile() {
  currentProfile = await fetchJson(`/api/users/me?userKey=${encodeURIComponent(getUserKey())}`);
  profileForm.elements.displayName.value = currentProfile.displayName || "";
  profileForm.elements.bio.value = currentProfile.bio || "";
  displayNameInput.value = currentProfile.displayName || "";
  return currentProfile;
}

async function loadMyMarkers() {
  const myMarkers = await fetchJson(`/api/markers/me?userKey=${encodeURIComponent(getUserKey())}`);
  if (!myMarkers.length) {
    myMarkersList.innerHTML = '<p class="hint">目前還沒有你發布的貼文。</p>';
    return;
  }

  myMarkersList.innerHTML = myMarkers
    .map(
      (marker) => `
        <article class="event-item">
          <button type="button" class="event-focus" data-id="${marker._id}">${escapeHtml(marker.title)}</button>
          <p class="event-meta">${categoryText[marker.category]} · ${formatDate(marker.createdAt)}</p>
          <p>${escapeHtml(marker.description)}</p>
          <div class="profile-actions">
            <button type="button" class="edit-marker-btn" data-id="${marker._id}">編輯</button>
            <button type="button" class="delete-marker-btn danger" data-id="${marker._id}">刪除</button>
          </div>
        </article>
      `
    )
    .join("");
}

function resetMarkerForm() {
  editingMarkerId = null;
  markerForm.reset();
  displayNameInput.value = (currentProfile && currentProfile.displayName) || "";
  formTitle.textContent = "新增回報";
  markerForm.querySelector('button[type="submit"]').textContent = "送出回報";
  pickedLocation.textContent = "請先點擊地圖選擇位置。";
  selectedLatLng = null;
  formError.textContent = "";
  updateFormFields();
}

function startEditingMarker(marker) {
  editingMarkerId = marker._id;
  selectedLatLng = L.latLng(marker.lat, marker.lng);
  formTitle.textContent = "編輯回報";
  markerForm.querySelector('button[type="submit"]').textContent = "儲存修改";
  pickedLocation.textContent = `原標記位置：${marker.lat.toFixed(6)}, ${marker.lng.toFixed(6)}`;
  markerForm.elements.category.value = marker.category;
  markerForm.elements.trashLevel.value = marker.trashLevel || "light";
  markerForm.elements.quantity.value = marker.quantity || "";
  markerForm.elements.carbonSaved.value = marker.carbonSaved || 0;
  setTrashTypeChecks(marker.trashTypes || []);
  markerForm.elements.displayName.value = marker.creatorName || (currentProfile && currentProfile.displayName) || "";
  markerForm.elements.title.value = marker.title || "";
  markerForm.elements.description.value = marker.description || "";
  markerForm.elements.organizer.value = marker.organizer || "";
  markerForm.elements.organizerEmail.value = marker.organizerEmail || "";
  markerForm.elements.locationName.value = marker.locationName || "";
  markerForm.elements.eventUrl.value = marker.eventUrl || "";
  markerForm.elements.maxParticipants.value = marker.maxParticipants || "";
  markerForm.elements.startAt.value = formatDateForInput(marker.startAt);
  markerForm.elements.endAt.value = formatDateForInput(marker.endAt);
  markerForm.elements.images.value = "";
  updateFormFields();
  formPanel.classList.remove("hidden");
  locationChoicePanel.classList.add("hidden");
  profilePanel.classList.add("hidden");
}

function detailHtml(marker) {
  const images = markerImages(marker)
    .map((imagePath) => `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(marker.title)}">`)
    .join("");
  const comments = (marker.comments || [])
    .map((comment) => `<div>${escapeHtml(comment.text)}<br><small>${escapeHtml(comment.author)} · ${formatDate(comment.createdAt)}</small></div>`)
    .join("");
  return `
    <div class="detail-scroll">
      <span class="badge" style="background:${categoryColor[marker.category]}">${categoryText[marker.category]}</span>
      ${eventMetaHtml(marker)}
      ${trashMetaHtml(marker)}
      ${riskAlertHtml(marker.trashTypes || [], marker.riskLevel || "low")}
      ${joinStatusHtml(marker)}
      <p class="detail-description">${escapeHtml(marker.description)}</p>
      <div class="image-grid">${images}</div>
      <div class="comments">${comments || "尚無留言"}</div>
      <form class="comment-form" data-id="${marker._id}">
        <input name="text" maxlength="500" placeholder="新增留言" required>
        <button type="submit">留言</button>
      </form>
    </div>
  `;
}

function showDetail(marker) {
  detailTitle.textContent = marker.title || "完整內容";
  detailBody.innerHTML = detailHtml(marker);
  detailPanel.classList.remove("hidden");
}

async function showPublicProfile(userKey) {
  try {
    const profile = await fetchJson(`/api/users/${encodeURIComponent(userKey)}`);
    showToast(`${profile.displayName || "匿名使用者"}：${profile.bio || "尚未填寫個人敘述。"}`);
  } catch (error) {
    showToast(error.message);
  }
}

function popupHtml(marker) {
  const image = markerImages(marker)[0] ? `<img src="${escapeHtml(markerImages(marker)[0])}" alt="${escapeHtml(marker.title)}">` : "";
  const level = marker.trashLevel ? ` · ${trashLevelText[marker.trashLevel]}` : "";
  const cleanCount = (marker.cleanConfirmations || []).length;
  const cleanThreshold = marker.cleanThreshold || 1;
  const isOwner = marker.creatorUserKey && marker.creatorUserKey === getUserKey();
  const creator = marker.creatorUserKey
    ? `<button type="button" class="user-link" data-user-key="${escapeHtml(marker.creatorUserKey)}">${escapeHtml(marker.creatorName || "匿名使用者")}</button>`
    : "舊資料";
  const ownerActions = isOwner
    ? `
      <div class="marker-actions">
        <button type="button" class="edit-marker-btn" data-id="${marker._id}">編輯</button>
        <button type="button" class="delete-marker-btn danger" data-id="${marker._id}">刪除</button>
      </div>
    `
    : "";
  const latestCleanImage = [...(marker.cleanConfirmations || [])].reverse().find((item) => item.imagePath);
  const cleanedInfo =
    marker.status === "cleaned"
      ? `
        <p class="event-meta">已清理：${formatDate(marker.cleanedAt)}</p>
        ${latestCleanImage ? `<img src="${escapeHtml(latestCleanImage.imagePath)}" alt="清理後照片">` : ""}
      `
      : "";
  const cleanForm =
    marker.category === "trash" && marker.status !== "cleaned"
      ? `
        <form class="clean-form" data-id="${marker._id}">
          <strong>回報已清除</strong>
          <span class="event-meta">目前 ${cleanCount} 人確認，至少需要 ${cleanThreshold} 人。</span>
          <input name="note" maxlength="500" placeholder="清理說明或現場狀況">
          <input name="image" type="file" accept="image/*">
          <button type="submit">送出清理確認</button>
        </form>
      `
      : "";
  const comments = (marker.comments || [])
    .map((comment) => `<div>「${escapeHtml(comment.text)}」<br><small>${escapeHtml(comment.author)} · ${formatDate(comment.createdAt)}</small></div>`)
    .join("");

  return `
    <div class="marker-popup">
      <span class="badge" style="background:${categoryColor[marker.category]}">${categoryText[marker.category]}${level}</span>
      <h3>${escapeHtml(marker.title)}</h3>
      <p class="event-meta">發布者：${creator} · ${formatDate(marker.createdAt)}</p>
      ${eventMetaHtml(marker)}
      ${trashMetaHtml(marker)}
      ${riskAlertHtml(marker.trashTypes || [], marker.riskLevel || "low")}
      <p class="clamped-text">${escapeHtml(shortText(marker.description))}</p>
      ${image}
      ${joinStatusHtml(marker)}
      <button type="button" class="detail-btn" data-id="${marker._id}">完整敘述</button>
      ${ownerActions}
      ${cleanedInfo}
      <div class="comments">${comments || "尚無留言"}</div>
      <form class="comment-form" data-id="${marker._id}">
        <input name="text" maxlength="500" placeholder="新增留言" required>
        <button type="submit">留言</button>
      </form>
      ${cleanForm}
    </div>
  `;
}

function trashMetaHtml(marker) {
  if (marker.category !== "trash") return "";
  const types = (marker.trashTypes || []).map((type) => `<span>${escapeHtml(type)}</span>`).join("");
  return `
    <div class="trash-meta">
      <p>預估數量：${Number(marker.quantity || 0)} 袋 / 件</p>
      <p>預估碳減量：${Number(marker.carbonSaved || 0)} kg CO2e</p>
      <p>風險等級：${riskLevelText[marker.riskLevel || "low"]}</p>
      ${types ? `<div class="trash-tags">${types}</div>` : ""}
    </div>
  `;
}

function drawMarkers() {
  markerLayers.forEach((layer) => map.removeLayer(layer));
  markerLayers = new Map();

  markers
    .filter((marker) => {
      if (marker.status === "cleaned" && !showCleaned) return false;
      if (marker.status !== "cleaned" && activeFilter === "cleaned") return false;
      return activeFilter === "all" || marker.category === activeFilter;
    })
    .forEach((marker) => {
      const layer = L.marker([marker.lat, marker.lng], { icon: markerIcon(marker) })
        .addTo(map)
        .bindPopup(popupHtml(marker), {
          maxWidth: 340,
          autoPan: true,
          keepInView: true
        });
      markerLayers.set(marker._id, layer);
    });

  if (pendingMarkerId && markerLayers.has(pendingMarkerId)) {
    const layer = markerLayers.get(pendingMarkerId);
    map.setView(layer.getLatLng(), 17);
    layer.openPopup();
    pendingMarkerId = null;
  }
}

function renderEvents() {
  const events = markers
    .filter((marker) => marker.category === "beach-clean")
    .sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));

  if (!events.length) {
    eventsList.innerHTML = '<p class="hint">目前還沒有淨灘活動。</p>';
    return;
  }

  eventsList.innerHTML = events
    .map(
      (event) => `
        <article class="event-item">
          <button type="button" class="event-focus" data-id="${event._id}">${escapeHtml(event.title)}</button>
          ${eventMetaHtml(event)}
          ${joinStatusHtml(event)}
          <p class="clamped-text">${escapeHtml(shortText(event.description, 120))}</p>
          <button type="button" class="detail-btn" data-id="${event._id}">完整敘述</button>
          <div class="comments">${(event.comments || []).map((comment) => `<div>${escapeHtml(comment.text)}<br><small>${escapeHtml(comment.author)} · ${formatDate(comment.createdAt)}</small></div>`).join("") || "尚無留言"}</div>
          <form class="comment-form" data-id="${event._id}">
            <input name="text" maxlength="500" placeholder="幫活動留言" required>
            <button type="submit">送出</button>
          </form>
        </article>
      `
    )
    .join("");
}

async function loadMarkers() {
  const params = new URLSearchParams();
  if (showExpired) params.set("includeExpired", "true");
  if (rangeStartInput.value) params.set("startDate", rangeStartInput.value);
  if (rangeEndInput.value) params.set("endDate", rangeEndInput.value);
  const query = params.toString();
  markers = await fetchJson(`/api/markers${query ? `?${query}` : ""}`);
  drawMarkers();
  renderEvents();
}

function updateFormFields() {
  const category = categorySelect.value;
  trashLevelField.classList.toggle("hidden", category !== "trash");
  trashAdvancedFields.classList.toggle("hidden", category !== "trash");
  timeFields.classList.toggle("hidden", !["activity", "beach-clean"].includes(category));
  document.querySelector("#maxParticipantsField").classList.toggle("hidden", category !== "beach-clean");
  updateTrashAdvancedPreview();
}

map.on("click", (event) => {
  if (!waitingForManualPick) return;
  setSelectedLocation(event.latlng, "手動選擇位置");
});

document.querySelector("#homeBtn").addEventListener("click", () => map.setView(NTOU, 15));
document.querySelector("#closeFormBtn").addEventListener("click", () => {
  formPanel.classList.add("hidden");
  resetMarkerForm();
});
document.querySelector("#addMarkerBtn").addEventListener("click", () => {
  resetMarkerForm();
  locationChoicePanel.classList.remove("hidden");
  formPanel.classList.add("hidden");
  profilePanel.classList.add("hidden");
  waitingForManualPick = false;
});
document.querySelector("#profileBtn").addEventListener("click", async () => {
  try {
    await loadProfile();
    await loadMyMarkers();
    profilePanel.classList.remove("hidden");
    formPanel.classList.add("hidden");
    locationChoicePanel.classList.add("hidden");
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelector("#closeProfileBtn").addEventListener("click", () => profilePanel.classList.add("hidden"));
document.querySelector("#myLocationBtn").addEventListener("click", () => locateUser({ openForm: false }));
document.querySelector("#useGpsBtn").addEventListener("click", () => locateUser({ openForm: true }));
document.querySelector("#manualPickBtn").addEventListener("click", () => {
  waitingForManualPick = true;
  locationChoicePanel.classList.add("hidden");
  formPanel.classList.add("hidden");
  showToast("請在地圖上點選標記位置。");
});
document.querySelector("#closeChoiceBtn").addEventListener("click", () => {
  waitingForManualPick = false;
  locationChoicePanel.classList.add("hidden");
});
categorySelect.addEventListener("change", updateFormFields);
quantityInput.addEventListener("input", updateTrashAdvancedPreview);
markerForm.querySelectorAll('input[name="trashTypes"]').forEach((input) => {
  input.addEventListener("change", updateTrashAdvancedPreview);
});
showCleanedToggle.addEventListener("change", () => {
  showCleaned = showCleanedToggle.checked;
  drawMarkers();
});
showExpiredToggle.addEventListener("change", async () => {
  showExpired = showExpiredToggle.checked;
  await loadMarkers();
});
rangeStartInput.addEventListener("change", () => loadMarkers().catch((error) => showToast(error.message)));
rangeEndInput.addEventListener("change", () => loadMarkers().catch((error) => showToast(error.message)));
document.querySelector("#closeDetailBtn").addEventListener("click", () => detailPanel.classList.add("hidden"));

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    drawMarkers();
  });
});

markerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  if (!selectedLatLng) {
    formError.textContent = "請先按「新增標記」並選擇 GPS 或手動位置。";
    return;
  }

  const formData = new FormData(markerForm);
  const title = String(formData.get("title") || "").trim();
  const images = formData.getAll("images").filter((file) => file && file.size);

  if (!title) {
    formError.textContent = "標題不可空白。";
    return;
  }

  for (const image of images) {
    if (!image.type.startsWith("image/")) {
      formError.textContent = "請上傳圖片檔。";
      return;
    }
    if (image.size > 5 * 1024 * 1024) {
      formError.textContent = "圖片不可超過 5MB。";
      return;
    }
  }

  formData.append("lat", selectedLatLng.lat);
  formData.append("lng", selectedLatLng.lng);
  formData.append("userKey", getUserKey());
  formData.set("carbonSaved", calculateCarbonSaved(formData.get("quantity")));

  const displayName = String(formData.get("displayName") || "").trim() || "匿名使用者";
  formData.set("displayName", displayName);

  try {
    const url = editingMarkerId ? `/api/markers/${editingMarkerId}` : "/api/markers";
    const wasEditing = Boolean(editingMarkerId);
    const created = await fetchJson(url, { method: editingMarkerId ? "PUT" : "POST", body: formData });
    pendingMarkerId = created._id;
    currentProfile = await fetchJson("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userKey: getUserKey(),
        displayName,
        bio: (currentProfile && currentProfile.bio) || ""
      })
    });
    resetMarkerForm();
    formPanel.classList.add("hidden");
    showToast(wasEditing ? "回報已更新。" : "回報已新增。");
    await loadMarkers();
    if (!profilePanel.classList.contains("hidden")) await loadMyMarkers();
  } catch (error) {
    formError.textContent = error.message;
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    currentProfile = await fetchJson("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userKey: getUserKey(),
        displayName: profileForm.elements.displayName.value,
        bio: profileForm.elements.bio.value
      })
    });
    displayNameInput.value = currentProfile.displayName || "";
    showToast("個人資料已儲存。");
    await loadMyMarkers();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches(".comment-form")) return;
  event.preventDefault();

  const id = event.target.dataset.id;
  const input = event.target.elements.text;
  const text = input.value.trim();
  if (!text) {
    showToast("留言不可空白。");
    return;
  }

  try {
    await fetchJson(`/api/markers/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author: (currentProfile && currentProfile.displayName) || "訪客" })
    });
    input.value = "";
    showToast("留言已送出。");
    await loadMarkers();
    if (markerLayers.has(id)) markerLayers.get(id).openPopup();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches(".clean-form")) return;
  event.preventDefault();

  const formData = new FormData(event.target);
  const image = formData.get("image");
  if (image && image.size) {
    if (!image.type.startsWith("image/")) {
      showToast("請上傳圖片檔。");
      return;
    }
    if (image.size > 5 * 1024 * 1024) {
      showToast("圖片不可超過 5MB。");
      return;
    }
  }

  formData.append("userKey", getUserKey());
  formData.append("author", (currentProfile && currentProfile.displayName) || "訪客");

  try {
    const result = await fetchJson(`/api/markers/${event.target.dataset.id}/confirm-clean`, {
      method: "POST",
      body: formData
    });
    showToast(result.message);
    await loadMarkers();
    const markerId = result.marker && result.marker._id;
    if (markerId && markerLayers.has(markerId)) markerLayers.get(markerId).openPopup();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".event-focus")) return;
  const marker = markers.find((item) => item._id === event.target.dataset.id);
  if (!marker) return;
  map.setView([marker.lat, marker.lng], 17);
  if (markerLayers.has(marker._id)) markerLayers.get(marker._id).openPopup();
});

document.addEventListener("click", async (event) => {
  if (!event.target.matches(".join-marker-btn")) return;
  const id = event.target.dataset.id;
  try {
    const updated = await fetchJson(`/api/markers/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userKey: getUserKey(),
        displayName: (currentProfile && currentProfile.displayName) || "訪客"
      })
    });
    const index = markers.findIndex((item) => item._id === updated._id);
    if (index >= 0) markers[index] = updated;
    showToast(isJoined(updated) ? "報名成功。" : "已取消報名。");
    drawMarkers();
    renderEvents();
    if (!detailPanel.classList.contains("hidden")) showDetail(updated);
    if (markerLayers.has(id)) markerLayers.get(id).openPopup();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".detail-btn")) return;
  const marker = markers.find((item) => item._id === event.target.dataset.id);
  if (marker) showDetail(marker);
});

document.addEventListener("click", async (event) => {
  if (!event.target.matches(".edit-marker-btn")) return;
  const marker = markers.find((item) => item._id === event.target.dataset.id);
  if (!marker) return;
  startEditingMarker(marker);
});

document.addEventListener("click", async (event) => {
  if (!event.target.matches(".delete-marker-btn")) return;
  const marker = markers.find((item) => item._id === event.target.dataset.id);
  if (!marker) return;

  if (!window.confirm(`確定要刪除「${marker.title}」嗎？`)) return;

  try {
    await fetchJson(`/api/markers/${marker._id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userKey: getUserKey() })
    });
    showToast("貼文已刪除。");
    await loadMarkers();
    if (!profilePanel.classList.contains("hidden")) await loadMyMarkers();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".user-link")) return;
  showPublicProfile(event.target.dataset.userKey);
});

updateFormFields();
loadProfile()
  .catch(() => null)
  .finally(() => loadMarkers().catch((error) => showToast(error.message)));
