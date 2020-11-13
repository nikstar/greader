import Ctx from '../shared/ctx'
import * as DB from '../shared/db'
import parser from 'fast-xml-parser'
import { readFile, readFileSync } from 'fs'
import fetch, { Response } from 'node-fetch'

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

    // todo: import feeds

    ctx.reply(`Imported ${urls.length} feeds`, { parse_mode: 'HTML', disable_web_page_preview: true })

    // todo: report issues
  } catch (err) {
    console.log(err)
    ctx.reply(`Could not import any feeds\n\n<i>Error: ${err}</i>`, { parse_mode: 'HTML', disable_web_page_preview: true })
  }
}