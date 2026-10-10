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
const trashLevelColor = {
  light: "#d5a437",
  medium: "#d56d28",
  heavy: "#b23b32"
};

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

const locationChoicePanel = document.querySelector("#locationChoicePanel");
const formPanel = document.querySelector("#formPanel");
const markerForm = document.querySelector("#markerForm");
const formError = document.querySelector("#formError");
const pickedLocation = document.querySelector("#pickedLocation");
const categorySelect = document.querySelector("#category");
const trashLevelField = document.querySelector("#trashLevelField");
const timeFields = document.querySelector("#timeFields");
const eventsList = document.querySelector("#eventsList");
const toast = document.querySelector("#toast");
const showCleanedToggle = document.querySelector("#showCleanedToggle");

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

function popupHtml(marker) {
  const image = marker.imagePath ? `<img src="${escapeHtml(marker.imagePath)}" alt="${escapeHtml(marker.title)}">` : "";
  const level = marker.trashLevel ? ` · ${trashLevelText[marker.trashLevel]}` : "";
  const cleanCount = (marker.cleanConfirmations || []).length;
  const cleanThreshold = marker.cleanThreshold || 3;
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
      <p>${escapeHtml(marker.description)}</p>
      ${image}
      <p class="event-meta">${marker.startAt ? `${formatDate(marker.startAt)} - ${formatDate(marker.endAt)}` : ""}</p>
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
        .bindPopup(popupHtml(marker));
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
          <p class="event-meta">${formatDate(event.startAt)} - ${formatDate(event.endAt)}</p>
          <p>${escapeHtml(event.description)}</p>
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
  markers = await fetchJson("/api/markers");
  drawMarkers();
  renderEvents();
}

function updateFormFields() {
  const category = categorySelect.value;
  trashLevelField.classList.toggle("hidden", category !== "trash");
  timeFields.classList.toggle("hidden", !["activity", "beach-clean"].includes(category));
}

map.on("click", (event) => {
  if (!waitingForManualPick) return;
  setSelectedLocation(event.latlng, "手動選擇位置");
});

document.querySelector("#homeBtn").addEventListener("click", () => map.setView(NTOU, 15));
document.querySelector("#closeFormBtn").addEventListener("click", () => formPanel.classList.add("hidden"));
document.querySelector("#addMarkerBtn").addEventListener("click", () => {
  locationChoicePanel.classList.remove("hidden");
  formPanel.classList.add("hidden");
  waitingForManualPick = false;
});
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
showCleanedToggle.addEventListener("change", () => {
  showCleaned = showCleanedToggle.checked;
  drawMarkers();
});

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
  const image = formData.get("image");

  if (!title) {
    formError.textContent = "標題不可空白。";
    return;
  }

  if (image && image.size) {
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

  try {
    const created = await fetchJson("/api/markers", { method: "POST", body: formData });
    pendingMarkerId = created._id;
    markerForm.reset();
    updateFormFields();
    formPanel.classList.add("hidden");
    selectedLatLng = null;
    showToast("回報已新增。");
    await loadMarkers();
  } catch (error) {
    formError.textContent = error.message;
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
      body: JSON.stringify({ text, author: "訪客" })
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
  formData.append("author", "訪客");

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

updateFormFields();
loadMarkers().catch((error) => showToast(error.message));
