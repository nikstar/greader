import Ctx from '../ctx'
import * as DB from '../db'
import { generateOPML } from '../opml'

function date(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .split("T")[0];
}
           
export const handleExport = async (ctx: Ctx) => { 
  if ("text" in ctx.message) {
    console.log('handler: export: ' + ctx.message.text) 
  }
  const feeds = await DB.subscriptions.selectSubscriptionsForUser(ctx.chat.id)
  if (feeds.length == 0) {
    await ctx.reply(`You don't have any subscriptions. Send me links to subscribe.`)
    return
  }
  let opml = generateOPML(feeds)
  await ctx.replyWithDocument({
    filename: `greader-export-${date()}.opml`,
    source: Buffer.from(opml)
  })
}
