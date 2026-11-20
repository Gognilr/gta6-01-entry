// All sound is synthesised with WebAudio: no audio files, nothing over the network.
// An engine hum that follows the car's speed, a two-tone police siren, gunshots,
// pickups and crashes as shaped noise, and a small looping bass-and-hats groove.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function resume() {
    if (ensure() && context.state === 'suspended') context.resume();
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(frequency, duration, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  function noiseHit(duration, volume, filterFrequency) {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  // A sun-soaked groove: A-minor bass line with a hat tick, one bar of eight steps.
  const BASS_LINE = [55, 0, 55, 65.41, 55, 0, 82.41, 73.42];
  function musicTick() {
    if (!context || muted) return;
    const step = musicStep % 8;
    const note = BASS_LINE[step];
    if (note > 0) blip(note, 0.22, 'triangle', 0.16);
    if (step % 2 === 0) noiseHit(0.03, 0.05, 6000);
    musicStep += 1;
  }

  return {
    resume,
    unlock() {
      resume();
      if (context && !musicTimer) musicTimer = window.setInterval(musicTick, 240);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** speedRatio 0..1 while driving; 0 and the hum fades out. */
    setEngine(speedRatio, on) {
      if (!context) return;
      const target = on ? 0.05 + speedRatio * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speedRatio * 130, context.currentTime, 0.1);
    },
    /** wanted > 0 and the two-tone siren wails; the tone flips every call. */
    setSiren(on, high) {
      if (!context) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.1);
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, context.currentTime, 0.05);
    },
    shoot() {
      noiseHit(0.12, 0.5, 1800);
      blip(160, 0.08, 'square', 0.2, 60);
    },
    punch() {
      noiseHit(0.08, 0.35, 900);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.3);
      window.setTimeout(() => blip(990, 0.14, 'sine', 0.3), 70);
    },
    cash() {
      blip(880, 0.09, 'sine', 0.3);
      window.setTimeout(() => blip(1174, 0.09, 'sine', 0.3), 80);
      window.setTimeout(() => blip(1568, 0.18, 'sine', 0.3), 160);
    },
    crash(strength) {
      noiseHit(0.25, 0.25 + strength * 0.4, 500);
      blip(90, 0.2, 'sine', 0.4, 40);
    },
    explosion() {
      noiseHit(0.7, 0.7, 320);
      blip(70, 0.6, 'sine', 0.5, 28);
    },
    mission() {
      blip(523, 0.12, 'sine', 0.3);
      window.setTimeout(() => blip(659, 0.12, 'sine', 0.3), 110);
      window.setTimeout(() => blip(784, 0.2, 'sine', 0.3), 220);
    },
    busted() {
      blip(392, 0.25, 'sawtooth', 0.25, 196);
      window.setTimeout(() => blip(311, 0.4, 'sawtooth', 0.25, 155), 240);
    },
  };
}
