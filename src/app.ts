// src/app.ts
import express from 'express'
import http from 'http'
import tokensRouter from './routes/tokens'
import adminRouter from './routes/admin'
import { startWebsocket } from './ws/ws'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('tiny'))

// serve demo static files from /public
const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir))

// API routes
app.use('/tokens', tokensRouter)
app.use('/admin', adminRouter)

// createServer exported so index.ts can attach websocket
export function createServer() {
  const httpServer = http.createServer(app)
  // start websocket and attach to http server
  const io = startWebsocket(httpServer)
  return { app, httpServer, io }
}

export default app
