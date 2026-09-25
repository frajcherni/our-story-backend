'use strict'
/* ------------------------------------------------------------------
   Settings.

   One file reads the environment, so nothing below it ever has to
   wonder what a missing value means. Every setting has a working
   default: the server starts and runs correctly with no .env at all.
------------------------------------------------------------------ */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

/* A .env is a list of NAME=value lines. That is the whole format we use,
   so reading it here costs ten lines and saves a dependency. Anything
   already set in the real environment wins, the way it should. */
function loadEnvFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return // no .env — the defaults below carry the server
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match || line.trim().startsWith('#')) continue
    const value = match[2].trim().replace(/^["'](.*)["']$/, '$1')
    if (process.env[match[1]] === undefined) process.env[match[1]] = value
  }
}

loadEnvFile(path.join(ROOT, '.env'))

const num = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const str = (value, fallback = '') => String(value ?? '').trim() || fallback

const MB = 1024 * 1024
const photoMb = num(process.env.MAX_PHOTO_MB, 15)
const videoMb = num(process.env.MAX_VIDEO_MB, 150)
const audioMb = num(process.env.MAX_AUDIO_MB, 25)

module.exports = {
  port: num(process.env.PORT, 4000),
  clientUrl: str(process.env.CLIENT_URL, 'http://localhost:5173').replace(/\/+$/, ''),

  /* The one password for /admin. Empty means the console stays closed —
     the lock screen says so, instead of silently letting anyone in. */
  adminKey: str(process.env.ADMIN_KEY),

  /* Where things live. Both are created at boot if they are missing. */
  dataFile: path.join(ROOT, 'data', 'db.json'),
  uploadDir: path.join(ROOT, 'uploads'),

  /* How big one file may be. Enforced before a byte is written. */
  limits: { image: photoMb * MB, video: videoMb * MB, audio: audioMb * MB },

  /* The same numbers in megabytes, so the upload page can say them out loud. */
  limitsMb: { image: photoMb, video: videoMb, audio: audioMb },
}
