import Ctx from '../ctx'
import * as DB from '../db'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { env } from 'process'
import { isSubscriptionLimitError, subscriptionLimitMessage } from '../subscription-limit'


function collectUrls(node: any): string[] {
  let urls = Array<string>()
  const url = node['@xmlUrl']
  if (url) { // todo don't ignore title if available
    urls.push(url)
  }
  try {
    const o = node.outline
    const childUrls = Array.isArray(o) ? o.flatMap(collectUrls) : collectUrls(o)
    urls = urls.concat(childUrls)
  } catch (err) {
    // do nothing
  }
  return urls
}

async function quickSubscribe(url: string): Promise<number> {
  try {
    const crawlerHost = env['CRAWLER_HOST'] || 'localhost'
    const resp = await fetch(`http://${crawlerHost}:9090/crawl?url=${url}`)
    if (resp?.status != 200) {
      return 0
    }
    const feed_id = Number(await resp.text())
    return feed_id
  } catch (err) {
    console.log(`quickSubscribe: ${err}`)
    return 0
  }
}

export async function handleImportFile(ctx: Ctx) {
  var document = null
  if ("document" in ctx.message) { 
    document = ctx.message.document
  }
  if (!document) { 
    return 
  }
  try {
    await DB.subscriptions.assertCanSubscribe(ctx.chat.id)
    const fileUrl = await ctx.telegram.getFileLink(document.file_id)
    const data = await (await fetch(fileUrl)).text()
    if (XMLValidator.validate(data) !== true) throw Error('Invalid OPML XML')
    let parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
    let parsed = parser.parse(data)
    const urls = [...new Set(collectUrls((parsed as any).opml.body))]
    if (urls && urls.length == 0) {
      throw 'Empty file'
    }

    const msg = await ctx.reply(`Found ${urls.length} feeds, checking them right now`, { parse_mode: 'HTML', disable_web_page_preview: true })
      
    let issues: string[] = []
    let okFeeds = 0
    let skipped = 0
    for (const feedUrl of urls) {
      try {
        await DB.subscriptions.assertCanSubscribe(ctx.chat.id)
        const feed_id = await quickSubscribe(feedUrl)
        if (feed_id) {
          await DB.subscriptions.insertNewOrActivate(ctx.chat.id, feed_id)
          okFeeds++
        } else {
          issues.push(feedUrl)
        }
      } catch (err) {
        if (!isSubscriptionLimitError(err)) throw err
        skipped = urls.length - okFeeds - issues.length
        break
      }
    }

    let str = `Imported ${okFeeds} feeds.`
    if (issues.length) str += `\nCould not load ${issues.length} feeds.`
    if (skipped) str += `\nSkipped ${skipped} feeds because the subscription limit was reached.\n\n${subscriptionLimitMessage}`

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, str, { disable_web_page_preview: true })
    
  } catch (err) {
    if (isSubscriptionLimitError(err)) {
      await ctx.reply(subscriptionLimitMessage)
      return
    }
    console.log(err)
    await ctx.reply('Import could not be completed. Any feeds already imported are in /list. Please check that the file is valid OPML.', { disable_web_page_preview: true })
  }
}
