// Kathmandu winter story mode — simplified but directionally correct box model.
// Units: "µg/m³-like" for PM components. Rates are toy parameters.

const UI = {
  day: document.getElementById("day"),
  pm: document.getElementById("pm"),
  next: document.getElementById("next"),
  restart: document.getElementById("restart"),
  story: document.getElementById("story"),
  insight: document.getElementById("insight"),
  toast: document.getElementById("toast"),

  traffic: document.getElementById("traffic"),
  kilns: document.getElementById("kilns"),
  burning: document.getElementById("burning"),
  dust: document.getElementById("dust"),
  trafficVal: document.getElementById("trafficVal"),
  kilnsVal: document.getElementById("kilnsVal"),
  burningVal: document.getElementById("burningVal"),
  dustVal: document.getElementById("dustVal"),

  mh: document.getElementById("mh"),
  wind: document.getElementById("wind"),
  rh: document.getElementById("rh"),
  rain: document.getElementById("rain"),

  b_primary: document.getElementById("b_primary"),
  b_sulf: document.getElementById("b_sulf"),
  b_nit: document.getElementById("b_nit"),
  b_soa: document.getElementById("b_soa"),
  t_primary: document.getElementById("t_primary"),
  t_sulf: document.getElementById("t_sulf"),
  t_nit: document.getElementById("t_nit"),
  t_soa: document.getElementById("t_soa"),

  plot: document.getElementById("plot")
};

const ACTIONS = {
  kiln_ban: {
    name: "Kiln ban",
    apply: s => { s.policy.kilnBan = true; s.tradeoff.econ += 8; },
    text: "You enforce a kiln shutdown. Big SO₂/primary drop, but construction supply chains complain."
  },
  odd_even: {
    name: "Odd-even traffic",
    apply: s => { s.policy.oddEven = true; s.tradeoff.mobility += 6; },
    text: "You impose odd-even traffic. Peak traffic emissions drop, but mobility gets harder."
  },
  burning_crackdown: {
    name: "Stop open burning",
    apply: s => { s.policy.burningCrackdown = true; s.tradeoff.social += 5; },
    text: "You crack down on open burning. Cleaner air, but enforcement friction rises."
  },
  road_sweep: {
    name: "Road sweeping",
    apply: s => { s.policy.roadSweep = true; s.tradeoff.cost += 3; },
    text: "You deploy road sweeping and watering. Dust goes down, especially on dry days."
  },
  public_alert: {
    name: "Public health alert",
    apply: s => { s.policy.publicAlert = true; },
    text: "You issue a public alert: masks, indoor filtration, reduce outdoor activity. Exposure risk drops, but emissions don’t."
  }
};

// Episode timeline (days)
const EPISODES = [
  {
    title: "Day 1 — Winter starts",
    narrative:
      "Cold morning. The valley traps air near the ground. Traffic + kilns are running. PM builds fast under low mixing height.",
    env: { mh: 180, wind: 1.2, rh: 55, rain: false, sunlight: 0.55 }
  },
  {
    title: "Day 2 — Inversion deepens",
    narrative:
      "Inversion strengthens overnight. Even if emissions stay the same, concentrations jump because dilution collapses.",
    env: { mh: 120, wind: 0.8, rh: 60, rain: false, sunlight: 0.50 }
  },
  {
    title: "Day 3 — Brick kiln push",
    narrative:
      "Demand surges. Kilns run harder. Expect more primary PM and SO₂, which later converts to sulfate.",
    env: { mh: 140, wind: 0.9, rh: 62, rain: false, sunlight: 0.52 },
    nudge: s => { UI.kilns.value = clamp(+UI.kilns.value + 10, 0, 100); }
  },
  {
    title: "Day 4 — Haze day (high humidity)",
    narrative:
      "Humidity rises. Particles absorb water and look worse. Secondary formation also gets a boost under moist conditions.",
    env: { mh: 150, wind: 0.9, rh: 82, rain: false, sunlight: 0.45 }
  },
  {
    title: "Day 5 — Festival + cooking + traffic",
    narrative:
      "More movement, more cooking fires, more congestion. You’ll feel it quickly because primary emissions act instantly.",
    env: { mh: 160, wind: 1.0, rh: 70, rain: false, sunlight: 0.50 },
    nudge: s => {
      UI.traffic.value = clamp(+UI.traffic.value + 12, 0, 100);
      UI.burning.value = clamp(+UI.burning.value + 10, 0, 100);
    }
  },
  {
    title: "Day 6 — Wind picks up",
    narrative:
      "A breeze arrives. Not a full cleanout, but dilution improves. This is where you see if controls were worth it.",
    env: { mh: 260, wind: 2.1, rh: 58, rain: false, sunlight: 0.55 }
  },
  {
    title: "Day 7 — Light rain",
    narrative:
      "Rain finally. Wet deposition removes particles fast. If PM stays high even after rain, you’re dealing with ongoing emissions + quick formation.",
    env: { mh: 320, wind: 2.4, rh: 75, rain: true, sunlight: 0.30 }
  }
];

