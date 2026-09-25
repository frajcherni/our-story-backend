'use strict'
/* ------------------------------------------------------------------
   The application.

   Four things live here and nothing else: who may talk to us, where
   the uploaded files are served from, where the API is mounted, and
   what happens when something goes wrong.
------------------------------------------------------------------ */
const express = require('express')
const cors = require('cors')

const config = require('./config')

const app = express()

app.disable('x-powered-by')

/* The site and the API are two different origins while you are
   developing (Vite on 5173, this on 4000), so the browser asks
   permission first. In the normal deployment Vite proxies /api and
   /media through its own origin and this never comes up. */
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'x-admin-key', 'x-build-token', 'x-view-token'],
}))

/* Only the JSON bodies. Uploads arrive as multipart and are handled
   by multer in media.js, which must see the raw stream. */
app.use(express.json({ limit: '1mb' }))

/* The photographs, films and voices that have been sent in.

   These now live in the database (see mediaStore.js) and are handed
   back out through /m/:id — see routes/media.js, which is where the
   the id's randomness and the immutable cache header actually live.
   The static route below is kept only for files a pre-database build
   of this server left on disk; nothing new is ever written there. */
app.use('/media', express.static(config.uploadDir, {
  index: false,
  dotfiles: 'deny',
  maxAge: '365d',
  immutable: true,
}))
app.use('/m', require('./routes/media'))

/* Three doors, three routers — the same three roles the app has.
     admin  the console: an order in, an empty gift out
     build  the workshop: the customer fills their own gift
     view   the heart: the recipient types the passcode */
app.use('/api/admin', require('./routes/admin'))
app.use('/api/build', require('./routes/build'))
app.use('/api/view', require('./routes/view'))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, adminConfigured: !!config.adminKey })
})

/* Anything else is not ours — the site itself is served by Vite. */
app.use((_req, res) => {
  res.status(404).json({ error: 'Ma famech chay fel adresse hedhi.' })
})

/* The last word. Whatever went wrong, the browser gets one readable
   sentence — never a stack trace, never a path from this machine. */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[our-story]', err)
  res.status(500).json({ error: 'Fama 7aja ma mchetch 3andna. 3awed jarreb.' })
})

module.exports = app
