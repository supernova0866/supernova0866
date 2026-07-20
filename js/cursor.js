/**
 * cursor.js
 * Handles cursor shape and cursor follower for nova's portfolio.
 *
 * Cursor shapes:
 *   default      — system cursor
 *   glow-circle  — small glowing white circle
 *   tri-force    — 3 triangles arranged so their vertices meet, forming a triangle gap in the centre
 *
 * localStorage keys:
 *   nova-cursor    — cursor shape
 *   nova-follower  — cursor follower sprite
 */

(function () {

  // ── CONFIG ──────────────────────────────────────────────────────────────────

  const FOLLOWERS = {
    cat:    'https://raw.githubusercontent.com/adryd325/oneko.js/main/oneko.gif',
    calico: 'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/calico.png',
    dog:    'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/snuupy.png',
    shiba:  'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/snuupy.png',
    eevee:  'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/eevee.png',
    kirby:  'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/eevee.png',
    ghost:  'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/ghost.png',
    fox:    'https://raw.githubusercontent.com/onekocord/onekocord/main/skins/fox.png',
    none:   null,
  };

  const CURSORS = {
    default:     'default',
    'glow-circle': 'custom',
    'tri-force':   'custom',
  };

  // ── STATE ────────────────────────────────────────────────────────────────────

  let followerScript = null;
  let cursorEl       = null;
  let currentCursor  = 'default';
  let mouseX = 0, mouseY = 0;
  let rafId  = null;

  // ── CUSTOM CURSOR ELEMENT ────────────────────────────────────────────────────

  function buildGlowCircle() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.style.overflow = 'visible';

    // Outer glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="cg-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    svg.appendChild(defs);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'white');
    circle.setAttribute('stroke-width', '1.2');
    circle.setAttribute('filter', 'url(#cg-glow)');
    svg.appendChild(circle);

    // Tiny solid centre dot
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '12');
    dot.setAttribute('r', '1');
    dot.setAttribute('fill', 'white');
    svg.appendChild(dot);

    return svg;
  }

  function buildTriForce() {
    /*
      Triforce: 3 small equilateral triangles whose vertices meet,
      leaving a downward-pointing triangular gap in the centre.

      We place 4 equilateral triangles in a 2×2 grid arrangement
      (like the Sierpinski triangle step 1), then only draw the 3
      outer ones — top, bottom-left, bottom-right.

      Grid origin: top-left corner of the bounding 2×2 block.
      Unit side  = S  (each small triangle has side S)
      Full block : width = 2S, height = sqrt(3)*S

      Small triangle height: H = sqrt(3)/2 * S

      Vertices of the 4 positions (row, col):
        top     (0,0 shifted): tip=(cx, top),    bl=(cx-S/2, top+H), br=(cx+S/2, top+H)
        bot-L   (1,0):         tip=(cx-S/2,top+H), bl=(cx-S,top+2H),  br=(cx,top+2H)
        bot-R   (1,1):         tip=(cx+S/2,top+H), bl=(cx,top+2H),    br=(cx+S,top+2H)
        centre  (gap, skip)
    */
    const SIZE = 20;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width',  String(SIZE));
    svg.setAttribute('height', String(SIZE));
    svg.style.overflow = 'visible';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="tf-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="1.8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    svg.appendChild(defs);

    const S  = SIZE * 0.42;          // side of each small triangle
    const H  = (Math.sqrt(3) / 2) * S; // height of each small triangle
    const cx = SIZE / 2;
    const top = (SIZE - 2 * H) / 2; // y of topmost point so block is centred

    // The three triangles (each defined by 3 [x,y] vertices)
    const tris = [
      // top triangle — points up
      [ [cx,         top      ],
        [cx - S/2,   top + H  ],
        [cx + S/2,   top + H  ] ],
      // bottom-left — points up
      [ [cx - S/2,   top + H  ],
        [cx - S,     top + 2*H],
        [cx,         top + 2*H] ],
      // bottom-right — points up
      [ [cx + S/2,   top + H  ],
        [cx,         top + 2*H],
        [cx + S,     top + 2*H] ],
    ];

    tris.forEach(pts => {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts.map(p => p.map(n => n.toFixed(2)).join(',')).join(' '));
      poly.setAttribute('fill',         'rgba(255,255,255,0.92)');
      poly.setAttribute('stroke',       'rgba(255,255,255,0.3)');
      poly.setAttribute('stroke-width', '0.3');
      poly.setAttribute('filter',       'url(#tf-glow)');
      svg.appendChild(poly);
    });

    return svg;
  }

  function createCursorEl(key) {
    const el = document.createElement('div');
    el.id = 'nova-cursor';
    Object.assign(el.style, {
      position:      'fixed',
      top:           '0',
      left:          '0',
      pointerEvents: 'none',
      zIndex:        '999999',
      willChange:    'transform',
      // offset so hotspot is centred
      transform:     'translate(-50%, -50%)',
    });

    if (key === 'glow-circle') el.appendChild(buildGlowCircle());
    if (key === 'tri-force')   el.appendChild(buildTriForce());

    return el;
  }

  // ── RAF LOOP ─────────────────────────────────────────────────────────────────

  function startRaf() {
    if (rafId) return;
    function loop() {
      if (cursorEl) {
        cursorEl.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px))`;
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ── CURSOR SHAPE ─────────────────────────────────────────────────────────────

  function removeCursorEl() {
    const old = document.getElementById('nova-cursor');
    if (old) old.remove();
    cursorEl = null;
    stopRaf();
  }

  function loadCursor(key) {
    currentCursor = key;
    try { localStorage.setItem('nova-cursor', key); } catch (e) {}
    syncSelects('select-cursor', key);

    removeCursorEl();

    if (!document.body) return;

    if (key === 'default') {
      document.body.style.cursor = '';
      const st = document.getElementById('nova-cursor-style');
      if (st) st.textContent = '';
      return;
    }

    // Hide system cursor everywhere including pointer on links/buttons
    document.body.style.cursor = 'none';
    let styleTag = document.getElementById('nova-cursor-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'nova-cursor-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = '*, *:hover { cursor: none !important; }';

    cursorEl = createCursorEl(key);
    document.body.appendChild(cursorEl);
    startRaf();
  }

  // ── FOLLOWER ─────────────────────────────────────────────────────────────────

  function removeFollower() {
    if (window.onekoInstance) {
      window.onekoInstance.changeFollower(null);
    } else {
      document.querySelectorAll('#oneko').forEach(el => el.remove());
      if (followerScript) { followerScript.remove(); followerScript = null; }
    }
  }

  function loadFollower(key) {
    try { localStorage.setItem('nova-follower', key); } catch (e) {}
    syncSelects('select-follower', key);

    const gifUrl = FOLLOWERS[key];

    if (window.onekoInstance) {
      window.onekoInstance.changeFollower(gifUrl);
      return;
    }

    if (!gifUrl) {
      removeFollower();
      return;
    }

    window.onekoCatUrl = gifUrl;
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  function syncSelects(id, value) {
    document.querySelectorAll('.custom-select[id="' + id + '"]').forEach(sel => {
      sel.dataset.value = value;
      const opt = sel.querySelector(`.custom-select-option[data-value="${value}"]`);
      if (opt) {
        sel.querySelector('.custom-select-trigger').textContent = opt.textContent;
        sel.querySelectorAll('.custom-select-option').forEach(o => o.classList.toggle('selected', o === opt));
      }
    });
  }

  function saved(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  // ── MOUSE TRACKING ───────────────────────────────────────────────────────────

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ── INIT ─────────────────────────────────────────────────────────────────────

  // Apply cursor immediately (before DOM ready — hides flicker)
  loadCursor(saved('nova-cursor', 'default'));

  function init() {
    // Restore saved values into custom selects
    syncSelects('select-cursor',   saved('nova-cursor',   'default'));
    syncSelects('select-follower', saved('nova-follower', 'cat'));
    // Load saved follower
    loadFollower(saved('nova-follower', 'cat'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────────

  window.CursorJS = { loadCursor, loadFollower, FOLLOWERS, CURSORS };

})();