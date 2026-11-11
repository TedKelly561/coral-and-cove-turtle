// 100% Procedural Web Audio Ocean Soundscape & Musical Feedback Engine

class OceanAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isAmbientRunning: boolean = false;
  private masterGain: GainNode | null = null;
  private underwaterFilter: BiquadFilterNode | null = null;
  private surfGain: GainNode | null = null;
  private chordTimer: number | null = null;

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    this.startAmbientSoundscape();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, this.ctx.currentTime, 0.15);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setCameraUnderwater(isUnderwater: boolean) {
    if (!this.ctx || !this.underwaterFilter || !this.surfGain) return;
    const now = this.ctx.currentTime;
    // Smooth lowpass filter transition when diving beneath the surface vs surfacing near the beach
    this.underwaterFilter.frequency.setTargetAtTime(isUnderwater ? 340 : 1100, now, 0.35);
    this.surfGain.gain.setTargetAtTime(isUnderwater ? 0.08 : 0.16, now, 0.35);
  }

  private startAmbientSoundscape() {
    if (!this.ctx || !this.masterGain || this.isAmbientRunning) return;
    this.isAmbientRunning = true;

    // 1. Pink-noise ocean surf & deep water current
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.03;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.underwaterFilter = this.ctx.createBiquadFilter();
    this.underwaterFilter.type = 'lowpass';
    this.underwaterFilter.frequency.value = 420;
    this.underwaterFilter.Q.value = 0.7;

    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.11;

    // Slow LFO to modulate wave wash every 9 seconds
    const waveLfo = this.ctx.createOscillator();
    waveLfo.type = 'sine';
    waveLfo.frequency.value = 0.11;
    const waveLfoGain = this.ctx.createGain();
    waveLfoGain.gain.value = 0.045;
    waveLfo.connect(waveLfoGain);
    waveLfoGain.connect(this.surfGain.gain);

    whiteNoise.connect(this.underwaterFilter);
    this.underwaterFilter.connect(this.surfGain);
    this.surfGain.connect(this.masterGain);

    whiteNoise.start();
    waveLfo.start();

    // 2. Tranquil pentatonic ambient harp/pad notes every few seconds
    const pentatonicHz = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const scheduleNextAmbientNote = () => {
      if (!this.ctx || !this.masterGain) return;
      if (!this.isMuted && this.ctx.state === 'running') {
        const freq = pentatonicHz[Math.floor(Math.random() * pentatonicHz.length)];
        this.playSoftPadNote(freq, 4.2, 0.045);
      }
      this.chordTimer = window.setTimeout(scheduleNextAmbientNote, 3600 + Math.random() * 2800);
    };
    this.chordTimer = window.setTimeout(scheduleNextAmbientNote, 1800);
  }

  private playSoftPadNote(freq: number, duration: number, peakGain: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq * 0.5, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + duration + 0.05);
    subOsc.stop(now + duration + 0.05);
  }

  // Triggered when Mother or Baby Turtle sings/calls to each other or wildlife
  public playTurtleCall(isMother: boolean) {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const baseFreq = isMother ? 329.63 : 523.25; // E4 for Mom, C5 for Baby
    const secondFreq = isMother ? 392.00 : 659.25; // G4 for Mom, E5 for Baby

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(secondFreq, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + 0.75);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.85);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.9);
  }

  // Triggered when opening a sunken treasure chest
  public playTreasureChime() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const start = this.ctx.currentTime + idx * 0.11;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 1.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(start);
      osc.stop(start + 1.45);
    });
  }

  // Triggered on flipper gentle boost
  public playSwimWhoosh() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(290, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  // Triggered when Mother or Hatchling performs a hydrodynamic barrel roll
  public playBarrelRollBubbles(isMother: boolean) {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 1. Swirling water current sweep
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sine';
    const baseHz = isMother ? 190 : 280;
    sweepOsc.frequency.setValueAtTime(baseHz, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(baseHz * 1.85, now + 0.28);
    sweepOsc.frequency.exponentialRampToValueAtTime(baseHz * 0.75, now + 0.68);

    sweepGain.gain.setValueAtTime(0.001, now);
    sweepGain.gain.linearRampToValueAtTime(0.09, now + 0.12);
    sweepGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.72);

    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.75);

    // 2. Cascade of sparkling bubble-pop overtones
    const bubbleNotes = isMother
      ? [392.0, 493.88, 587.33, 659.25, 783.99, 987.77]
      : [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51];

    bubbleNotes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + i * 0.085;
      const popOsc = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();

      popOsc.type = 'sine';
      popOsc.frequency.setValueAtTime(freq * 0.82, t);
      popOsc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.09);

      popGain.gain.setValueAtTime(0.001, t);
      popGain.gain.linearRampToValueAtTime(0.055, t + 0.02);
      popGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);

      popOsc.connect(popGain);
      popGain.connect(this.masterGain);
      popOsc.start(t);
      popOsc.stop(t + 0.16);
    });
  }

  // Triggered when Mother or Baby Turtle stops to munch tender seaweed
  public playSeaweedMunch() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 3 joyful little crunchy-bubble nibbles + happy marimba chirp
    [0, 0.16, 0.32].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      const base = 330 + idx * 65;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.08);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.13);
    });

    // Happy rising fifth chime after the nibble
    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(587.33, now + 0.45);
    chime.frequency.exponentialRampToValueAtTime(880.0, now + 0.72);
    chimeGain.gain.setValueAtTime(0.001, now + 0.45);
    chimeGain.gain.linearRampToValueAtTime(0.1, now + 0.5);
    chimeGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.95);
    chime.connect(chimeGain);
    chimeGain.connect(this.masterGain);
    chime.start(now + 0.45);
    chime.stop(now + 0.98);
  }

  // Triggered when befriending a marine creature
  public playFriendshipChime() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const notes = [440.0, 554.37, 659.25, 880.0]; // Warm A-major friendship arpeggio
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const start = this.ctx.currentTime + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 1.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 1.15);
    });
  }

  public dispose() {
    if (this.chordTimer) {
      clearTimeout(this.chordTimer);
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const oceanAudio = new OceanAudioEngine();
