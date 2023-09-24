import * as DB from '../db'
import Ctx from '../ctx'
import { Markup } from 'telegraf'

const directUnsubscription = async (ctx: Ctx, url: string): Promise<boolean> => {
  console.log(`Unsubscribing ${ctx.chat.id} from ${url}`)
  try {
    const id = await DB.subscriptions.updateInactiveByUrl(ctx.chat.id, url)
    const extra = Markup
      .inlineKeyboard([
        Markup.button.callback('Resubscribe', `resubscribe:${id}`)
      ])
    await ctx.reply(`Unsubscribed`, extra) // TODO: Show name and url
    return true
  } catch(err) {
    return false
  }
}

const handleUnsubscriptionReply = async (ctx: Ctx): Promise<boolean> => {
  try {
    if ("reply_to_message" in ctx.message) {
      const reply = ctx.message.reply_to_message
      const subscription_id = await DB.unsubscriptions.lookup(reply.chat.id, reply.message_id)
      await DB.subscriptions.updateInactiveDirect(subscription_id)
      const info = await DB.subscriptions.info(subscription_id)
      
      const extra = Markup
        .inlineKeyboard([
          Markup.button.callback('Resubscribe', `enable_subscription:${subscription_id}`, false)
        ])
      await ctx.replyWithHTML(`Unsubscribed from <b><a href="${info.url}">${info.title}</a></b>`, extra)
      return true
    } else {
      return false
    }
  } catch(err) {
    return false
  }
}
  
const help = `To unsubscribe you can <b>reply</b> /unsubscribe (/u) to an item in the feed you want to unsubscribe from, or send a feed url directly: /u https://example.com/feed.xml`

export const handleUnsubscribe = async (ctx: Ctx) => { 
  
  if ("reply_to_message" !in ctx.message) {
    const ok = await handleUnsubscriptionReply(ctx)
    // ignore if reply message is invalid
    return 
  } 
  
  var urls = []
  if ("entities" in ctx.message) {
    urls = ctx.message.entities?.filter(entity => entity.type == 'url')
  }
  if (urls.length == 0) {
    await ctx.replyWithHTML(help, Markup.removeKeyboard())
    return
  }

  if ("text" in ctx.message) {
    const text = ctx.message.text
    const found = urls.slice(0, 1)
      .map(entity => text.substr(entity.offset, entity.length))
      .map(url => directUnsubscription(ctx, url))
      .filter(async token => await token)

    if (found.length == 0) {
      await ctx.replyWithHTML(`Could not unsubscribe. ` + help)
    }
  }
}