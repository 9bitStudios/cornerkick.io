// Vantage point cloud: the Expense Tracker AI build session (window.cloudData) drawn as measured points.
// Height follows brightness, colour follows height, the app's green chart marks what was found,
// and a sweep passes through every seven seconds. Pauses off screen, on hover and focus, from its button, and under reduced motion.
(function () {
  const fig = document.querySelector('[data-cloud]');
  const data = window.cloudData;
  if (!fig || !data) return;
  const canvas = fig.querySelector('canvas');
  const toggle = fig.querySelector('[data-loop-toggle]');
  const ctx = canvas.getContext('2d');
  const { cols, rows } = data;
  const n = cols * rows;
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const lum = decode(data.lum), found = decode(data.found);

  // Resolve the theme's point tokens to RGB through a gradient, 32 steps from low to high.
  const STEPS = 32;
  const css = getComputedStyle(document.documentElement);
  const tok = (name) => css.getPropertyValue(name).trim();
  const probe = document.createElement('canvas');
  probe.width = STEPS; probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const grad = pctx.createLinearGradient(0, 0, STEPS, 0);
  grad.addColorStop(0, tok('--point-lo')); grad.addColorStop(0.55, tok('--point-mid')); grad.addColorStop(1, tok('--point-hi'));
  pctx.fillStyle = grad; pctx.fillRect(0, 0, STEPS, 1);
  const px = pctx.getImageData(0, 0, STEPS, 1).data;
  const ramp = Array.from({ length: STEPS }, (_, i) => `rgb(${px[i * 4]} ${px[i * 4 + 1]} ${px[i * 4 + 2]})`);
  const accent = tok('--color-accent');

  // Model space: x across the screen, z down it, y up from brightness.
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = gy * cols + gx;
      X[i] = (gx / (cols - 1) - 0.5) * 1.77;
      Z[i] = gy / (rows - 1) - 0.5;
      Y[i] = Math.pow(lum[i] / 255, 1.4) * 0.26;
    }
  }

  const sx = new Float32Array(n), sy = new Float32Array(n), ss = new Float32Array(n);
  const bucket = new Uint8Array(n);
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H;
  };

  const draw = (t, sweepAt) => {
    const yaw = Math.sin((t / 120000) * Math.PI * 2) * 0.45;
    const pitch = 0.95;
    const cy = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const scale = Math.min(W / 1.6, H / 0.9);
    const cam = 2.2;
    const sweep = sweepAt === null ? ((t % 7000) / 7000) * 1.6 - 0.8 : sweepAt;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i++) {
      const x = X[i] * cy - Z[i] * sy0, z0 = X[i] * sy0 + Z[i] * cy;
      const y = Y[i] * cp - z0 * sp, z = Y[i] * sp + z0 * cp;
      const d = cam / (cam + z);
      sx[i] = W / 2 + x * scale * d;
      sy[i] = H * 0.52 - y * scale * d;
      ss[i] = Math.max(0.8, 1.6 * d) * dpr;
      const lift = Math.max(0, 1 - Math.abs(Z[i] - sweep) * 14);
      bucket[i] = Math.min(STEPS - 1, Math.round((Y[i] / 0.26) * (STEPS - 1) * (0.55 + 0.45 * d) + lift * STEPS * 0.6));
    }
    for (let b = 0; b < STEPS; b++) {
      ctx.fillStyle = ramp[b];
      for (let i = 0; i < n; i++) if (bucket[i] === b && !found[i]) ctx.fillRect(sx[i], sy[i], ss[i], ss[i]);
    }
    ctx.fillStyle = accent;
    for (let i = 0; i < n; i++) if (found[i]) ctx.fillRect(sx[i], sy[i], ss[i] * 1.3, ss[i] * 1.3);
  };

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const s = { seen: false, hover: false, focus: false, held: reduce.matches };
  let raf = 0, last = 0, clock = 0, prev = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    clock += Math.min(now - (prev || now), 100);
    prev = now; last = now;
    draw(clock, null);
  };
  const sync = () => {
    const run = s.seen && !s.hover && !s.focus && !s.held && !document.hidden;
    if (run && !raf) { prev = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!run && !raf) draw(clock, s.held && reduce.matches ? 0 : null);
    fig.classList.toggle('is-running', run);
    if (toggle) toggle.textContent = s.held ? 'Play' : 'Pause';
  };

  resize();
  document.documentElement.classList.add('has-cloud');
  draw(0, 0);
  new ResizeObserver(() => { resize(); if (!raf) draw(clock, s.held && reduce.matches ? 0 : null); }).observe(canvas);
  new IntersectionObserver(([e]) => { s.seen = e.isIntersecting; sync(); }).observe(fig);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', () => { s.held = reduce.matches; sync(); });
  if (toggle) toggle.addEventListener('click', () => { s.held = !s.held; sync(); });
  [['pointerenter', 'hover', true], ['pointerleave', 'hover', false], ['focusin', 'focus', true], ['focusout', 'focus', false]].forEach(([type, key, v]) => fig.addEventListener(type, () => { s[key] = v; sync(); }));
})();
