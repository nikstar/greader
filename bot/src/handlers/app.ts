import { Context, Markup } from 'telegraf'

export const handleApp = async (ctx: Context) => { 

  const keyboard = Markup.inlineKeyboard([
    Markup.button.webApp("Manage subscriptions", "https://nikstar.me")
  ]);

  await ctx.sendMessage(
    "Manage subscriptions",
    keyboard
  )
}

