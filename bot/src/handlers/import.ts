import Ctx from '../ctx'
import * as DB from '../db'
import parser from 'fast-xml-parser'
import { readFile, readFileSync } from 'fs'
import fetch, { Response } from 'node-fetch'
import { env } from 'process'


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
  if (!ctx.message?.document) { return }
  try {
    const fileUrl = await ctx.telegram.getFileLink(ctx.message.document.file_id)
    console.log(fileUrl)
    const data = await (await fetch(fileUrl)).text()
    let parsed = parser.parse(data, {
      attributeNamePrefix: '@',
      ignoreAttributes: false 
    })
    const urls = collectUrls(parsed.opml.body)
    if (urls.length == 0) {
      throw 'Empty file'
    }

    const msg = await ctx.reply(`Found ${urls.length} feeds, checking them right now`, { parse_mode: 'HTML', disable_web_page_preview: true })
      
    let issues: string[] = []
    for (const feedUrl of urls) {
      const feed_id = await quickSubscribe(feedUrl)
      if (feed_id) {
        await DB.subscriptions.insertNewOrActivate(ctx.chat.id, feed_id)
      } else {
        issues.push(feedUrl)
      }
    }

    const okFeeds = urls.length - issues.length
    let str = ``
    if (issues.length > 0) {
      str = `Imported ${okFeeds} feeds\n\nFailed to import following feeds:\n`
      for (const issue of issues) {
        str += `${issue}\n`
      }
    } else {
      str = `Successfully imported ${okFeeds} feeds`
    } 

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, str, { disable_web_page_preview: true })
    
  } catch (err) {
    console.log(err)
    ctx.reply(`Could not import any feeds\n\n<i>Error: ${err}</i>`, { parse_mode: 'HTML', disable_web_page_preview: true })
  }
}