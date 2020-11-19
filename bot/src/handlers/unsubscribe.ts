import * as DB from '../shared/db'
import Ctx from '../shared/ctx'
import { Extra, Markup } from 'telegraf'

const directUnsubscription = async (ctx: Ctx, url: string): Promise<boolean> => {
  console.log(`Unsubscribing ${ctx.chat.id} from ${url}`)
  try {
    const id = await DB.subscriptions.updateInactiveByUrl(ctx.chat.id, url)
    const extra = Markup
      .inlineKeyboard([
        Markup.callbackButton('Resubscribe', `resubscribe:${id}`, false)
      ], undefined)
      .resize()
      .extra()
    await ctx.reply(`Unsubscribed`, extra) // TODO: Show name and url
    return true
  } catch(err) {
    return false
  }
}

const handleUnsubscriptionReply = async (ctx: Ctx): Promise<boolean> => {
  try {
    const reply = ctx.message.reply_to_message
    const subscription_id = await DB.unsubscriptions.lookup(reply.chat.id, reply.message_id)
    await DB.subscriptions.updateInactiveDirect(subscription_id)
    const info = await DB.subscriptions.info(subscription_id)
    const extra = Extra
      .HTML(true)
      .markup(
        Markup
          .inlineKeyboard([
            Markup.callbackButton('Resubscribe', `enable_subscription:${subscription_id}`, false)
          ], undefined)
          .resize()
      )
    await ctx.reply(`Unsubscribed from <b><a href="${info.url}">${info.title}</a></b>`, extra)
    return true
  } catch(err) {
    return false
  }
}
  
const help = `To unsubscribe you can <b>reply</b> /unsubscribe (/u) to an item in the feed you want to unsubscribe from, or send a feed url directly: /u https://example.com/feed.xml`

export const handleUnsubscribe = async (ctx: Ctx) => { 
  console.log('handler: unsubscribe: ' + ctx.message.text) 
  
  if (ctx.message.reply_to_message) {
    const ok = await handleUnsubscriptionReply(ctx)
    // ignore if reply message is invalid
    return 
  } 
  
  const urls = ctx.message?.entities?.filter(entity => entity.type == 'url')
  if (urls.length == 0) {
    await ctx.reply(help, Extra.HTML().markup(m => m.removeKeyboard()))
    return
  }

  const found = urls.slice(0, 1)
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .map(url => directUnsubscription(ctx, url))
    .filter(async token => await token)

  if (found.length == 0) {
    await ctx.reply(`Could not unsubscribe. ` + help, { parse_mode: 'HTML' })
  }
}