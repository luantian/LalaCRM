import prisma from '../lib/prisma'
import { sendWecomText, sendWecomMarkdown } from './wecomBot'
import { sendServerChan } from './serverChan'
import { isUserOnline } from '../websocket'

/**
 * 双通道外发提醒(企业微信群机器人 + Server酱个人微信)。
 * 任一通道未配置即自动跳过;失败只记日志,不影响业务主流程。
 *
 * @param richText  完整文案(企微群用,可带单据标题;群内都是自己人)
 * @param vagueText 极简文案(Server酱用,经第三方服务器,去掉单据标题只留动作,可选)
 * @param opts.mentionedMobiles 企微群消息中 @ 的手机号列表(精准提醒对应人)
 * @param opts.targetUserIds    消息的目标接收人(在线抑制):
 *                              全部在线 → 跳过外发(站内通知/WS弹窗已覆盖);
 *                              有离线的 → 发送且只 @ 离线的人(覆盖 mentionedMobiles)
 */
export async function notifyExternal(
  richText: string,
  vagueText?: string,
  opts?: { mentionedMobiles?: string[]; targetUserIds?: number[] }
): Promise<void> {
  let mentionedMobiles = opts?.mentionedMobiles

  if (opts?.targetUserIds?.length) {
    const offlineIds = opts.targetUserIds.filter(id => !isUserOnline(id))
    if (offlineIds.length === 0) return // 接收人都在线,站内/WS已提醒,省一条群消息
    mentionedMobiles = await phonesOf(offlineIds) // 只 @ 离线的人
  }

  await Promise.allSettled([
    // 需要 @ 的(任务类)走文本消息(markdown 不支持@);其余走 markdown 排版
    (mentionedMobiles && mentionedMobiles.length > 0
      ? sendWecomText(richText, mentionedMobiles)
      : sendWecomMarkdown(richText)
    ).then(r => r.ok),
    sendServerChan((vagueText || richText).split('\n')[0].replace(/\*\*|<[^>]+>/g, ''), vagueText || richText),
  ])
}

/** 取用户姓名(推送文案用),查不到给中性称呼 */
export async function userNameOf(userId?: number | null): Promise<string> {
  if (!userId) return '同事'
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    return u?.name || '同事'
  } catch {
    return '同事'
  }
}

/** 批量取用户手机号(已录手机号的才返回),用于企微群 @ 精准提醒 */
export async function phonesOf(userIds: Array<number | null | undefined>): Promise<string[]> {
  const ids = [...new Set((userIds || []).filter((id): id is number => !!id))]
  if (ids.length === 0) return []
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, phone: { not: null } },
      select: { phone: true }
    })
    return users.map(u => u!.phone!).filter(Boolean)
  } catch {
    return []
  }
}
