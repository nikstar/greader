import cheerio from 'cheerio'
import Ctx from '../shared/ctx'
import * as DB from '../shared/db'
import { env } from 'process'
import fetch from 'node-fetch'
import sanitize from '../shared/sanitize'

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

  
  try {
    let resp: any // final response to be handled

    try {
      // first try link as feed
      resp = await fetch(`http://${crawlerHost}:9090/crawl?url=${url}`)
      console.log(`1: ${resp.status}`)
      if (resp.status == 404) {
        console.log("404: " + resp.url)
        const candidate = await findInPage(url)
        // then try link found in xml
        resp = await fetch(`http://${crawlerHost}:9090/crawl?url=${candidate}`)
      }
    } catch (err) { //if unsuccessful try homepage
      console.log(`2: ${err}`)
      if (!url.match('^https?://')) { url = 'https://' + url }
      let baseURL = new URL(url)
      baseURL.pathname = ""
      const candidate = await findInPage(baseURL.toString())
      resp = await fetch(`http://${crawlerHost}:9090/crawl?url=${candidate}`)
    }

    // handle resp
    console.log(`3: ${resp.status}`)
      if (resp.status != 200) {
      throw Error(`Subscription failed: url=${resp.url} status=${resp.status}`)
    }
    console.log(`4: ${resp.url}`)
    const r = resp
    console.log(`5: ${r.status}`)
    const feed_id = Number(await r.text())
    console.log(`6: ${r.status}`)
    const title = await DB.feeds.selectFeedTitle(feed_id)
    console.log(`7: ${r.status}`)
    const items = await DB.feedItems.selectTenMostRecent(feed_id)    
    console.log(`8: ${r.status}`)
    // FIXME: change url to something that can be fetched from DB
    let str = `<a href="${items[0].url}">⁠</a>Subscribed to <b><a href="${url}">${sanitize(title)}</a></b>\n\nRecent posts:\n`
    items.forEach(item => {
      str += `→ <a href="${item.url}">${sanitize(item.title)}</a>\n`
    })
    str += '\nLatest post:'
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, str, { parse_mode: 'HTML', disable_web_page_preview: false })
    await DB.subscriptions.insertNewOrUpdateLastSent(ctx.chat.id, feed_id)

  } catch (err) { // report fail
    console.log(`6: ${err}`)
    await DB.badFeeds.insert(ctx.chat.id, url, err)
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `Could not load ${url}. Try sending a direct link to the feed`)
  }
}
  
export const handleSubscribe = async (ctx: Ctx) => { 
  console.log('handler: subscribe: ' + ctx.message.text) 
  const urls = ctx.message.entities?.filter(entity => entity.type == 'url')
  if (urls === undefined || urls.length == 0) {
    await ctx.reply(`Send me links you want to subscribe to`)
    return
  }
  urls
    .map(entity => ctx.message.text.substr(entity.offset, entity.length))
    .forEach(async url => await handleSingleSubscription(ctx, url));
}
