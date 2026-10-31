(function () {
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const STYLE = {
    bold:      'font-weight:600;color:rgba(255,255,255,0.95)',
    muted:     'font-weight:400;color:rgba(255,255,255,0.4)',
    highlight: 'font-weight:500;color:rgba(255,255,255,0.92)',
    link:      'color:rgba(255,255,255,0.8);text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgba(255,255,255,0.25)',
    tag:       'display:inline-flex;align-items:center;padding:1px 8px;border-radius:4px;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:.04em;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6)',
  };

  const DIVIDER =
    '<div class="about-divider" aria-hidden="true" style="margin:2rem auto;width:100%;height:1px;background:linear-gradient(to right,transparent,rgba(255,255,255,0.06) 15%,rgba(255,255,255,0.06) 85%,transparent)"></div>';

  const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

  const NovaMark = {
    parse(text) {
      if (!text) return '';
      let html = esc(String(text));

      html = html.replace(/\{([^{}#\n]+)#([0-9a-fA-F]{6})\}/g, (m, word, color) =>
        `<span style="color:#${color}">${word}</span>`);

      html = html.replace(/\{bold:([^{}\n]+)\}/g, (m, t) => `<strong style="${STYLE.bold}">${t}</strong>`);
      html = html.replace(/\{muted:([^{}\n]+)\}/g, (m, t) => `<span style="${STYLE.muted}">${t}</span>`);
      html = html.replace(/\{highlight:([^{}\n]+)\}/g, (m, t) => `<span style="${STYLE.highlight}">${t}</span>`);

      html = html.replace(/\{link:([^{}|]+)\|([^{}]+)\}/g, (m, label, url) => {
        const u = url.trim();
        if (!SAFE_URL.test(u)) return label;
        return `<a href="${u}" style="${STYLE.link}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });

      html = html.replace(/\{tag:([^{}\n]+)\}/g, (m, t) => `<span style="${STYLE.tag}">${t}</span>`);
      html = html.replace(/\{divider\}/g, DIVIDER);
      html = html.replace(/\{break\}/g, '<br>');
      return html;
    },
  };

  if (typeof window !== 'undefined') window.NovaMark = NovaMark;
  if (typeof module !== 'undefined') module.exports = NovaMark;
})();
