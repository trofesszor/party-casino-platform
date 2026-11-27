<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  resultNumber: number | null;
  previousResultNumber?: number | null;
  spinning: boolean;
  roundNumber: number;
  completedAt?: string | null;
  resultSeconds?: number;
}>();
const emit = defineEmits<{ landed: [round: number] }>();

const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const fullTurn = 2 * Math.PI;
const pocket = fullTurn / order.length;
const size = 600;
const center = size / 2;
const canvas = ref<HTMLCanvasElement>();
const revealed = ref<number | null>(null);
const running = ref(false);
const resultClass = computed(() => revealed.value === 0 ? 'green' : red.has(revealed.value ?? -1) ? 'red' : 'black');

let context: CanvasRenderingContext2D | null = null;
let housing: HTMLCanvasElement;
let rotor: HTMLCanvasElement;
let motion: MediaQueryList;
let frame = 0;

function layer() {
  const image = document.createElement('canvas');
  image.width = image.height = size;
  return image;
}

function disc(ctx: CanvasRenderingContext2D, radius: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, fullTurn);
  ctx.fillStyle = fill;
  ctx.fill();
}

function radial(ctx: CanvasRenderingContext2D, radius: number, stops: Array<[number, string]>) {
  const gradient = ctx.createRadialGradient(-35, -52, 0, 0, 0, radius);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function drawHousing(ctx: CanvasRenderingContext2D) {
  ctx.translate(center, center);
  disc(ctx, 286, radial(ctx, 286, [[0, '#773745'], [.78, '#50252d'], [.91, '#301821'], [1, '#160c11']]));
  for (let radius = 242; radius <= 279; radius += 4) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, .3 + radius * .11, 5.8 + radius * .11);
    ctx.strokeStyle = radius % 3 === 0 ? '#f1a87b2b' : '#0c061339';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  disc(ctx, 245, radial(ctx, 245, [[0, '#c0805b'], [.83, '#5c2f31'], [.91, '#edbd8b'], [.95, '#87523c'], [1, '#512c30']]));
  disc(ctx, 236, radial(ctx, 236, [[0, '#4e3940'], [.85, '#393038'], [.94, '#171421'], [1, '#2f2330']]));
  ctx.strokeStyle = '#d6a36c77';
  ctx.lineWidth = 1.5;
  for (const radius of [219, 229]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, fullTurn);
    ctx.stroke();
  }
}

function drawRotor(ctx: CanvasRenderingContext2D) {
  ctx.translate(center, center);
  disc(ctx, 208, '#a66c51');
  order.forEach((number, index) => {
    const angle = index * pocket;
    const start = angle - Math.PI / 2 - pocket / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 205, start + .008, start + pocket - .008);
    ctx.closePath();
    ctx.fillStyle = number === 0 ? '#1e765f' : red.has(number) ? '#a32b48' : '#171a28';
    ctx.fill();
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#fff1db';
    ctx.font = '700 17px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 0, -189);
    ctx.restore();
  });
  disc(ctx, 158, '#c99366');
  disc(ctx, 154, radial(ctx, 154, [[0, '#483340'], [.75, '#3d262e'], [.94, '#2c1b25'], [1, '#69505a']]));
  disc(ctx, 110, radial(ctx, 110, [[0, '#aa5d54'], [.60, '#66383e'], [.91, '#482632'], [1, '#ce9b75']]));
  disc(ctx, 39, radial(ctx, 39, [[0, '#e9b887'], [.75, '#bd855d'], [1, '#5b2c37']]));
  for (let spoke = 0; spoke < 4; spoke++) {
    ctx.save();
    ctx.rotate(spoke * Math.PI / 2);
    ctx.fillStyle = '#edbb89';
    ctx.fillRect(-4, -54, 8, 52);
    ctx.restore();
  }
  disc(ctx, 25, radial(ctx, 25, [[0, '#fff2c9'], [.72, '#d3966c'], [1, '#6c3637']]));
  disc(ctx, 8, '#4b2936');
}

function atTop(number: number | null | undefined) {
  return number == null ? 0 : -order.indexOf(number) * pocket;
}