// ---------- State ----------
function freshState(){
  return {
    day: 1,
    episodeIndex: 0,
    env: { mh: 180, wind: 1.2, rh: 55, rain: false, sunlight: 0.55 },
    policy: { kilnBan:false, oddEven:false, burningCrackdown:false, roadSweep:false, publicAlert:false },
    tradeoff: { econ:0, mobility:0, social:0, cost:0 },
    // precursors (toy pools)
    so2: 20, nox: 18, voc: 14, nh3: 16,
    // PM components
    pm_primary: 35,
    pm_sulf: 10,
    pm_nit: 8,
    pm_soa: 7,
    history: [] // total PM per day
  };
}

let S = freshState();

// ---------- UI helpers ----------
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function fmt(x){ return Math.round(x); }

function toast(msg){
  UI.toast.textContent = msg;
  UI.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> UI.toast.classList.remove("show"), 2400);
}

function syncSliderLabels(){
  UI.trafficVal.textContent = UI.traffic.value;
  UI.kilnsVal.textContent = UI.kilns.value;
  UI.burningVal.textContent = UI.burning.value;
  UI.dustVal.textContent = UI.dust.value;
}

// ---------- Core model ----------
function stepOneDay(){
  const e = S.env;

  // Controls → emission scaling
  let traffic = +UI.traffic.value / 100;
  let kilns   = +UI.kilns.value / 100;
  let burning = +UI.burning.value / 100;
  let dust    = +UI.dust.value / 100;

  if (S.policy.oddEven) traffic *= 0.78;
  if (S.policy.kilnBan) kilns *= 0.35;
  if (S.policy.burningCrackdown) burning *= 0.70;
  if (S.policy.roadSweep) dust *= (e.rain ? 0.90 : 0.70); // more effective when dry

  // Primary emissions (instant)
  const E_primary =
    22*traffic + 28*kilns + 24*burning + 16*dust;

  // Precursor emissions (toy): kilns → SO2, traffic → NOx/VOC, burning → VOC, agriculture baseline NH3
  const E_so2 = 18*kilns + 2*burning;
  const E_nox = 16*traffic + 3*kilns;
  const E_voc = 10*traffic + 8*burning;
  const E_nh3 = 6 + 2*burning; // baseline + some from burning (toy)

  // Meteorology scalars
  const inv = clamp(220 / e.mh, 0.6, 2.2);           // low MH -> bigger concentrations
  const humid = clamp(e.rh / 80, 0.6, 1.35);         // humidity increases growth/formation
  const sun = clamp(e.sunlight, 0.2, 0.8);           // photochemistry
  const wind = clamp(e.wind, 0.6, 3.0);

  // Update precursor pools with simple loss (oxidation/transport)
  // Loss increases with wind (ventilation) and sunlight (chemistry)
  S.so2 = Math.max(0, S.so2 + E_so2 - (0.12*sun + 0.10*wind)*S.so2*0.15);
  S.nox = Math.max(0, S.nox + E_nox - (0.14*sun + 0.08*wind)*S.nox*0.14);
  S.voc = Math.max(0, S.voc + E_voc - (0.10*sun + 0.06*wind)*S.voc*0.12);
  S.nh3 = Math.max(0, S.nh3 + E_nh3 - (0.06*wind)*S.nh3*0.08);

  // Secondary formation (toy, but with correct dependencies)
  const F_sulf = 0.22 * S.so2 * sun * humid;                   // sulfate
  const coldFactor = clamp((260 - e.mh)/200, 0.2, 1.1);        // proxy for winter stability (more nitrate)
  const F_nit  = 0.18 * S.nox * S.nh3 * 0.012 * coldFactor * humid;
  const F_soa  = 0.16 * S.voc * sun * 0.9;

  // Removal
  const dryLoss = 0.06 + 0.03*wind;            // deposition + ventilation
  const rainLoss = e.rain ? 0.35 : 0.0;        // washout event

  // Apply to PM components
  // Inversion amplifies concentration response: we apply inv to net addition
  S.pm_primary = Math.max(0, (S.pm_primary + E_primary*inv) * (1 - dryLoss - rainLoss));
  S.pm_sulf    = Math.max(0, (S.pm_sulf    + F_sulf*inv)    * (1 - dryLoss - rainLoss));
  S.pm_nit     = Math.max(0, (S.pm_nit     + F_nit*inv)     * (1 - dryLoss - rainLoss));
  S.pm_soa     = Math.max(0, (S.pm_soa     + F_soa*inv)     * (1 - dryLoss - rainLoss));

  // Humidity “haze growth” (optical/measurement effect): bump total a bit when RH high
  // We apply as a multiplier to total shown, not stored as mass.
  const hazeMult = e.rh >= 78 ? 1.18 : (e.rh >= 65 ? 1.08 : 1.0);

  const total = (S.pm_primary + S.pm_sulf + S.pm_nit + S.pm_soa) * hazeMult;

  // Store history
  S.history.push({ day: S.day, total, hazeMult });

  return total;
}

