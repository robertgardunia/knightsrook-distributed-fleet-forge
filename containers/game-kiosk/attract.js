// Attract mode — injected into HexGL index.html.
// Only activates when ?attract=1 is present (set by title.html after idle delay).
(function () {
  if (new URLSearchParams(window.location.search).get('attract') !== '1') return;

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function el(id) { return document.getElementById(id); }

  // Mute all audio when dashboard requests it
  var _isMuted = new URLSearchParams(window.location.search).get('muted') === '1';
  if (_isMuted) {
    var _OrigAC = window.AudioContext || window.webkitAudioContext;
    if (_OrigAC) {
      var _SilentAC = function() { var ctx = new _OrigAC(); ctx.suspend(); return ctx; };
      _SilentAC.prototype = _OrigAC.prototype;
      window.AudioContext = window.webkitAudioContext = _SilentAC;
    }
  }

  function showGame() {
    ['step-1', 'step-2', 'step-3', 'step-5'].forEach(function (id) {
      var e = el(id);
      if (e) e.style.display = 'none';
    });
    var s4 = el('step-4');
    if (s4) { s4.style.display = 'block'; s4.style.opacity = '1'; }
  }

  function backToTitle() {
    var params = new URLSearchParams(window.location.search);
    params.delete('attract');
    var qs = params.toString();
    window.location.href = 'title.html' + (qs ? '?' + qs : '');
  }

  function launch() {
    showGame();

    // Variable session cap — how long this "player" stays before leaving
    var sessionMs = rand(35, 90) * 1000;
    var exitTimer = setTimeout(backToTitle, sessionMs);

    var hexGL = new bkcore.hexgl.HexGL({
      document:    document,
      width:       window.innerWidth,
      height:      window.innerHeight,
      container:   el('main'),
      overlay:     el('overlay'),
      quality:     2,
      difficulty:  0,
      hud:         false,
      controlType: 0,
      track:       'Cityscape',
      mode:        'replay'
    });

    window.hexGL = hexGL;

    hexGL.load({
      onLoad: function () {
        hexGL.init();
        hexGL.start();
        // Patch finish callback once gameplay object exists
        setTimeout(function () {
          if (hexGL.gameplay) {
            hexGL.gameplay.onFinish = function () {
              clearTimeout(exitTimer);
              backToTitle();
            };
          }
        }, 500);
      },
      onError:    function () { clearTimeout(exitTimer); backToTitle(); },
      onProgress: function () {}
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
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
