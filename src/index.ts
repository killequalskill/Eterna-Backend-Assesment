// src/index.ts
import { createServer } from './app'
import { PORT } from './config'
import { startAggregator } from './services/aggregator'
import debug from 'debug'

const log = debug('app:main')
const { httpServer } = createServer()

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`)
  startAggregator()
  log('Server started')
})
