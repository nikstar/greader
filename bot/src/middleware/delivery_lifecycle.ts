import Ctx from '../ctx'
import { deliveryStore } from '../delivery-store'

export default async function deliveryLifecycle(ctx: Ctx, next: () => any) {
  const message = ctx.message
  if (message && 'migrate_to_chat_id' in message) {
    await deliveryStore.migrate(message.chat.id, message.migrate_to_chat_id)
    return
  }
  if (message && 'migrate_from_chat_id' in message) {
    await deliveryStore.migrate(message.migrate_from_chat_id, message.chat.id)
    return
  }
  if ('my_chat_member' in ctx.update) {
    const update = ctx.update.my_chat_member
    const status = update.new_chat_member.status
    if (status === 'kicked' || status === 'left') {
      await deliveryStore.pause(update.chat.id, update.chat.type === 'private' ? 'Bot blocked by user' : 'Bot removed from chat')
    } else if (status === 'member' || status === 'administrator' || status === 'creator') {
      if (update.chat.type !== 'private') await deliveryStore.resume(update.chat.id)
    }
    return
  }
  await next()
}
