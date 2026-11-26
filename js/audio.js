/**
 * MoeMew Audio Engine (js/audio.js)
 * Zero-dependency Web Audio API kawaii BGM composer & expressive cat SFX synthesizer.
 */
(function () {
  "use strict";

  // Helper: MIDI note number or note name to frequency
  const NOTE_MAP = {
    C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, "F#4": 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, "F#5": 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
    C6: 1046.50, D6: 1174.66, Eb6: 1244.51, E6: 1318.51, F6: 1396.91, G6: 1567.98
  };

  function freq(note) {
    return NOTE_MAP[note] || 440;
  }

  // Three Original Kawaii Healing Tracks
  // Each step = 1 eighth note (or waltz beat subdivision)
  const TRACKS = [
    {
      id: "sunny",
      name: "午后猫步 ♪",
      bpm: 114,
      style: "cafe",
      // 32 eighth-note steps (4 bars of 4/4 in F Major: Fmaj7 - Dm7 - Gm7 - C9sus4 | Fmaj7 - Am7 - Bbmaj7 - C7)
      steps: 64,
      melody: [
        // Bar 1 (Fmaj7)
        "C5", null, "F5", "G5", "A5", null, "G5", "F5",
        // Bar 2 (Dm7)
        "D5", null, "F5", null, "A5", "G5", "F5", "D5",
        // Bar 3 (Gm7)
        "Bb4", "C5", "D5", "F5", "G5", null, "F5", "D5",
        // Bar 4 (C9sus4 -> C7)
        "C5", null, "D5", "E5", "G5", null, null, null,
        // Bar 5 (Fmaj7)
        "A5", null, "C6", "A5", "G5", null, "F5", "C5",
        // Bar 6 (Am7 -> Dm7)
        "E5", "G5", "C6", null, "A5", null, "F5", "D5",
        // Bar 7 (Bbmaj7 -> Gm7)
        "D5", "F5", "A5", "G5", null, "F5", "D5", "F5",
        // Bar 8 (C9sus4 -> F6resolve)
        "G5", null, "E5", "C5", "F5", null, null, null
      ],
      chords: {
        0: ["A4", "C5", "E5"],      4: ["A4", "C5", "E5"],
        8: ["F4", "A4", "C5"],      12: ["F4", "A4", "C5"],
        16: ["F4", "Bb4", "D5"],    20: ["F4", "Bb4", "D5"],
        24: ["F4", "G4", "Bb4"],    28: ["E4", "G4", "Bb4"],
        32: ["A4", "C5", "E5"],     36: ["A4", "C5", "E5"],
        40: ["G4", "C5", "E5"],     44: ["F4", "A4", "C5"],
        48: ["F4", "A4", "D5"],     52: ["F4", "Bb4", "D5"],
        56: ["G4", "Bb4", "D5"],    60: ["A4", "C5", "F5"]
      },
      bass: {
        0: "F3", 4: "C4", 8: "D3", 12: "A3",
        16: "G3", 20: "D4", 24: "C3", 28: "G3",
        32: "F3", 36: "C4", 40: "A3", 44: "D3",
        48: "Bb3", 52: "G3", 56: "C3", 60: "F3"
      }
    },
    {
      id: "musicbox",
      name: "奶糖八音盒 ♪",
      bpm: 96,
      style: "waltz",
      // 48 steps = 8 bars of 6/8 dreamy waltz in G Major (Gmaj7 - Bm7 - Cmaj7 - Cm6 | Bm7 - Em7 - Am7 - D9sus4)
      steps: 48,
      melody: [
        // Bar 1 (Gmaj7)
        "D5", null, "G5", "F#5", "G5", "B5",
        // Bar 2 (Bm7)
        "A5", null, "F#5", "D5", null, null,
        // Bar 3 (Cmaj7)
        "E5", null, "G5", "B5", "A5", "G5",
        // Bar 4 (Cm6 - Ghibli nostalgia!)
        "Eb5", null, "G5", "A5", null, null,
        // Bar 5 (Bm7)
        "D5", "F#5", "A5", "B5", null, "A5",
        // Bar 6 (Em7)
        "G5", null, "E5", "D5", "E5", "G5",
        // Bar 7 (Am7)
        "A5", null, "E5", "G5", "F#5", "E5",
        // Bar 8 (D9sus4 -> G)
        "D5", null, "A4", "B4", null, null
      ],
      chords: {
        0: ["B4", "D5"],  2: ["F#4", "B4"],
        6: ["A4", "D5"],  8: ["F#4", "A4"],
        12: ["G4", "B4"], 14: ["E4", "G4"],
        18: ["G4", "C5"], 20: ["Eb4", "A4"],
        24: ["F#4", "B4"], 26: ["D4", "A4"],
        30: ["G4", "B4"], 32: ["E4", "G4"],
        36: ["E4", "C5"], 38: ["G4", "C5"],
        42: ["G4", "A4", "C5"], 45: ["F#4", "A4"]
      },
      bass: {
        0: "G3", 6: "B3", 12: "C4", 18: "C4",
        24: "B3", 30: "E3", 36: "A3", 42: "D3"
      }
    },
    {
      id: "starlight",
      name: "星夜呼噜曲 ♪",
      bpm: 78,
      style: "lullaby",
      // 32 steps in Eb Major Lullaby
      steps: 32,
      melody: [
        "Bb4", null, "Eb5", "F5", "G5", null, "Bb5", null,
        "Ab5", "G5", "F5", null, "Eb5", null, null, null,
        "F5", null, "G5", "Ab5", "Bb5", null, "G5", "Eb5",
        "F5", null, "Eb5", "D5", "Eb5", null, null, null
      ],
      chords: {
        0: ["G4", "Bb4", "D5"],
        8: ["Eb4", "Ab4", "C5"],
        16: ["Eb4", "G4", "Bb4"],
        24: ["F4", "Ab4", "Bb4"],
        28: ["G4", "Bb4", "Eb5"]
      },
      bass: {
        0: "Eb3", 8: "Ab3", 16: "C3", 24: "Bb3", 28: "Eb3"
      }
    }
  ];

  const PENTATONIC_SPARKLE = ["F5", "G5", "A5", "C6", "D6", "F6", "G6"];

  class MoeAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.bgmGain = null;
      this.sfxGain = null;
      this.delayNode = null;
      this.noiseBuffer = null;

      this.isPlaying = false;
      this.unlocked = false;
      this.userPaused = false;
      this.trackIndex = 0;

      this.currentStep = 0;
      this.nextNoteTime = 0;
      this.schedulerTimer = null;

      // Continuous purr oscillator nodes
      this.purrNodes = null;
      this.purrFadeTimeout = null;
      this.lastBellTime = 0;
      this.bubbleCombo = 0;

      // Callbacks for visual sync (melody notes, state & exact meow-to-mouth lock-step!)
      this.onMelodyNote = null;
      this.onStateChange = null;
      this.onCatVocalize = null;
    }

    /**
     * Runs audio synthesis ONLY when AudioContext is genuinely running (never silently on a frozen
     * autoplay-blocked context, and discards stale queued calls if resume settles >350ms later!),
     * guaranteeing 100% lock-step sound <-> mouth animation sync.
     */
    runWhenAudible(fn) {
      this.unlockAndPlay();
      if (!this.ctx || this.ctx.state === "closed") return;
      if (this.ctx.state === "running") {
        fn();
      } else if (this.ctx.state === "suspended" && typeof this.ctx.resume === "function") {
        const requestedAt = Date.now();
        this.ctx.resume().then(() => {
          if (this.ctx && this.ctx.state === "running" && Date.now() - requestedAt <= 350) {
            fn();
          }
        }).catch(() => {});
      }
    }

    initContext() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      // Gentle master compressor & gain
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(compressor);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.42;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.65;
      this.sfxGain.connect(this.masterGain);

      // Warm cozy filtered echo/reverb bus for celesta/music-box sweetness
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.26;
      const delayFeedback = this.ctx.createGain();
      delayFeedback.gain.value = 0.25;
      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = "lowpass";
      delayFilter.frequency.value = 2100;
      const wetGain = this.ctx.createGain();
      wetGain.gain.value = 0.26;

      this.delayNode.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(this.delayNode);
      delayFilter.connect(wetGain);
      wetGain.connect(this.bgmGain);

      // Soft white noise buffer for gentle shaker & breathy purr
      const bufferSize = this.ctx.sampleRate * 1.0;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    unlockAndPlay() {
      this.initContext();
      if (!this.ctx) return;
      const activate = () => {
        if (!this.ctx || this.ctx.state !== "running") return;
        this.unlocked = true;
        if (!this.userPaused && !this.isPlaying) {
          this.startBGM();
        }
      };
      if (this.ctx.state === "running") {
        activate();
      } else if (this.ctx.state === "suspended" && typeof this.ctx.resume === "function") {
        const p = this.ctx.resume();
        if (p && typeof p.then === "function") {
          p.then(activate).catch(() => {});
        }
      }
    }

    toggleBGM() {
      this.initContext();
      if (!this.ctx) return false;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.unlocked = true;

      if (this.isPlaying) {
        this.userPaused = true;
        this.stopBGM();
      } else {
        this.userPaused = false;
        this.startBGM();
      }
      return this.isPlaying;
    }

    startBGM() {
      if (!this.ctx || this.isPlaying) return;
      this.isPlaying = true;
      this.currentStep = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.08;

      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(0.001, now);
      this.bgmGain.gain.exponentialRampToValueAtTime(0.42, now + 0.8);

      if (this.schedulerTimer) clearInterval(this.schedulerTimer);
      this.schedulerTimer = setInterval(() => this.scheduleLoop(), 45);
      this.emitState();
    }

    stopBGM() {
      if (!this.ctx) return;
      this.isPlaying = false;
      if (this.schedulerTimer) {
        clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
      }
      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(0.0001, now, 0.12);
      this.emitState();
    }

    nextTrack(specificIndex) {
      if (typeof specificIndex === "number") {
        this.trackIndex = ((specificIndex % TRACKS.length) + TRACKS.length) % TRACKS.length;
      } else {
        this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
      }
      this.currentStep = 0;
      if (!this.isPlaying && !this.userPaused && this.unlocked) {
        this.startBGM();
      } else {
        this.emitState();
      }
      return this.getCurrentTrack();
    }

    getCurrentTrack() {
      return TRACKS[this.trackIndex];
    }

    emitState() {
      if (typeof this.onStateChange === "function") {
        this.onStateChange({
          isPlaying: this.isPlaying,
          track: this.getCurrentTrack()
        });
      }
    }

    scheduleLoop() {
      if (!this.isPlaying || !this.ctx) return;
      const track = TRACKS[this.trackIndex];
      const stepDuration = (60 / track.bpm) * 0.5; // eighth note

      while (this.nextNoteTime < this.ctx.currentTime + 0.16) {
        this.scheduleStep(track, this.currentStep, this.nextNoteTime, stepDuration);
        this.nextNoteTime += stepDuration;
        this.currentStep = (this.currentStep + 1) % track.steps;
      }
    }

    scheduleStep(track, step, time, stepDur) {
      // 1. Lead Melody (Music Box / Celesta)
      const melNote = track.melody[step];
      if (melNote) {
        this.playCelestaNote(freq(melNote), time, stepDur * 2.2, track.style === "waltz" ? 0.23 : 0.25);
        if (this.onMelodyNote && step % 2 === 0) {
          const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
          setTimeout(() => {
            if (this.isPlaying && this.onMelodyNote) this.onMelodyNote(melNote);
          }, delayMs);
        }
      }

      // 2. Warm Ukulele / Felt Harp Chords
      const chord = track.chords[step];
      if (chord) {
        chord.forEach((n, idx) => {
          // Slight upward strum spread (18ms per string) for organic kawaii feel!
          this.playWarmPluck(freq(n), time + idx * 0.018, stepDur * 2.6, 0.085);
        });
      }

      // 3. Cozy Pizzicato / Marimba Bass
      const bassNote = track.bass[step];
      if (bassNote) {
        this.playMarimbaBass(freq(bassNote), time, stepDur * 2.4, 0.18);
      }

      // 4. Gentle Cafe Shaker on Sunny Track
      if (track.style === "cafe" && step % 2 === 1) {
        this.playSoftShaker(time, step % 4 === 3 ? 0.022 : 0.012);
      }
    }

    // --- Instrument Voices ---

    playCelestaNote(f, time, dur, peakGain) {
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const overGain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(f, time);

      // Gentle 3rd/2nd bell harmonic for music-box sparkle
      overtone.type = "sine";
      overtone.frequency.setValueAtTime(f * 2.0, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

      overGain.gain.setValueAtTime(0.0001, time);
      overGain.gain.linearRampToValueAtTime(peakGain * 0.18, time + 0.006);
      overGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(0.22, dur * 0.45));

      osc.connect(gain);
      overtone.connect(overGain);
      overGain.connect(gain);

      gain.connect(this.bgmGain);
      gain.connect(this.delayNode);

      osc.start(time);
      overtone.start(time);
      osc.stop(time + dur + 0.04);
      overtone.stop(time + dur + 0.04);
    }

    playWarmPluck(f, time, dur, peakGain) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, time);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1650, time);
      filter.frequency.exponentialRampToValueAtTime(650, time + dur);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0006, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      gain.connect(this.delayNode);

      osc.start(time);
      osc.stop(time + dur + 0.04);
    }

    playMarimbaBass(f, time, dur, peakGain) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(f * 1.02, time);
      osc.frequency.exponentialRampToValueAtTime(f, time + 0.035);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + dur + 0.03);
    }

    playSoftShaker(time, peakGain) {
      if (!this.noiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 5800;
      filter.Q.value = 1.8;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      src.start(time);
      src.stop(time + 0.07);
    }

    // =========================================================================
    // Cute Interactive Cat Voices & Sound Effects
    // =========================================================================

    /**
     * Synthesizes an adorable kitten "Mew~" using dual vowel-formant filtering
     * @param {"sweet"|"happy"|"curious"|"tiny"} mood
     */
    playMew(mood = "sweet") {
      this.runWhenAudible(() => {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const subOsc = this.ctx.createOscillator();
        const formant1 = this.ctx.createBiquadFilter();
        const formant2 = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = "sawtooth";
        subOsc.type = "sine";

        let dur = 0.34;
        let startF = 610, peakF = 810, endF = 530;

        if (mood === "happy") {
          dur = 0.38;
          startF = 660; peakF = 920; endF = 640;
        } else if (mood === "curious") {
          dur = 0.25;
          startF = 580; peakF = 880; endF = 850; // rising question "mrrp?"
        } else if (mood === "tiny") {
          dur = 0.20;
          startF = 740; peakF = 940; endF = 700;
        }

        // Slight random natural variation
        const jitter = 0.96 + Math.random() * 0.08;
        startF *= jitter;
        peakF *= jitter;
        endF *= jitter;

        osc.frequency.setValueAtTime(startF, now);
        osc.frequency.exponentialRampToValueAtTime(peakF, now + dur * 0.32);
        osc.frequency.exponentialRampToValueAtTime(endF, now + dur);

        subOsc.frequency.setValueAtTime(startF, now);
        subOsc.frequency.exponentialRampToValueAtTime(peakF, now + dur * 0.32);
        subOsc.frequency.exponentialRampToValueAtTime(endF, now + dur);

        // Kitten "m-ee-ow" formant sweep
        formant1.type = "bandpass";
        formant1.Q.value = 3.2;
        formant1.frequency.setValueAtTime(850, now);
        formant1.frequency.exponentialRampToValueAtTime(1450, now + dur * 0.35);
        formant1.frequency.exponentialRampToValueAtTime(920, now + dur);

        formant2.type = "lowpass";
        formant2.frequency.setValueAtTime(2600, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.20, now + 0.035);
        gain.gain.setValueAtTime(0.18, now + dur * 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

        const subGain = this.ctx.createGain();
        subGain.gain.value = 0.14;

        osc.connect(formant1);
        formant1.connect(formant2);
        formant2.connect(gain);

        subOsc.connect(subGain);
        subGain.connect(gain);

        gain.connect(this.sfxGain);

        osc.start(now);
        subOsc.start(now);
        osc.stop(now + dur + 0.03);
        subOsc.stop(now + dur + 0.03);

        // Lock-step mouth sync for the exact vocalization duration!
        if (typeof this.onCatVocalize === "function") {
          this.onCatVocalize(dur, mood);
        }
      });
    }

    /**
     * Warm, soothing continuous purr while petting kitty
     */
    pokePurr() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (!this.purrNodes) {
        const carrier = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const env = this.ctx.createGain();

        carrier.type = "triangle";
        carrier.frequency.value = 54;

        // 25Hz rhythmic cat purr flutter
        lfo.type = "sine";
        lfo.frequency.value = 25;
        lfoGain.gain.value = 0.09;

        filter.type = "lowpass";
        filter.frequency.value = 175;

        env.gain.setValueAtTime(0.0001, now);
        env.gain.setTargetAtTime(0.16, now, 0.12);

        lfo.connect(lfoGain);
        lfoGain.connect(env.gain);

        carrier.connect(filter);
        filter.connect(env);
        env.connect(this.sfxGain);

        carrier.start(now);
        lfo.start(now);

        this.purrNodes = { carrier, lfo, env };
      } else {
        this.purrNodes.env.gain.setTargetAtTime(0.16, now, 0.08);
      }

      if (this.purrFadeTimeout) clearTimeout(this.purrFadeTimeout);
      this.purrFadeTimeout = setTimeout(() => {
        this.stopPurr();
      }, 320);
    }

    stopPurr() {
      if (!this.purrNodes || !this.ctx) return;
      const nodes = this.purrNodes;
      this.purrNodes = null;
      const now = this.ctx.currentTime;
      nodes.env.gain.cancelScheduledValues(now);
      nodes.env.gain.setTargetAtTime(0.0001, now, 0.14);
      setTimeout(() => {
        try {
          nodes.carrier.stop();
          nodes.lfo.stop();
        } catch (_) {}
      }, 500);
    }

    /**
     * Watery bubble pop + pentatonic sparkle chime
     */
    playBubblePop() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Droplet pop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(1240, now + 0.065);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.085);

      // Cute pentatonic chime note
      const noteName = PENTATONIC_SPARKLE[this.bubbleCombo % PENTATONIC_SPARKLE.length];
      this.bubbleCombo++;
      this.playSparkleNote(freq(noteName), 0.11);
    }

    playSparkleNote(f, peak = 0.14) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.38);
    }

    /**
     * Delicate silver bell tinkle for feather wand
     */
    playBell() {
      this.unlockAndPlay();
      if (!this.ctx) return;
      const nowMs = performance.now();
      if (nowMs - this.lastBellTime < 140) return;
      this.lastBellTime = nowMs;

      const now = this.ctx.currentTime;
      [2480, 3740].forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f * (0.98 + Math.random() * 0.04), now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.075 : 0.04, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
      });
    }

    /**
     * Crispy fish-treat munch + happy sparkle
     */
    playMunch() {
      this.unlockAndPlay();
      if (!this.ctx || !this.noiseBuffer) return;

      const now = this.ctx.currentTime;
      [0, 0.13, 0.26].forEach((offset, idx) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1800 + idx * 350;
        filter.Q.value = 1.6;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        src.start(now + offset);
        src.stop(now + offset + 0.08);
      });

      setTimeout(() => {
        this.playSparkleNote(freq("C6"), 0.13);
        setTimeout(() => this.playSparkleNote(freq("F6"), 0.15), 90);
      }, 280);
    }

    /**
     * Crisp dry cat-kibble pellets rattling playfully into a ceramic bowl
     */
    playKibblePour() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const pelletTimes = [0.02, 0.07, 0.11, 0.16, 0.20, 0.25, 0.31, 0.37, 0.44];
      pelletTimes.forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        const baseF = 1150 + ((idx * 173) % 620) + Math.random() * 140;
        osc.frequency.setValueAtTime(baseF, now + offset);
        osc.frequency.exponentialRampToValueAtTime(baseF * 0.55, now + offset + 0.035);

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(0.095, now + offset + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.042);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.048);

        if (this.noiseBuffer && idx % 2 === 0) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = 2600 + idx * 180;
          filter.Q.value = 2.2;

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.0001, now + offset);
          nGain.gain.linearRampToValueAtTime(0.07, now + offset + 0.004);
          nGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.032);

          src.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.sfxGain);
          src.start(now + offset);
          src.stop(now + offset + 0.036);
        }
      });
    }

    /**
     * Sparkling crystalline water pouring into ceramic bowl (glug-bloop + gentle stream)
     */
    playWaterPour() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Soft filtered stream hiss
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.65);
        filter.Q.value = 2.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.08);
        gain.gain.setValueAtTime(0.075, now + 0.52);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        src.start(now);
        src.stop(now + 0.74);
      }

      // Bubbling rising liquid droplets as bowl fills up!
      const drops = [0.04, 0.12, 0.20, 0.29, 0.37, 0.45, 0.54, 0.62];
      drops.forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        const f0 = 460 + idx * 78 + Math.random() * 45;
        osc.frequency.setValueAtTime(f0, now + offset);
        osc.frequency.exponentialRampToValueAtTime(f0 * 1.48, now + offset + 0.055);

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(0.085, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.068);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.075);
      });
    }

    /**
     * Gentle cute kitten water-lapping sound ("吧嗒吧嗒舔水")
     */
    playLapWater() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [0, 0.14].forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        const base = idx === 0 ? 540 : 620;
        osc.frequency.setValueAtTime(base, now + offset);
        osc.frequency.exponentialRampToValueAtTime(base * 1.62, now + offset + 0.055);

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(0.085, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.075);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.08);
      });
    }

    /**
     * Warm gourmet fish-platter chime + soft ceramic clink when serving fresh salmon slices
     */
    playFishServe() {
      this.unlockAndPlay();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [freq("E5"), freq("G5"), freq("C6")];
      notes.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, now + idx * 0.065);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.065 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.24);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + 0.26);
      });
    }

    /**
     * Adorable cute "I'm stuffed!" declining kitten whine + tiny bubbly hiccup burp ("唔~嗝♪")
     */
    playFullBurp() {
      this.runWhenAudible(() => {
        const now = this.ctx.currentTime;
        // 1. Soft descending "no thanks~" kitten murmur
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(520, now);
        osc1.frequency.exponentialRampToValueAtTime(340, now + 0.22);
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.03);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(now);
        osc1.stop(now + 0.26);

        // 2. Cute tiny bubbly hiccup pop ("嗝♪")
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(290, now + 0.26);
        osc2.frequency.exponentialRampToValueAtTime(640, now + 0.34);
        gain2.gain.setValueAtTime(0.0001, now + 0.26);
        gain2.gain.linearRampToValueAtTime(0.13, now + 0.28);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now + 0.26);
        osc2.stop(now + 0.40);

        if (typeof this.onCatVocalize === "function") {
          this.onCatVocalize(0.38, "burp");
        }
      });
    }

    /**
     * Heart-melting pleading hungry kitten meow ("喵呜~") + tiny soft tummy rumble ("咕噜噜")
     * Runs strictly inside runWhenAudible so mouth opening stays 100% locked to vocalization!
     */
    playHungryMeow() {
      this.runWhenAudible(() => {
        const now = this.ctx.currentTime;
        const dur = 0.44;

        // 1. Pleading tender ascending-then-drooping kitten whine ("m-eee-oww~")
        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const f1 = this.ctx.createBiquadFilter();
        const f2 = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        const subGain = this.ctx.createGain();

        osc.type = "sawtooth";
        sub.type = "sine";

        const jitter = 0.97 + Math.random() * 0.06;
        const fStart = 640 * jitter;
        const fPeak = 890 * jitter;
        const fEnd = 505 * jitter;

        osc.frequency.setValueAtTime(fStart, now);
        osc.frequency.exponentialRampToValueAtTime(fPeak, now + dur * 0.30);
        osc.frequency.exponentialRampToValueAtTime(fEnd, now + dur);

        sub.frequency.setValueAtTime(fStart, now);
        sub.frequency.exponentialRampToValueAtTime(fPeak, now + dur * 0.30);
        sub.frequency.exponentialRampToValueAtTime(fEnd, now + dur);

        f1.type = "bandpass";
        f1.Q.value = 3.4;
        f1.frequency.setValueAtTime(920, now);
        f1.frequency.exponentialRampToValueAtTime(1520, now + dur * 0.32);
        f1.frequency.exponentialRampToValueAtTime(760, now + dur);

        f2.type = "lowpass";
        f2.frequency.setValueAtTime(2400, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.045);
        gain.gain.setValueAtTime(0.16, now + dur * 0.58);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

        subGain.gain.value = 0.14;

        osc.connect(f1);
        f1.connect(f2);
        f2.connect(gain);
        sub.connect(subGain);
        subGain.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        sub.start(now);
        osc.stop(now + dur + 0.03);
        sub.stop(now + dur + 0.03);

        // 2. Cute soft tummy-rumble underneath ("咕噜~")
        const rumble = this.ctx.createOscillator();
        const rLfo = this.ctx.createOscillator();
        const rLfoGain = this.ctx.createGain();
        const rFilter = this.ctx.createBiquadFilter();
        const rGain = this.ctx.createGain();

        rumble.type = "triangle";
        rumble.frequency.setValueAtTime(74, now);
        rumble.frequency.exponentialRampToValueAtTime(48, now + 0.38);

        rLfo.type = "sine";
        rLfo.frequency.value = 18;
        rLfoGain.gain.value = 0.045;

        rFilter.type = "lowpass";
        rFilter.frequency.value = 185;

        rGain.gain.setValueAtTime(0.0001, now);
        rGain.gain.linearRampToValueAtTime(0.095, now + 0.06);
        rGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.40);

        rLfo.connect(rLfoGain);
        rLfoGain.connect(rGain.gain);
        rumble.connect(rFilter);
        rFilter.connect(rGain);
        rGain.connect(this.sfxGain);

        rumble.start(now);
        rLfo.start(now);
        rumble.stop(now + 0.42);
        rLfo.stop(now + 0.42);

        if (typeof this.onCatVocalize === "function") {
          this.onCatVocalize(dur, "hungry");
        }
      });
    }

    /**
     * Soft boing for yarn ball bounce or cat grass wiggle
     */
    playBoing(pitchScale = 1) {
      this.unlockAndPlay();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(240 * pitchScale, now);
      osc.frequency.exponentialRampToValueAtTime(480 * pitchScale, now + 0.11);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.18);
    }

    /**
     * Celebration fanfare when Moe Meter levels up!
     */
    playLevelUp() {
      this.unlockAndPlay();
      if (!this.ctx) return;
      const notes = ["F5", "A5", "C6", "E6", "F6"];
      notes.forEach((n, idx) => {
        setTimeout(() => {
          this.playSparkleNote(freq(n), 0.15);
        }, idx * 75);
      });
    }
  }

  window.MoeAudio = new MoeAudioEngine();
})();
