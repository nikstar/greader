import Telegraf from 'telegraf'
import { job as cronJob } from 'cron'
import { handleExport, handleList, handleStart, handleSubscribe, handleUnsubscribe, handleHelp, handleResubscribe } from './handlers'
import { updateAll } from './updater'
import UserSession from 'telegraf-session-postgresql'
import loggerMiddleware from './logger'

const bot = new Telegraf(process.env.BOT_TOKEN)

const sessionMiddleware = new UserSession()

bot.use(Telegraf.log())
bot.use(sessionMiddleware)
bot.use(loggerMiddleware)

bot.start(handleStart)
bot.command('help', handleHelp)
bot.command('export', handleExport)
bot.command('list', handleList)
bot.action(/^resubscribe:(.+)/, handleResubscribe)
bot.command('unsubscribe', handleUnsubscribe)
bot.command('u', handleUnsubscribe)
bot.on('text', handleSubscribe)

const updaterJob = cronJob('30 * * * * *', () => updateAll(bot.telegram))
updateAll(bot.telegram)
updaterJob.start()

bot.launch()
