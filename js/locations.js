/* ============ locations.js — film location library ============ */
"use strict";

var LocationsView = (function () {

  // minimal EXIF GPS reader (JPEG APP1/TIFF) — fills coordinates straight from the photo
  function exifGps(buf) {
    try {
      var v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      var off = 2;
      while (off + 4 < v.byteLength) {
        if (v.getUint8(off) !== 0xFF) break;
        var marker = v.getUint8(off + 1);
        var size = v.getUint16(off + 2);
        if (marker === 0xE1 && v.getUint32(off + 4) === 0x45786966) {
          var tiff = off + 10;
          var little = v.getUint16(tiff) === 0x4949;
          var u16 = function (p) { return v.getUint16(p, little); };
          var u32 = function (p) { return v.getUint32(p, little); };
          var ifd0 = tiff + u32(tiff + 4);
          var n = u16(ifd0), gpsIfd = 0;
          for (var i = 0; i < n; i++) {
            var e = ifd0 + 2 + i * 12;
            if (u16(e) === 0x8825) gpsIfd = tiff + u32(e + 8);
          }
          if (!gpsIfd) return null;
          var rat = function (p) { return u32(p) / (u32(p + 4) || 1); };
          var dms = function (p) { return rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600; };
          var gn = u16(gpsIfd), lat = null, lng = null, latRef = "N", lngRef = "E";
          for (var j = 0; j < gn; j++) {
            var g = gpsIfd + 2 + j * 12;
            var tag = u16(g);
            if (tag === 1) latRef = String.fromCharCode(v.getUint8(g + 8));
            else if (tag === 3) lngRef = String.fromCharCode(v.getUint8(g + 8));
            else if (tag === 2) lat = dms(tiff + u32(g + 8));
            else if (tag === 4) lng = dms(tiff + u32(g + 8));
          }
          if (lat === null || lng === null || (!lat && !lng)) return null;
          if (latRef === "S") lat = -lat;
          if (lngRef === "W") lng = -lng;
          return lat.toFixed(5) + "," + lng.toFixed(5);
        }
        if (marker === 0xDA) break;
        off += 2 + size;
      }
    } catch (e) { /* corrupt EXIF — just skip */ }
    return null;
  }

  // shrink the photo before it goes into localStorage (space is precious there)
  function compressImage(file, cb) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 900;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cb(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

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
      '<label class="field"><span>📷 Fotos hochladen (GPS wird automatisch aus dem Bild gelesen)</span>' +
      '<input type="file" id="l-upload" accept="image/*" multiple></label>' +
      '<div id="l-thumbs" class="row" style="flex-wrap:wrap;gap:8px">' +
      (v.photosData || []).map(function (p, i) {
        return '<span style="position:relative"><img src="' + p + '" style="width:74px;height:74px;object-fit:cover;border-radius:10px">' +
          '<button class="small ghost danger" data-del-photo="' + i + '" style="position:absolute;top:-6px;right:-6px">✕</button></span>';
      }).join("") + '</div>' +
      '<label class="field"><span>Photo links (https, one per line — Dropbox shared links)</span><textarea id="l-photos" style="min-height:70px">' + esc((v.photos || []).join("\n")) + '</textarea></label>' +
      '<label class="field"><span>Notes (access, permits, best light...)</span><textarea id="l-notes" style="min-height:80px">' + esc(v.notes) + '</textarea></label>' +
      (loc ? Graph.relatedHTML(loc.id) : "") +
      '<div class="modal-actions">' +
      (loc ? '<button class="ghost danger" id="l-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="l-save">Save</button></div>';
    openModal(html);
    Graph.bindRelated();

    /* photo upload: EXIF-GPS lesen + komprimiert speichern */
    var pendingPhotos = (v.photosData || []).slice();
    function refreshThumbs() {
      var box = $("#l-thumbs");
      box.innerHTML = pendingPhotos.map(function (p, i) {
        return '<span style="position:relative"><img src="' + p + '" style="width:74px;height:74px;object-fit:cover;border-radius:10px">' +
          '<button class="small ghost danger" data-del-photo="' + i + '" style="position:absolute;top:-6px;right:-6px">✕</button></span>';
      }).join("");
      bindThumbDelete();
    }
    function bindThumbDelete() {
      $$("[data-del-photo]").forEach(function (b) {
        b.onclick = function (ev) {
          ev.preventDefault();
          pendingPhotos.splice(parseInt(b.getAttribute("data-del-photo"), 10), 1);
          refreshThumbs();
        };
      });
    }
    bindThumbDelete();
    var up = $("#l-upload");
    if (up) up.onchange = function () {
      Array.from(up.files || []).forEach(function (file) {
        var r = new FileReader();
        r.onload = function () {
          var gps = exifGps(r.result);
          if (gps && !$("#l-coords").value.trim()) {
            $("#l-coords").value = gps;
            toast("📍 Standort aus dem Foto gelesen: " + gps);
          } else if (!gps && !$("#l-coords").value.trim()) {
            toast("Kein GPS im Bild (WhatsApp/Screenshots entfernen es) — Koordinaten manuell eintragen", true);
          }
          compressImage(file, function (dataUrl) {
            if (dataUrl) { pendingPhotos.push(dataUrl); refreshThumbs(); }
          });
        };
        r.readAsArrayBuffer(file);
      });
      up.value = "";
    };

    $("#l-save").onclick = function () {
      var name = $("#l-name").value.trim();
      if (!name) { toast("Name required", true); return; }
      var photos = $("#l-photos").value.split("\n").map(function (u) { return u.trim(); })
        .filter(function (u) { return safeUrl(u); });
      var now = new Date().toISOString();
      var data = {
        name: name, area: $("#l-area").value.trim(), coords: $("#l-coords").value.trim(),
        tags: $("#l-tags").value.trim(), vibe: $("#l-vibe").value.trim(),
        photos: photos, photosData: pendingPhotos, notes: $("#l-notes").value.trim(), updatedAt: now
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
        var photo = (l.photosData || [])[0] || (l.photos || []).map(safeUrl).filter(Boolean)[0];
        var ml = mapsLink(l.coords);
        var nPhotos = (l.photosData || []).length + (l.photos || []).length;
        return '<div class="card tint-teal idea-card clickable" data-loc="' + esc(l.id) + '"' +
          (photo ? ' style="background-image:linear-gradient(180deg,rgba(12,9,8,.55) 0%,rgba(12,9,8,.85) 100%),url(\'' + (photo.indexOf("data:") === 0 ? photo : esc(photo)) + '\');background-size:cover;background-position:center"' : "") + '>' +
          '<span class="idea-emoji">📍</span>' +
          '<div class="row between mb"><span class="badge">' + esc(l.area || "—") + '</span>' +
          '<span class="muted" style="font-size:11px">' + nPhotos + ' 📷</span></div>' +
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
