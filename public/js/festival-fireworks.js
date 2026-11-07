(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  const colors = ['#fbbf24', '#f59e0b', '#8b5cf6', '#38bdf8', '#fde68a', '#fb923c'];
  const particles = [];
  const rockets = [];
  const isSmallScreen = window.matchMedia('(max-width: 600px)').matches;
  const burstSize = isSmallScreen ? 28 : 44;
  const maxParticles = isSmallScreen ? 420 : 760;
  let width = 0;
  let height = 0;
  let nextLaunch = 0;
  let lastFrame = 0;
  let animationFrame = 0;

  canvas.className = 'festival-fireworks';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function launchRocket() {
    const x = width * (0.12 + Math.random() * 0.76);
    rockets.push({
      x,
      y: height + 12,
      targetX: x + (Math.random() - 0.5) * width * 0.16,
      targetY: height * (0.18 + Math.random() * 0.34),
      progress: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  function burst(rocket) {
    const count = Math.min(burstSize, Math.max(0, maxParticles - particles.length));
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.08;
      const speed = 1.2 + Math.random() * 3.8;
      particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 38 + Math.random() * 22,
        maxLife: 60,
        color: rocket.color,
        size: 1.1 + Math.random() * 1.6,
      });
    }
  }

  function draw(now) {
    animationFrame = 0;
    if (document.hidden || reduceMotion.matches) return;
    if (now - lastFrame < 32) {
      animationFrame = window.requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;

    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';

    if (now >= nextLaunch) {
      launchRocket();
      nextLaunch = now + 1500 + Math.random() * 1100;
    }

    for (let index = rockets.length - 1; index >= 0; index -= 1) {
      const rocket = rockets[index];
      rocket.progress += 0.035;
      rocket.x += (rocket.targetX - rocket.x) * 0.035;
      rocket.y += (rocket.targetY - rocket.y) * 0.035;
      context.beginPath();
      context.moveTo(rocket.x, rocket.y + 16);
      context.lineTo(rocket.x, rocket.y);
      context.strokeStyle = rocket.color;
      context.lineWidth = 2;
      context.shadowBlur = 12;
      context.shadowColor = rocket.color;
      context.stroke();
      if (rocket.progress >= 1) {
        burst(rocket);
        rockets.splice(index, 1);
      }
    }

    context.shadowBlur = 9;
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + 0.035;
      particle.life -= 1;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    animationFrame = window.requestAnimationFrame(draw);
  }

  function resume() {
    if (!document.hidden && !reduceMotion.matches && !animationFrame) {
      lastFrame = 0;
      animationFrame = window.requestAnimationFrame(draw);
    }
  }

  function pause() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
  }

  resize();
  nextLaunch = performance.now() + 500;
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', resume);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) pause();
    else resume();
  });
  resume();
}());
