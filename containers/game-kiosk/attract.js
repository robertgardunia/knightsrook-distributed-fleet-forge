// Attract mode — injected into HexGL index.html.
// Only activates when ?attract=1 is present (set by title.html after idle delay).
(function () {
  if (new URLSearchParams(window.location.search).get('attract') !== '1') return;

  function el(id) { return document.getElementById(id); }

  // Skip all menu steps — go straight to the game canvas
  function showGame() {
    ['step-1', 'step-2', 'step-3', 'step-5'].forEach(function (id) {
      var e = el(id);
      if (e) e.style.display = 'none';
    });
    var s4 = el('step-4');
    if (s4) { s4.style.display = 'block'; s4.style.opacity = '1'; }
  }

  function backToTitle() {
    window.location.href = 'title.html';
  }

  function launch() {
    showGame();

    var hexGL = new bkcore.hexgl.HexGL({
      document: document,
      width: window.innerWidth,
      height: window.innerHeight,
      container: el('main'),
      overlay: el('overlay'),
      quality: 2,      // Mainstream — solid visuals without melting the CPU
      difficulty: 0,
      hud: false,      // Clean attract display, no HUD clutter
      controlType: 0,
      track: 'Cityscape',
      mode: 'replay'
    });

    window.hexGL = hexGL;

    hexGL.load({
      onLoad: function () {
        hexGL.init();
        hexGL.start();
        // Patch finish handler — start() initialises gameplay, give it a tick
        setTimeout(function () {
          if (hexGL.gameplay) {
            hexGL.gameplay.onFinish = backToTitle;
          }
        }, 500);
      },
      onError:    function () { backToTitle(); },
      onProgress: function () {}
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    // Load replay data into localStorage (cached after first run)
    if (localStorage['race-Cityscape-replay']) {
      launch();
      return;
    }
    fetch('replays/cityscape-casual/bkcore.replay.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        localStorage['race-Cityscape-replay'] = JSON.stringify(data);
        launch();
      })
      .catch(backToTitle);
  });
}());
