import Ctx from '../ctx'
import * as DB from '../db'
import { handleSingleSubscription } from './subscribe'

export const handleResubscribe = async (ctx: Ctx) => { 
  try {
    const id = ctx.match[1]
    const url = await DB.subscriptions.selectURLForID(id)
    ctx.answerCbQuery(`Resubscribing to ${url}`)
    handleSingleSubscription(ctx, url)
  } catch(err) {
    console.log(`hanleResubscribe: ${err}`)
    ctx.answerCbQuery(`Failed to resubscribe`)
  }
}
