import Ctx from "../shared/ctx"
import * as DB from "../shared/db"

export default async function userInfo(ctx: Ctx, next: () => any) {
  if (ctx.chat && ctx.from) {  
    await DB.users.insert(ctx.chat.id, ctx.from.language_code, ctx.from.username, ctx.from.first_name) // maybe do full name instead of first?
  }
  await next()
}
