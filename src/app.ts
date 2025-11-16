// src/app.ts
import express from 'express'
import http from 'http'
import tokensRouter from './routes/tokens'
import { startWebsocket } from './ws/ws'
import cors from 'cors'
import morgan from 'morgan'

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('tiny'))

app.use('/tokens', tokensRouter)

export function createServer() {
  const httpServer = http.createServer(app)
  const io = startWebsocket(httpServer)
  return { app, httpServer, io }
}

export default app
