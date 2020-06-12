import { ContextMessageUpdate } from 'telegraf'
import * as DB from '../db'

export const handleList = async (ctx: ContextMessageUpdate) => { 
  console.log('handler: list: ' + ctx.message.text) 
  const res = await DB.subscriptions.selectSubscriptionsForUser(ctx.chat.id)
  if (res.rowCount == 0) {
    await ctx.reply(`You don't have any subscriptions. Send me links to subscribe.`)
    return
  }
  let msg = `Subscriptions:\n\n`
  res.rows.forEach((row, idx) => {
    msg += `${idx + 1}. <a href="${row.url}">${row.title}</a>\n`
  })
  await ctx.reply(msg, { parse_mode: 'HTML' })
}