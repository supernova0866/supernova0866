(function () {
  const canvas = document.getElementById('c');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CONFIG = {
    count: 65,
    dotRadius: 1.8,
    lineColor: '240, 237, 232',
    connectDist: 110,
    cursorDist: 150,
    speed: 0.35,
    lineOpacity: 0.2,
    lineWidth: 0.4,
  };

  let W, H, mouse = { x: -9999, y: -9999 };
  let particles = [];

  function resize() {
    const parent = canvas.parentElement;
    W = canvas.width = parent.clientWidth;
    H = canvas.height = parent.clientHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(initial = false) {
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : (Math.random() < 0.5 ? -5 : H + 5);
      const angle = Math.random() * Math.PI * 2;
      this.speedFactor = 0.4 + Math.random() * 0.6;
      this.vx = Math.cos(angle) * this.speedFactor;
      this.vy = Math.sin(angle) * this.speedFactor;
    }
    update() {
      this.x += this.vx * CONFIG.speed;
      this.y += this.vy * CONFIG.speed;
      if (this.x < -10) this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      if (this.y < -10) this.y = H + 10;
      if (this.y > H + 10) this.y = -10;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, CONFIG.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(240, 237, 232, 0.45)';
      ctx.fill();
    }
  }

  function init() {
    particles = Array.from({ length: CONFIG.count }, () => new Particle());
  }

  function drawLine(x1, y1, x2, y2, alpha) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${CONFIG.lineColor}, ${alpha * CONFIG.lineOpacity})`;
    ctx.lineWidth = CONFIG.lineWidth;
    ctx.stroke();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONFIG.connectDist) {
          drawLine(particles[i].x, particles[i].y, particles[j].x, particles[j].y,
            1 - dist / CONFIG.connectDist);
        }
      }
      const cx = particles[i].x - mouse.x;
      const cy = particles[i].y - mouse.y;
      const cdist = Math.sqrt(cx * cx + cy * cy);
      if (cdist < CONFIG.cursorDist) {
        drawLine(particles[i].x, particles[i].y, mouse.x, mouse.y,
          (1 - cdist / CONFIG.cursorDist) * 1.5);
      }
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { resize(); init(); });
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

  resize();
  init();
  loop();
})();
