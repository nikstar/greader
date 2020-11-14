import Telegraf from 'telegraf'
import { handleExport, handleList, handleStart, handleSubscribe, handleUnsubscribe, handleHelp, handleResubscribe, handleImportFile } from './handlers'
import { updateAll } from './updater'
import UserSession from 'telegraf-session-postgresql'
import loggerMiddleware from './middleware/logger'
import userInfoMiddleware from './middleware/user_info'

const bot = new Telegraf(process.env.BOT_TOKEN)

const sessionMiddleware = new UserSession()

bot.use(Telegraf.log())
bot.use(userInfoMiddleware)
bot.use(sessionMiddleware)
bot.use(loggerMiddleware)

bot.start(handleStart)
bot.command('help', handleHelp)
bot.command('export', handleExport)
bot.command('list', handleList)
bot.command('subscribe', handleSubscribe)
bot.command('s', handleSubscribe)
bot.action(/^resubscribe:(.+)/, handleResubscribe)
bot.command('unsubscribe', handleUnsubscribe)
bot.command('u', handleUnsubscribe)
bot.on('document', handleImportFile)
bot.on('text', handleSubscribe)

updateAll(bot.telegram)
setInterval(() => updateAll(bot.telegram), 30 * 1000)

bot.launch()
