<template>
  <NCard size="small" v-if="combinedChampions && gameMode">
    <div class="flex items-center justify-center">
      <div class="flex flex-col items-center gap-1">
        <NTooltip
          raw
          :show-arrow="false"
          :duration="100"
          :delay="300"
          :keep-alive-on-hover="false"
          :disabled="!hasTooltipContent(lcs.champSelect.currentChampion || -1)"
        >
          <template #trigger>
            <ChampionIcon
              class="size-9 cursor-default rounded-full border border-black/10 dark:border-white/10"
              :class="
                getChampionImageClass(
                  championAdjustmentEffect(lcs.champSelect.currentChampion || -1)
                )
              "
              :champion-id="lcs.champSelect.currentChampion || -1"
            />
          </template>
          <BenchChampionTooltip
            :champion-id="lcs.champSelect.currentChampion || -1"
            :performance="performance(lcs.champSelect.currentChampion || -1)"
            :metadata="metadata"
          />
        </NTooltip>

        <!-- 新版大乱斗将不再有 Reroll 机制 -->
        <div class="flex gap-1">
          <NButton
            v-if="shouldShowRerollButton"
            @click="() => handleReroll()"
            :disabled="rerollsRemaining === 0 || isRerolling"
            size="tiny"
            :title="
              t('auxWindow.championBench.reroll', {
                count: rerollsRemaining
              })
            "
            secondary
            type="primary"
          >
            <template #icon>
              <NIcon><RefreshOutlineIcon /></NIcon>
            </template>
          </NButton>
          <NButton
            v-if="shouldShowRerollButton"
            :disabled="rerollsRemaining === 0 || isRerolling"
            @click="() => handleReroll(true)"
            :title="
              t('auxWindow.championBench.charity', {
                count: rerollsRemaining
              })
            "
            secondary
            size="tiny"
          >
            <template #icon>
              <NIcon><ShareIcon /></NIcon>
            </template>
          </NButton>
        </div>
      </div>

      <NDivider vertical />

      <div class="grid grid-cols-5 gap-1">
        <div v-for="item of benchItems" :key="item.championId" class="relative">
          <NTooltip
            raw
            :show-arrow="false"
            :duration="100"
            :delay="300"
            :keep-alive-on-hover="false"
            :disabled="!hasTooltipContent(item.championId)"
          >
            <template #trigger>
              <ChampionIcon
                class="size-8 cursor-pointer rounded-xs border border-black/10 dark:border-white/10"
                :class="[
                  getChampionImageClass(championAdjustmentEffect(item.championId)),
                  {
                    'cursor-not-allowed grayscale-[0.8]':
                      !isChampionSwappable(item.championId) || !canUseBench
                  }
                ]"
                :champion-id="item.championId"
                @click="() => handleBenchSwapOrPick(item.championId)"
                @click.right="handleBenchSwapOrPick(item.championId, false)"
              />
            </template>
            <BenchChampionTooltip
              :champion-id="item.championId"
              :performance="item.performance"
              :metadata="metadata"
            />
          </NTooltip>

          <span
            v-if="item.badge"
            class="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xs bg-neutral-950/75 text-center text-[9px] leading-3 font-semibold tabular-nums"
            :class="badgeToneClass(item.badge.tone)"
          >
            {{ item.badge.text }}
          </span>
        </div>
        <div
          v-for="_i of Math.max(10 - (combinedChampions?.length || 0), 0)"
          class="size-8 rounded-xs border border-black/10 dark:border-white/10"
        />
      </div>
    </div>
  </NCard>
</template>

<script setup lang="ts">
import BenchChampionTooltip from './BenchChampionTooltip.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import {
  type ChampionPerformanceTone,
  toPerformanceBadge,
  useChampionPerformance
} from '@renderer-shared/composables/champion-performance'
import { useComponentName } from '@renderer-shared/composables/useComponentName'
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import { useInstance } from '@renderer-shared/shards'
import { LeagueClientRenderer } from '@renderer-shared/shards/league-client'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import {
  getOpggAramBalanceAdjustments,
  getOpggAramBalanceOverallEffect
} from '@shared/data-adapter/opgg-aram-balance'
import { RefreshOutline as RefreshOutlineIcon, Share as ShareIcon } from '@vicons/ionicons5'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NDivider, NIcon, NTooltip, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'

const { t } = useTranslation()
const componentName = useComponentName()

const lcs = useLeagueClientStore()
const lc = useInstance(LeagueClientRenderer)
const logger = useInstance(LoggerRenderer)
const resources = useAkariResourceProvider()
const { performance, metadata } = useChampionPerformance()

const gameMode = computed(() => {
  if (!lcs.gameflow.session) {
    return null
  }

  return lcs.gameflow.session.gameData.queue.gameMode
})

const hasBalanceAdjustment = (championId: number) => {
  if (gameMode.value !== 'ARAM') {
    return false
  }

  const balance = resources.champions.aramBalance(championId)
  if (!balance) {
    return false
  }

  return getOpggAramBalanceAdjustments(balance).length > 0
}

const hasTooltipContent = (championId: number) => {
  return performance(championId) !== null || hasBalanceAdjustment(championId)
}

const championAdjustmentEffect = (championId: number) => {
  if (gameMode.value !== 'ARAM') {
    return undefined
  }

  const balance = resources.champions.aramBalance(championId)
  if (!balance) {
    return undefined
  }

  const adjustments = getOpggAramBalanceAdjustments(balance)
  if (!adjustments.length) {
    return undefined
  }

  return getOpggAramBalanceOverallEffect(adjustments)
}

