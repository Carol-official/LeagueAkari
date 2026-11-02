<template>
  <div class="rounded-xs bg-neutral-100 px-2 py-1 dark:bg-neutral-900">
    <div
      v-for="row of performanceRows"
      :key="row.key"
      class="flex text-[11px] text-neutral-900/60 dark:text-neutral-100/60"
    >
      <span class="flex-1">{{ row.label }}</span>
      <span class="min-w-9 text-right whitespace-nowrap tabular-nums" :class="row.class">
        {{ row.value }}
      </span>
    </div>

    <div
      v-if="performanceRows.length && adjustments.length"
      class="my-1 h-px bg-neutral-900/10 dark:bg-white/10"
    />

    <div
      v-for="b of adjustments"
      :key="b.type"
      class="flex text-[11px] text-neutral-900/60 dark:text-neutral-100/60"
    >
      <span class="flex-1">{{ b.name }}</span>
      <span
        class="min-w-9 text-right whitespace-nowrap tabular-nums"
        :class="balanceValueClass(b.effect)"
      >
        {{ b.formattedValue }}
      </span>
    </div>

    <div v-if="footer" class="mt-1 text-[10px] text-neutral-700 dark:text-neutral-300">
      {{ footer }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import {
  type ChampionPerformanceLookup,
  type ChampionPerformanceMetadata,
  classifyWinRate,
  formatPickRate,
  formatRank,
  formatWinRate
} from '@renderer-shared/composables/champion-performance'
import {
  getOpggAramBalanceAdjustments,
  type OpggAramBalanceAdjustment
} from '@shared/data-adapter/opgg-aram-balance'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'

const props = defineProps<{
  championId: number
  performance?: ChampionPerformanceLookup | null
  metadata?: ChampionPerformanceMetadata | null
}>()

const { t } = useTranslation()
const lcs = useLeagueClientStore()
const resources = useAkariResourceProvider()

const gameMode = computed(() => lcs.gameflow.session?.gameData.queue.gameMode ?? null)

const balanceTypes = computed(() => ({
  'damage-dealt': { name: t('auxWindow.championBench.balanceTypes.damage-dealt') },
  'damage-taken': { name: t('auxWindow.championBench.balanceTypes.damage-taken') },
  'attack-speed': { name: t('auxWindow.championBench.balanceTypes.attack-speed') },
  'ability-haste': { name: t('auxWindow.championBench.balanceTypes.ability-haste') },
  healing: { name: t('auxWindow.championBench.balanceTypes.healing') },
  tenacity: { name: t('auxWindow.championBench.balanceTypes.tenacity') },
  shielding: { name: t('auxWindow.championBench.balanceTypes.shielding') },
  'energy-regen': { name: t('auxWindow.championBench.balanceTypes.energy-regen') },
  'area-of-effect-damage': {
    name: t('auxWindow.championBench.balanceTypes.area-of-effect-damage')
  }
}))

const formatBalanceValue = (item: OpggAramBalanceAdjustment) => {
  if (item.display === 'percentage') {
    return `${item.value.toFixed()}%`
  }

  return `${item.value > 0 ? '+' : ''}${item.value}`
}

const adjustments = computed(() => {
  if (gameMode.value !== 'ARAM') {
    return []
  }

  const balance = resources.champions.aramBalance(props.championId)
  if (!balance) {
    return []
  }

  return getOpggAramBalanceAdjustments(balance).map((item) => ({
    ...item,
    name: balanceTypes.value[item.type].name,
    formattedValue: formatBalanceValue(item)
  }))
})

const balanceValueClass = (effect?: string) => {
  switch (effect) {
    case 'buffed':
      return 'text-emerald-600 dark:text-emerald-300'
    case 'nerfed':
      return 'text-orange-600 dark:text-orange-300'
    default:
      return ''
  }
}

const winRateClass = (winRate: number | null) => {
  switch (classifyWinRate(winRate)) {
    case 'high':
      return 'text-emerald-600 dark:text-emerald-300'
    case 'low':
      return 'text-orange-600 dark:text-orange-300'
    default:
      return ''
  }
}

const performanceRows = computed(() => {
  const performance = props.performance
  if (!performance) {
    return []
  }

  const winRate = formatWinRate(performance.winRate)
  const pickRate = formatPickRate(performance.pickRate)
  const rank = formatRank(performance.tier, performance.rank)

  const rows: Array<{ key: string; label: string; value: string; class: string }> = []

  if (winRate) {
    rows.push({
      key: 'win-rate',
      label: t('auxWindow.championBench.performance.winRate'),
      value: winRate,
      class: winRateClass(performance.winRate)
    })
  }

  if (pickRate) {
    rows.push({
      key: 'pick-rate',
      label: t('auxWindow.championBench.performance.pickRate'),
      value: pickRate,
      class: ''
    })
  }

  if (rank) {
    rows.push({
      key: 'rank',
      label: t('auxWindow.championBench.performance.rank'),
      value: rank,
      class: ''
    })
  }

  return rows
})

const footer = computed(() => {
  const labels: string[] = []

  if (props.metadata) {
    labels.push(props.metadata.source === 'qq101' ? '101' : 'OP.GG')

    if (props.metadata.patch) {
      labels.push(props.metadata.patch)
    }
  }

  if (adjustments.value.length) {
    labels.push('OP.GG')
  }

  return Array.from(new Set(labels)).join(' · ')
})
</script>
