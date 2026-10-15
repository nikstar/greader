function escapeAttribute(value: string): string {
  return (value || '')
    .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;')
}

export function generateOPML(feeds: { title: string, url: string }[]): string {
  const outlines = feeds.map(feed => {
    const title = escapeAttribute(feed.title)
    return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeAttribute(feed.url)}"/>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Export from @GReaderBot</title></head>
  <body>
${outlines}
  </body>
</opml>
`
}