// ---------- Rendering ----------
function renderEnv(){
  UI.mh.textContent = `${S.env.mh} m`;
  UI.wind.textContent = `${S.env.wind.toFixed(1)} m/s`;
  UI.rh.textContent = `${S.env.rh}%`;
  UI.rain.textContent = S.env.rain ? "Yes" : "No";
}

function renderBars(totalShown){
  const p = S.pm_primary, s = S.pm_sulf, n = S.pm_nit, o = S.pm_soa;
  const sum = Math.max(1e-6, (p+s+n+o)); // composition based on mass, not haze
  const pct = x => (100 * x / sum);

  UI.b_primary.style.width = `${pct(p)}%`;
  UI.b_sulf.style.width = `${pct(s)}%`;
  UI.b_nit.style.width = `${pct(n)}%`;
  UI.b_soa.style.width = `${pct(o)}%`;

  UI.t_primary.textContent = fmt(p);
  UI.t_sulf.textContent = fmt(s);
  UI.t_nit.textContent = fmt(n);
  UI.t_soa.textContent = fmt(o);

  // Insight text: highlight dominant driver
  const parts = [
    {k:"Primary", v:p},
    {k:"Sulfate", v:s},
    {k:"Nitrate", v:n},
    {k:"SOA", v:o}
  ].sort((a,b)=> b.v-a.v);

  const dom = parts[0].k;
  let msg = `Dominant today: ${dom}. `;
  if (S.env.mh <= 150) msg += "Low mixing height is trapping pollution near the surface. ";
  if (S.env.rh >= 78) msg += "High humidity is boosting haze and making air look worse. ";
  if (S.env.rain) msg += "Rain is removing particles quickly. ";
  if (S.policy.publicAlert) msg += "Public alert reduces exposure behavior, but not emissions. ";

  UI.insight.textContent = msg.trim();
  UI.pm.textContent = String(fmt(totalShown));
}

function renderStory(){
  const ep = EPISODES[S.episodeIndex];
  const title = `<strong>${ep.title}</strong>`;
  const trade = `Tradeoffs so far — econ:${S.tradeoff.econ}, mobility:${S.tradeoff.mobility}, social:${S.tradeoff.social}, cost:${S.tradeoff.cost}`;
  UI.story.innerHTML = `${title}<br/><br/>${ep.narrative}<br/><br/><span style="color: #a8b3d6; font-size: 12px;">${trade}</span>`;
}

