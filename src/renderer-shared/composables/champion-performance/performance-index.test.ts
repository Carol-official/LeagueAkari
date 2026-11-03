import type {
  ChampionDataOverview,
  ChampionOverviewItem,
  ChampionPerformance
} from '@shared/data-adapter/champion-data'
import { describe, expect, it } from 'vitest'

import {
  type ChampionPerformanceLookup,
  classifyWinRate,
  mergeSecondaryTier,
  resolveChampionPerformanceMode,
  resolveChampionPerformanceModeFromSession,
  toChampionPerformanceIndex,
  toPerformanceBadge
} from './performance-index'

function performance(patch: Partial<ChampionPerformance> = {}): ChampionPerformance {
  return {
    games: null,
    wins: null,
    winRate: null,
    pickRate: null,
    banRate: null,
    kda: null,
    rank: null,
    rankChange: null,
    strengthTier: null,
    averagePlacement: null,
    firstPlaceRate: null,
    ...patch
  }
}

function champion(
  championId: number,
  patch: Partial<ChampionPerformance> = {}
): ChampionOverviewItem {
  return {
    championId,
    position: 'none',
    performance: performance(patch),
    counterChampionIds: []
  }
}

function overview(champions: ChampionOverviewItem[]): ChampionDataOverview {
  return {
    metadata: { source: 'opgg', mode: 'aram', patch: '16.21', dataDate: null, updatedAt: null },
    sections: { champions }
  }
}

describe('resolveChampionPerformanceMode', () => {
  it('只在大乱斗类模式下返回对应模式', () => {
    expect(resolveChampionPerformanceMode('ARAM')).toBe('aram')
    expect(resolveChampionPerformanceMode('KIWI')).toBe('aram_mayhem')
    expect(resolveChampionPerformanceMode('CLASSIC')).toBeNull()
    expect(resolveChampionPerformanceMode(null)).toBeNull()
  })
})

describe('resolveChampionPerformanceModeFromSession', () => {
  it('优先识别海克斯大乱斗', () => {
    expect(
      resolveChampionPerformanceModeFromSession({
        gameData: { queue: { gameMode: 'ARAM' } },
        map: { gameMode: 'KIWI' }
      })
    ).toBe('aram_mayhem')

    expect(
      resolveChampionPerformanceModeFromSession({
        gameData: { queue: { gameMode: 'KIWI' } },
        map: { gameMode: 'ARAM' }
      })
    ).toBe('aram_mayhem')
  })

  it('普通大乱斗与非大乱斗模式', () => {
    expect(
      resolveChampionPerformanceModeFromSession({
        gameData: { queue: { gameMode: 'ARAM' } },
        map: { gameMode: 'ARAM' }
      })
    ).toBe('aram')

    expect(
      resolveChampionPerformanceModeFromSession({
        gameData: { queue: { gameMode: 'CLASSIC' } },
        map: { gameMode: 'CLASSIC' }
      })
    ).toBeNull()
  })

  it('字段缺失时不应崩溃', () => {
    expect(resolveChampionPerformanceModeFromSession(null)).toBeNull()
    expect(resolveChampionPerformanceModeFromSession({})).toBeNull()
    expect(
      resolveChampionPerformanceModeFromSession({ gameData: null, map: { gameMode: null } })
    ).toBeNull()
  })
})

describe('toChampionPerformanceIndex', () => {
  it('按英雄 ID 建立查询表并归一化梯度值', () => {
    const index = toChampionPerformanceIndex(
      overview([
        champion(86, { winRate: 0.510667, pickRate: 0.0626479, rank: 49, strengthTier: 2 }),
        champion(17, { winRate: 0.53, rank: 1, strengthTier: 'OP' }),
        champion(4)
      ])
    )

    expect(index.get(86)).toMatchObject({ winRate: 0.510667, rank: 49, tier: 2 })
    expect(index.get(17)).toMatchObject({ winRate: 0.53, tier: 0 })
    expect(index.get(4)).toMatchObject({ winRate: null, tier: null })
  })

  it('没有数据时返回空表', () => {
    expect(toChampionPerformanceIndex(null).size).toBe(0)
  })
})

describe('mergeSecondaryTier', () => {
  it('把 OP.GG 的梯度并入 101 的胜率条目', () => {
    const primary = new Map<number, ChampionPerformanceLookup>([
      [
        17,
        {
          winRate: 0.5446,
          pickRate: 0.138,
          rank: 12,
          tier: 1,
          games: null,
          opggTier: null,
          opggRank: null
        }
      ]
    ])

    const secondary = new Map<number, ChampionPerformanceLookup>([
      [
        17,
        {
          winRate: null,
          pickRate: null,
          rank: 38,
          tier: 2,
          games: null,
          opggTier: null,
          opggRank: null
        }
      ],
      [
        99,
        {
          winRate: null,
          pickRate: null,
          rank: 5,
          tier: 1,
          games: null,
          opggTier: null,
          opggRank: null
        }
      ]
    ])

    const merged = mergeSecondaryTier(primary, secondary)

    expect(merged.get(17)).toMatchObject({
      winRate: 0.5446,
      tier: 1,
      rank: 12,
      opggTier: 2,
      opggRank: 38
    })
    // 主数据源没有的英雄，直接用 OP.GG 的梯度，不去重出额外一行
    expect(merged.get(99)).toMatchObject({ tier: 1, rank: 5, opggTier: null, opggRank: null })
  })
})

describe('toPerformanceBadge', () => {
  const lookup = (patch: Partial<ChampionPerformanceLookup> = {}): ChampionPerformanceLookup => ({
    winRate: null,
    pickRate: null,
    rank: null,
    tier: null,
    games: null,
    opggTier: null,
    opggRank: null,
    ...patch
  })

  it('有胜率时展示胜率并按强弱分档', () => {
    expect(toPerformanceBadge(lookup({ winRate: 0.545 }))).toEqual({
      text: '54.5',
      tone: 'high'
    })
    expect(toPerformanceBadge(lookup({ winRate: 0.501 }))).toEqual({
      text: '50.1',
      tone: 'neutral'
    })
    expect(toPerformanceBadge(lookup({ winRate: 0.461 }))).toEqual({
      text: '46.1',
      tone: 'low'
    })
  })

  it('按 p25 / p75 边界分档', () => {
    expect(classifyWinRate(0.515)).toBe('high')
    expect(classifyWinRate(0.5149)).toBe('neutral')
    expect(classifyWinRate(0.478)).toBe('low')
    expect(classifyWinRate(0.479)).toBe('neutral')
    expect(classifyWinRate(null)).toBe('neutral')
  })

  it('没有胜率时退化为梯度或排名', () => {
    expect(toPerformanceBadge(lookup({ tier: 0 }))).toEqual({ text: 'OP', tone: 'tier' })
    expect(toPerformanceBadge(lookup({ tier: 3 }))).toEqual({ text: 'T3', tone: 'tier' })
    expect(toPerformanceBadge(lookup({ rank: 12 }))).toEqual({ text: '#12', tone: 'tier' })
    expect(toPerformanceBadge(lookup())).toBeNull()
    expect(toPerformanceBadge(null)).toBeNull()
  })
})