// lcux 中按照如下逻辑隐藏 bench. 在隐藏 bench 的时候, 通常也不能继续进行选择
const canUseBench = computed(() => {
  if (!lcs.champSelect.session) {
    return false
  }

  if (!lcs.champSelect.session.benchEnabled) {
    return false
  }

  const isInFinalizationPhase = lcs.champSelect.session.timer.phase === 'FINALIZATION'
  const isInBanPickPhase = lcs.champSelect.session.timer.phase === 'BAN_PICK'

  if (lcs.champSelect.session.allowSubsetChampionPicks) {
    return isInFinalizationPhase || isInBanPickPhase
  }

  return isInFinalizationPhase
})

// when in ban pick phase, the bench champions are the subset champions
const combinedChampions = computed(() => {
  if (!lcs.champSelect.session?.benchEnabled) {
    return null
  }

  const originalBenchChampions = lcs.champSelect.session.benchChampions || []

  if (lcs.champSelect.session.timer.phase === 'BAN_PICK') {
    const subsetChampionList = lcs.lobbyTeamBuilder.champSelect.subsetChampionList

    const newChampions = subsetChampionList
      .filter((championId) => !originalBenchChampions.some((c) => c.championId === championId))
      .filter((championId) => lcs.champSelect.currentChampion !== championId)
      .map((championId) => ({
        championId,
        isPriority: false
      }))

    return [...newChampions, ...originalBenchChampions]
  }

  return originalBenchChampions
})

const benchItems = computed(() => {
  const champions = combinedChampions.value
  if (!champions) {
    return []
  }

  return champions.map((champion) => {
    const item = performance(champion.championId)

    return {
      championId: champion.championId,
      performance: item,
      badge: toPerformanceBadge(item)
    }
  })
})

const rerollsRemaining = computed(() => {
  if (!canUseBench.value) {
    return 0
  }

  return lcs.champSelect.session!.rerollsRemaining
})

// logic copied from lcux
const isChampionSwappable = (championId: number) => {
  if (!championId || !lcs.champSelect.session) {
    return false
  }

  const canPlay = lcs.champSelect.currentPickableChampionIds.has(championId)
  const waitingOnFinalizationPhase =
    lcs.champSelect.session.timer.phase === 'BAN_PICK' &&
    !lcs.lobbyTeamBuilder.champSelect.subsetChampionList.includes(championId)

  return canPlay && !waitingOnFinalizationPhase
}

// logic copied from lcux
const shouldShowRerollButton = computed(() => {
  if (!lcs.champSelect.session) {
    return false
  }

  return (
    lcs.champSelect.session.rerollsRemaining > 0 /* 特殊 hacky 情况 */ ||
    (lcs.champSelect.session.allowRerolling &&
      lcs.champSelect.session.timer.phase === 'FINALIZATION' &&
      !lcs.champSelect.session.allowSubsetChampionPicks)
  )
})

const message = useMessage()

const isRerolling = ref(false)
const isSwappingOrPicking = ref(false)

const getChampionImageClass = (effect?: string) => {
  switch (effect) {
    case 'buffed':
      return 'border-emerald-600 dark:border-emerald-400'
    case 'nerfed':
      return 'border-orange-600 dark:border-orange-400'
    case 'mixed':
      return 'champion-image-mixed border'
    default:
      return ''
  }
}

const badgeToneClass = (tone: ChampionPerformanceTone) => {
  switch (tone) {
    case 'high':
      return 'text-emerald-300'
    case 'low':
      return 'text-orange-300'
    case 'tier':
      return 'text-amber-200'
    default:
      return 'text-white/90'
  }
}

// complete takes effect only when in ban-pick phase
const handleBenchSwapOrPick = async (championId: number, complete = true) => {
  if (isSwappingOrPicking.value) {
    return
  }

  // isChampionSwappable makes sure lcs.champSelect.session is not null
  if (!isChampionSwappable(championId)) {
    return
  }

  isSwappingOrPicking.value = true
  try {
    if (lcs.champSelect.session!.timer.phase === 'BAN_PICK' && !lcs.champSelect.currentChampion) {
      const firstPickAction = lcs.champSelect
        .session!.actions.flat()
        .find(
          (a) =>
            a.type === 'pick' &&
            !a.completed &&
            a.actorCellId === lcs.champSelect.session!.localPlayerCellId
        )

      if (firstPickAction) {
        await lc.api.champSelect.pickOrBan(championId, complete, 'pick', firstPickAction.id)
      }
    } else {
      await lc.api.champSelect.benchSwap(championId)
    }
  } catch (error: any) {
    logger.warn(componentName, 'Failed to swap or pick champion', error)
    message.warning(
      t('auxWindow.championBench.swapFailed', {
        reason: error.message
      })
    )
  } finally {
    isSwappingOrPicking.value = false
  }
}

const handleReroll = async (grabBack = false) => {
  if (isRerolling.value) {
    return
  }

  isRerolling.value = true
  try {
    const prevId = lcs.champSelect.currentChampion

    await lc.api.champSelect.reroll()

    // 使用一个简短的延时来实现，simple workaround
    if (grabBack && prevId !== null) {
      window.setTimeout(async () => {
        if (combinedChampions.value) {
          await handleBenchSwapOrPick(prevId)
        }
      }, 25)
    }
  } catch (error: any) {
    logger.warn(componentName, 'Failed to reroll champion', error)
    message.warning(
      t('auxWindow.championBench.rerollFailed', {
        reason: error.message
      })
    )
  } finally {
    isRerolling.value = false
  }
}
</script>

<style scoped>
.champion-image-mixed {
  border-style: solid;
  border-width: 1px;
  border-image: linear-gradient(to bottom right, rgb(0, 161, 67) 50%, rgb(181, 75, 0) 50%) 1;

  [data-theme='dark'] & {
    border-image: linear-gradient(to bottom right, rgb(16, 185, 129) 50%, rgb(251, 146, 60) 50%) 1;
  }
}
</style>
