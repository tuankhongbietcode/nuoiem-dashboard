/* Static demo shim: answers the dashboard's API calls from pre-baked JSON files.
   Loaded before app.js / admin.js, so window.fetch is already replaced when the
   page starts. Only URLs that belong to the dashboard API are touched; every
   other request goes to the real fetch unchanged. */
(function () {
  "use strict";

  var script = document.currentScript;
  var base = script ? script.src.replace(/[^/]*$/, "") : "";
  var realFetch = window.fetch.bind(window);
  var mapPromise = null;

  function loadMap() {
    if (!mapPromise) {
      mapPromise = realFetch(base + "api/_index.json").then(function (response) {
        return response.json();
      });
    }
    return mapPromise;
  }

  function canonical(url) {
    var parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (error) {
      return null;
    }
    var path = parsed.pathname;
    var at = path.indexOf("/api/");
    var key;
    if (at >= 0) {
      key = path.slice(at);
    } else if (/\/health$/.test(path)) {
      key = "/health";
    } else {
      return null;
    }
    var pairs = [];
    parsed.searchParams.forEach(function (value, name) {
      pairs.push([name, value]);
    });
    pairs.sort(function (a, b) {
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      if (a[1] === b[1]) return 0;
      return a[1] < b[1] ? -1 : 1;
    });
    if (!pairs.length) return key;
    return key + "?" + pairs.map(function (pair) {
      return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
    }).join("&");
  }

  function jsonResponse(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var key = canonical(url);
    if (!key) return realFetch(input, init);

    return loadMap().then(function (data) {
      var file = data.map[key];
      if (!file) {
        file = (data.defaults || {})[key.split("?")[0]];
      }
      if (!file) {
        return jsonResponse({ error: "not_in_static_demo" }, 404);
      }
      return realFetch(base + "api/" + file)
        .then(function (response) { return response.json(); })
        .then(function (payload) { return jsonResponse(payload, 200); });
    });
  };
})();
