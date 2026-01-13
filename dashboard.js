const API_URL = "http://172.29.19.20:33003";
let trailLayer = null;
let trailLine = null;
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");

  if (!token || !username) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("userInfo").textContent = `Connecté en tant que ${username}`;

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    window.location.href = "index.html";
  });

  setupTabs();

  document.getElementById("refreshTramesBtn").addEventListener("click", async () => {
    await loadTrames();
    await loadLatestBoatsOnMap();
  });

  document.getElementById("refreshBoatsBtn").addEventListener("click", loadBoats);
  document.getElementById("addTrameForm").addEventListener("submit", handleAddTrame);
  document.getElementById("addBoatForm").addEventListener("submit", handleAddBoat);
  loadBoats();
  initMapAndLoad();
});

async function initMapAndLoad() {
  await waitForLeaflet();
  initMap();
  await loadTrames();
  await loadLatestBoatsOnMap();

  setInterval(async () => {
    await loadTrames();
    await loadLatestBoatsOnMap();
  }, 60000);
}

function waitForLeaflet() {
  return new Promise((resolve) => {
    const check = () => {
      if (typeof window.L !== "undefined") return resolve();
      setTimeout(check, 50);
    };
    check();
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(targetId).classList.add("active");
    });
  });
}

async function loadTrames() {
  const tbody = document.getElementById("tramesTableBody");
  tbody.innerHTML = `<tr><td colspan="8">Chargement...</td></tr>`;

  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_URL}/frames?limit=200`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !Array.isArray(data.frames)) {
      const msg = data.message ? escapeHtml(data.message) : `HTTP ${res.status}`;
      tbody.innerHTML = `<tr><td colspan="8">Erreur : ${msg}</td></tr>`;
      return;
    }

    const trames = data.frames;
    updateTrailOnMap(trames);

    if (trames.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">Aucune trame en base pour le moment.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";

    trames.forEach(trame => {
      const lat = trame.latitude ?? "-";
      const lon = trame.longitude ?? "-";
      const dateStr = trame.date || trame.created_at || trame.timestamp;

      const tr = document.createElement("tr");
        tr.innerHTML = `
        <td>${escapeHtml(trame.id)}</td>
        <td>${escapeHtml(trame.boat_name || "-")}</td>
        <td>${escapeHtml(formatDateTime(dateStr))}</td>
        <td>${escapeHtml(lat)}</td>
        <td>${escapeHtml(lon)}</td>
        <td>${escapeHtml(truncate(trame.raw_frame || "", 60))}</td>

        <!--Bouton focus map -->
        <td>
            <button class="btn btn-small" data-action="focus"
                    data-boat="${escapeHtml(trame.boat_name || "")}"
                    data-lat="${lat}"
                    data-lon="${lon}">
            📍
            </button>
        </td>

        <td>
            <button class="btn btn-small" data-action="delete" data-id="${escapeHtml(trame.id)}">
            Supprimer
            </button>
        </td>
        `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-action='delete']").forEach(btn => {
      btn.addEventListener("click", () => deleteTrame(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-action='focus']").forEach(btn => {
    btn.addEventListener("click", async () => {
        const boat = btn.dataset.boat || "";
        const lat = Number(btn.dataset.lat);
        const lon = Number(btn.dataset.lon);
        await focusOnMap(boat, lat, lon);
    });
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8">Erreur lors de la récupération des trames.</td></tr>`;
  }
}

async function handleAddTrame(e) {
  e.preventDefault();

  const boatName = document.getElementById("boatName").value.trim();
  const latitudeStr = document.getElementById("latitude").value.trim();
  const longitudeStr = document.getElementById("longitude").value.trim();
  const rawFrame = document.getElementById("rawFrame").value.trim();
  const msg = document.getElementById("addTrameMessage");
  msg.textContent = "";

  const latitude = Number(latitudeStr);
  const longitude = Number(longitudeStr);

  if (!boatName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    msg.textContent = "Merci de remplir bateau + latitude/longitude (en nombre).";
    msg.style.color = "#dc2626";
    return;
  }

  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_URL}/gps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        boat_name: boatName,
        latitude,
        longitude,
        raw_frame: rawFrame
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    msg.textContent = "Trame enregistrée avec succès.";
    msg.style.color = "#059669";
    e.target.reset();

    await loadTrames();
    await loadLatestBoatsOnMap();

  } catch (err) {
    console.error(err);
    msg.textContent = `Erreur lors de l'enregistrement : ${err.message || err}`;
    msg.style.color = "#dc2626";
  }
}

async function deleteTrame(id) {
  if (!confirm(`Supprimer la trame #${id} ?`)) return;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/gps/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await loadTrames();
    await loadLatestBoatsOnMap();

  } catch (err) {
    console.error(err);
    alert("Suppression impossible (endpoint DELETE /gps/:id non disponible ou erreur serveur).");
  }
}

