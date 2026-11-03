import type { ChampionDataOverview } from '@shared/data-adapter/champion-data'

/**
 * 只在这两个模式下展示备选英雄胜率。ARAM 即极地大乱斗，KIWI 即符文大乱斗
 * (OP.GG 侧的 aram_mayhem)。
 */
export type ChampionPerformanceMode = 'aram' | 'aram_mayhem'

export interface ChampionPerformanceLookup {
  winRate: number | null
  pickRate: number | null
  rank: number | null
  tier: number | null
  games: number | null
  /** OP.GG 的梯度与排名，海克斯大乱斗下作为补充信息与 101 的胜率并列展示 */
  opggTier: number | null
  opggRank: number | null
}

export type ChampionPerformanceTone = 'high' | 'low' | 'neutral' | 'tier'

export interface ChampionPerformanceBadge {
  text: string
  tone: ChampionPerformanceTone
}

/**
 * 大乱斗胜率分布很窄 (中位数约 49.7%，标准差约 3%)，因此用 p25 / p75 作为
 * 强弱分界：约 1/4 的英雄被标为强势或弱势。
 */
const HIGH_WIN_RATE = 0.515
const LOW_WIN_RATE = 0.478

export function classifyWinRate(
  winRate: number | null | undefined
): Exclude<ChampionPerformanceTone, 'tier'> {
  if (winRate === null || winRate === undefined || !Number.isFinite(winRate)) {
    return 'neutral'
  }

  if (winRate >= HIGH_WIN_RATE) {
    return 'high'
  }

  if (winRate <= LOW_WIN_RATE) {
    return 'low'
  }

  return 'neutral'
}

export function resolveChampionPerformanceMode(
  gameMode: string | null | undefined
): ChampionPerformanceMode | null {
  switch (gameMode) {
    case 'ARAM':
      return 'aram'
    case 'KIWI':
      return 'aram_mayhem'
    default:
      return null
  }
}

interface GameflowSessionLike {
  gameData?: { queue?: { gameMode?: string | null } | null } | null
  map?: { gameMode?: string | null } | null
}

/**
 * 选人阶段 `queue.gameMode` 与 `map.gameMode` 可能不一致 (例如海克斯大乱斗
 * 队列复用了大乱斗的队列配置)，只要有一处表明是海克斯大乱斗，就按海克斯大乱斗处理，
 * 避免把大乱斗的胜率错当成海克斯大乱斗的。
 */
export function resolveChampionPerformanceModeFromSession(
  session: GameflowSessionLike | null | undefined
): ChampionPerformanceMode | null {
  if (!session) {
    return null
  }

  const candidates = [session.gameData?.queue?.gameMode, session.map?.gameMode]

  for (const candidate of candidates) {
    if (resolveChampionPerformanceMode(candidate) === 'aram_mayhem') {
      return 'aram_mayhem'
    }
  }

  for (const candidate of candidates) {
    const resolved = resolveChampionPerformanceMode(candidate)
    if (resolved) {
      return resolved
    }
  }

  return null
}

function toTier(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (value.trim().toUpperCase() === 'OP') {
    return 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toChampionPerformanceIndex(
  overview: ChampionDataOverview | null | undefined
): Map<number, ChampionPerformanceLookup> {
  const index = new Map<number, ChampionPerformanceLookup>()
  if (!overview) {
    return index
  }

  for (const item of overview.sections.champions) {
    index.set(item.championId, {
      winRate: item.performance.winRate,
      pickRate: item.performance.pickRate,
      rank: item.performance.rank,
      tier: toTier(item.performance.strengthTier),
      games: item.performance.games,
      opggTier: null,
      opggRank: null
    })
  }

  return index
}

/**
 * 把 OP.GG 的梯度/排名并入已有查询表。海克斯大乱斗下 OP.GG 只提供梯度，
 * 胜率来自 101，两者拼在同一行展示。
 */
export function mergeSecondaryTier(
  index: Map<number, ChampionPerformanceLookup>,
  secondary: Map<number, ChampionPerformanceLookup>
): Map<number, ChampionPerformanceLookup> {
  for (const [championId, item] of secondary) {
    const existing = index.get(championId)
    if (existing) {
      existing.opggTier = item.tier
      existing.opggRank = item.rank
      continue
    }

    // 主数据源没有这个英雄时，直接把 OP.GG 的梯度当作主数据
    index.set(championId, item)
  }

  return index
}

export function formatWinRate(winRate: number | null | undefined) {
  if (winRate === null || winRate === undefined || !Number.isFinite(winRate)) {
    return null
  }

  return `${(winRate * 100).toFixed(1)}%`
}

/** 图标角标空间很小，去掉百分号以节省宽度 */
export function formatWinRateCompact(winRate: number | null | undefined) {
  if (winRate === null || winRate === undefined || !Number.isFinite(winRate)) {
    return null
  }

  return (winRate * 100).toFixed(1)
}

export function formatPickRate(pickRate: number | null | undefined) {
  if (pickRate === null || pickRate === undefined || !Number.isFinite(pickRate)) {
    return null
  }

  return `${(pickRate * 100).toFixed(2)}%`
}

export function formatRank(tier: number | null, rank: number | null) {
  if (tier === null && rank === null) {
    return null
  }

  const tierLabel = tier === null ? null : tier === 0 ? 'OP' : `T${tier}`
  if (tierLabel && rank !== null) {
    return `${tierLabel} · #${rank}`
  }

  return tierLabel ?? `#${rank}`
}

/**
 * 没有胜率数据时 (例如 OP.GG 的符文大乱斗只提供梯度) 退化为梯度角标，
 * 这样即使拿不到胜率也不会在图标上留白。
 */
export function toPerformanceBadge(
  performance: ChampionPerformanceLookup | null | undefined
): ChampionPerformanceBadge | null {
  if (!performance) {
    return null
  }

  const winRateText = formatWinRateCompact(performance.winRate)
  if (winRateText !== null) {
    return { text: winRateText, tone: classifyWinRate(performance.winRate) }
  }

  if (performance.tier !== null) {
    return { text: performance.tier === 0 ? 'OP' : `T${performance.tier}`, tone: 'tier' }
  }

  if (performance.rank !== null) {
    return { text: `#${performance.rank}`, tone: 'tier' }
  }

  return null
}
