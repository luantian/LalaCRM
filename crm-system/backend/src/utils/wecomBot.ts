import prisma from '../lib/prisma'
import logger from './logger'

/**
 * 企业微信群机器人推送
 *
 * 配置存 SystemConfig(key: wecom_bot_webhook),在"系统设置"页维护;
 * 未配置时静默跳过,发送失败只记日志——绝不影响业务主流程。
 *
 * webhook 获取方式:企业微信群 → 右上角群设置 → 群机器人 → 添加机器人 → 复制地址
 * 机器人消息进群,群成员手机上的企业微信会收到提醒。
 */

const WEBHOOK_KEY = 'wecom_bot_webhook'

export async function getWecomWebhook(): Promise<string> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: WEBHOOK_KEY } })
    return (config?.value || '').trim()
  } catch (error) {
    logger.error('读取企微机器人配置失败:', error)
    return ''
  }
}

export async function setWecomWebhook(webhook: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: WEBHOOK_KEY },
    update: { value: webhook },
    create: { key: WEBHOOK_KEY, value: webhook }
  })
}

/**
 * 发送 markdown 消息到企微群(支持 **粗体**、<font color="info|comment|warning">、> 引用;
 * 注意 markdown 不支持 @人,需要 @ 的用 sendWecomText)。
 */
export async function sendWecomMarkdown(md: string): Promise<{ ok: boolean; errmsg?: string }> {
  const webhook = await getWecomWebhook()
  if (!webhook) return { ok: false, errmsg: '未配置 webhook' }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md.slice(0, 4000) } }),
      signal: AbortSignal.timeout(8000),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || data?.errcode !== 0) {
      const errmsg = `腾讯返回 errcode=${data?.errcode ?? res.status} ${data?.errmsg || 'HTTP ' + res.status}`
      logger.warn('企微markdown推送失败:', errmsg)
      return { ok: false, errmsg }
    }
    return { ok: true }
  } catch (error) {
    const errmsg = error instanceof Error ? error.message : String(error)
    logger.warn('企微markdown推送异常:', errmsg)
    return { ok: false, errmsg: '网络异常：' + errmsg }
  }
}

/**
 * 发送文本消息到企微群。
 * @param text             消息文本(支持 \n 换行)
 * @param mentionedMobiles 需要 @ 的成员手机号列表(须为群成员在企微绑定的手机号;
 *                         空数组/无值则不 @;传 ['@all'] @所有人)
 * @returns ok=是否成功; errmsg=失败原因(测试接口透出给前端,便于自行排查)
 */
export async function sendWecomText(text: string, mentionedMobiles?: string[]): Promise<{ ok: boolean; errmsg?: string }> {
  const webhook = await getWecomWebhook()
  if (!webhook) return { ok: false, errmsg: '未配置 webhook' }

  const mentioned = (mentionedMobiles || []).filter(Boolean)
  const payload: any = { msgtype: 'text', text: { content: text.slice(0, 2000) } }
  if (mentioned.length > 0) {
    payload.text.mentioned_mobile_list = mentioned
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || data?.errcode !== 0) {
      const errmsg = `腾讯返回 errcode=${data?.errcode ?? res.status} ${data?.errmsg || 'HTTP ' + res.status}`
      logger.warn('企微机器人推送失败:', errmsg)
      // 93000=机器人不存在(被删/key复制错) 310000=IP不在白名单 45009=超频率
      if (data?.errcode === 93000) {
        return { ok: false, errmsg: '机器人不存在：请到群机器人列表确认机器人还在，重新复制完整 Webhook 地址' }
      }
      return { ok: false, errmsg }
    }
    return { ok: true }
  } catch (error) {
    const errmsg = error instanceof Error ? error.message : String(error)
    logger.warn('企微机器人推送异常:', errmsg)
    return { ok: false, errmsg: '网络异常：' + errmsg }
  }
}
