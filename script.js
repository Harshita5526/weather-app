// ---------- 1. Elements ----------
const $ = (id) => document.getElementById(id);
const form = $("searchForm"), input = $("cityInput"), unitBtn = $("unitBtn");
const message = $("message"), weatherBox = $("weather"), recentBox = $("recent");

// ---------- 2. State ----------
let unit = localStorage.getItem("unit") || "C";
let lastData = null;   // last API result, so unit change needs no new request
let lastPlace = "";

// ---------- 3. Weather code -> emoji, text, theme ----------
function describe(code, isDay = 1) {
  if (code === 0) return isDay ? ["☀️", "Clear sky", "clear"] : ["🌙", "Clear night", "night"];
  if (code <= 3)  return ["⛅", "Partly cloudy", isDay ? "cloudy" : "night"];
  if (code <= 48) return ["🌫️", "Fog", "cloudy"];
  if (code <= 57) return ["🌦️", "Drizzle", "rain"];
  if (code <= 67) return ["🌧️", "Rain", "rain"];
  if (code <= 77) return ["❄️", "Snow", "snow"];
  if (code <= 82) return ["🌧️", "Showers", "rain"];
  if (code <= 86) return ["🌨️", "Snow showers", "snow"];
  return ["⛈️", "Thunderstorm", "storm"];
}

// ---------- 4. Helpers ----------
const toUnit = (c) => Math.round(unit === "C" ? c : c * 9 / 5 + 32);
const showMsg = (text) => { message.textContent = text; message.hidden = false; };
const clearMsg = () => { message.hidden = true; };
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// ---------- 5. API calls ----------
async function getCoords(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("network");
  const data = await res.json();
  if (!data.results) throw new Error("notfound");
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country || ""}` };
}

async function getWeather(lat, lon) {
  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day" +
    "&hourly=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset" +
    "&timezone=auto&forecast_days=5";
  const res = await fetch(url);
  if (!res.ok) throw new Error("network");
  return res.json();
}

// ---------- 6. Main flow ----------
async function loadCity(city) {
  weatherBox.hidden = true;
  showMsg("Loading weather...");
  message.classList.add("skeleton");
  try {
    const place = await getCoords(city);
    lastData = await getWeather(place.lat, place.lon);
    lastPlace = place.name;
    render();
    saveRecent(place.name.split(",")[0]);
    clearMsg();
  } catch (err) {
    showMsg(err.message === "notfound"
      ? `Couldn't find "${city}". Check the spelling and try again.`
      : "Couldn't reach the weather service. Check your connection and try again.");
  } finally {
    message.classList.remove("skeleton");
  }
}

async function loadCoords(lat, lon) {
  try {
    lastData = await getWeather(lat, lon);
    lastPlace = "Your location";
    render(); clearMsg();
  } catch { showMsg("Couldn't load weather for your location."); }
}