function renderPlot(){
  const c = UI.plot;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;

  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(ctx, 0,0,W,H, 16, true, false);

  const data = S.history.map(d => d.total);
  if (data.length < 2) return;

  const maxY = Math.max(80, ...data) * 1.1;
  const minY = 0;

  const padL = 42, padR = 14, padT = 14, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // axes labels (simple)
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillText("PM2.5", 12, 18);

  // y grid
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  for (let i=0;i<=4;i++){
    const y = padT + (plotH * i/4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W-padR, y);
    ctx.stroke();

    const val = Math.round(maxY * (1 - i/4));
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(String(val), 8, y+4);
  }

  // line
  ctx.strokeStyle = "rgba(88,140,255,0.9)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = padL + plotW * (i/(data.length-1));
    const y = padT + plotH * (1 - (v-minY)/(maxY-minY));
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(0,255,209,0.8)";
  data.forEach((v, i) => {
    const x = padL + plotW * (i/(data.length-1));
    const y = padT + plotH * (1 - (v-minY)/(maxY-minY));
    ctx.beginPath();
    ctx.arc(x,y,3,0,Math.PI*2);
    ctx.fill();
  });

  // x labels
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  const last = S.history[S.history.length-1].day;
  ctx.fillText(`Day ${S.history[0].day}`, padL, H-10);
  ctx.fillText(`Day ${last}`, W-padR-48, H-10);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ---------- Episode progression ----------
function applyEpisode(){
  const ep = EPISODES[S.episodeIndex];
  S.env = { ...ep.env };
  if (ep.nudge) ep.nudge(S);
  renderEnv();
  renderStory();
  syncSliderLabels();
}

function nextDay(){
  // simulate day
  const total = stepOneDay();

  // day advance
  S.day += 1;
  UI.day.textContent = String(S.day);

  renderBars(total);
  renderPlot();

  // progress story (cap at last episode)
  if (S.episodeIndex < EPISODES.length - 1) {
    S.episodeIndex += 1;
    applyEpisode();
  } else {
    // End-of-episode evaluation
    const avg = S.history.reduce((a,b)=>a+b.total,0)/S.history.length;
    const endMsg =
      avg > 180 ? "Brutal week. Inversion + emissions dominated. Your best lever is cutting kilns/burning before the inversion days."
      : avg > 120 ? "Bad but improved. You managed the worst days, but secondary formation still kept PM high."
      : "Strong outcome. You reduced emissions early, so the inversion days didn’t explode as much.";
    toast(endMsg);
  }
}

// ---------- Actions ----------
document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.action;
    const a = ACTIONS[key];
    if (!a) return;

    // prevent re-applying same policy repeatedly
    const already = (key === "kiln_ban" && S.policy.kilnBan) ||
                    (key === "odd_even" && S.policy.oddEven) ||
                    (key === "burning_crackdown" && S.policy.burningCrackdown) ||
                    (key === "road_sweep" && S.policy.roadSweep) ||
                    (key === "public_alert" && S.policy.publicAlert);

    if (already) { toast("You already applied that action."); return; }

    a.apply(S);
    toast(a.text);
    renderStory();
  });
});

// sliders
["traffic","kilns","burning","dust"].forEach(id => {
  UI[id].addEventListener("input", syncSliderLabels);
});

UI.next.addEventListener("click", nextDay);
UI.restart.addEventListener("click", () => init(true));

// ---------- Init ----------
function init(hard=false){
  S = freshState();
  UI.day.textContent = String(S.day);
  UI.pm.textContent = "0";
  // defaults (feel free to tune)
  UI.traffic.value = 60;
  UI.kilns.value = 70;
  UI.burning.value = 55;
  UI.dust.value = 50;

  syncSliderLabels();
  applyEpisode();

  // Seed initial “day 0” point for plot feel
  const startTotal = (S.pm_primary + S.pm_sulf + S.pm_nit + S.pm_soa);
  S.history = [{ day: 0, total: startTotal, hazeMult: 1.0 }];
  renderBars(startTotal);
  renderPlot();

  if (hard) toast("Restarted. Try cutting kilns/burning before inversion days.");
}

init();
