<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  resultNumber: number | null;
  previousResultNumber?: number | null;
  spinning: boolean;
  roundNumber: number;
}>();

// European roulette wheel order, clockwise from zero.
const wheelOrder = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const landed = ref(!props.spinning && (props.resultNumber !== null || props.previousResultNumber != null));
const lastResult = ref<number | null>(props.resultNumber ?? props.previousResultNumber ?? null);

const visibleResult = computed(() => props.resultNumber ?? props.previousResultNumber ?? lastResult.value);
const winningIndex = computed(() => visibleResult.value === null ? 0 : wheelOrder.indexOf(visibleResult.value));
const pocketStep = 360 / wheelOrder.length;
const wheelStyle = computed(() => ({
  // Six full turns, then settle at the winning pocket. The resting transform
  // is the exact same angle modulo 360 degrees, preventing a post-spin snap.
  '--wheel-stop': `${-winningIndex.value * pocketStep - 2160}deg`,
  '--wheel-rest': `${-winningIndex.value * pocketStep}deg`,
}));
const pockets = computed(() => wheelOrder.map((number,index) => ({
  number,
  angle:index*pocketStep,
  color:number===0?'green':redNumbers.has(number)?'red':'black',
})));

watch(
  () => [props.roundNumber, props.resultNumber, props.previousResultNumber, props.spinning] as const,
  () => {
    if (props.resultNumber !== null) {
      lastResult.value = props.resultNumber;
      landed.value = !props.spinning;
    } else if (props.previousResultNumber !== null && props.previousResultNumber !== undefined) {
      lastResult.value = props.previousResultNumber;
      landed.value = true;
    } else {
      landed.value = lastResult.value !== null;
    }
  },
);

function onWheelAnimationEnd(event: AnimationEvent) {
  if (event.animationName === 'roulette-wheel-spin') landed.value = true;
}
</script>

<template>
  <div class="roulette-wheel-wrap">
    <div class="roulette-wheel-stage" :class="{ 'is-spinning': spinning, 'has-landed': landed }" :style="wheelStyle">
      <div class="roulette-pointer"></div>
      <div class="roulette-wheel" @animationend="onWheelAnimationEnd">
        <div class="wheel-rim">
          <div class="wheel-number-ring">
            <span v-for="pocket in pockets" :key="pocket.number" class="wheel-pocket" :class="pocket.color" :style="{ '--pocket-angle': pocket.angle + 'deg' }">{{ pocket.number }}</span>
          </div>
          <div class="wheel-center">
            <span class="wheel-center-label">{{ spinning ? 'SPINNING' : 'LAST RESULT' }}</span>
            <strong v-if="visibleResult !== null" class="wheel-winning-number" :class="visibleResult === 0 ? 'green' : redNumbers.has(visibleResult) ? 'red' : 'black'">{{ visibleResult }}</strong>
            <strong v-else class="wheel-center-star">✦</strong>
          </div>
        </div>
      </div>
      <div class="roulette-ball-track"><span class="roulette-ball"></span></div>
    </div>
    <p class="wheel-status" v-if="spinning && !landed">A golyó forog…</p>
    <p class="wheel-status wheel-result-status" v-else-if="visibleResult !== null">Előző nyerőszám: {{ visibleResult }}</p>
    <p class="wheel-status" v-else>Várakozás a következő pörgetésre</p>
  </div>
</template>