function draw(rotation: number, orbit: number, radius: number, bounce = 0) {
  const ctx = context;
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(housing, 0, 0);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(rotation);
  ctx.drawImage(rotor, -center, -center);
  ctx.restore();

  const x = center + Math.sin(orbit) * radius;
  const y = center - Math.cos(orbit) * radius - bounce;
  ctx.save();
  ctx.translate(x, y);
  const ball = ctx.createRadialGradient(-3, -3, 1, 0, 0, 8);
  ball.addColorStop(0, '#fffdf5');
  ball.addColorStop(.64, '#f1d7ba');
  ball.addColorStop(1, '#967b73');
  ctx.shadowColor = '#110812';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  disc(ctx, 7.5, ball);
  ctx.restore();
}

function restart() {
  if (!context) return;
  cancelAnimationFrame(frame);
  const result = props.resultNumber;
  const previous = props.previousResultNumber ?? null;
  if (!props.spinning || result === null) {
    running.value = false;
    revealed.value = previous;
    draw(atTop(previous), 0, previous === null ? 224 : 169);
    return;
  }

  const round = props.roundNumber;
  const duration = Math.min(6100, Math.max(250, (props.resultSeconds ?? 5) * 1000 - 250));
  const rawTimestamp = props.completedAt ?? '';
  const completedAt = Date.parse(rawTimestamp.includes(' ') ? rawTimestamp.replace(' ', 'T') + 'Z' : rawTimestamp);
  const start = performance.now() - (Number.isFinite(completedAt) ? Math.max(0, Date.now() - completedAt) : 0);
  const startAngle = atTop(previous);
  const endAngle = atTop(result);
  const rotationDelta = ((endAngle - startAngle) % fullTurn + fullTurn) % fullTurn + 3 * fullTurn;
  const settle = () => {
    draw(endAngle, 0, 169);
    running.value = false;
    revealed.value = result;
    emit('landed', round);
  };
  if (motion.matches || performance.now() - start >= duration) {
    settle();
    return;
  }

  running.value = true;
  revealed.value = previous;
  const animate = (timestamp: number) => {
    const progress = Math.min(1, Math.max(0, (timestamp - start) / duration));
    if (progress === 1) {
      settle();
      return;
    }
    const rotorProgress = 1 - (1 - progress) ** 3;
    const orbitProgress = 1 - (1 - progress) ** 2.35;
    const drop = Math.max(0, (progress - .58) / .42);
    const bounce = Math.abs(Math.sin(drop * Math.PI * 5)) * (1 - drop) ** 2 * 9;
    draw(startAngle + rotationDelta * rotorProgress, -fullTurn * 6 * orbitProgress, 224 - 55 * drop ** 1.35, bounce);
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
}

onMounted(() => {
  context = canvas.value?.getContext('2d') ?? null;
  if (!context) {
    revealed.value = props.resultNumber ?? props.previousResultNumber ?? null;
    if (props.spinning && props.resultNumber !== null) emit('landed', props.roundNumber);
    return;
  }
  housing = layer();
  rotor = layer();
  const housingContext = housing.getContext('2d');
  const rotorContext = rotor.getContext('2d');
  if (housingContext && rotorContext) {
    drawHousing(housingContext);
    drawRotor(rotorContext);
  }
  motion = matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', restart);
  restart();
});
watch(() => [props.roundNumber, props.spinning, props.resultNumber, props.previousResultNumber, props.completedAt, props.resultSeconds], restart);
onUnmounted(() => {
  cancelAnimationFrame(frame);
  motion?.removeEventListener('change', restart);
});
</script>

<template>
  <figure class="roulette-rotor" :data-motion="running ? 'rolling' : 'resting'">
    <div class="rotor-plinth" aria-hidden="true">
      <canvas ref="canvas" width="600" height="600"></canvas>
      <span class="rotor-index"></span>
    </div>
    <figcaption class="rotor-caption" role="status">
      <span v-if="running">A golyó pályán van</span>
      <template v-else>
        <span>{{ spinning ? 'Nyerőszám' : 'Legutóbbi szám' }}</span>
        <strong v-if="revealed !== null" :class="resultClass">{{ revealed }}</strong>
        <span v-else class="rotor-no-result">—</span>
      </template>
    </figcaption>
  </figure>
</template>
