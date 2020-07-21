import Ctx from "./shared/ctx"
import * as DB from "./shared/db"

export default async function(ctx: Ctx, next: () => any) {
  const start = new Date()
  await next()
  const ms = +(new Date()) - +start
  if (ctx.chat && ctx.message) {
    await DB.messageLog.insert(ctx.chat.id, ctx.message.text, ms)
  }
}
