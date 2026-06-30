// novamark.js - Custom parser for NovaMark syntax
(function() {
  const NovaMark = {
    parse: function(text) {
      if (!text) return '';
      
      // Escape HTML to prevent XSS
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // {Word#RRGGBB} -> <span style="color:#RRGGBB">Word</span>
      html = html.replace(/\{([^{}#\n]+)#([0-9a-fA-F]{6})\}/g, (match, word, color) => {
        return `<span style="color: #${color}">${word}</span>`;
      });

      // {bold:text} -> <strong>text</strong>
      html = html.replace(/\{bold:([^{}\n]+)\}/g, (match, inner) => {
        return `<strong class="font-bold text-white/95">${inner}</strong>`;
      });

      // {muted:text} -> muted white span
      html = html.replace(/\{muted:([^{}\n]+)\}/g, (match, inner) => {
        return `<span class="text-white/40 font-normal">${inner}</span>`;
      });

      // {highlight:text} -> bright white span
      html = html.replace(/\{highlight:([^{}\n]+)\}/g, (match, inner) => {
        return `<span class="text-white/90 font-medium">${inner}</span>`;
      });

      // {link:label|url} -> <a href="url" class="...">label</a>
      html = html.replace(/\{link:([^{}|]+)\|([^{}]+)\}/g, (match, label, url) => {
        return `<a href="${url}" class="text-white/80 hover:text-white underline underline-offset-4 decoration-white/20 hover:decoration-white/60 transition-all" target="_blank" rel="noopener">${label}</a>`;
      });

      // {tag:label} -> tag pill span
      html = html.replace(/\{tag:([^{}\n]+)\}/g, (match, label) => {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-wide bg-white/5 border border-white/10 text-white/60">${label}</span>`;
      });

      // {divider} -> <hr class="about-divider"> (which is the inset divider style in the main layout)
      html = html.replace(/\{divider\}/g, () => {
        return `<div class="about-divider" aria-hidden="true" style="margin: 2rem auto; width: 100%; height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.06) 15%, rgba(255,255,255,0.06) 85%, transparent);"></div>`;
      });

      // {break} -> <br>
      html = html.replace(/\{break\}/g, '<br>');

      return html;
    }
  };

  // Expose to global window
  if (typeof window !== 'undefined') {
    window.NovaMark = NovaMark;
  }
})();
