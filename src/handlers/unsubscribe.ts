import { disableSubscribtion, getFeedForItemUrl } from '../db'
import Ctx from '../ctx'
import { Extra, Markup } from 'telegraf'
import { url } from 'inspector'

const handleSingleUnsubscription = async (ctx: Ctx, url: string): Promise<boolean> => {
  console.log(`Unsubscribing ${ctx.chat.id} from ${url}`)
  try {
    const id = await disableSubscribtion(ctx.chat.id, url)
    const extra = Markup
      .inlineKeyboard([
        Markup.callbackButton('Resubscribe', `resubscribe:${id}`, false)
      ], undefined)
      .resize()
      .extra()
    await ctx.reply(`Unsubscribed from ${url}`, extra)
    return true
  } catch(err) {
    console.log(`handleSingleUnsubscription: ${err}`)
    return false
  }
}

const handleUnsubscriptionReply = async (ctx: Ctx, url: string): Promise<boolean> => {
  console.log(`trying to find subscription for ${url}`)
  // todo: this does not neccessarily uniquely identify the subscribtion - what is better? keep track of ids for messages?
  try {
    const feedUrl = await getFeedForItemUrl(url)
    return await handleSingleUnsubscription(ctx, feedUrl)
  } catch(err) {
    console.log(`reply error: ${err}`)
    return false
  }
}
  
export const handleUnsubscribe = async (ctx: Ctx) => { 
  console.log('handler: unsubscribe: ' + ctx.message.text) 
  
  if (ctx.message.reply_to_message) {
    const message = ctx.message.reply_to_message
    const entities = message.entities

    console.log(`reply entities:`)
    entities.forEach(e =>  console.log(e.type, e.offset, e.length))
    const text_urls = entities.filter(entity => entity.type == 'text_link') // unclear why <a> tags do not give me these
      .map(entity => entity.url)
    let urls = entities?.filter(entity => entity.type == 'url')
      .map(entity => message.text.substr(entity.offset, entity.length))
    urls = urls.concat(text_urls)
    console.log(`found reply urls: ${urls}`)
    const found = urls
      .map(url => handleUnsubscriptionReply(ctx, url))
      .filter(async token => await token)
    if (found.length == 0) {
      await ctx.reply(`Could not unsubscribe. To unsubscribe you can
- <i>reply</i> /unsubscribe to an item in the feed you want to unsubscribe from, or 
- send me a feed url <i>directly</i>: <code>/unsubscribe https://example.com/rss</code>`)
    }
    return 
  } 
  
  const urls = ctx.message?.entities?.filter(entity => entity.type == 'url')
  if (urls.length == 0) {
    await ctx.reply(`To unsubscribe you can
- <i>reply</i> /unsubscribe to an item in the feed you want to unsubscribe from, or 
- send me a feed url <i>directly</i>: <code>/unsubscribe https://example.com/rss</code>

Pro tip: you can use /u instead of /unsubscribe`, Extra.HTML().markup(m => m.removeKeyboard()))
  }
   
  

  const found = urls.slice(0, 3)
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .map(url => handleSingleUnsubscription(ctx, url))
    .filter(async token => await token)

  if (found.length == 0) {
    await ctx.reply(`Could not unsubscribe. To unsubscribe you can
- <i>reply</i> /unsubscribe to an item in the feed you want to unsubscribe from, or 
- send me a feed url <i>directly</i>: <code>/unsubscribe https://example.com/rss</code>`)
  }
}