// canvas/loader.js — randomly picks one effect from EFFECTS on each page load.
// To add a new effect: drop a self-contained JS file into canvas/ and add its
// name (without .js) to the EFFECTS array below.
(function () {
  const EFFECTS = [
    'particles',
  ];

  const pick = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
  const script = document.createElement('script');
  script.src = '/canvas/' + pick + '.js';
  document.currentScript
    ? document.currentScript.after(script)
    : document.body.appendChild(script);
})();
