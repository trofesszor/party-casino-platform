import { onUnmounted, ref } from 'vue';

type Cue = 'start' | 'end' | 'win' | 'reel';
const preferenceKey = 'party-game-audio';
export const audioEnabled = ref(localStorage.getItem(preferenceKey) !== 'off');
let audio: AudioContext | undefined;
let output: GainNode | undefined;
let voiceOwner: symbol | undefined;

export async function activateGameAudio() {
  const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return;
  try {
    if (!audio) {
      audio = new Audio();
      output = audio.createGain();
      output.connect(audio.destination);
    }
    if (output) output.gain.value = 1;
    if (audio.state !== 'running') await audio.resume();
  } catch { /* Web Audio is optional on this device. */ }
}

export function setAudioEnabled(enabled: boolean) {
  audioEnabled.value = enabled;
  localStorage.setItem(preferenceKey, enabled ? 'voice' : 'off');
  if (enabled) void activateGameAudio();
  else {
    window.speechSynthesis?.cancel();
    if (output) output.gain.value = 0;
  }
}

export function unlockGameAudio() {
  const onInteraction = () => {
    if (audioEnabled.value) void activateGameAudio();
  };
  window.addEventListener('pointerdown', onInteraction);
  window.addEventListener('pointerup', onInteraction);
  window.addEventListener('keydown', onInteraction);
  return () => {
    window.removeEventListener('pointerdown', onInteraction);
    window.removeEventListener('pointerup', onInteraction);
    window.removeEventListener('keydown', onInteraction);
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

export function useGameAudio(canPlay = () => audioEnabled.value) {
  const owner = Symbol();
  const scheduled = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  let clip: Promise<AudioBuffer | undefined> | undefined;

  function prepareClip(url: string) {
    if (!canPlay()) return;
    void activateGameAudio();
    const ctx = audio;
    if (!ctx || clip) return;
    clip = fetch(url).then(response => {
      if (!response.ok) throw new Error('A hangfájl nem érhető el.');
      return response.arrayBuffer();
    }).then(data => ctx.decodeAudioData(data)).catch(() => {
      clip = undefined;
      return undefined;
    });
  }

  async function playClip() {
    if (!canPlay() || document.hidden) return;
    const buffer = await clip;
    if (disposed || !buffer || !canPlay() || document.hidden || audio?.state !== 'running') return;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(output ?? audio.destination);
    source.start();
  }

  function effect(cue: Cue) {
    if (!canPlay() || document.hidden || audio?.state !== 'running') return;
    const t = audio.currentTime;
    switch (cue) {
      case 'start':
        tone(audio, t, .13, 440, 540);
        tone(audio, t + .08, .17, 660);
        break;
      case 'end':
        tone(audio, t, .16, 520);
        tone(audio, t + .11, .19, 390);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((note, index) => tone(audio!, t + index * .065, .23, note));
        break;
      case 'reel':
        tone(audio, t, .14, 290, 430, .07, 'triangle');
        tone(audio, t + .12, .18, 430, 235, .065, 'triangle');
        break;
    }
  }

  function announce(message: string, queue = false) {
    if (!canPlay() || document.hidden || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
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

  function stopSpeech() {
    if (voiceOwner === owner) window.speechSynthesis?.cancel();
  }

  onUnmounted(() => {
    disposed = true;
    for (const timer of scheduled) clearTimeout(timer);
    stopSpeech();
  });

  return { effect, announce, after, stopSpeech, prepareClip, playClip };
}

type RouletteRound = import('../types').RouletteRound;

export function useRouletteAudio() {
  const audio = useGameAudio();
  let spinningRound: number | undefined;
  return {
    changed(previous: RouletteRound | null | undefined, current: RouletteRound | null | undefined, active = true) {
      if (!active || !current) return;
      if (current.status === 'BETTING' && previous?.id !== current.id) {
        spinningRound = undefined;
        audio.effect('start');
        audio.announce('Új rulettkör. A tétek megtehetők.', true);
      } else if (current.status === 'COMPLETED' && previous?.id === current.id && previous.status === 'BETTING') {
        spinningRound = current.roundNumber;
      }
    },
    landed(current: RouletteRound | null | undefined, round: number, won = false) {
      if (spinningRound !== round || current?.roundNumber !== round || current.resultNumber === null) return;
      spinningRound = undefined;
      audio.effect(won ? 'win' : 'end');
      audio.announce('A rulettkör véget ért. A nyerőszám ' + current.resultNumber + '.', true);
    },
    stop() {
      spinningRound = undefined;
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
      } else if (current.status === 'RESULT' && current.spinId === spin) {
        spin = null;
        audio.effect('win');
        audio.announce('A pörgetés véget ért. Eredmény: ' + (current.winner?.label ?? '') + '.');
      }
    },
    stop() {
      spin = null;
      audio.stopSpeech();
    },
  };
}
