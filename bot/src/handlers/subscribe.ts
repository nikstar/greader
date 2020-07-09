import { ContextMessageUpdate } from 'telegraf'
import * as DB from '../db'
import cheerio from 'cheerio'
import Ctx from '../ctx'
import fetch from 'node-fetch'
import { env } from 'process'

async function findInPage(url: string): Promise<string> {
  if (!url.match('^https?://')) { url = 'https://' + url }
  const data = await (await fetch(url)).text()
  const html = cheerio.load(data)
  let candidate: string = undefined
  html('head>link').each((_, e) => {
    if (candidate !== undefined) { return }
    if (e.attribs['rel'] == 'alternate' && (e.attribs['type'] == 'application/atom+xml' || e.attribs['type'] == 'application/rss+xml')) {
      let feedURL = e.attribs['href']
      if (feedURL[0] == '/') { feedURL = new URL(feedURL, url).toString() }
      candidate = feedURL
    }
  })
  if (candidate) {
    return candidate
  }
  throw Error(`Could not find any candidates: ${url}`)
}

const handleSingleSubscription = async (ctx: ContextMessageUpdate, url: string) => {
  const msg = await ctx.reply('Loading ' + url)

  const host = env['CRAWLER_HOST'] || 'localhost'
  const resp = fetch(`http://${host}:9090/crawl?url=${url}`)
    .then(async resp => {
      if (resp.status == 404) {
        console.log("404: " + resp.url)
        const candidate = await findInPage(url)
        return fetch(`http://${host}:9090/crawl?url=${url}`)
      }
      return resp
    })
    .catch(async err => {
      let baseURL = new URL(url)
      baseURL.pathname = ""
      const candidate = await findInPage(baseURL.toString())
      return fetch("http://localhost:9090/crawl?url=" + candidate)
    })
    .then(async resp => {
      if (resp.status != 200) {
        throw Error(`Subscription failed: url=${resp.url} status=${resp.status}`)
      }
      return resp
    })  
  
  try {
    const r = await resp
    const feed_id = Number(await r.text())

    const title = await DB.feeds.selectFeedTitle(feed_id)
    const items = await DB.feedItems.selectTenMostRecent(feed_id)
    
    // FIXME: change url to something that can be fetched from DB
    let str = `<a href="${items[0].url}">⁠</a>Subscribed to <b><a href="${url}">${title}</a></b>\n\nRecent posts:\n`
    items.forEach(item => {
      str += `→ <a href="${item.url}">${item.title}</a>\n`
    })
    str += '\nLatest post:'
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, str, { parse_mode: 'HTML', disable_web_page_preview: false })
    await DB.subscriptions.insertNewOrUpdateLastSent(ctx.chat.id, feed_id)
  
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
  urls
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .forEach(async url => await handleSingleSubscription(ctx, url));
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
