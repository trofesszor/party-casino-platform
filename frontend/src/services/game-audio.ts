import { onUnmounted, ref } from 'vue';

type AudioMode = 'off' | 'effects' | 'voice';
type Cue = 'start' | 'end' | 'win' | 'bet' | 'card' | 'click' | 'reel' | 'bell' | 'bark' | 'bonus';
const stored = localStorage.getItem('party-game-audio');
export const audioMode = ref<AudioMode>(stored === 'effects' || stored === 'voice' ? stored : 'off');
let audio: AudioContext | undefined;
let output: GainNode | undefined;
let voiceOwner: symbol | undefined;

function unlock() {
  if (audioMode.value === 'off' || !window.AudioContext) return;
  try {
    if (!audio) {
      audio = new AudioContext();
      output = audio.createGain();
      output.connect(audio.destination);
    }
    if (output) output.gain.value = 1;
    if (audio.state !== 'running') void audio.resume().catch(() => undefined);
  } catch { /* Web Audio is optional on this device. */ }
}

export function setAudioMode(mode: AudioMode) {
  audioMode.value = mode;
  localStorage.setItem('party-game-audio', mode);
  if (mode !== 'voice') window.speechSynthesis?.cancel();
  if (mode === 'off') {
    if (output) output.gain.value = 0;
  } else unlock();
}

