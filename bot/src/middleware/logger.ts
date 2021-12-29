import Ctx from "../ctx"
import * as DB from "../db"

export default async function log(ctx: Ctx, next: () => any) {
  const start = new Date()
  await next()
  const ms = +(new Date()) - +start
  if (ctx.chat && ctx.message) {
    await DB.messageLog.insert(ctx.chat.id, ctx.message.text, ms)
  }
}
