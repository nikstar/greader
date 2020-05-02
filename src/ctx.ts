import { ContextMessageUpdate } from 'telegraf'
import db from './db'

export class Session {
  counter: number
  
  constructor() {
    this.counter = 0
  }
}

export default interface Ctx extends ContextMessageUpdate {
  session: Session
}