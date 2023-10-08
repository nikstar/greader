import { Context, Markup } from 'telegraf'
import * as DB from '../db'

export const manageSubsButton = async (ctx: Context) => {
  const hash = await DB.users.hash(ctx.chat.id)
  if (!hash || ctx.chat.type != "private") { return Markup.removeKeyboard() }
  return Markup.inlineKeyboard([
    Markup.button.webApp("Manage subscriptions", `https://greader.nikstar.me?hash=${hash}`)
  ]);
}

export const handleApp = async (ctx: Context) => { 

  await ctx.sendMessage(
    "Tap the button to manage your subscriptions",
    (await manageSubsButton(ctx))
  )
}

