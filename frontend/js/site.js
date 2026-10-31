(function () {
  const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function bindGlow(node) {
    node.addEventListener('mousemove', (e) => {
      const r = node.getBoundingClientRect();
      node.style.setProperty('--gx', e.clientX - r.left + 'px');
      node.style.setProperty('--gy', e.clientY - r.top + 'px');
    });
    node.addEventListener('mouseleave', () => {
      node.style.setProperty('--gx', '-9999px');
      node.style.setProperty('--gy', '-9999px');
    });
  }

  const empty = (text) => {
    const p = el('p', 'project-desc', text);
    p.style.padding = '2rem 0';
    return p;
  };

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.json();
  }

  async function renderProjects() {
    const list = document.querySelector('.project-list');
    if (!list) return;
    try {
      const projects = await getJson('/api/projects');
      list.replaceChildren();
      if (!projects.length) { list.append(empty('nothing here yet.')); return; }

      for (const p of projects) {
        const item = el('div', 'project-item glow-target');
        const info = el('div', 'project-info');
        info.append(el('div', 'project-name', (p.pinned ? '★ ' : '') + p.name));
        if (p.desc) info.append(el('div', 'project-desc', p.desc));
        if (p.stack && p.stack.length) {
          const stack = el('div', 'project-stack');
          p.stack.forEach((s) => stack.append(el('span', 'stack-pill', s)));
          info.append(stack);
        }
        item.append(info);
        if (p.link && SAFE_LINK.test(p.link)) {
          const a = el('a', 'project-link', '↗ view');
          a.href = p.link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          item.append(a);
        }
        bindGlow(item);
        list.append(item);
      }
    } catch (e) {
      console.warn('projects failed to load', e);
    }
  }

  async function renderSocials() {
    const list = document.querySelector('.socials-list');
    if (!list) return;
    try {
      const socials = await getJson('/api/socials');
      list.replaceChildren();
      if (!socials.length) { list.append(empty('nothing here yet.')); return; }

      for (const s of socials) {
        const a = el('a', 'social-item');
        if (s.url && SAFE_LINK.test(s.url)) {
          a.href = s.url;
          if (/^https?:/i.test(s.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        }
        a.append(el('span', 'social-platform', s.platform), el('span', 'social-handle', s.handle));
        const arrow = el('span', 'social-arrow', '→');
        arrow.setAttribute('aria-hidden', 'true');
        a.append(arrow);
        list.append(a);
      }
    } catch (e) {
      console.warn('socials failed to load', e);
    }
  }

  async function applyConfig() {
    try {
      const cfg = await getJson('/api/config');
      const loc = document.getElementById('clock-location');
      if (loc) loc.textContent = (cfg['hero:location'] || '').trim() || 'on the internet';
    } catch (e) { }
  }

  const SECTIONS = ['home', 'now', 'about', 'projects', 'socials'];

  function fromHash() {
    const id = location.hash.replace('#', '');
    if (SECTIONS.includes(id) && typeof window.showSection === 'function') window.showSection(id);
  }

  function setupHash() {
    document.querySelectorAll('.nav-link[data-section], .footer-link[data-section]').forEach((link) => {
      link.addEventListener('click', () => {
        const id = link.dataset.section;
        history.replaceState(null, '', id === 'home' ? location.pathname : '#' + id);
      });
    });
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  function init() {
    renderProjects();
    renderSocials();
    applyConfig();
    setupHash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
