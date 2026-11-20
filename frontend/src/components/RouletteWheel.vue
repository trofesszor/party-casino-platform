<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{ resultNumber: number | null; spinning: boolean; roundNumber: number }>();
const wheelOrder = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const landed = ref(false);
const winningIndex = computed(() => props.resultNumber === null ? 0 : wheelOrder.indexOf(props.resultNumber));
const wheelStyle = computed(() => ({ '--wheel-stop': `${2160 - Math.max(0, winningIndex.value) * (360 / wheelOrder.length)}deg` }));
const pockets = computed(() => wheelOrder.map((number,index) => ({number,angle:index*(360/wheelOrder.length),color:number===0?'green':redNumbers.has(number)?'red':'black'})));
watch(() => [props.spinning,props.roundNumber], () => { landed.value = false; });
function onWheelAnimationEnd() { landed.value = true; }
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
            <span class="wheel-center-label">PARTY CASINO</span>
            <strong v-if="landed && resultNumber !== null" class="wheel-winning-number" :class="resultNumber === 0 ? 'green' : redNumbers.has(resultNumber) ? 'red' : 'black'">{{ resultNumber }}</strong>
            <strong v-else class="wheel-center-star">✦</strong>
          </div>
        </div>
      </div>
      <div class="roulette-ball-track"><span class="roulette-ball"></span></div>
    </div>
    <p class="wheel-status" v-if="spinning && !landed">A golyó forog…</p>
    <p class="wheel-status wheel-result-status" v-else-if="landed && resultNumber !== null">Eredmény: {{ resultNumber }}</p>
    <p class="wheel-status" v-else>Várakozás a következő pörgetésre</p>
  </div>
</template>
