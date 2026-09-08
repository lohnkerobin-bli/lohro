/* ============ app.js — hash router ============ */
"use strict";

var App = (function () {
  var routes = {
    dashboard: DashboardView,
    films: FilmsView,
    locations: LocationsView,
    festivals: FestivalsView,
    ideas: IdeasView,
    extern: ExternBrainView,
    phone: BrainPhoneView,
    projects: ProjectsView,
    brain: BrainView,
    settings: SettingsView
  };

  // challenge: the daily-challenge chapter is closed — old links land on films
  var ALIASES = { knowledge: "brain", challenge: "films", telefon: "phone", call: "phone" };

  function currentRoute() {
    var h = (location.hash || "#/dashboard").replace(/^#\//, "");
    if (ALIASES[h]) h = ALIASES[h];
    return routes[h] ? h : "dashboard";
  }

  function render() {
    var route = currentRoute();
    $$("#main-nav a").forEach(function (a) {
      var on = a.getAttribute("data-route") === route;
      a.classList.toggle("active", on);
      // the nav scrolls horizontally on phones — keep the active tab in view
      if (on && a.scrollIntoView && window.innerWidth <= 720) {
        try { a.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {}
      }
    });
    document.body.classList.toggle("ph-view", route === "phone");
    var tb = $("#topbar");
    if (tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px");
    var root = $("#view");
    routes[route].render(root);
    var s = Store.get();
    $("#footer-status").textContent =
      "Data: " + s.ideas.length + " ideas · " + Object.keys(s.challengeDays).length + " challenge days · saved locally " +
      (s.meta.updatedAt ? "· last edit " + s.meta.updatedAt.slice(0, 16).replace("T", " ") : "");
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", render);

  return { render: render };
})();