// ---------- 7. Render ----------
function render() {
  const { current, hourly, daily } = lastData;
  const [emoji, text, theme] = describe(current.weather_code, current.is_day);

  document.body.className = theme;
  $("place").textContent = lastPlace;
  $("date").textContent = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  $("icon").textContent = emoji;
  $("temp").textContent = `${toUnit(current.temperature_2m)}°`;
  $("desc").textContent = text;
  $("feels").textContent = `Feels like ${toUnit(current.apparent_temperature)}°`;
  $("humidity").textContent = `${current.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  $("sunrise").textContent = time(daily.sunrise[0]);
  $("sunset").textContent = time(daily.sunset[0]);

  // hourly: next 12 hours starting from the current hour
  const nowIdx = hourly.time.findIndex((t) => t >= current.time.slice(0, 13));
  $("hourly").innerHTML = hourly.time.slice(nowIdx, nowIdx + 12).map((t, i) => {
    const k = nowIdx + i;
    const label = i === 0 ? "Now" : new Date(t).toLocaleTimeString([], { hour: "numeric" });
    return `<div class="hour${i === 0 ? ' now' : ''}"><span>${label}</span><span class="e">${describe(hourly.weather_code[k])[0]}</span><b>${toUnit(hourly.temperature_2m[k])}°</b></div>`;
  }).join("");

  // daily (bar shows each day's range inside the week's range)
  const lo = Math.min(...daily.temperature_2m_min), hi = Math.max(...daily.temperature_2m_max);
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  $("daily").innerHTML = daily.time.map((d, i) => {
    const name = i === 0 ? "Today" : new Date(d).toLocaleDateString([], { weekday: "long" });
    const mn = daily.temperature_2m_min[i], mx = daily.temperature_2m_max[i];
    return `<li class="day"><span>${name}</span><span class="e">${describe(daily.weather_code[i])[0]}</span>
      <span class="lo">${toUnit(mn)}°</span>
      <div class="track"><i style="left:${pos(mn)}%;width:${pos(mx) - pos(mn)}%"></i></div>
      <span class="hi">${toUnit(mx)}°</span></li>`;
  }).join("");

  // sun path: where the sun is between sunrise and sunset
  const sr = new Date(daily.sunrise[0]), ss = new Date(daily.sunset[0]);
  const p = Math.min(1, Math.max(0, (new Date(current.time) - sr) / (ss - sr)));
  $("sunDot").setAttribute("cx", 100 - 90 * Math.cos(Math.PI * p));
  $("sunDot").setAttribute("cy", 95 - 90 * Math.sin(Math.PI * p));
  $("sunDot").style.opacity = current.is_day ? 1 : .35;

  $("tip").textContent = tipFor(current);
  setFx(theme);
  $("intro").hidden = true;
  weatherBox.hidden = false;
}

// ---------- 8. Recent searches (localStorage) ----------
function saveRecent(city) {
  let list = JSON.parse(localStorage.getItem("recent") || "[]");
  list = [city, ...list.filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(0, 5);
  localStorage.setItem("recent", JSON.stringify(list));
  showRecent();
}
function showRecent() {
  const list = JSON.parse(localStorage.getItem("recent") || "[]");
  recentBox.innerHTML = list.map((c) => `<button type="button">${c}</button>`).join("");
}
recentBox.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") loadCity(e.target.textContent);
});

// ---------- 9. Events ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();               // stop page reload; Enter key works because it's a form
  const city = input.value.trim();
  if (city) loadCity(city);
});

unitBtn.addEventListener("click", () => {
  unit = unit === "C" ? "F" : "C";
  localStorage.setItem("unit", unit);
  unitBtn.textContent = `°${unit}`;
  if (lastData) render();           // re-draw with the saved data, no new API call
});

// ---------- Smart tip ----------
function tipFor(c) {
  const code = c.weather_code, t = c.temperature_2m;
  if (code >= 95) return "⚠️ Thunderstorm. Stay indoors if you can";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "☂️ Carry an umbrella today";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🧣 Dress warm, roads may be slippery";
  if (t >= 35) return "🥤 Very hot. Drink water, avoid the midday sun";
  if (t <= 10) return "🧥 Cold outside. Wear a jacket";
  if (c.wind_speed_10m >= 35) return "💨 Windy. Hold on to your hat";
  return c.is_day ? "😎 Good day to go outside" : "🌙 Calm night ahead";
}

// ---------- Live particles (rain, snow, stars, light dust) ----------
const cv = $("fx"), ctx = cv.getContext("2d");
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
let parts = [], mode = "intro";
function setFx(m) {
  mode = m;
  cv.width = innerWidth; cv.height = innerHeight;
  const count = { rain: 140, storm: 220, snow: 110, night: 90, intro: 45, clear: 40, cloudy: 30 }[m] || 30;
  parts = Array.from({ length: count }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: Math.random() }));
}
function tick(t) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  for (const p of parts) {
    if (mode === "rain" || mode === "storm") {
      ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + 12 + p.s * 10); ctx.stroke();
      p.y += 14 + p.s * 10; p.x -= 1.5;
    } else if (mode === "snow") {
      ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + p.s * 2.5, 0, 7); ctx.fill();
      p.y += .6 + p.s * 1.2; p.x += Math.sin(p.y / 40 + p.s * 6) * .5;
    } else if (mode === "night") {
      ctx.globalAlpha = .3 + .6 * Math.abs(Math.sin(t / 700 + p.s * 10)); ctx.beginPath(); ctx.arc(p.x, p.y, .6 + p.s * 1.4, 0, 7); ctx.fill();
    } else {
      ctx.globalAlpha = .13; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.s * 6, 0, 7); ctx.fill();
      p.y -= .2 + p.s * .4;
    }
    if (p.y > cv.height) { p.y = -20; p.x = Math.random() * cv.width; }
    if (p.y < -20) p.y = cv.height + 10;
  }
  requestAnimationFrame(tick);
}
addEventListener("resize", () => setFx(mode));
setFx("intro");
if (!calm) requestAnimationFrame(tick);

// ---------- 10. Start ----------
unitBtn.textContent = `°${unit}`;
showRecent();
if ("geolocation" in navigator) {
  showMsg("Finding your location...");
  navigator.geolocation.getCurrentPosition(
    (pos) => loadCoords(pos.coords.latitude, pos.coords.longitude),
    () => loadCity("Bhopal")        // permission denied -> default city
  );
} else {
  loadCity("Bhopal");
}