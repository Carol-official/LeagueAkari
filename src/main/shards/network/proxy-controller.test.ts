import { GAME_PROXY_BYPASS_RULES } from '@shared/shards/network'
import { reaction, runInAction } from 'mobx'
import { describe, expect, it, vi } from 'vitest'

import type { NetworkMainContext } from './context'
import { NetworkProxyController, resolveNetworkProxyConfig } from './proxy-controller'
import { NetworkSettings } from './state'

describe('resolveNetworkProxyConfig', () => {
  it('keeps game domains out of the proxy so SGP and LCU stay reachable', () => {
    const config = resolveNetworkProxyConfig({
      strategy: 'fixed-servers',
      host: '127.0.0.1',
      port: 7897
    })

    expect(config).toEqual({
      mode: 'fixed_servers',
      proxyRules: '127.0.0.1:7897',
      proxyBypassRules: GAME_PROXY_BYPASS_RULES
    })
    expect(config.proxyBypassRules).toContain('<local>')
    expect(config.proxyBypassRules).toContain('*.qq.com')
    expect(config.proxyBypassRules).toContain('*.pvp.net')
  })

  it('also bypasses game domains when following the system proxy', () => {
    expect(
      resolveNetworkProxyConfig({ strategy: 'system', host: '127.0.0.1', port: 7897 })
    ).toEqual({ mode: 'system', proxyBypassRules: GAME_PROXY_BYPASS_RULES })
  })

  it('uses no bypass rules when connecting directly', () => {
    expect(
      resolveNetworkProxyConfig({ strategy: 'direct', host: '127.0.0.1', port: 7897 })
    ).toEqual({ mode: 'direct' })
  })
})

describe('NetworkProxyController', () => {
  it('serializes proxy changes so a slow earlier configuration cannot overwrite a newer one', async () => {
    const settings = new NetworkSettings()
    let finishInitialConfiguration!: () => void
    const initialConfiguration = new Promise<void>((resolve) => {
      finishInitialConfiguration = resolve
    })
    const setProxy = vi.fn().mockReturnValueOnce(initialConfiguration).mockResolvedValue(undefined)
    const closeAllConnections = vi.fn().mockResolvedValue(undefined)
    const controller = new NetworkProxyController({
      settings,
      electronSession: { setProxy, closeAllConnections },
      mobxUtils: { reaction },
      logger: { warn: vi.fn() }
    } as unknown as NetworkMainContext)

    controller.start()
    await vi.waitFor(() => expect(setProxy).toHaveBeenCalledTimes(1))
    runInAction(() => {
      settings.httpProxy = { strategy: 'fixed-servers', host: 'localhost', port: 1080 }
    })
    await Promise.resolve()
    expect(setProxy).toHaveBeenCalledTimes(1)

    finishInitialConfiguration()
    await controller.waitUntilConfigured()

    expect(setProxy).toHaveBeenNthCalledWith(2, {
      mode: 'fixed_servers',
      proxyRules: 'localhost:1080',
      proxyBypassRules: GAME_PROXY_BYPASS_RULES
    })
    expect(closeAllConnections).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
