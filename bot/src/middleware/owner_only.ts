import Ctx from "../ctx"

export default async function ownerOnly(ctx: Ctx, next: () => any) {
  console.log(ctx.from, process.env.OWNER_ID)
  if (ctx.chat && ctx.from && ctx.from.id == Number(process.env.OWNER_ID)) {
    await next()
  }
}