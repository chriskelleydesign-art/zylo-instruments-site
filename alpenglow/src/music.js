const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MODES = {
  auto: { label: "Auto" },
  dawn: { name: "ionian", label: "Ionian", iv: [0, 2, 4, 5, 7, 9, 11] },
  day: { name: "lydian", label: "Lydian", iv: [0, 2, 4, 6, 7, 9, 11] },
  golden: { name: "mixolydian", label: "Mixolydian", iv: [0, 2, 4, 5, 7, 9, 10] },
  dusk: { name: "dorian", label: "Dorian", iv: [0, 2, 3, 5, 7, 9, 10] },
  night: { name: "aeolian", label: "Aeolian", iv: [0, 2, 3, 5, 7, 8, 10] },
  phrygian: { name: "phrygian", label: "Phrygian", iv: [0, 1, 3, 5, 7, 8, 10] },
  minorPent: { name: "minor pent", label: "Minor Pent", iv: [0, 3, 5, 7, 10] },
  hirajoshi: { name: "hirajoshi", label: "Hirajoshi", iv: [0, 2, 3, 7, 8] },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function createMusicEngine({ state, onChord = () => {} }) {
  const S = state;
  const AE = {
    ctx: null,
    keyRoot: 0,
    chord: null,
    chordVoices: [],
    nextChordAt: 0,
    nextBellAt: 0,
    nextMotifAt: 0,
    windGains: [],
    windFilters: [],
    started: false,
    openingPlayed: false,
    phraseStep: 0,
  };

  function modeForHour(h) {
    if (S.musicMode && S.musicMode !== "auto" && MODES[S.musicMode]?.iv) return MODES[S.musicMode];
    if ((S.spaceBlend || 0) > 0.5) return MODES.night;
    if (h < 5) return MODES.night;
    if (h < 8.5) return MODES.dawn;
    if (h < 16) return MODES.day;
    if (h < 18.7) return MODES.golden;
    if (h < 21) return MODES.dusk;
    return MODES.night;
  }

  function makeIR(ctx, seconds) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const w = Math.random() * 2 - 1;
        lp += 0.25 * (w - lp);
        const s = lerp(w, lp, t * 0.85);
        d[i] = s * Math.pow(1 - t, 2.2) * (1 - Math.exp(-i / 800));
      }
    }
    return buf;
  }

  function init() {
    if (AE.started) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx({ latencyHint: "playback" });
    AE.ctx = ctx;

    AE.comp = ctx.createDynamicsCompressor();
    AE.comp.threshold.value = -14;
    AE.comp.knee.value = 18;
    AE.comp.ratio.value = 4;
    AE.comp.attack.value = 0.02;
    AE.comp.release.value = 0.4;
    AE.master = ctx.createGain();
    AE.master.gain.value = 0;
    AE.comp.connect(AE.master);
    AE.master.connect(ctx.destination);

    AE.tone = ctx.createBiquadFilter();
    AE.tone.type = "lowpass";
    AE.tone.frequency.value = 9000;
    AE.tone.Q.value = 0.3;
    AE.dry = ctx.createGain();
    AE.dry.gain.value = 0.85;
    AE.revSend = ctx.createGain();
    AE.revSend.gain.value = 0.7;
    AE.wet = ctx.createGain();
    AE.wet.gain.value = 0.8;
    AE.conv = ctx.createConvolver();
    AE.conv.buffer = makeIR(ctx, 7);
    AE.shimDelay = ctx.createDelay(0.1);
    AE.shimDelay.delayTime.value = 0.028;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.31;
    AE.shimLfoGain = ctx.createGain();
    AE.shimLfoGain.gain.value = 0.004;
    lfo.connect(AE.shimLfoGain);
    AE.shimLfoGain.connect(AE.shimDelay.delayTime);
    lfo.start();

    AE.tone.connect(AE.dry);
    AE.dry.connect(AE.comp);
    AE.tone.connect(AE.revSend);
    AE.revSend.connect(AE.shimDelay);
    AE.shimDelay.connect(AE.conv);
    AE.conv.connect(AE.wet);
    AE.wet.connect(AE.comp);

    AE.padBus = ctx.createGain();
    AE.padBus.gain.value = 1;
    AE.padFilter = ctx.createBiquadFilter();
    AE.padFilter.type = "lowpass";
    AE.padFilter.frequency.value = 1200;
    AE.padFilter.Q.value = 0.4;
    AE.padBus.connect(AE.padFilter);
    AE.padFilter.connect(AE.tone);

    AE.melBus = ctx.createGain();
    AE.melBus.gain.value = 0;
    AE.melDelay = ctx.createDelay(1.2);
    AE.melDelay.delayTime.value = 0.38;
    AE.melFeedback = ctx.createGain();
    AE.melFeedback.gain.value = 0.34;
    AE.melFilter = ctx.createBiquadFilter();
    AE.melFilter.type = "bandpass";
    AE.melFilter.frequency.value = 1800;
    AE.melFilter.Q.value = 0.9;
    AE.melBus.connect(AE.melFilter);
    AE.melFilter.connect(AE.tone);
    AE.melFilter.connect(AE.melDelay);
    AE.melDelay.connect(AE.melFeedback);
    AE.melFeedback.connect(AE.melDelay);
    AE.melDelay.connect(AE.revSend);

    const nlen = 2 * ctx.sampleRate;
    const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    [[-0.6, 620, 0.05], [0.6, 1150, 0.07]].forEach(([pan, freq, lfoRate]) => {
      const src = ctx.createBufferSource();
      src.buffer = nbuf;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 0.55;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const wlfo = ctx.createOscillator();
      wlfo.frequency.value = lfoRate;
      const wlg = ctx.createGain();
      wlg.gain.value = freq * 0.45;
      wlfo.connect(wlg);
      wlg.connect(bp.frequency);
      wlfo.start();
      src.connect(bp);
      bp.connect(g);
      g.connect(p);
      p.connect(AE.tone);
      src.start();
      AE.windGains.push(g);
      AE.windFilters.push(bp);
    });

    AE.sub = ctx.createOscillator();
    AE.sub.type = "sine";
    AE.subGain = ctx.createGain();
    AE.subGain.gain.value = 0;
    AE.sub.connect(AE.subGain);
    AE.subGain.connect(AE.comp);
    AE.sub.frequency.value = mtof(36 + AE.keyRoot);
    AE.sub.start();

    AE.started = true;
    AE.nextChordAt = ctx.currentTime + 0.5;
    AE.nextBellAt = ctx.currentTime + 6;
    AE.nextMotifAt = ctx.currentTime + 3;
    AE.master.gain.setTargetAtTime(Math.pow(S.level, 2) * 1.2, ctx.currentTime, 2.5);
    return true;
  }

  function padVoice(freq, when, attack, peak) {
    const ctx = AE.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.setTargetAtTime(peak, when, attack / 3);
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * 0.55;
    g.connect(p);
    p.connect(AE.padBus);
    const oscs = [];
    [[-6, "sawtooth", 0.30], [7, "sawtooth", 0.30], [0, "triangle", 0.55]].forEach(([det, type, amt]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = type === "triangle" ? freq / 2 : freq;
      o.detune.value = det + (Math.random() * 4 - 2);
      const og = ctx.createGain();
      og.gain.value = amt;
      o.connect(og);
      og.connect(g);
      o.start(when);
      oscs.push(o);
    });
    return {
      g,
      oscs,
      release(t) {
        this.g.gain.setTargetAtTime(0.0001, t, 5.5);
        this.oscs.forEach(o => o.stop(t + 26));
      },
    };
  }

  function newChord(quick = false) {
    if (!AE.ctx || !AE.started) return false;
    const ctx = AE.ctx;
    const t = ctx.currentTime;
    const opening = quick && !AE.openingPlayed;
    const mode = opening ? MODES.dawn : modeForHour(S.hour);
    const degrees = [0, 3, 4, 5, 1, 2].filter(v => v < mode.iv.length);
    const weights = [3, 2.4, 2.2, 2.0, 1.2, 0.8].slice(0, degrees.length);
    let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
    let d = 0;
    if (!opening) {
      for (let i = 0; i < degrees.length; i++) {
        pick -= weights[i];
        if (pick <= 0) { d = degrees[i]; break; }
      }
    }
    const sc = mode.iv;
    const sl = sc.length;
    const noteAt = k => sc[((d + k) % sl + sl) % sl] + 12 * Math.floor((d + k) / sl);
    const base = 41 + (opening ? 0 : AE.keyRoot);
    const midis = opening
      ? [48, 52, 55, 60, 64]
      : quick
      ? [base + noteAt(0), base + noteAt(4), base + noteAt(2) + 12, base + noteAt(6) + 12, base + noteAt(1) + 24]
      : [base + noteAt(0), base + noteAt(4), base + noteAt(2) + 12, base + noteAt(6) + 12];
    if (!quick && Math.random() < 0.5) midis.push(base + noteAt(1) + 24);

    AE.chordVoices.forEach(v => v.release(t));
    const attack = opening ? 5.6 : (quick ? 2.4 : 7 + Math.random() * 5);
    const peak = opening ? 0.036 : (quick ? 0.066 : 0.055);
    AE.chordVoices = midis.map((m, i) => padVoice(mtof(m), t + i * (opening ? 0.08 : (quick ? 0.18 : 0.9)), attack, peak));
    AE.sub.frequency.setTargetAtTime(mtof(opening ? 36 : base + sc[d] - 12), t, 4);
    AE.subGain.gain.setTargetAtTime((opening ? 0.030 : 0.10) + (S.spaceBlend || 0) * 0.05, t, 4);

    const rootPc = (base + sc[d]) % 12;
    const third = ((sc[(d + 2) % sl] - sc[d]) + 12) % 12;
    const seventh = ((sc[(d + Math.min(6, sl - 1)) % sl] - sc[d]) + 12) % 12;
    const qual = third === 4 ? (seventh === 11 ? "maj7" : "7") : (seventh === 10 ? "m7" : "m");
    AE.chord = { label: opening ? "Cmaj" : NOTE_NAMES[rootPc] + qual, mode: mode.name, midis };
    onChord(AE.chord);
    const interval = lerp(46, 13, S.drift) * (0.75 + Math.random() * 0.5) * (1 + (S.spaceBlend || 0) * 0.6);
    AE.nextChordAt = t + interval;
    return true;
  }

  async function wake(generatePhrase = false) {
    if (!AE.started) init();
    const ctx = AE.ctx;
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (err) { console.warn("audio resume failed", err); }
    }
    const t = ctx.currentTime;
    AE.master.gain.cancelScheduledValues(t);
    AE.master.gain.setTargetAtTime(Math.max(0.30, Math.pow(S.level, 2) * 0.92), t, 0.55);
    AE.melBus.gain.cancelScheduledValues(t);
    AE.melBus.gain.setTargetAtTime(Math.max(0.16, S.melody * 0.28), t, 0.28);
    AE.wet.gain.setTargetAtTime(0.74 + S.reverb * 0.38, t, 0.8);
    AE.melFeedback.gain.setTargetAtTime(0.32, t, 0.8);
    AE.padFilter.frequency.setTargetAtTime(2200 + S.tone * 2600, t, 0.25);
    if (!AE.chord || generatePhrase) newChord(true);
    if (generatePhrase && AE.chord) {
      AE.nextMotifAt = t + 1.1;
      motif(!AE.openingPlayed);
      AE.openingPlayed = true;
    } else if (!AE.chord) {
      AE.nextChordAt = t + 0.05;
    } else {
      AE.nextMotifAt = Math.min(AE.nextMotifAt || Infinity, t + 0.6);
    }
    AE.nextBellAt = generatePhrase ? Math.max(AE.nextBellAt || 0, t + 8) : Math.min(AE.nextBellAt || Infinity, t + 2);
    AE.master.gain.setTargetAtTime(Math.pow(S.level, 2) * 1.2, t, 0.8);
    return ctx.state === "running";
  }

  function bell() {
    const ctx = AE.ctx;
    const t = ctx.currentTime;
    if (!AE.chord) return;
    const tones = AE.chord.midis;
    const m = tones[Math.floor(Math.random() * tones.length)] + 12 * (1 + Math.floor(Math.random() * 2));
    const f = mtof(m);
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2.76;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.7, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.01, t + 2.2);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    const peak = 0.05 + Math.random() * 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5 + Math.random() * 2.5);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    car.connect(g);
    g.connect(p);
    const dryTap = ctx.createGain();
    dryTap.gain.value = 0.3;
    p.connect(dryTap);
    dryTap.connect(AE.tone);
    const wetTap = ctx.createGain();
    wetTap.gain.value = 1;
    p.connect(wetTap);
    wetTap.connect(AE.revSend);
    car.start(t);
    mod.start(t);
    car.stop(t + 7);
    mod.stop(t + 7);
    AE.nextBellAt = t + lerp(15, 2.2, S.density) * (0.8 + Math.random() * 0.7) * (1 + (S.spaceBlend || 0) * 1.4);
  }

  function melodicPluck(midi, when, dur, pan, accent, ambient = false) {
    const ctx = AE.ctx;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = ambient ? "sine" : (Math.random() < 0.45 ? "triangle" : "sine");
    o.frequency.setValueAtTime(f, when);
    o.detune.setValueAtTime((Math.random() * 2 - 1) * (ambient ? 2 : 5), when);
    const g = ctx.createGain();
    const peak = (ambient ? 0.020 + 0.020 * S.melody : 0.018 + 0.030 * S.melody) * accent;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + (ambient ? 0.16 : 0.018));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(AE.melBus);
    o.start(when);
    o.stop(when + dur + (ambient ? 1.4 : 0.3));
  }

  const PHRASES = [
    [0, 1, 2, 4, 2, 1, 0],
    [0, 3, 4, 6, 5, 4, 2, 1],
    [4, 5, 4, 2, 0, 1, 2, 0],
    [2, 4, 6, 7, 6, 4, 3, 2],
  ];

  function scaleDegreeMidi(mode, base, degree) {
    const sl = mode.iv.length;
    const oct = Math.floor(degree / sl);
    const ix = ((degree % sl) + sl) % sl;
    return base + mode.iv[ix] + oct * 12;
  }

  function motif(opening = false) {
    const ctx = AE.ctx;
    const t = ctx.currentTime;
    if (!AE.chord) return;
    const mode = opening ? MODES.dawn : modeForHour(S.hour);
    const base = (opening ? 60 : 53) + (opening ? 0 : AE.keyRoot) + ((S.spaceBlend || 0) > 0.5 ? 12 : 0);
    const pulse = (opening ? 0.82 : lerp(0.92, 0.28, S.density)) * lerp(1.35, 0.72, S.thrust || 0);
    const pattern = opening ? PHRASES[0] : PHRASES[AE.phraseStep % PHRASES.length];
    const len = opening ? pattern.length : 4 + Math.floor(S.melody * 5);
    const offset = opening ? 0 : Math.floor(Math.random() * Math.max(1, mode.iv.length - 2));
    for (let i = 0; i < len; i++) {
      const pdeg = pattern[i % pattern.length] + offset + (i >= pattern.length ? 7 : 0);
      const chordSnap = AE.chord.midis[(i + AE.phraseStep) % AE.chord.midis.length] + (opening ? 24 : (Math.random() < 0.35 ? 12 : 24));
      const midi = (!opening && Math.random() < 0.22) ? chordSnap : scaleDegreeMidi(mode, base, pdeg);
      const swim = (S.underwater || 0) * Math.sin(i * 1.7 + t) * 0.18;
      const when = t + (opening ? 1.05 : 0) + i * pulse * (opening ? 0.92 : 0.72 + swim);
      const dur = pulse * (opening ? lerp(2.6, 3.7, S.reverb) : lerp(1.7, 3.2, S.reverb));
      const pan = Math.sin(i * 1.15 + AE.phraseStep * 0.7) * (opening ? 0.42 : 0.58);
      melodicPluck(midi, when, dur, pan, i === 0 ? (opening ? 0.82 : 1.35) : (opening ? 0.68 : 1.0), opening);
      if (opening && i === 3) melodicPluck(midi - 12, when + 0.10, dur * 1.25, -pan * 0.55, 0.22, true);
    }
    AE.phraseStep++;
    AE.nextMotifAt = t + pulse * (len + (opening ? 3.5 : lerp(2.8, 0.8, S.melody))) * (opening ? 1 : 0.85 + Math.random() * 0.6) * (1 + (S.underwater || 0) * 0.45);
  }

  function frame() {
    if (!AE.started) return;
    const ctx = AE.ctx;
    const t = ctx.currentTime;
    if (t >= AE.nextChordAt) newChord();
    if (t >= AE.nextBellAt) bell();
    if (t >= AE.nextMotifAt) motif();
    const sb = S.spaceBlend || 0;
    const altN = clamp((S.camY - 20) / 380, 0, 1);
    const cutoff = (260 + altN * 2400) * (0.45 + S.tone * 1.3) * (1 - sb * 0.35);
    AE.padFilter.frequency.setTargetAtTime(cutoff, t, 0.8);
    const turn = clamp(Math.abs(S.yawVel) * 5, 0, 1);
    const spdN = clamp(S.effSpd / 300, 0, 1);
    const wp = S.waterProx || 0;
    const wa = S.warpAmt || 0;
    const windAmt = S.wind * ((1 - sb) * (0.018 + spdN * 0.025 + turn * 0.02 + wp * 0.22) + sb * (0.045 + wa * 0.14));
    AE.windGains.forEach((g, i) => g.gain.setTargetAtTime(windAmt * (i ? 0.8 : 1), t, 0.9));
    AE.windFilters.forEach((f, i) => {
      const base = (i ? 1050 : 560) * (0.55 + altN * 0.5 + spdN * 0.3) * (1 - wp * 0.4);
      f.frequency.setTargetAtTime(lerp(base, i ? 240 : 130, sb) * (1 + wa * 2.5), t, 1.2);
    });
    const uwAudio = clamp(S.underwater || 0, 0, 1);
    AE.wet.gain.setTargetAtTime(0.25 + S.reverb * 0.95 + sb * 0.5 + uwAudio * 0.24, t, 0.55);
    AE.dry.gain.setTargetAtTime(0.9 - S.reverb * 0.25 - sb * 0.2 - uwAudio * 0.16, t, 0.55);
    AE.tone.frequency.setTargetAtTime((2500 + S.tone * 13000) * (1 - uwAudio * 0.46), t, 0.7);
    AE.melBus.gain.setTargetAtTime(S.melody * (0.28 + sb * 0.12) * (1 - uwAudio * 0.28), t, 0.6);
    AE.melFilter.frequency.setTargetAtTime(lerp(900, 3200, S.tone) * (1 - uwAudio * 0.72) * (1 + (S.thrust || 0) * 0.25), t, 0.55);
    AE.melDelay.delayTime.setTargetAtTime(lerp(0.52, 0.21, S.density) * (1 + uwAudio * 0.58), t, 0.8);
    AE.shimLfoGain.gain.setTargetAtTime(0.0006 + S.haze * 0.006 + sb * 0.003, t, 0.5);
    AE.master.gain.setTargetAtTime(Math.pow(S.level, 2) * 1.2, t, 0.3);
  }

  function rebuildIR() {
    if (AE.ctx && AE.conv) AE.conv.buffer = makeIR(AE.ctx, 2.5 + S.reverb * 9.5);
  }

  return {
    NOTE_NAMES,
    MODES,
    init,
    wake,
    frame,
    rebuildIR,
    setKey(value) {
      AE.keyRoot = Number(value) || 0;
      if (AE.started) wake(true);
    },
    setMode(value) {
      S.musicMode = value || "auto";
      if (AE.started) wake(true);
    },
    get started() { return AE.started; },
    get keyRoot() { return AE.keyRoot; },
  };
}
