import Telegraf from 'telegraf'
import { job } from 'cron'
import { handleExport, handleList, handleStart, handleSubscribe, handleUnsubscribe, handleHelp, handleResubscribe } from './handlers'
import { fetchAll } from './crawler'
import { updateAll } from './updater'
import PostgreSQLSession from 'telegraf-session-postgresql'

const bot = new Telegraf(process.env.BOT_TOKEN)

const session = new PostgreSQLSession()

const crawlerJob = job('0 * * * * *', fetchAll)
fetchAll()
crawlerJob.start()

const updaterJob = job('30 * * * * *', () => updateAll(bot.telegram))
updateAll(bot.telegram)
updaterJob.start()

bot.use(Telegraf.log())
bot.use(session)

bot.start(handleStart)
bot.command('help', handleHelp)
bot.command('export', handleExport)
bot.command('list', handleList)
bot.action(/^resubscribe:(.+)/, handleResubscribe)

bot.command('unsubscribe', handleUnsubscribe)
bot.command('u', handleUnsubscribe)

bot.on('text', handleSubscribe)

bot.launch()

