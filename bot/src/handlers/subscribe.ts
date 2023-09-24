import cheerio from 'cheerio'
import Ctx from '../ctx'
import * as DB from '../db'
import { env } from 'process'
import sanitize from '../sanitize'

function fixUrl(url: string): string {
  if (!url.match('^https?://')) { 
    url = 'https://' + url 
  }
  return url
}

function fixRelativeUrl(url: string, referenceUrl: string): string {
  referenceUrl = fixUrl(referenceUrl)
  if (url[0] == '/') { 
    url = new URL(url, referenceUrl).toString() 
  }
  return url
}

function getHomepage(url: string): string {
  url = fixUrl(url)
  let homepage = new URL(url)
  homepage.pathname = ""
  return homepage.toString()
}

async function findInPage(pageUrl: string): Promise<string> {
  try {
    pageUrl = fixUrl(pageUrl)
    const resp = await fetch(pageUrl)
    const data = await resp.text()
    const html = cheerio.load(data)
    let feedUrl: string = undefined
    html('head>link').each((_, e) => {
      if (feedUrl !== undefined) { /* already done */ return }
      if ("attribs" in e && e.attribs['rel'] == 'alternate' && (e.attribs['type'] == 'application/atom+xml' || e.attribs['type'] == 'application/rss+xml')) {
        const rawCandidate = e.attribs['href']
        const candidate = fixRelativeUrl(rawCandidate, pageUrl)
        feedUrl = candidate
      }
    })
    if (feedUrl) {
      return feedUrl
    } else {
      return null
    }
  } catch (err) {
    console.log(`find in page returned error: ${err}`)
    return null
  }
}

async function tryCommonCandidates(pageUrl: string, homepageUrl: string, crawlerHost: string): Promise<Response> {
  const medium = new RegExp('https?://medium.com/(@[a-z_]+)/.+')
  if (pageUrl.match(medium)) {
    const feedUrl = pageUrl.replace(medium, 'https://medium.com/feed/$1/')
    console.log(`Found Medium feed candidate: ${feedUrl}`)
    return tryFeedUrl(feedUrl, crawlerHost)
  }

  let commonPaths = [
    "index.xml",
    "feed.xml"
  ]
  for (const path of commonPaths) {
    const candidate = homepageUrl + path 
    const resp = await tryFeedUrl(candidate, crawlerHost)
    if (resp.status == 200) {
      return resp
    }
  }
  return null;
}

async function tryFeedUrl(feedUrl: string, crawlerHost: string): Promise<Response> {
  try {
    const resp = await fetch(`http://${crawlerHost}:9090/crawl?url=${feedUrl}`)
    return resp
  } catch (err) {
    console.log(`request to crawler returned error: ${err}`)
    return null
  }
}

export const handleSingleSubscription = async (ctx: Ctx, url: string) => {
  
  const crawlerHost = env['CRAWLER_HOST'] || 'localhost'
        
  try {
    let candidateUrl = fixUrl(url)
    let resp: Response = null // final response to be handled

    // first try link as feed
    console.log(`0`)
    resp = await tryFeedUrl(candidateUrl, crawlerHost)
    console.log(`1`)
        
    // next try find in page
    if (resp?.status != 200) {
      const newCandidate = await findInPage(candidateUrl)
      if (newCandidate != null) {
        candidateUrl = newCandidate
        resp = await tryFeedUrl(newCandidate, crawlerHost)
        console.log(`2`)
      }
    }

    // next look in homepage
    if (resp?.status != 200) {
      const homepage = getHomepage(candidateUrl)
      const newCandidate = await findInPage(homepage)
      if (newCandidate != null) {
        candidateUrl = newCandidate
        resp = await tryFeedUrl(newCandidate, crawlerHost)
        console.log(`3`)
    
      }
    }

    if (resp?.status != 200) {
      resp = await tryCommonCandidates(fixUrl(url), getHomepage(url), crawlerHost)
      console.log(`4`) 
    }

    // out of options. what do we have?
    if (resp?.status != 200) {
      throw Error(`Subscription failed: url=${resp.url} status=${resp.status}`)
    }
    const feed_id = Number(await resp.text())
    const title = await DB.feeds.selectFeedTitle(feed_id)
    const items = await DB.feedItems.selectTenMostRecent(feed_id)    
    // TODO: change candidateUrl to titleUrl, which should be stored in subscriptions table
    let str = `<a href="${items[0].url}">⁠</a>Subscribed to <b><a href="${candidateUrl}">${sanitize(title)}</a></b>\n\nRecent posts:\n`
    items.forEach(item => {
      str += `→ <a href="${item.url}">${sanitize(item.title)}</a>\n`
    })
    str += `\nLatest post:`
    const msg = await ctx.reply(str, { parse_mode: 'HTML', disable_web_page_preview: false })
    const subscription_id = await DB.subscriptions.insertNewOrUpdateLastSent(ctx.chat.id, feed_id)
    await DB.unsubscriptions.insert(msg.chat.id, msg.message_id, subscription_id)
  
  } catch (err) { // report fail to the user
    
    await DB.badFeeds.insert(ctx.chat.id, url, err)
    await ctx.reply(`Could not load ${url}. Try sending a direct link to the feed`, { disable_web_page_preview: true })
  }
}
  
export const handleSubscribe = async (ctx: Ctx) => { 
  const urls = (ctx.message as any).entities?.filter(entity => entity.type == 'url')
  if (urls === undefined || urls.length == 0) {
    await ctx.reply(`Send me links you want to subscribe to`)
    return
  }
  if ("text" in ctx.message) {
    const text = ctx.message.text
    urls
      .map(entity => text.substr(entity.offset, entity.length))
      .forEach(async url => await handleSingleSubscription(ctx, url));
  }
}


export const handleText = async (ctx: Ctx) => { 
  if (ctx.message.chat.type == "private") {
    handleSubscribe(ctx);
  }
}
