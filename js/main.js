/* ============================================================
   LACOURA AUDIO — main.js
   ============================================================ */


/* ── Mobile nav hamburger ──────────────────────────────────── */
(function () {
  const btn = document.querySelector('.nav-hamburger');
  const mobileNav = document.querySelector('.nav-mobile');
  if (!btn || !mobileNav) return;
  btn.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    // animate bars
    const bars = btn.querySelectorAll('span');
    if (open) {
      bars[0].style.transform = 'translateY(6.5px) rotate(45deg)';
      bars[1].style.opacity = '0';
      bars[2].style.transform = 'translateY(-6.5px) rotate(-45deg)';
    } else {
      bars[0].style.transform = '';
      bars[1].style.opacity = '';
      bars[2].style.transform = '';
    }
  });
})();

/* ── Touch-friendly desktop dropdowns ─────────────────────── */
(function () {
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  if (!dropdowns.length) return;
  const hasFinePointerHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  function closeDropdowns(except) {
    dropdowns.forEach(dropdown => {
      if (dropdown === except) return;
      dropdown.classList.remove('open');
      dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
    });
  }

  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('.nav-dropdown-toggle');
    const menu = dropdown.querySelector('.nav-dropdown-menu');
    if (!toggle || !menu) return;

    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    function toggleDropdown(event) {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !dropdown.classList.contains('open');
      closeDropdowns(dropdown);
      dropdown.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    }

    toggle.addEventListener('click', event => {
      if (hasFinePointerHover.matches) return;
      toggleDropdown(event);
    });
    toggle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') toggleDropdown(event);
      if (event.key === 'Escape') {
        dropdown.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    menu.addEventListener('click', () => closeDropdowns());
  });

  document.addEventListener('click', () => closeDropdowns());
  window.addEventListener('resize', () => closeDropdowns());
})();

/* ── Product filter tabs (products page) ───────────────────── */
(function () {
  const filterLinks = document.querySelectorAll('.filter-links a[data-filter]');
  if (!filterLinks.length) return;

  filterLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const filter = link.dataset.filter;

      // Active state
      filterLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Show/hide cards
      const cards = document.querySelectorAll('.product-card[data-category]');
      cards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.closest('.product-card-wrapper')
            ? (card.closest('.product-card-wrapper').style.display = '')
            : (card.style.display = '');
        } else {
          card.closest('.product-card-wrapper')
            ? (card.closest('.product-card-wrapper').style.display = 'none')
            : (card.style.display = 'none');
        }
      });
    });
  });
})();

/* ── Audio player simulation ───────────────────────────────── */
(function () {
  // Simulated durations in seconds for each demo player
  const players = document.querySelectorAll('[data-player]');
  const activeTimers = new Map();

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function stopPlayer(playerId) {
    const timer = activeTimers.get(playerId);
    if (timer) {
      clearInterval(timer);
      activeTimers.delete(playerId);
    }
  }

  function stopAll() {
    document.querySelectorAll('[data-player]').forEach(p => {
      const btn = p.querySelector('.audio-play-btn, .audio-demo-play');
      const fill = p.querySelector('.audio-progress-fill, .audio-demo-fill');
      const dur = p.querySelector('.audio-duration, .audio-demo-duration');
      if (btn) btn.classList.remove('playing');
      if (fill) fill.style.width = '0%';
      const total = parseInt(p.dataset.duration || '120', 10);
      if (dur) dur.textContent = formatTime(total);
    });
    activeTimers.forEach((_, id) => stopPlayer(id));
    activeTimers.clear();
  }

  players.forEach((player, index) => {
    const btn = player.querySelector('.audio-play-btn, .audio-demo-play');
    const fill = player.querySelector('.audio-progress-fill, .audio-demo-fill');
    const dur = player.querySelector('.audio-duration, .audio-demo-duration');
    const progressBar = player.querySelector('.audio-progress, .audio-demo-bar');
    const totalDuration = parseInt(player.dataset.duration || '120', 10);
    let elapsed = 0;

    if (dur) dur.textContent = formatTime(totalDuration);

    if (btn) {
      btn.addEventListener('click', () => {
        const isPlaying = btn.classList.contains('playing');

        if (isPlaying) {
          // Pause
          btn.classList.remove('playing');
          stopPlayer(index);
        } else {
          // Stop all others first
          stopAll();

          // Start this one
          btn.classList.add('playing');
          elapsed = 0;

          const interval = setInterval(() => {
            elapsed += 0.1;
            const pct = Math.min((elapsed / totalDuration) * 100, 100);
            if (fill) fill.style.width = pct + '%';
            if (dur) dur.textContent = formatTime(Math.min(elapsed, totalDuration));

            if (elapsed >= totalDuration) {
              clearInterval(interval);
              activeTimers.delete(index);
              btn.classList.remove('playing');
              if (fill) fill.style.width = '0%';
              if (dur) dur.textContent = formatTime(totalDuration);
              elapsed = 0;
            }
          }, 100);

          activeTimers.set(index, interval);
        }
      });
    }

    // Click on progress bar to seek
    if (progressBar) {
      progressBar.addEventListener('click', e => {
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        elapsed = pct * totalDuration;
        if (fill) fill.style.width = (pct * 100) + '%';
        if (dur) dur.textContent = formatTime(elapsed);
      });
    }
  });
})();

