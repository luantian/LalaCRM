import prisma from '../lib/prisma'
import logger from './logger'

/**
 * Server酱推送(消息直达个人微信)
 *
 * 每人一个 SendKey:微信扫码登录 https://ftqq.com 绑定后获得。
 * 配置存 SystemConfig(key: serverchan_sendkey),在"系统设置"页维护;
 * 未配置时静默跳过,发送失败只记日志——绝不影响业务主流程。
 *
 * 注意:消息经第三方服务器转发,调用方只发笼统提醒文案,不带业务敏感数据。
 */

const KEY_NAME = 'serverchan_sendkey'

export async function getServerChanKey(): Promise<string> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: KEY_NAME } })
    return (config?.value || '').trim()
  } catch (error) {
    logger.error('读取Server酱配置失败:', error)
    return ''
  }
}

export async function setServerChanKey(key: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: KEY_NAME },
    update: { value: key },
    create: { key: KEY_NAME, value: key }
  })
}

/**
 * 发送消息到绑定的个人微信。
 * @param title 消息标题(通知栏展示,取一行短句)
 * @param desp  消息正文(支持换行,Server酱会渲染为卡片)
 * @returns true=发送成功 false=未配置/发送失败(已记日志)
 */
export async function sendServerChan(title: string, desp?: string): Promise<boolean> {
  const key = await getServerChanKey()
  if (!key) return false

  try {
    const body = new URLSearchParams({ title: title.slice(0, 100), desp: (desp || title).slice(0, 1000) })
    const res = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || data?.code !== 0) {
      logger.warn('Server酱推送失败:', res.status, JSON.stringify(data))
      return false
    }
    return true
  } catch (error) {
    logger.warn('Server酱推送异常:', error instanceof Error ? error.message : error)
    return false
  }
}