export function unlockGameAudio() {
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function tone(ctx: AudioContext, at: number, duration: number, from: number, to = from, volume = .12, wave: OscillatorType = 'sine') {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(.001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .012);
  gain.gain.exponentialRampToValueAtTime(.001, at + duration);
  oscillator.connect(gain).connect(output ?? ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

function texture(ctx: AudioContext, at: number, duration: number, kind: 'card' | 'bark') {
  const sample = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = sample.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const progress = i / data.length;
    const envelope = Math.min(1, progress / .12) * Math.pow(1 - progress, 1.6);
    phase += 2 * Math.PI * (235 - 105 * progress + 22 * Math.sin(progress * 14)) / ctx.sampleRate;
    const rasp = (Math.random() * 2 - 1) * .6;
    data[i] = envelope * (kind === 'card' ? rasp : rasp + .5 * Math.tanh(3 * Math.sin(phase)) + .18 * Math.sin(phase * 4));
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = kind === 'bark' ? 870 : 1900;
  filter.Q.value = .65;
  gain.gain.value = kind === 'bark' ? .45 : .2;
  source.buffer = sample;
  source.connect(filter).connect(gain).connect(output ?? ctx.destination);
  source.start(at);
}

export function useGameAudio() {
  const owner = Symbol();
  const scheduled = new Set<ReturnType<typeof setTimeout>>();
  let rollTimer: ReturnType<typeof setInterval> | undefined;

  function effect(cue: Cue, variation = 0) {
    if (audioMode.value === 'off' || document.hidden || audio?.state !== 'running') return;
    const t = audio.currentTime;
    switch (cue) {
      case 'click': tone(audio, t, .058, 760, 440, .09, 'triangle'); break;
      case 'bet': tone(audio, t, .09, 1060, 450, .13, 'triangle'); break;
      case 'card': texture(audio, t, .12, 'card'); break;
      case 'start':
        tone(audio, t, .13, 440, 540);
        tone(audio, t + .08, .17, 660);
        break;
      case 'end':
        tone(audio, t, .16, 520);
        tone(audio, t + .11, .19, 390);
        break;
      case 'win':
      case 'bonus':
        [523, 659, 784, 1046].forEach((note, index) => tone(audio!, t + index * .065, .23, note));
        break;
      case 'reel': {
        const pitch = [275, 460, 315, 615, 380, 530][variation % 6];
        tone(audio, t, .1, pitch, pitch * (variation % 2 ? 1.55 : .58), .072, 'triangle');
        break;
      }
      case 'bell':
        tone(audio, t, .3, 1100, 1060, .12, 'triangle');
        tone(audio, t, .18, 1560, 1510, .045);
        break;
      case 'bark':
        texture(audio, t, .19, 'bark');
        break;
    }
  }

  function announce(message: string, queue = false) {
    if (audioMode.value !== 'voice' || document.hidden || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const speech = window.speechSynthesis;
    const voice = speech.getVoices().find(item => /^hu(?:[-_]|$)/i.test(item.lang));
    if (!queue) speech.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'hu-HU';
    if (voice) utterance.voice = voice;
    utterance.rate = 1.04;
    utterance.volume = .85;
    voiceOwner = owner;
    speech.speak(utterance);
  }

  function after(ms: number, callback: () => void) {
    const timer = setTimeout(() => {
      scheduled.delete(timer);
      callback();
    }, ms);
    scheduled.add(timer);
  }

  function stopRoll() {
    clearInterval(rollTimer);
    rollTimer = undefined;
  }

  function roll(kind: 'slot' | 'wheel') {
    stopRoll();
    let tick = 0;
    const play = () => effect(kind === 'slot' ? 'reel' : 'click', tick++);
    play();
    rollTimer = setInterval(() => tick < 100 ? play() : stopRoll(), kind === 'slot' ? 125 : 155);
  }

  function stopSpeech() {
    if (voiceOwner === owner) window.speechSynthesis?.cancel();
  }

  onUnmounted(() => {
    stopRoll();
    for (const timer of scheduled) clearTimeout(timer);
    stopSpeech();
  });

  return { effect, announce, after, roll, stopRoll, stopSpeech };
}

type RouletteRound = import('../types').RouletteRound;

export function useRouletteAudio() {
  const audio = useGameAudio();
  let spinningRound: number | undefined;
  return {
    effect: audio.effect,
    changed(previous: RouletteRound | null | undefined, current: RouletteRound | null | undefined, active = true) {
      if (!active || !current) return;
      if (current.status === 'BETTING' && previous?.id !== current.id) {
        spinningRound = undefined;
        audio.stopRoll();
        audio.effect('start');
        audio.announce('Új rulettkör. A tétek megtehetők.', true);
      } else if (current.status === 'COMPLETED' && previous?.id === current.id && previous.status === 'BETTING') {
        spinningRound = current.roundNumber;
        audio.effect('start');
        audio.announce('A tétek lezárva. Indul a rulett.');
        audio.roll('wheel');
      }
    },
    landed(current: RouletteRound | null | undefined, round: number, won = false) {
      if (spinningRound !== round || current?.roundNumber !== round || current.resultNumber === null) return;
      spinningRound = undefined;
      audio.stopRoll();
      audio.effect(won ? 'win' : 'end');
      audio.announce('A rulettkör véget ért. A nyerőszám ' + current.resultNumber + '.', true);
    },
    stop() {
      spinningRound = undefined;
      audio.stopRoll();
      audio.stopSpeech();
    },
  };
}

type WheelState = { status: string; spinId: string | null; winner: { label: string } | null };

export function useWheelAudio() {
  const audio = useGameAudio();
  let spin: string | null = null;
  return {
    changed(previous: WheelState | null, current: WheelState, active = true) {
      if (!active || !current.spinId) return;
      if (current.status === 'SPINNING' && current.spinId !== spin && (previous?.spinId !== current.spinId || previous.status !== 'SPINNING')) {
        spin = current.spinId;
        audio.effect('start');
        audio.announce('Indul a szerencsekerék.');
        audio.roll('wheel');
      } else if (current.status === 'RESULT' && current.spinId === spin) {
        spin = null;
        audio.stopRoll();
        audio.effect('win');
        audio.announce('A pörgetés véget ért. Eredmény: ' + (current.winner?.label ?? '') + '.');
      }
    },
    stop() {
      spin = null;
      audio.stopRoll();
      audio.stopSpeech();
    },
  };
}