/* ── Generated product audio samples ───────────────────────── */
(function () {
  const rows = document.querySelectorAll('[data-synth-demo]');
  if (!rows.length) return;

  let ctx = null;
  let active = null;

  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function stopActive() {
    if (!active) return;
    if (active.audio) {
      active.audio.pause();
      active.audio.currentTime = 0;
    }
    active.nodes?.forEach(node => {
      try { node.stop && node.stop(); } catch (_) {}
      try { node.disconnect && node.disconnect(); } catch (_) {}
    });
    if (active.timer) clearInterval(active.timer);
    if (active.endTimer) clearTimeout(active.endTimer);
    active.row.querySelector('.audio-sample-play')?.classList.remove('playing');
    const fill = active.row.querySelector('.audio-sample-fill');
    if (fill) fill.style.width = '0%';
    active = null;
  }

  function formatSampleTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function playAudioFile(row) {
    const audio = new Audio(row.dataset.audioSrc);
    const fill = row.querySelector('.audio-sample-fill');
    const button = row.querySelector('.audio-sample-play');
    const duration = row.querySelector('.audio-sample-duration');

    button?.classList.add('playing');

    audio.addEventListener('loadedmetadata', () => {
      if (duration) duration.textContent = formatSampleTime(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      if (!fill || !audio.duration) return;
      fill.style.width = `${Math.min((audio.currentTime / audio.duration) * 100, 100)}%`;
    });

    audio.addEventListener('ended', stopActive);
    audio.play().catch(() => stopActive());
    active = { row, audio };
  }

  function tone(ac, type, freq, start, dur, dest, gainValue, detuneCents) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detuneCents) osc.detune.setValueAtTime(detuneCents, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    return osc;
  }

  function createDelay(ac, dest, time, feedback, wet) {
    const input = ac.createGain();
    const dry = ac.createGain();
    const delay = ac.createDelay(2);
    const fb = ac.createGain();
    const wetGain = ac.createGain();
    dry.gain.value = 0.72;
    delay.delayTime.value = time;
    fb.gain.value = feedback;
    wetGain.gain.value = wet;
    input.connect(dry).connect(dest);
    input.connect(delay).connect(wetGain).connect(dest);
    delay.connect(fb).connect(delay);
    return input;
  }

  function noiseBurst(ac, start, dur, dest, gainValue, filterFreq) {
    const source = ac.createBufferSource();
    const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.Q.value = 5;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter).connect(gain).connect(dest);
    source.start(start);
    source.stop(start + dur + 0.02);
    return source;
  }

  function playDemo(kind, row) {
    const ac = getContext();
    const start = ac.currentTime + 0.03;
    const duration = /pad|field|springs|tape/.test(kind) ? 12 : 10;
    const master = ac.createGain();
    const filter = ac.createBiquadFilter();
    const delayTime = /seq|pingpong|antigrav/.test(kind) ? 0.24 : /verb|springs|shimmer/.test(kind) ? 0.56 : 0.42;
    const delayBus = createDelay(ac, master, delayTime, /delay|verb/.test(kind) ? 0.58 : 0.44, /verb/.test(kind) ? 0.52 : 0.38);
    const nodes = [master, filter, delayBus];

    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.42, start + 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, start + duration - 0.2);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'medrone-fm' ? 3600 : 1400, start);
    filter.Q.value = 0.7;
    master.connect(ac.destination);

    if (kind === 'medrone-pad') {
      filter.frequency.linearRampToValueAtTime(2300, start + 5.6);
      filter.connect(delayBus);
      [146.83, 220, 293.66, 369.99].forEach((freq, i) => {
        nodes.push(tone(ac, i % 2 ? 'triangle' : 'sawtooth', freq, start + i * 0.18, 9.2, filter, 0.045, i * 7 - 10));
        nodes.push(tone(ac, 'sine', freq * 0.5, start + i * 0.22, 9.2, filter, 0.035, 0));
      });
    } else if (kind === 'medrone-fm') {
      filter.connect(delayBus);
      [659.25, 783.99, 987.77, 1174.66, 987.77, 783.99].forEach((freq, i) => {
        const t = start + i * 0.72;
        nodes.push(tone(ac, 'sine', freq, t, 1.25, filter, 0.075, 0));
        nodes.push(tone(ac, 'sine', freq * 2.01, t, 0.45, filter, 0.026, 0));
      });
    } else if (kind === 'medrone-seq') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(720, start);
      filter.frequency.linearRampToValueAtTime(1800, start + 7.2);
      filter.connect(delayBus);
      const seq = [110, 146.83, 164.81, 220, 196, 164.81, 246.94, 293.66];
      for (let i = 0; i < 24; i += 1) {
        const freq = seq[i % seq.length];
        nodes.push(tone(ac, i % 3 ? 'square' : 'sawtooth', freq, start + i * 0.28, 0.22, filter, 0.045, -8));
      }
    } else if (kind === 'orbit-field') {
      filter.frequency.setValueAtTime(900, start);
      filter.frequency.linearRampToValueAtTime(2600, start + 6.5);
      filter.connect(delayBus);
      [130.81, 196, 261.63, 392].forEach((freq, i) => {
        nodes.push(tone(ac, i % 2 ? 'sine' : 'triangle', freq, start + i * 0.35, 10.8, filter, 0.05, i * 11 - 15));
      });
      for (let i = 0; i < 16; i += 1) {
        nodes.push(noiseBurst(ac, start + 1 + i * 0.42, 0.12, delayBus, 0.012, 900 + i * 90));
      }
    } else if (kind === 'orbit-grain') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, start);
      filter.connect(delayBus);
      const notes = [261.63, 329.63, 392, 523.25, 587.33, 392];
      for (let i = 0; i < 22; i += 1) {
        const freq = notes[i % notes.length] * (i % 4 === 0 ? 1.5 : 1);
        nodes.push(tone(ac, 'sine', freq, start + i * 0.22, 0.16, filter, 0.036, i * 3));
        nodes.push(noiseBurst(ac, start + i * 0.22, 0.08, delayBus, 0.01, freq * 2));
      }
    } else if (kind === 'orbit-antigrav') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(780, start);
      filter.frequency.linearRampToValueAtTime(2100, start + 8);
      filter.connect(delayBus);
      const bounces = [98, 146.83, 220, 329.63, 493.88, 329.63, 220, 146.83];
      for (let i = 0; i < 28; i += 1) {
        nodes.push(tone(ac, i % 2 ? 'square' : 'triangle', bounces[i % bounces.length], start + i * 0.2, 0.18, filter, 0.038, i % 5 * 9));
      }
    } else if (kind === 'zyloverb-springs') {
      filter.frequency.setValueAtTime(1800, start);
      filter.connect(delayBus);
      [174.61, 220, 261.63, 329.63].forEach((freq, i) => {
        nodes.push(tone(ac, 'triangle', freq, start + i * 0.28, 8.8, filter, 0.045, i * 4));
        nodes.push(tone(ac, 'sine', freq * 2, start + i * 0.5, 5.6, filter, 0.018, 0));
      });
    } else if (kind === 'zyloverb-shimmer') {
      filter.frequency.setValueAtTime(2400, start);
      filter.frequency.linearRampToValueAtTime(4200, start + 6);
      filter.connect(delayBus);
      [220, 277.18, 329.63, 440].forEach((freq, i) => {
        nodes.push(tone(ac, 'sine', freq, start + i * 0.4, 7.6, filter, 0.035, 0));
        nodes.push(tone(ac, 'sine', freq * 2, start + 1.1 + i * 0.36, 6.4, filter, 0.024, 0));
      });
    } else if (kind === 'zyloverb-scatter') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, start);
      filter.connect(delayBus);
      const keys = [392, 493.88, 587.33, 783.99, 659.25, 493.88];
      for (let i = 0; i < 18; i += 1) {
        nodes.push(tone(ac, 'triangle', keys[i % keys.length], start + i * 0.34, 0.28, filter, 0.052, 0));
      }
    } else if (kind === 'zylodelay-tape') {
      filter.frequency.setValueAtTime(1100, start);
      filter.frequency.linearRampToValueAtTime(720, start + 8.5);
      filter.connect(delayBus);
      [110, 164.81, 220, 246.94].forEach((freq, i) => {
        nodes.push(tone(ac, 'sawtooth', freq, start + i * 0.55, 8.8, filter, 0.042, i % 2 ? 12 : -12));
      });
    } else if (kind === 'zylodelay-pingpong') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, start);
      filter.connect(delayBus);
      const keys = [130.81, 196, 261.63, 329.63, 392, 329.63];
      for (let i = 0; i < 24; i += 1) {
        nodes.push(tone(ac, 'square', keys[i % keys.length], start + i * 0.25, 0.18, filter, 0.035, i % 2 ? 8 : -8));
      }
    } else if (kind === 'zylodelay-reverse') {
      filter.frequency.setValueAtTime(900, start);
      filter.frequency.linearRampToValueAtTime(1900, start + 7);
      filter.connect(delayBus);
      [196, 246.94, 293.66, 392, 493.88].forEach((freq, i) => {
        nodes.push(tone(ac, 'sine', freq, start + i * 0.85, 1.9, filter, 0.052, 0));
        nodes.push(tone(ac, 'triangle', freq * 0.5, start + i * 0.85, 2.3, filter, 0.028, -6));
      });
    }

    const fill = row.querySelector('.audio-sample-fill');
    const button = row.querySelector('.audio-sample-play');
    button?.classList.add('playing');
    const started = performance.now();
    const timer = setInterval(() => {
      if (!fill) return;
      const pct = Math.min(((performance.now() - started) / (duration * 1000)) * 100, 100);
      fill.style.width = `${pct}%`;
    }, 80);
    const endTimer = setTimeout(stopActive, duration * 1000);
    active = { row, nodes, timer, endTimer };
  }

  rows.forEach(row => {
    row.querySelector('.audio-sample-play')?.addEventListener('click', async () => {
      const isPlaying = row.querySelector('.audio-sample-play')?.classList.contains('playing');
      stopActive();
      if (isPlaying) return;
      if (row.dataset.audioSrc) {
        playAudioFile(row);
        return;
      }
      const ac = getContext();
      if (ac.state === 'suspended') await ac.resume();
      playDemo(row.dataset.synthDemo, row);
    });
  });
})();

