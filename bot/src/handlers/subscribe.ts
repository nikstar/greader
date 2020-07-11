import cheerio from 'cheerio'
import Ctx from '../shared/ctx'
import * as DB from '../shared/db'
import { env } from 'process'
import fetch from 'node-fetch'

async function findInPage(url: string): Promise<string> {
  console.log(`findInPage start: ${url}`)
  if (!url.match('^https?://')) { url = 'https://' + url }
  console.log(`findInPage fixed: ${url}`)
  const data = await (await fetch(url)).text()
  const html = cheerio.load(data)
  let candidate: string = undefined
  html('head>link').each((_, e) => {
    if (candidate !== undefined) { return }
    if (e.attribs['rel'] == 'alternate' && (e.attribs['type'] == 'application/atom+xml' || e.attribs['type'] == 'application/rss+xml')) {
      let feedURL = e.attribs['href']
      console.log(`raw candidate: ${feedURL}`)
      if (feedURL[0] == '/') { feedURL = new URL(feedURL, url).toString() }
      console.log(`got candidate: ${feedURL}`)
      candidate = feedURL
    }
  })
  if (candidate) {
    console.log(`findInPage returned: ${candidate}`)
    return candidate
  }
  console.log(`findInPage failed: ${url}`)
  throw Error(`Could not find any candidates: ${url}`)
}

export const handleSingleSubscription = async (ctx: Ctx, url: string) => {
  const msg = await ctx.reply('Loading ' + url)

  const crawlerHost = env['CRAWLER_HOST'] || 'localhost'
  const resp = fetch(`http://${crawlerHost}:9090/crawl?url=${url}`)
    .then(async resp => {
      if (resp.status == 404) {
        console.log("404: " + resp.url)
        const candidate = await findInPage(url)
        return fetch(`http://${crawlerHost}:9090/crawl?url=${candidate}`)
      }
      return resp
    })
    .catch(async err => {
      let baseURL = new URL(url)
      baseURL.pathname = ""
      const candidate = await findInPage(baseURL.toString())
      return fetch(`http://${crawlerHost}:9090/crawl?url=${candidate}`)
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
