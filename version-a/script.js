const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Mobile menu ---------- */
toggle.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
menu.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();

// Placeholder links go nowhere until you set a real href in index.html.
document.querySelectorAll('a[data-placeholder]').forEach((a) => {
  a.addEventListener('click', (e) => e.preventDefault());
});

/* ---------- Scroll progress ---------- */
const progress = document.querySelector('.progress');
const onScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.setProperty('--p', max > 0 ? scrollY / max : 0);
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Scroll reveal (staggered per group) ---------- */
const groups = [
  '.section-title', '.about-text', '.facts li', '.skills li',
  '.card', '.contact .lead', '.contact-list li',
];
const targets = document.querySelectorAll(groups.join(','));
targets.forEach((el) => {
  const siblings = [...el.parentElement.children].filter((c) => c.matches(groups.join(',')));
  el.style.setProperty('--d', `${siblings.indexOf(el) * 0.1}s`);
  el.classList.add('reveal');
});
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => io.observe(el));
} else {
  targets.forEach((el) => el.classList.add('in'));
}

/* ---------- Active nav link ---------- */
const links = [...menu.querySelectorAll('a')];
const spy = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) {
      links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${en.target.id}`));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));

/* ---------- Typing roles ---------- */
const typed = document.getElementById('typed');
const roles = ['مطوّر تطبيقات', 'مهتم بالذكاء الاصطناعي', 'مصمّم منتجات رقمية'];
if (!reduceMotion) {
  let r = 0, i = 0, deleting = false;
  const tick = () => {
    const word = roles[r];
    i += deleting ? -1 : 1;
    typed.textContent = word.slice(0, i);
    let delay = deleting ? 45 : 90;
    if (!deleting && i === word.length) { deleting = true; delay = 1600; }
    else if (deleting && i === 0) { deleting = false; r = (r + 1) % roles.length; delay = 400; }
    setTimeout(tick, delay);
  };
  typed.textContent = '';
  setTimeout(tick, 600);
}

/* ---------- Pointer effects: spotlight, card tilt ---------- */
if (finePointer && !reduceMotion) {
  const glow = document.querySelector('.cursor-glow');
  let tx = 0, ty = 0, gx = 0, gy = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; glow.classList.add('on'); });
  document.addEventListener('pointerleave', () => glow.classList.remove('on'));
  (function follow() {
    gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
    glow.style.transform = `translate(${gx - 260}px, ${gy - 260}px)`;
    requestAnimationFrame(follow);
  })();

  document.querySelectorAll('.card, .facts li, .contact-list li').forEach((el) => {
    const tilt = el.classList.contains('card');
    el.addEventListener('pointermove', (e) => {
      const b = el.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      if (tilt) {
        el.style.setProperty('--ry', `${((x / b.width) - 0.5) * 12}deg`);
        el.style.setProperty('--rx', `${(0.5 - (y / b.height)) * 12}deg`);
      }
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });

  // Magnetic buttons
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const b = btn.getBoundingClientRect();
      const dx = (e.clientX - (b.left + b.width / 2)) * 0.2;
      const dy = (e.clientY - (b.top + b.height / 2)) * 0.3;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}

/* ---------- Hero particle network ---------- */
const canvas = document.getElementById('net');
if (canvas && !reduceMotion) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const mouse = { x: -999, y: -999 };
  let w, h, dots = [], visible = true, color = '94,234,212';

  const readColor = () => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m) color = m.slice(1).map((v) => parseInt(v, 16)).join(',');
  };
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = hero.clientWidth; h = hero.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(90, Math.floor((w * h) / 14000));
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
    }));
    readColor();
  };
  hero.addEventListener('pointermove', (e) => {
    const b = hero.getBoundingClientRect();
    mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top;
  });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -999; });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);
  addEventListener('resize', resize);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', readColor);

  const LINK = 130;
  (function draw() {
    requestAnimationFrame(draw);
    if (!visible) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > w) d.vx *= -1;
      if (d.y < 0 || d.y > h) d.vy *= -1;
      const mdx = d.x - mouse.x, mdy = d.y - mouse.y, md = Math.hypot(mdx, mdy);
      if (md < 120) { d.x += (mdx / md) * 1.2; d.y += (mdy / md) * 1.2; }
      ctx.fillStyle = `rgba(${color},.8)`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.8, 0, 6.283); ctx.fill();
    }
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
        if (dist < LINK) {
          ctx.strokeStyle = `rgba(${color},${(1 - dist / LINK) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke();
        }
      }
    }
  })();
  resize();
}
