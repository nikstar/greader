import Ctx from '../ctx'
import { deliveryStore } from '../delivery-store'

export const handleStart = async (ctx: Ctx) => { 
  let str = `Welcome`
  if (ctx.from.first_name && ctx.from.first_name.length > 1) {
    str += `, ${ctx.from.first_name}`
  }
  str += `!\n\nSend me links and I will follow them for you.`
  if (ctx.chat?.type == 'private') {
    const resumed = await deliveryStore.resume(ctx.chat.id)
    str += ` No need to use any commands.`
    if (resumed.restored) str += `\n\nResumed ${resumed.restored} paused subscriptions. Delivery starts with new items.`
    if (resumed.remaining) str += `\n${resumed.remaining} subscriptions remain paused because the subscription limit was reached.`
  }
  await ctx.reply(str)
}
