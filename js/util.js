/* ============ util.js — helpers, DOM, dates, modal, toast ============ */
"use strict";

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function safeUrl(u) {
  // only allow http(s) links in href attributes — blocks javascript:/data: schemes
  if (!u) return "";
  var s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

function el(html) {
  var t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function uid(prefix) {
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

/* ---------- dates ---------- */
function todayISO() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseISO(iso) {
  if (!iso) return null;
  var p = String(iso).slice(0, 10).split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function fmtDate(iso, opts) {
  var d = parseISO(iso);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", opts || { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateShort(iso) { return fmtDate(iso, { day: "numeric", month: "short" }); }
function addDays(iso, n) {
  var d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function daysBetween(isoA, isoB) {
  var a = parseISO(isoA), b = parseISO(isoB);
  return Math.round((b - a) / 86400000);
}
function weekdayShort(iso) {
  var d = parseISO(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US");
}
function fmtCompact(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 999500000) return (Math.round(n / 100000000) / 10) + "B";
  if (n >= 999500) return (Math.round(n / 100000) / 10) + "M";
  if (n >= 1000) return (Math.round(n / 100) / 10) + "K";
  return String(n);
}

/* ---------- modal ---------- */
var _modalSticky = false;
function openModal(innerHTML, opts) {
  closeModal();
  _modalSticky = !!(opts && opts.sticky);
  var root = $("#modal-root");
  var backdrop = el('<div class="modal-backdrop"><div class="modal">' + innerHTML + "</div></div>");
  backdrop.addEventListener("mousedown", function (e) {
    if (e.target === backdrop && !_modalSticky) closeModal();
  });
  root.appendChild(backdrop);
  var firstInput = $("input, textarea, select", backdrop);
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 30);
  return backdrop;
}
function closeModal() { _modalSticky = false; $("#modal-root").innerHTML = ""; }
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !_modalSticky) closeModal();
});

/* ---------- toast ---------- */
function toast(msg, isError) {
  var t = el('<div class="toast' + (isError ? " error" : "") + '">' + esc(msg) + "</div>");
  $("#toast-root").appendChild(t);
  setTimeout(function () { t.remove(); }, 2600);
}

/* ---------- tiny SVG line chart ---------- */
function sparkline(points, opts) {
  // points: [{x: number(ms or index), y: number}] sorted by x
  opts = opts || {};
  var w = opts.width || 600, h = opts.height || 160, pad = 26;
  if (!points || points.length === 0) return '<div class="empty-note">No data points yet.</div>';
  var xs = points.map(function (p) { return p.x; });
  var ys = points.map(function (p) { return p.y; });
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var dataMax = Math.max.apply(null, ys), dataMin = Math.min.apply(null, ys);
  // zoom to the data unless the goal is within reach of the curve (< 2x max)
  var showGoal = opts.goal && opts.goal <= dataMax * 2;
  var maxY = Math.max(showGoal ? opts.goal : dataMax * 1.08, 10);
  var minY = Math.max(0, dataMin - (maxY - dataMin) * 0.15);
  if (maxY === minY) maxY = minY + 1;
  if (maxX === minX) maxX = minX + 1;
  function X(v) { return pad + ((v - minX) / (maxX - minX)) * (w - pad * 2); }
  function Y(v) { return h - pad - ((v - minY) / (maxY - minY)) * (h - pad * 2); }
  var path = points.map(function (p, i) { return (i === 0 ? "M" : "L") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ");
  var dots = points.map(function (p) {
    return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3.2" fill="#EAFBF7"/>';
  }).join("");
  var goalLine = "";
  if (showGoal) {
    goalLine = '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + Y(opts.goal).toFixed(1) + '" y2="' + Y(opts.goal).toFixed(1) +
      '" stroke="#FFD98A" stroke-dasharray="5 5" stroke-width="1.2" opacity=".8"/>' +
      '<text x="' + (w - pad) + '" y="' + (Y(opts.goal) - 6).toFixed(1) + '" text-anchor="end" fill="#FFD98A" font-size="11">Goal ' + fmtCompact(opts.goal) + "</text>";
  }
  var area = path + " L" + X(maxX).toFixed(1) + " " + Y(minY).toFixed(1) + " L" + X(minX).toFixed(1) + " " + Y(minY).toFixed(1) + " Z";
  return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet" role="img">' +
    '<defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#FFFFFF" stop-opacity=".30"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#sparkfill)"/>' +
    goalLine +
    '<path d="' + path + '" fill="none" stroke="#EAFBF7" stroke-width="2.4" stroke-linejoin="round"/>' +
    dots + "</svg>";
}

/* ---------- ring gauge (Oura-style circular progress) ---------- */
function ringGauge(percent, opts) {
  opts = opts || {};
  var size = opts.size || 136;
  var stroke = opts.stroke || 9;
  var r = (size - stroke) / 2 - 2;
  var c = 2 * Math.PI * r;
  var pct = Math.max(0, Math.min(100, percent || 0));
  var dash = (pct / 100) * c;
  var color = opts.color || "#2FA39A";
  var id = "rg" + Math.random().toString(36).slice(2, 7);
  return '<svg viewBox="0 0 ' + size + " " + size + '" style="width:100%;max-width:' + size + 'px" role="img">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity=".55"/>' +
    '<stop offset="100%" stop-color="' + color + '"/></linearGradient></defs>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="' + stroke + '"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + stroke + '"' +
    ' stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + " " + c.toFixed(1) + '"' +
    ' transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')">' +
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "" :
      '<animate attributeName="stroke-dasharray" from="0 ' + c.toFixed(1) + '" to="' + dash.toFixed(1) + " " + c.toFixed(1) + '" dur="1.1s" calcMode="spline" keySplines="0.22 1 0.36 1" fill="freeze"/>') +
    '</circle>' +
    '<text x="50%" y="47%" text-anchor="middle" fill="#FFFFFF" font-size="' + size * 0.19 + '" font-weight="800" font-family="-apple-system, system-ui, sans-serif">' + esc(opts.value || "") + '</text>' +
    '<text x="50%" y="62%" text-anchor="middle" fill="rgba(255,255,255,.65)" font-size="' + size * 0.078 + '" letter-spacing="1">' + esc(opts.sub || "") + '</text>' +
    '</svg>';
}

/* ---------- confetti (dopamine, zero deps) ---------- */
function confetti(opts) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var colors = ["#E8871E", "#2FA39A", "#E63946", "#B04A93", "#E3A72F", "#F6EEDD"];
  var cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:400";
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  var ctx = cv.getContext("2d");
  var n = (opts && opts.count) || 90;
  var parts = [];
  for (var i = 0; i < n; i++) {
    parts.push({
      x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.5,
      y: cv.height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length]
    });
  }
  var t0 = performance.now();
  (function frame(t) {
    var dt = (t - t0) / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - dt / 1.6);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (dt < 1.6) requestAnimationFrame(frame);
    else cv.remove();
  })(t0);
}

/* ---------- download / upload ---------- */
function downloadBlob(content, filename, mime) {
  var blob = new Blob([content], { type: mime });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function downloadJSON(obj, filename) {
  downloadBlob(JSON.stringify(obj, null, 2), filename, "application/json");
}
function pickJSONFile(cb) {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = function () {
    var f = input.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { cb(null, JSON.parse(r.result), f.name); }
      catch (e) { cb(e); }
    };
    r.readAsText(f);
  };
  input.click();
}
