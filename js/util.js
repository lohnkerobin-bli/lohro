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
  var minY = 0, maxY = Math.max(Math.max.apply(null, ys), opts.goal || 0, 10);
  if (maxX === minX) maxX = minX + 1;
  function X(v) { return pad + ((v - minX) / (maxX - minX)) * (w - pad * 2); }
  function Y(v) { return h - pad - ((v - minY) / (maxY - minY)) * (h - pad * 2); }
  var path = points.map(function (p, i) { return (i === 0 ? "M" : "L") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ");
  var dots = points.map(function (p) {
    return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3.2" fill="#2A9D8F"/>';
  }).join("");
  var goalLine = "";
  if (opts.goal) {
    goalLine = '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + Y(opts.goal).toFixed(1) + '" y2="' + Y(opts.goal).toFixed(1) +
      '" stroke="#D4AF37" stroke-dasharray="5 5" stroke-width="1.2" opacity=".8"/>' +
      '<text x="' + (w - pad) + '" y="' + (Y(opts.goal) - 6).toFixed(1) + '" text-anchor="end" fill="#D4AF37" font-size="11">Goal ' + fmtCompact(opts.goal) + "</text>";
  }
  var area = path + " L" + X(maxX).toFixed(1) + " " + Y(minY).toFixed(1) + " L" + X(minX).toFixed(1) + " " + Y(minY).toFixed(1) + " Z";
  return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet" role="img">' +
    '<defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2A9D8F" stop-opacity=".35"/><stop offset="100%" stop-color="#2A9D8F" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#sparkfill)"/>' +
    goalLine +
    '<path d="' + path + '" fill="none" stroke="#2A9D8F" stroke-width="2.2" stroke-linejoin="round"/>' +
    dots + "</svg>";
}

/* ---------- ring gauge (Oura-style circular progress) ---------- */
function ringGauge(percent, opts) {
  opts = opts || {};
  var size = opts.size || 150;
  var stroke = opts.stroke || 9;
  var r = (size - stroke) / 2 - 2;
  var c = 2 * Math.PI * r;
  var pct = Math.max(0, Math.min(100, percent || 0));
  var dash = (pct / 100) * c;
  var color = opts.color || "#2A9D8F";
  var id = "rg" + Math.random().toString(36).slice(2, 7);
  return '<svg viewBox="0 0 ' + size + " " + size + '" style="width:100%;max-width:' + size + 'px" role="img">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity=".55"/>' +
    '<stop offset="100%" stop-color="' + color + '"/></linearGradient></defs>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="' + stroke + '"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + stroke + '"' +
    ' stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + " " + c.toFixed(1) + '"' +
    ' transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/>' +
    '<text x="50%" y="47%" text-anchor="middle" fill="#F1FAEE" font-size="' + size * 0.19 + '" font-weight="800" font-family="Futura, Avenir Next, system-ui, sans-serif">' + esc(opts.value || "") + '</text>' +
    '<text x="50%" y="62%" text-anchor="middle" fill="#8F958D" font-size="' + size * 0.078 + '" letter-spacing="1">' + esc(opts.sub || "") + '</text>' +
    '</svg>';
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
