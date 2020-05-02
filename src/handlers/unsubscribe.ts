import { deleteSubscribtion, getFeedForItemUrl } from '../db'
import Ctx from '../ctx'
import { Extra, Markup } from 'telegraf'
import { url } from 'inspector'

const handleSingleUnsubscription = async (ctx: Ctx, url: string) => {
  console.log(`Unsubscribing ${ctx.chat.id} from ${url}`)
  try {
    await deleteSubscribtion(ctx.chat.id, url)
    const extra = Markup
      .removeKeyboard()
      .inlineKeyboard([
        Markup.callbackButton('Resubscribe', `subscribe:${url}`, false)
      ], undefined)
      .resize()
      .extra()
    await ctx.reply(`Unsubscribed from ${url}`, extra)
  } catch(err) {
    await ctx.reply(`Didn't find a subscription for ${url}: ${err}`)
  }
}

const handleUnsubscriptionReply = async (ctx: Ctx, url: string) => {
  console.log(`trying to find subscription for ${url}`)
  // todo: this does not neccessarily uniquely identifies the subscribtion
  const feedUrl = await getFeedForItemUrl(url)
  try {
    await handleSingleUnsubscription(ctx, feedUrl)
  } catch(err) {
    console.log(err)
    // silently fail
  }
}
  
export const handleUnsubscribe = async (ctx: Ctx) => { 
  console.log('handler: unsubscribe: ' + ctx.message.text) 
  
  if (ctx.message.reply_to_message) {
    const message = ctx.message.reply_to_message
    const entities = message.entities

    console.log(`entities:`)
    entities.forEach(e =>  console.log(e.type, e.offset, e.length))
    const text_urls = entities.filter(entity => entity.type == 'text_link') // unclear why <a> tags do not give me these
      .map(entity => entity.url)
    let urls = entities?.filter(entity => entity.type == 'url')
      .map(entity => message.text.substr(entity.offset, entity.length))
    urls = urls.concat(text_urls)
    console.log(`found urls: ${urls}`)
    urls.forEach(async url => await handleUnsubscriptionReply(ctx, url))
    return 
  } 
  
  const urls = ctx.message?.entities?.filter(entity => entity.type == 'url')
  if (urls.length == 0) {
    await ctx.reply(`To unsubscribe you can
- <i>reply</i> /unsubscribe to an item in the feed you want to unsubscribe from, or 
- send me a feed url <i>directly</i>: <code>/unsubscribe https://example.com/rss</code>

Pro tip: you can use /u instead of /unsubscribe`, Extra.HTML().markup(m => m.removeKeyboard()))
  }
   
  urls.slice(0, 3)
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .forEach(url => handleSingleUnsubscription(ctx, url))
}