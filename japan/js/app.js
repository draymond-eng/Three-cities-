/* =============================================================================
   Japan 2027 — app logic. Vanilla JS, no build step. State saved on-device
   via localStorage (per phone). Renders every screen from window.TRIP.
   ========================================================================== */
(function () {
  "use strict";
  const T = window.TRIP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (id) => T.travelers.find((t) => t.id === id);
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  /* ---- Local persistence ------------------------------------------------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("jp27_" + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("jp27_" + k, JSON.stringify(v)); } catch {} },
  };
  const state = {
    me: LS.get("me", null),
    packing: LS.get("packing", {}),
    decisions: LS.get("decisions", {}), // {decisionId: optionId}
    ideas: LS.get("ideas", {}),         // {ideaId: true}
    expenses: LS.get("expenses", []),
    cityFilter: "all",
  };
  const save = () => {
    LS.set("me", state.me); LS.set("packing", state.packing);
    LS.set("decisions", state.decisions); LS.set("ideas", state.ideas);
    LS.set("expenses", state.expenses);
  };

  /* ---- Type metadata ----------------------------------------------------- */
  const TYPE = {
    travel:   { emoji: "🚆", color: "#c99a2e", label: "Travel" },
    sight:    { emoji: "⛩️", color: "#2f5680", label: "Sight" },
    food:     { emoji: "🍜", color: "#e4573d", label: "Food" },
    activity: { emoji: "🎏", color: "#7a8c5a", label: "Activity" },
    rest:     { emoji: "♨️", color: "#e79fb0", label: "Rest" },
    meet:     { emoji: "📍", color: "#e4573d", label: "Meetup" },
  };
  const cityName = (id) => (T.cities.find((c) => c.id === id) || { name: id }).name;
  const fmtDate = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return { day: d.getDate(), mon: d.toLocaleString("en-US", { month: "short" }),
             wd: d.toLocaleString("en-US", { weekday: "short" }) };
  };

  /* =======================================================================
     NAVIGATION
     ==================================================================== */
  function show(screen) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = $("#screen-" + screen);
    if (el) el.classList.add("active");
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.screen === screen));
    // Keep "More" tab highlighted when a sheet screen is active
    const primary = ["home", "itinerary", "map", "crew"];
    if (!primary.includes(screen)) $("#moreTab").classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    closeSheet();
    if (screen === "map") initMap();
  }
  $$(".tab[data-screen]").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));
  $$(".sheet-item").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));

  const openSheet = () => { $("#moreSheet").classList.add("open"); $("#sheetBackdrop").classList.add("open"); };
  const closeSheet = () => { $("#moreSheet").classList.remove("open"); $("#sheetBackdrop").classList.remove("open"); };
  $("#moreTab").addEventListener("click", openSheet);
  $("#sheetBackdrop").addEventListener("click", closeSheet);

  /* =======================================================================
     HOME
     ==================================================================== */
  function renderHome() {
    const s = $("#screen-home");
    const openDecisions = T.decisions.filter((d) => d.status !== "decided").length;
    s.innerHTML = `
      <div class="hero">
        <div class="sun"></div>
        <div class="kicker">${esc(T.meta.tagline)}</div>
        <h1>${esc(T.meta.title)}</h1>
        <div class="dates">Thu Apr 15 – Sun Apr 25, 2027 · ${T.meta.nights} nights</div>
        <div class="cities-row">
          ${T.cities.map((c) => `<span class="city-chip">${c.emoji} ${esc(c.name)}</span>`).join("")}
        </div>
      </div>

      ${T.meta.draft ? `<div class="card" style="border-color:var(--sakura-deep);background:#fdf3f5">
        <span class="pill draft">Proposed baseline</span>
        <p style="margin:10px 0 0;font-size:13.5px;color:var(--ink-soft)">
          Nothing's locked — this is a starting point for the group to react to.
          Weigh in on the <b>${openDecisions} open decision${openDecisions === 1 ? "" : "s"}</b> before we meet about the itinerary.
        </p>
        <button class="btn primary" style="margin-top:12px;width:100%" data-go="decisions">🗳️ Cast your votes</button>
      </div>` : ""}

      <div class="countdown" id="countdown"></div>

      <div class="clocks" id="clocks"></div>

      <div class="section-title" style="margin-top:20px">The crew</div>
      <div class="card">
        <div class="crew-strip">
          ${T.travelers.map((t, i) => `<div class="avatar stack" style="background:${t.color}" title="${esc(t.name)}">${initials(t.name)}</div>`).join("")}
        </div>
        <p style="margin:12px 0 0;font-size:13px;color:var(--ink-soft)">
          6 travelers · 3 couples · ${T.meta.estGroup ? "≈ $" + T.meta.estGroup.toLocaleString() + " group / $" + T.meta.estPerPerson.toLocaleString() + " per person" : ""}
        </p>
      </div>

      <div class="section-title">At a glance</div>
      <div class="quick-grid">
        <button class="quick-tile" data-go="itinerary"><div class="qi">🗓️</div><div class="qt">Itinerary</div><div class="qs">11 days, day-by-day</div></button>
        <button class="quick-tile" data-go="map"><div class="qi">🗺️</div><div class="qt">Map</div><div class="qs">Every stop pinned</div></button>
        <button class="quick-tile" data-go="stays"><div class="qi">🏨</div><div class="qt">Stays</div><div class="qs">3 ryokans + rooms</div></button>
        <button class="quick-tile" data-go="budget"><div class="qi">💰</div><div class="qt">Budget</div><div class="qs">Split & settle up</div></button>
        <button class="quick-tile" data-go="packing"><div class="qi">🧳</div><div class="qt">Packing</div><div class="qs">April layers list</div></button>
        <button class="quick-tile" data-go="guide"><div class="qi">📖</div><div class="qt">Japan Guide</div><div class="qs">The FAQ, answered</div></button>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>⚠️ Golden Week wall</h3>
        <p style="margin:0;font-size:13px;color:var(--ink-soft)">${esc(T.meta.goldenWeekWarning)}</p>
      </div>

      <div class="foot-note">Built as a baseline for the group · edit anytime</div>
    `;
    s.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));
    renderClocks();
    tickCountdown();
  }

  function tickCountdown() {
    const box = $("#countdown");
    if (!box) return;
    const target = new Date(T.meta.departUS + "T08:00:00");
    const now = new Date();
    let diff = Math.max(0, target - now);
    const day = Math.floor(diff / 86400000); diff -= day * 86400000;
    const hr = Math.floor(diff / 3600000); diff -= hr * 3600000;
    const mn = Math.floor(diff / 60000); diff -= mn * 60000;
    const sc = Math.floor(diff / 1000);
    const cells = [[day, "Days"], [hr, "Hours"], [mn, "Min"], [sc, "Sec"]];
    box.innerHTML = (now >= target)
      ? `<div class="count-box" style="grid-column:1/-1"><div class="num">🎌 We're in Japan!</div></div>`
      : cells.map(([n, l]) => `<div class="count-box"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join("");
  }
  setInterval(() => { if ($("#screen-home").classList.contains("active")) tickCountdown(); }, 1000);

  function renderClocks() {
    const box = $("#clocks");
    if (!box) return;
    const fmt = (tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
    box.innerHTML = `
      <div class="clock"><div class="place">Home (Chicago)</div><div class="time">${fmt(T.meta.homeTimezone)}</div></div>
      <div class="clock"><div class="place">🗾 Tokyo</div><div class="time">${fmt(T.meta.tripTimezone)}</div></div>`;
  }
  setInterval(() => { if ($("#screen-home").classList.contains("active")) renderClocks(); }, 15000);

  /* =======================================================================
     ITINERARY
     ==================================================================== */
  function renderItinerary() {
    const s = $("#screen-itinerary");
    const filters = ["all", ...T.cities.map((c) => c.id)];
    s.innerHTML = `
      <div class="section-title">Itinerary</div>
      <div class="section-sub">Proposed day-by-day — tap a day to expand. Everything's open for discussion.</div>
      <div class="filters" id="itinFilters">
        ${filters.map((f) => `<button class="chip ${f === state.cityFilter ? "active" : ""}" data-city="${f}">${f === "all" ? "All" : cityName(f)}</button>`).join("")}
      </div>
      <div id="dayList"></div>`;
    s.querySelectorAll("#itinFilters .chip").forEach((c) => c.addEventListener("click", () => {
      state.cityFilter = c.dataset.city; renderDayList();
      s.querySelectorAll("#itinFilters .chip").forEach((x) => x.classList.toggle("active", x === c));
    }));
    renderDayList();
  }
  function renderDayList() {
    const list = $("#dayList");
    const days = T.days.filter((d) => state.cityFilter === "all" || d.city === state.cityFilter);
    list.innerHTML = days.map((d, idx) => {
      const f = fmtDate(d.date);
      const items = d.items.map((it) => {
        const tm = TYPE[it.type] || TYPE.sight;
        const map = it.lat ? `<a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}" target="_blank" rel="noopener">📍 Map</a>` : "";
        return `<div class="tl-item ${it.type}">
          ${it.time ? `<div class="tl-time">${esc(it.time)}</div>` : ""}
          <div class="tl-title"><span class="type-emoji">${tm.emoji}</span>${esc(it.title)}</div>
          ${it.note ? `<div class="tl-note">${esc(it.note)}</div>` : ""}
          ${map}
        </div>`;
      }).join("");
      return `<div class="day" data-day="${idx}">
        <div class="day-head">
          <div class="day-date"><div class="d">${f.day}</div><div class="m">${f.wd} ${f.mon}</div></div>
          <div class="info"><div class="t">${esc(d.title)} <span class="pill ${d.city}">${cityName(d.city)}</span></div>
            <div class="s">${esc(d.summary)}</div></div>
          <div class="caret">▶</div>
        </div>
        <div class="day-body">
          ${d.meetup ? `<div class="meetup">📍 <span>Meetup: ${esc(d.meetup)}</span></div>` : ""}
          <div class="timeline">${items}</div>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll(".day-head").forEach((h) => h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
    // open the first day by default
    const first = list.querySelector(".day"); if (first) first.classList.add("open");
  }

  /* =======================================================================
     MAP (Leaflet)
     ==================================================================== */
  let map = null, markerLayer = null, mapFilter = "all";
  function collectPins() {
    const pins = [];
    T.stays.forEach((st) => pins.push({ lat: st.lat, lng: st.lng, city: st.city, type: "stay", title: st.name, note: st.priceNote || st.address }));
    T.days.forEach((d) => d.items.forEach((it) => {
      if (it.lat) pins.push({ lat: it.lat, lng: it.lng, city: d.city, type: it.type, title: it.title, note: it.note });
    }));
    return pins;
  }
  function initMap() {
    if (typeof L === "undefined") {
      $("#screen-map").innerHTML = `<div class="section-title">Map</div><div class="empty">Map needs an internet connection to load tiles. Reconnect and reopen this tab.</div>`;
      return;
    }
    if (map) { setTimeout(() => map.invalidateSize(), 60); return; }
    const s = $("#screen-map");
    s.innerHTML = `
      <div class="section-title">Map</div>
      <div class="filters" id="mapFilters">
        <button class="chip active" data-city="all">All Japan</button>
        ${T.cities.map((c) => `<button class="chip" data-city="${c.id}">${esc(c.name)}</button>`).join("")}
      </div>
      <div id="map"></div>
      <div class="map-legend">
        <span><i class="dot" style="background:#1c1c1e"></i> Stay</span>
        ${Object.entries(TYPE).map(([k, v]) => `<span><i class="dot" style="background:${v.color}"></i> ${v.label}</span>`).join("")}
      </div>`;
    map = L.map("map", { scrollWheelZoom: false }).setView([35.4, 137.5], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    s.querySelectorAll("#mapFilters .chip").forEach((c) => c.addEventListener("click", () => {
      mapFilter = c.dataset.city;
      s.querySelectorAll("#mapFilters .chip").forEach((x) => x.classList.toggle("active", x === c));
      drawPins();
    }));
    drawPins();
    setTimeout(() => map.invalidateSize(), 80);
  }
  function drawPins() {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    const pins = collectPins().filter((p) => mapFilter === "all" || p.city === mapFilter);
    const bounds = [];
    pins.forEach((p) => {
      const color = p.type === "stay" ? "#1c1c1e" : (TYPE[p.type] || TYPE.sight).color;
      const emoji = p.type === "stay" ? "🏨" : (TYPE[p.type] || TYPE.sight).emoji;
      const icon = L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.35);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:12px">${emoji}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 24], popupAnchor: [0, -22] });
      const m = L.marker([p.lat, p.lng], { icon }).addTo(markerLayer);
      m.bindPopup(`<div class="pin-pop"><b>${esc(p.title)}</b><br><span class="pp-note">${esc(p.note || "")}</span></div>`);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: mapFilter === "all" ? 7 : 14 });
  }

  /* =======================================================================
     CREW
     ==================================================================== */
  function renderCrew() {
    const s = $("#screen-crew");
    const pairs = [...new Set(T.travelers.map((t) => t.pair))];
    s.innerHTML = `
      <div class="section-title">The crew</div>
      <div class="section-sub">6 travelers · 3 couples. Tap "Who are you?" up top to tag yourself.</div>
      ${pairs.map((p) => {
        const people = T.travelers.filter((t) => t.pair === p);
        return `<div class="pair-card">
          <div class="pair-name">${esc(p)}</div>
          ${people.map((t) => `<div class="person">
            <div class="avatar" style="background:${t.color}">${initials(t.name)}</div>
            <div class="p-info"><div class="p-name">${esc(t.name)}${state.me === t.id ? '<span class="badge-you">YOU</span>' : ""}</div>
              <div class="p-role">${esc(t.role || "")}</div></div>
            <div class="p-meta">${t.from ? esc(t.from) + "<br>" : ""}${t.dietary ? "🥗 " + esc(t.dietary) : ""}</div>
          </div>`).join("")}
        </div>`;
      }).join("")}
      <div class="card">
        <h3>Booking order 📋</h3>
        <p class="section-sub" style="margin:2px 0 10px">From the plan — lock these in this order:</p>
        ${T.bookingOrder.map((b, i) => `<div class="row"><div class="avatar" style="width:28px;height:28px;font-size:12px;background:var(--ai)">${i + 1}</div>
          <div class="r-main"><div class="r-title">${esc(b.label)}</div><div class="r-sub">${esc(b.note)}</div></div></div>`).join("")}
      </div>`;
  }

  /* =======================================================================
     STAYS
     ==================================================================== */
  function renderStays() {
    const s = $("#screen-stays");
    s.innerHTML = `
      <div class="section-title">Where we sleep</div>
      <div class="section-sub">"Spend on the nights the room <i>is</i> the experience; save on the nights you're just sleeping."</div>
      ${T.stays.map((st) => `<div class="card">
        <span class="pill ${st.city}">${cityName(st.city)}</span>
        <h3 style="margin-top:8px">${esc(st.name)}</h3>
        <div class="r-sub" style="font-size:13px">${esc(st.address)} · ${fmtRange(st.checkIn, st.checkOut)}</div>
        <div style="font-weight:800;color:var(--ai);margin:8px 0">${esc(st.priceNote || "")}</div>
        <div style="display:grid;gap:6px;margin:10px 0">
          ${st.rooms.map((r) => `<div class="row" style="padding:8px 0">
            <div class="r-main"><div class="r-title">🛏️ ${esc(r.name)}</div>
              <div class="r-sub">${r.who.map((id) => esc((byId(id) || {}).name || id)).join(" · ")}</div></div>
          </div>`).join("")}
        </div>
        <p style="font-size:12.5px;color:var(--ink-soft);margin:0">${esc(st.notes)}</p>
        <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${st.lat},${st.lng}" target="_blank" rel="noopener" style="margin-top:8px">📍 Open in Maps</a>
      </div>`).join("")}`;
  }
  function fmtRange(a, b) {
    const fa = fmtDate(a), fb = fmtDate(b);
    return `${fa.mon} ${fa.day} → ${fb.mon} ${fb.day}`;
  }

  /* =======================================================================
     FLIGHTS
     ==================================================================== */
  function renderFlights() {
    const s = $("#screen-flights");
    s.innerHTML = `
      <div class="section-title">Flights & arrivals</div>
      <div class="section-sub">${esc(T.flightsNote || "")}</div>
      ${T.flights.map((f) => `<div class="card">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">${f.dir === "arrive" ? "🛬" : "🛫"}</span>
          <div style="flex:1">
            <div class="r-title">${esc(f.label || (f.dir === "arrive" ? "Arrival" : "Departure"))}</div>
            <div class="r-sub">${f.dir === "arrive" ? "Arrive" : "Depart"} ${esc(f.airport)} · ${fmtDate(f.date).wd} ${fmtDate(f.date).mon} ${fmtDate(f.date).day}${f.time ? " · " + esc(f.time) : ""}</div>
          </div>
        </div>
        ${f.note ? `<p style="font-size:12.5px;color:var(--ink-soft);margin:10px 0 0">${esc(f.note)}</p>` : ""}
      </div>`).join("")}`;
  }

  /* =======================================================================
     BUDGET (shared expenses + settle up)
     ==================================================================== */
  function toUSD(amount, cur) {
    const per = T.meta.currency.perUSD || 1;
    return cur === "JPY" ? amount / per : Number(amount);
  }
  function renderBudget() {
    const s = $("#screen-budget");
    const nets = {}; T.travelers.forEach((t) => nets[t.id] = 0);
    state.expenses.forEach((e) => {
      const usd = toUSD(e.amount, e.currency);
      const share = usd / (e.splitAmong.length || 1);
      if (nets[e.paidBy] != null) nets[e.paidBy] += usd;
      e.splitAmong.forEach((id) => { if (nets[id] != null) nets[id] -= share; });
    });
    const total = state.expenses.reduce((a, e) => a + toUSD(e.amount, e.currency), 0);

    s.innerHTML = `
      <div class="section-title">Budget & settle-up</div>
      <div class="section-sub">Log shared expenses; balances update live. Saved on this phone — a shared version is a fast follow.</div>

      <div class="card">
        <h3>Trip estimate</h3>
        <div class="r-sub" style="font-size:13px">≈ <b>$${T.meta.estPerPerson.toLocaleString()}</b>/person · <b>$${T.meta.estGroup.toLocaleString()}</b> group. ${esc(T.meta.estNote)}</div>
      </div>

      <div class="section-title" style="font-size:16px">Balances</div>
      <div class="balance-grid">
        ${T.travelers.map((t) => {
          const v = nets[t.id]; const cls = v > 0.5 ? "owed" : (v < -0.5 ? "owes" : "");
          const txt = Math.abs(v) < 0.5 ? "even" : (v > 0 ? "+$" + v.toFixed(0) + " owed" : "-$" + Math.abs(v).toFixed(0));
          return `<div class="balance"><div class="bn"><span class="avatar" style="width:18px;height:18px;font-size:9px;display:inline-grid;vertical-align:middle;background:${t.color}">${initials(t.name)}</span> ${esc(t.name.split(" ")[0])}</div><div class="bv ${cls}">${txt}</div></div>`;
        }).join("")}
      </div>
      ${settleText(nets)}

      <div class="section-title" style="font-size:16px">Add an expense</div>
      <div class="card expense-add">
        <input id="exLabel" placeholder="What was it? (e.g. Group dinner)" />
        <div style="display:flex;gap:8px">
          <input id="exAmount" type="number" inputmode="decimal" placeholder="Amount" style="flex:2" />
          <select id="exCur" style="flex:1"><option value="JPY">¥ JPY</option><option value="USD">$ USD</option></select>
        </div>
        <label class="r-sub" style="font-weight:700">Paid by</label>
        <select id="exPaid">${T.travelers.map((t) => `<option value="${t.id}" ${state.me === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        <label class="r-sub" style="font-weight:700">Split among</label>
        <div id="exSplit" style="display:flex;flex-wrap:wrap;gap:6px">
          ${T.travelers.map((t) => `<label class="chip" style="cursor:pointer"><input type="checkbox" value="${t.id}" checked style="margin-right:6px;vertical-align:middle">${esc(t.name.split(" ")[0])}</label>`).join("")}
        </div>
        <button class="btn primary" id="exAdd">Add expense</button>
      </div>

      <div class="section-title" style="font-size:16px">Log</div>
      <div id="exLog">${expenseLog()}</div>`;

    $("#exAdd").addEventListener("click", addExpense);
    bindExpenseDelete();
  }
  function settleText(nets) {
    const cred = Object.entries(nets).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }));
    const debt = Object.entries(nets).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }));
    if (!cred.length || !debt.length) return `<p class="section-sub" style="margin-top:-6px">No one owes anything yet — add some expenses.</p>`;
    cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
    const lines = []; let i = 0, j = 0;
    const c = cred.map((x) => ({ ...x })), d = debt.map((x) => ({ ...x }));
    while (i < d.length && j < c.length) {
      const pay = Math.min(d[i].v, c[j].v);
      lines.push(`${esc((byId(d[i].id) || {}).name?.split(" ")[0] || d[i].id)} → ${esc((byId(c[j].id) || {}).name?.split(" ")[0] || c[j].id)}: <b>$${pay.toFixed(0)}</b>`);
      d[i].v -= pay; c[j].v -= pay;
      if (d[i].v < 0.5) i++; if (c[j].v < 0.5) j++;
    }
    return `<div class="card"><h3>Suggested settle-up</h3>${lines.map((l) => `<div class="r-sub" style="font-size:13.5px;padding:3px 0">${l}</div>`).join("")}</div>`;
  }
  function expenseLog() {
    if (!state.expenses.length) return `<div class="empty">No expenses logged yet.</div>`;
    return state.expenses.slice().reverse().map((e) => `<div class="row" data-ex="${e.id}">
      <div class="r-main"><div class="r-title">${esc(e.label)}</div>
        <div class="r-sub">${e.currency === "JPY" ? "¥" : "$"}${Number(e.amount).toLocaleString()} · paid by ${esc((byId(e.paidBy) || {}).name?.split(" ")[0] || e.paidBy)} · split ${e.splitAmong.length}</div></div>
      <button class="btn danger" data-del="${e.id}">Delete</button>
    </div>`).join("");
  }
  function addExpense() {
    const label = $("#exLabel").value.trim();
    const amount = parseFloat($("#exAmount").value);
    if (!label || !(amount > 0)) { alert("Add a description and an amount."); return; }
    const splitAmong = $$("#exSplit input:checked").map((c) => c.value);
    if (!splitAmong.length) { alert("Pick at least one person to split among."); return; }
    state.expenses.push({ id: "e" + Date.now(), label, amount, currency: $("#exCur").value, paidBy: $("#exPaid").value, splitAmong });
    save(); renderBudget();
  }
  function bindExpenseDelete() {
    $$("[data-del]").forEach((b) => b.addEventListener("click", () => {
      state.expenses = state.expenses.filter((e) => e.id !== b.dataset.del); save(); renderBudget();
    }));
  }

  /* =======================================================================
     PACKING
     ==================================================================== */
  function renderPacking() {
    const s = $("#screen-packing");
    const all = T.packing.flatMap((c) => c.items);
    const done = all.filter((i) => state.packing[i]).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    s.innerHTML = `
      <div class="section-title">Packing</div>
      <div class="section-sub">Late April = layers + dry. Checked items save on this phone. ${done}/${all.length} packed.</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      ${T.packing.map((cat) => `
        <div class="check-cat">${esc(cat.cat)}</div>
        ${cat.items.map((it) => {
          const on = !!state.packing[it];
          return `<div class="check ${on ? "done" : ""}"><input type="checkbox" ${on ? "checked" : ""} data-pack="${esc(it)}" id="pk-${btoa(unescape(encodeURIComponent(it))).replace(/=/g, "")}"><label for="pk-${btoa(unescape(encodeURIComponent(it))).replace(/=/g, "")}">${esc(it)}</label></div>`;
        }).join("")}`).join("")}`;
    s.querySelectorAll("[data-pack]").forEach((c) => c.addEventListener("change", () => {
      state.packing[c.dataset.pack] = c.checked; save(); renderPacking();
    }));
  }

  /* =======================================================================
     DECISIONS (group votes)
     ==================================================================== */
  function renderDecisions() {
    const s = $("#screen-decisions");
    s.innerHTML = `
      <div class="section-title">Decisions</div>
      <div class="section-sub">Open questions for the group. Tap your pick. ⚠️ Votes save on <i>this</i> phone only for now — a shared tally is the next upgrade.</div>
      ${!state.me ? `<div class="card" style="border-color:var(--sakura-deep);background:#fdf3f5"><b>Tag yourself first</b> — tap "Who are you?" at the top so your picks are yours. <button class="btn primary" id="decWho" style="margin-top:10px;width:100%">Set who I am</button></div>` : ""}
      ${T.decisions.map((d) => {
        const mine = state.decisions[d.id];
        return `<div class="card">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0">${esc(d.title)}</h3>
            <span class="pill ${d.status === "decided" ? "tokyo" : d.status === "leaning" ? "osaka" : "any"}">${d.status}</span>
          </div>
          <p class="section-sub" style="margin:8px 0 12px">${esc(d.note)}</p>
          <div style="display:grid;gap:8px">
            ${d.options.map((o) => `<button class="who-opt ${mine === o.id ? "sel" : ""}" data-dec="${d.id}" data-opt="${o.id}" style="text-align:left;width:100%">
              <span style="font-size:18px">${mine === o.id ? "🔘" : "⚪"}</span>
              <div><div>${esc(o.label)}</div><div class="r-sub" style="font-weight:500">${esc(o.note || "")}</div></div>
            </button>`).join("")}
          </div>
        </div>`;
      }).join("")}`;
    s.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => {
      if (!state.me) { openWho(); return; }
      state.decisions[b.dataset.dec] = b.dataset.opt; save(); renderDecisions();
    }));
    const dw = $("#decWho"); if (dw) dw.addEventListener("click", openWho);
  }

  /* =======================================================================
     IDEAS (thumbs-up)
     ==================================================================== */
  function renderIdeas() {
    const s = $("#screen-ideas");
    s.innerHTML = `
      <div class="section-title">Ideas board</div>
      <div class="section-sub">Add-ons nobody's committed to yet. 👍 the ones you'd want to do.</div>
      ${T.ideas.map((i) => {
        const on = !!state.ideas[i.id];
        return `<div class="idea">
          <div class="i-main"><div class="i-title">${esc(i.title)} <span class="pill ${i.city}">${i.city === "any" ? "Anytime" : cityName(i.city)}</span></div>
            <div class="i-note">${esc(i.note)}</div></div>
          <div class="vote"><button class="${on ? "voted" : ""}" data-idea="${i.id}">👍</button><span class="vcount">${on ? "You're in" : ""}</span></div>
        </div>`;
      }).join("")}`;
    s.querySelectorAll("[data-idea]").forEach((b) => b.addEventListener("click", () => {
      state.ideas[b.dataset.idea] = !state.ideas[b.dataset.idea]; save(); renderIdeas();
    }));
  }

  /* =======================================================================
     GUIDE + phrases
     ==================================================================== */
  function renderGuide() {
    const s = $("#screen-guide");
    s.innerHTML = `
      <div class="section-title">Japan Guide</div>
      <div class="section-sub">The stuff everyone would otherwise ask — answered once.</div>
      ${T.guide.map((g) => `<div class="guide-card">
        <div class="g-head"><span>${g.icon}</span> ${esc(g.title)}</div>
        <div class="g-body">${esc(g.body)}</div>
      </div>`).join("")}
      <div class="section-title" style="margin-top:20px">Phrasebook</div>
      <div class="card">
        ${T.phrases.map((p) => `<div class="phrase"><div class="p-en">${esc(p.en)}</div><div class="p-jp">${esc(p.jp)}</div><div class="p-ro">${esc(p.romaji)}</div></div>`).join("")}
      </div>`;
  }

  /* =======================================================================
     WHO ARE YOU
     ==================================================================== */
  function renderWhoami() {
    const btn = $("#whoamiName"), av = $("#whoamiAvatar");
    if (state.me) {
      const t = byId(state.me);
      btn.textContent = t.name.split(" ")[0];
      av.innerHTML = `<span class="avatar" style="width:24px;height:24px;font-size:11px;background:${t.color}">${initials(t.name)}</span>`;
    } else { btn.textContent = "Who are you?"; av.innerHTML = "👤"; }
  }
  function openWho() {
    const box = $("#whoOptions");
    box.innerHTML = T.travelers.map((t) => `<div class="who-opt ${state.me === t.id ? "sel" : ""}" data-me="${t.id}">
      <span class="avatar" style="width:30px;height:30px;font-size:12px;background:${t.color}">${initials(t.name)}</span>${esc(t.name)}</div>`).join("");
    box.querySelectorAll("[data-me]").forEach((o) => o.addEventListener("click", () => {
      state.me = o.dataset.me; save(); renderWhoami();
      box.querySelectorAll(".who-opt").forEach((x) => x.classList.toggle("sel", x === o));
      renderCurrent();
    }));
    $("#whoModal").classList.add("open");
  }
  $("#whoamiBtn").addEventListener("click", openWho);
  $("#whoClose").addEventListener("click", () => $("#whoModal").classList.remove("open"));
  $("#whoModal").addEventListener("click", (e) => { if (e.target.id === "whoModal") $("#whoModal").classList.remove("open"); });

  /* =======================================================================
     BOOT
     ==================================================================== */
  const RENDERERS = {
    home: renderHome, itinerary: renderItinerary, crew: renderCrew, stays: renderStays,
    flights: renderFlights, budget: renderBudget, packing: renderPacking,
    decisions: renderDecisions, ideas: renderIdeas, guide: renderGuide,
  };
  function renderCurrent() {
    const active = $(".screen.active");
    const id = active ? active.id.replace("screen-", "") : "home";
    if (RENDERERS[id]) RENDERERS[id]();
    if (id === "map") drawPins && map && drawPins();
  }
  function renderAll() { Object.values(RENDERERS).forEach((fn) => fn()); }

  renderAll();
  renderWhoami();
  if (!state.me) setTimeout(openWho, 600);

  // PWA service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
