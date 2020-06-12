import { ContextMessageUpdate } from 'telegraf'
import * as DB from '../db'
import { fetchFeed } from '../crawler'
import axios from 'axios'
import cheerio from 'cheerio'
import Parser from 'rss-parser'
import Ctx from '../ctx'
//import URL from 'url'


const findFeed = async (urlString: string) => {
  if (!urlString.match('^https?://')) { urlString = 'https://' + urlString }
  let url = new URL(urlString)
  
  try {
    const feed = await fetchFeed(url.toString())
    return { url: url.toString(), feed: feed }
  } catch(err) {
    try {
      const data = (await axios.get(url.toString())).data
      const html = cheerio.load(data)
      let urls: string[] = []
      html('head>link').each(async (_, e) => {
        if (e.attribs['rel'] == 'alternate' && (e.attribs['type'] == 'application/atom+xml' || e.attribs['type'] == 'application/rss+xml')) {
          let feedURL = e.attribs['href']
          if (feedURL[0] == '/') { feedURL = new URL(feedURL, url).toString() }
          console.log('Subscribing: found feed:', feedURL)
          urls.push(feedURL)
        }
      })
      const feed = await fetchFeed(urls[0])
      return { url: urls[0], feed: feed }
      
    } catch(err) {
      console.log("Subscribing: catch2: " + err)
      throw Error('Failed to find feed: ' + err)
    }
  }
}

const handleSingleSubscription = async (ctx: ContextMessageUpdate, url: string) => {
  console.log('Subscribing: ' + url)
  
  const msg = await ctx.reply('Loading ' + url)
  try {
    const resp = await findFeed(url)
    url = resp.url
    const feed = resp.feed
    let str = `<a href="${feed.items[0].link || feed.items[0].url}">⁠</a>Subscribed to <b><a href="${feed.link}">${feed.title}</a></b>\n\nRecent posts:\n`
    feed.items.slice(0, 10).forEach(item => {
      str += `→ <a href="${item.link || item.url}">${item.title}</a>\n`
    })
    str += '\nLatest post:'
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, str, { parse_mode: 'HTML', disable_web_page_preview: false })
    await DB.subscriptions.insertNewOrUpdateLastSent(ctx.chat.id, url)
  } catch(err) {
    await DB.badFeeds.insert(ctx.chat.id, url, err)
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `Could not load ${url}. Try sending a direct link to the feed`)
  }
}
  
export const handleSubscribe = async (ctx: Ctx) => { 
  console.log('handler: subscribe: ' + ctx.message.text) 
  const urls = ctx.message.entities?.filter(entity => entity.type == 'url')
  if (urls === undefined || urls.length == 0) {
    await ctx.reply(`Send me links you want to subscribe to`)
  }
  console.log(`handler: subscribe: ${urls}`)
  urls
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .forEach(url => handleSingleSubscription(ctx, url));
}

export const handleResubscribe = async (ctx: Ctx) => { 
  try {
    const id = ctx.match[1]
    const url = await DB.subscriptions.selectURLForID(id)
    ctx.answerCbQuery(`Resubscribing to ${url}`)
    handleSingleSubscription(ctx, url)
  } catch(err) {
    console.log(`hanleResubscribe: ${err}`)
    ctx.answerCbQuery(`Failed to resubscribe`)
  }
}