/* ── Newsletter form ───────────────────────────────────────── */
(function () {
  const forms = document.querySelectorAll('.newsletter-form');
  forms.forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const btn = form.querySelector('button[type="submit"]');
      const status = form.querySelector('.newsletter-form-status');
      if (!input || !btn || !status || !form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const defaultLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      input.style.borderColor = '';
      status.textContent = '';

      try {
        const isMailerLite = form.action.includes('assets.mailerlite.com');
        const response = await fetch(form.action, isMailerLite
          ? {
              method: 'POST',
              body: new FormData(form),
              mode: 'no-cors'
            }
          : {
              method: 'POST',
              body: new FormData(form),
              headers: { Accept: 'application/json' }
            });

        if (!isMailerLite && !response.ok) throw new Error('Newsletter submission failed');

        form.reset();
        status.textContent = isMailerLite ? 'Thanks. You’re on the list.' : "You're on the list.";
      } catch (_) {
        status.textContent = 'Something went wrong. Please email hello@zyloinstruments.com.';
      } finally {
        btn.textContent = defaultLabel;
        btn.disabled = false;
      }
    });
  });
})();

/* ── Trial form ───────────────────────────────────────────── */
(function () {
  const form = document.querySelector('.trial-form-el');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.trial-form-status');
    if (!btn || !status || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const defaultLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending...';
    status.textContent = '';

    try {
      const action = form.getAttribute('action');
      if (!action) throw new Error('MailerLite action missing');

      await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        mode: 'no-cors'
      });

      form.reset();
      status.textContent = form.dataset.successMessage || 'Thanks. Check your email for the trial download link.';
    } catch (_) {
      status.innerHTML = 'Something went wrong. Email <a href="mailto:support@zyloinstruments.com">support@zyloinstruments.com</a> and we&rsquo;ll help you.';
    } finally {
      btn.textContent = defaultLabel;
      btn.disabled = false;
    }
  });
})();

/* ── Contact form ──────────────────────────────────────────── */
(function () {
  const form = document.querySelector('.contact-form-el');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.contact-form-status');
    if (!btn || !status || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';
    btn.style.background = '';
    btn.style.color = '';
    status.textContent = '';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) throw new Error('Formspree submission failed');

      form.reset();
      btn.textContent = 'Message Sent';
      btn.style.background = '#c8ff00';
      btn.style.color = '#000';
      status.textContent = 'Message Sent';
    } catch (_) {
      btn.textContent = 'Send Message';
      status.innerHTML = 'Something went wrong. Please email <a href="mailto:hello@zyloinstruments.com">hello@zyloinstruments.com</a>.';
    } finally {
      btn.disabled = false;
    }
  });
})();

/* ── Active nav link highlight ─────────────────────────────── */
(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const links = document.querySelectorAll('.nav-links a, .nav-mobile a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    const isHome = page === 'index.html' && (href === '/' || href === 'index.html');
    if (href === page || isHome) {
      link.classList.add('active');
    }
  });
})();