async function loadBoats() {
  const tbody = document.getElementById("boatsTableBody");
  tbody.innerHTML = `<tr><td colspan="4">Chargement...</td></tr>`;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/boats`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    const data = await res.json().catch(() => ([]));

    if (!res.ok || !Array.isArray(data)) {
      tbody.innerHTML = `<tr><td colspan="4">Erreur lors de la récupération des bateaux.</td></tr>`;
      return;
    }

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4">Aucun bateau enregistré.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    data.forEach(boat => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(boat.id)}</td>
        <td>${escapeHtml(boat.name)}</td>
        <td>${escapeHtml(boat.type || "-")}</td>
        <td>
          <button class="btn btn-small" data-action="delete-boat" data-id="${escapeHtml(boat.id)}">Supprimer</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-action='delete-boat']").forEach(btn => {
      btn.addEventListener("click", () => deleteBoat(btn.dataset.id));
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4">Erreur lors de la récupération des bateaux.</td></tr>`;
  }
}

async function handleAddBoat(e) {
  e.preventDefault();

  const name = document.getElementById("boatLabel").value.trim();
  const type = document.getElementById("boatType").value.trim();
  const msg = document.getElementById("addBoatMessage");
  msg.textContent = "";

  if (!name) {
    msg.textContent = "Merci de renseigner un nom de bateau.";
    msg.style.color = "#dc2626";
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/boats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, type })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);

    msg.textContent = "Bateau ajouté avec succès.";
    msg.style.color = "#059669";
    e.target.reset();
    loadBoats();

  } catch (err) {
    console.error(err);
    msg.textContent = `Erreur lors de l'ajout : ${err.message || err}`;
    msg.style.color = "#dc2626";
  }
}

async function deleteBoat(id) {
  if (!confirm(`Supprimer le bateau #${id} ?`)) return;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/boats/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadBoats();

  } catch (err) {
    console.error(err);
    alert("Erreur lors de la suppression du bateau.");
  }
}

let map;
let markersByBoat = {};

function initMap() {
  const mapDiv = document.getElementById("map");
  map = L.map(mapDiv).setView([46.8, 2.0], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);
}

async function loadLatestBoatsOnMap() {
  if (!map) return;

  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_URL}/boats/latest`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !Array.isArray(data.boats)) return;

    const boats = data.boats;

    const existingNames = new Set(boats.map(b => b.boat_name));
    Object.keys(markersByBoat).forEach(name => {
      if (!existingNames.has(name)) {
        map.removeLayer(markersByBoat[name]);
        delete markersByBoat[name];
      }
    });

    const boundsPoints = [];

    boats.forEach(b => {
      const lat = Number(b.latitude);
      const lng = Number(b.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const boatName = b.boat_name || "Bateau";
      const dateStr = b.date || b.created_at || b.timestamp;

      const popupHtml = `
        <div style="font-size:0.85rem;">
          <strong>${escapeHtml(boatName)}</strong><br>
          ${escapeHtml(formatDateTime(dateStr))}<br>
          Lat : ${lat.toFixed(5)}<br>
          Lng : ${lng.toFixed(5)}
        </div>
      `;

      if (markersByBoat[boatName]) {
        markersByBoat[boatName].setLatLng([lat, lng]).setPopupContent(popupHtml);
      } else {
        markersByBoat[boatName] = L.marker([lat, lng]).addTo(map).bindPopup(popupHtml);
      }

      boundsPoints.push([lat, lng]);
    });

    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [30, 30] });
    }

  } catch (e) {
    console.error("Erreur map:", e);
  }
}

function formatDateTime(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  if (isNaN(d)) return String(dateString);
  return d.toLocaleString("fr-FR");
}

function truncate(str, max) {
  if (!str) return "";
  str = String(str);
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function focusOnMap(boatName, lat, lon) {
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
  await loadLatestBoatsOnMap();
  setTimeout(() => {
    if (!map) return;

    map.invalidateSize(true);

    if (boatName && markersByBoat[boatName]) {
      const m = markersByBoat[boatName];
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 6), { animate: true });
      m.openPopup();
      return;
    }

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.setView([lat, lon], 6, { animate: true });
    }
  }, 300);
}

function updateTrailOnMap(frames) {
  if (!map) return;
  if (!Array.isArray(frames) || frames.length === 0) return;
  const filteredByBoat = frames.filter(f => (f.boat_name || "").toLowerCase() === "endurance");
  const sorted = [...frames].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const points = [];
  for (const f of sorted) {
    const lat = Number(f.latitude);
    const lon = Number(f.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push([lat, lon]);
  }

  if (points.length === 0) return;
  if (trailLayer) map.removeLayer(trailLayer);
  if (trailLine) map.removeLayer(trailLine);
  trailLayer = L.layerGroup();
  points.forEach((p, idx) => {
    const isLast = idx === points.length - 1;
    const marker = L.circleMarker(p, {
      radius: isLast ? 7 : 4,
      weight: 2,
      fillOpacity: 0.8
    });

    marker.bindPopup(`Point #${idx + 1}<br>Lat: ${p[0].toFixed(5)}<br>Lng: ${p[1].toFixed(5)}`);
    marker.addTo(trailLayer);
  });
  trailLayer.addTo(map);
  trailLine = L.polyline(points, { weight: 3, opacity: 0.7 }).addTo(map);
  map.fitBounds(trailLine.getBounds(), { padding: [30, 30] });
}
