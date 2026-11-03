import { useInstance } from '@renderer-shared/shards'
import { ChampionDataRenderer } from '@renderer-shared/shards/champion-data'
import { useChampionDataStore } from '@renderer-shared/shards/champion-data/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import type {
  ChampionDataLoadResult,
  ChampionDataMode,
  ChampionDataOverview,
  ChampionDataSourceId
} from '@shared/data-adapter/champion-data'
import { computed, ref, shallowRef, watch } from 'vue'

import {
  type ChampionPerformanceLookup,
  type ChampionPerformanceMode,
  mergeSecondaryTier,
  resolveChampionPerformanceModeFromSession,
  toChampionPerformanceIndex
} from './performance-index'

interface CacheEntry {
  at: number
  index: Map<number, ChampionPerformanceLookup>
  metadata: ChampionPerformanceMetadata
}

interface PerformanceLoadAttempt {
  mode: ChampionDataMode
  source?: ChampionDataSourceId
  region: string
}

export interface ChampionPerformanceMetadata {
  source: ChampionDataSourceId
  patch: string | null
  /** 主要数据源之外补充的数据源，目前仅海克斯大乱斗会用到 OP.GG 的梯度 */
  secondarySource: ChampionDataSourceId | null
}

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function cacheKey(mode: ChampionPerformanceMode, region: string) {
  return `${mode}:${region}`
}

/**
 * 极地大乱斗用 OP.GG 的英雄榜，胜率最完整；OP.GG 没有国服数据，配置的地区
 * 请求失败时退回全球。海克斯大乱斗在 OP.GG 侧只有梯度，胜率来自国服 101，
 * 两者都会拉取后合并展示。
 */
function resolveLoadAttempts(
  mode: ChampionPerformanceMode,
  region: string
): PerformanceLoadAttempt[] {
  if (mode === 'aram_mayhem') {
    return [
      { mode: 'aram_mayhem', source: 'qq101', region },
      { mode: 'aram_mayhem', source: 'opgg', region }
    ]
  }

  if (region === 'global') {
    return [{ mode: 'aram', region }]
  }

  return [
    { mode: 'aram', region },
    { mode: 'aram', region: 'global' }
  ]
}

async function loadAttempt(
  loader: ChampionDataRenderer,
  logger: LoggerRenderer,
  attempt: PerformanceLoadAttempt
) {
  let result: ChampionDataLoadResult<ChampionDataOverview>
  try {
    result = await loader.loadOverview({
      mode: attempt.mode,
      region: attempt.region,
      tier: 'all',
      ...(attempt.source ? { source: attempt.source } : {})
    })
  } catch (error) {
    logger.warn('useChampionPerformance', 'Failed to load champion performance', error)
    return null
  }

  if (result.status !== 'success') {
    return null
  }

  const index = toChampionPerformanceIndex(result.data)
  if (index.size === 0) {
    return null
  }

  return {
    index,
    metadata: {
      source: result.effectiveSource,
      patch: result.data.metadata.patch,
      secondarySource: null
    } satisfies ChampionPerformanceMetadata
  }
}

async function loadPerformanceIndex(
  loader: ChampionDataRenderer,
  logger: LoggerRenderer,
  mode: ChampionPerformanceMode,
  region: string
) {
  if (!loader) {
    return null
  }

  if (mode === 'aram_mayhem') {
    const [qq101Attempt, opggAttempt] = resolveLoadAttempts(mode, region)

    // 101 提供胜率，OP.GG 只提供梯度，两者并行拉取后拼在一起
    const [primary, secondary] = await Promise.all([
      loadAttempt(loader, logger, qq101Attempt),
      loadAttempt(loader, logger, opggAttempt)
    ])

    if (primary && secondary) {
      return {
        index: mergeSecondaryTier(primary.index, secondary.index),
        metadata: { ...primary.metadata, secondarySource: secondary.metadata.source }
      }
    }

    if (primary) {
      return primary
    }

    if (secondary) {
      return secondary
    }

    return null
  }

  for (const attempt of resolveLoadAttempts(mode, region)) {
    const loaded = await loadAttempt(loader, logger, attempt)
    if (loaded) {
      return loaded
    }
  }

  return null
}

/**
 * 为选人界面提供「英雄 -> 大乱斗表现」的查询表。数据按模式和地区缓存，
 * 同一场比赛内不会重复请求。
 */
export function useChampionPerformance() {
  const leagueClientStore = useLeagueClientStore()
  const championDataStore = useChampionDataStore()
  const loader = useInstance(ChampionDataRenderer)
  const logger = useInstance(LoggerRenderer)

  const index = shallowRef<Map<number, ChampionPerformanceLookup>>(new Map())
  const metadata = shallowRef<ChampionPerformanceMetadata | null>(null)
  const loading = ref(false)

  const mode = computed(() =>
    resolveChampionPerformanceModeFromSession(leagueClientStore.gameflow.session)
  )
  const region = computed(() => championDataStore.settings.preferences.region || 'global')

  let token = 0

  const load = async (targetMode: ChampionPerformanceMode, targetRegion: string) => {
    const key = cacheKey(targetMode, targetRegion)
    const cached = cache.get(key)

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      index.value = cached.index
      metadata.value = cached.metadata
      return
    }

    const current = ++token
    loading.value = true

    try {
      const loaded = await loadPerformanceIndex(loader, logger, targetMode, targetRegion)
      if (current !== token) {
        return
      }

      if (!loaded) {
        index.value = new Map()
        metadata.value = null
        return
      }

      cache.set(key, { at: Date.now(), index: loaded.index, metadata: loaded.metadata })
      index.value = loaded.index
      metadata.value = loaded.metadata
    } finally {
      if (current === token) {
        loading.value = false
      }
    }
  }

  watch(
    [mode, region],
    ([targetMode, targetRegion]) => {
      if (!targetMode) {
        index.value = new Map()
        metadata.value = null
        return
      }

      void load(targetMode, targetRegion)
    },
    { immediate: true }
  )

  const performance = (championId: number) => index.value.get(championId) ?? null

  return { mode, region, index, metadata, loading, performance }
}
