export const NETWORK_MAIN_NAMESPACE = 'network-main'

export interface HttpProxySetting {
  strategy: 'system' | 'fixed-servers' | 'direct'
  port: number
  host: string
}

export const DEFAULT_HTTP_PROXY_SETTING: HttpProxySetting = {
  strategy: 'direct',
  port: 7890,
  host: '127.0.0.1'
}

/**
 * 这些域名必须直连，不能走用户配置的代理。
 *
 * 游戏客户端、SGP 战绩网关以及拳头官方域名大多只在中国大陆网络内可达，
 * 交给代理反而会被劫持：国服 SGP（`*.lol.qq.com:21019`）经代理请求会返回
 * 404，表现为「加载战绩失败」。`<local>` 覆盖 `127.0.0.1` 上的 LCU 接口。
 */
export const GAME_PROXY_BYPASS_RULES = [
  '<local>',
  '*.qq.com',
  '*.pvp.net',
  '*.riotgames.com',
  '*.leagueoflegends.com'
].join(',')
