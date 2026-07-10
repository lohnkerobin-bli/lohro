/* ============ locations.js — film location library ============ */
"use strict";

var LocationsView = (function () {

  function editModal(id) {
    var s = Store.get();
    var loc = id ? s.locations.find(function (x) { return x.id === id; }) : null;
    var v = loc || { name: "", area: "", coords: "", tags: "", vibe: "", photos: [], notes: "" };
    var html =
      '<h3>' + (loc ? "Edit location" : "New location") + '</h3>' +
      '<div class="row">' +
      '<label class="field" style="flex:2"><span>Name</span><input id="l-name" value="' + esc(v.name) + '" placeholder="e.g. Sebis Body Bar"></label>' +
      '<label class="field" style="flex:1"><span>Area / town</span><input id="l-area" value="' + esc(v.area) + '" placeholder="St. Gallen"></label></div>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Coordinates (lat,lng)</span><input id="l-coords" value="' + esc(v.coords) + '" placeholder="47.42,9.37 — Claude reads them from photo EXIF"></label>' +
      '<label class="field" style="flex:2"><span>Tags (comma-separated)</span><input id="l-tags" value="' + esc(v.tags) + '" placeholder="bar, warm, tungsten, interieur"></label></div>' +
      '<label class="field"><span>Vibe (one sentence — what does this place feel like on camera?)</span><input id="l-vibe" value="' + esc(v.vibe) + '"></label>' +
      '<label class="field"><span>Photo links (https, one per line — Dropbox shared links)</span><textarea id="l-photos" style="min-height:70px">' + esc((v.photos || []).join("\n")) + '</textarea></label>' +
      '<label class="field"><span>Notes (access, permits, best light...)</span><textarea id="l-notes" style="min-height:80px">' + esc(v.notes) + '</textarea></label>' +
      (loc ? Graph.relatedHTML(loc.id) : "") +
      '<div class="modal-actions">' +
      (loc ? '<button class="ghost danger" id="l-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="l-save">Save</button></div>';
    openModal(html);
    Graph.bindRelated();
    $("#l-save").onclick = function () {
      var name = $("#l-name").value.trim();
      if (!name) { toast("Name required", true); return; }
      var photos = $("#l-photos").value.split("\n").map(function (u) { return u.trim(); })
        .filter(function (u) { return safeUrl(u); });
      var now = new Date().toISOString();
      var data = {
        name: name, area: $("#l-area").value.trim(), coords: $("#l-coords").value.trim(),
        tags: $("#l-tags").value.trim(), vibe: $("#l-vibe").value.trim(),
        photos: photos, notes: $("#l-notes").value.trim(), updatedAt: now
      };
      if (loc) Object.assign(loc, data);
      else { data.id = uid("loc"); data.createdAt = now; s.locations.unshift(data); }
      Store.save(); closeModal(); toast("Location saved"); App.render();
    };
    var del = $("#l-delete");
    if (del) del.onclick = function () {
      s.locations = s.locations.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Location deleted"); App.render();
    };
  }

  function mapsLink(coords) {
    if (!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(coords || "")) return "";
    return "https://maps.google.com/?q=" + encodeURIComponent(coords.replace(/\s+/g, ""));
  }

  function render(root) {
    var s = Store.get();
    if (LocationsView._pendingOpen) {
      var pid = LocationsView._pendingOpen;
      LocationsView._pendingOpen = null;
      setTimeout(function () { editModal(pid); }, 0);
    }
    var q = (render._q || "").toLowerCase();
    var visible = s.locations.filter(function (l) {
      return !q || (l.name + " " + l.area + " " + l.tags + " " + l.vibe + " " + l.notes).toLowerCase().indexOf(q) !== -1;
    });

    root.innerHTML =
      '<h1 class="view-title">Locations</h1>' +
      '<p class="view-sub">Your location library. Send Claude photos of a spot — GPS gets read from the picture, the location lands here, and film ideas get matching suggestions automatically.</p>' +
      '<div class="filter-bar">' +
      '<input id="loc-q" placeholder="Search locations..." value="' + esc(render._q || "") + '" style="flex:1;min-width:180px">' +
      '<button class="primary" id="loc-new">+ New location</button></div>' +
      '<div class="grid cols-3">' +
      visible.map(function (l) {
        var photo = (l.photos || []).map(safeUrl).filter(Boolean)[0];
        var ml = mapsLink(l.coords);
        return '<div class="card tint-teal idea-card clickable" data-loc="' + esc(l.id) + '"' +
          (photo ? ' style="background-image:linear-gradient(180deg,rgba(12,9,8,.55) 0%,rgba(12,9,8,.85) 100%),url(\'' + esc(photo) + '\');background-size:cover;background-position:center"' : "") + '>' +
          '<span class="idea-emoji">📍</span>' +
          '<div class="row between mb"><span class="badge">' + esc(l.area || "—") + '</span>' +
          '<span class="muted" style="font-size:11px">' + (l.photos || []).length + ' 📷</span></div>' +
          '<div style="font-weight:700;font-size:16px;position:relative">' + esc(l.name) + '</div>' +
          (l.vibe ? '<div class="muted mt" style="font-size:12.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;position:relative">' + esc(l.vibe) + '</div>' : "") +
          '<div class="row between mt"><span class="muted" style="font-size:11px">' + esc(l.tags || "") + '</span>' +
          (ml ? '<a href="' + esc(ml) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px">🗺 map</a>' : "") + '</div>' +
        '</div>';
      }).join("") + '</div>' +
      (visible.length === 0 ? '<div class="empty-note">No locations yet — send Claude a photo of a spot you like.</div>' : "");

    $("#loc-q").oninput = function () {
      render._q = this.value;
      var caret = this.selectionStart;
      App.render();
      var n = $("#loc-q");
      if (n) { n.focus(); n.setSelectionRange(caret, caret); }
    };
    $("#loc-new").onclick = function () { editModal(null); };
    $$("[data-loc]", root).forEach(function (n) {
      n.onclick = function () { editModal(n.getAttribute("data-loc")); };
    });
  }

  return { render: render };
})();
