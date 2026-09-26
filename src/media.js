'use strict'
/* ------------------------------------------------------------------
   Files.

   A photograph, a film or a voice note arrives here, is checked, and
   handed to the media store (mediaStore.js) to be kept in the
   database under a random id. It is stored exactly as it was sent —
   nothing is re-encoded, so there is no image library to install and
   nothing that can fail on one machine and work on another.

   The id is random because the address is the only thing guarding
   the file: nobody can guess `/m/9f3a2c7e10b4a1b2`.
------------------------------------------------------------------ */
const path = require('node:path')
const multer = require('multer')

const config = require('./config')
const store = require('./mediaStore')

/* What each kind of memory may be sent as. A list rather than a
   pattern, so an unexpected file type is refused by default. */
const EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.jfif', '.heic', '.heif'],
  video: ['.mp4', '.mov', '.webm', '.m4v', '.ogv'],
  audio: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.opus', '.aac', '.weba'],
}

/** Which of our four kinds a browser's file is. */
function kindOf(file) {
  const mime = String(file?.mimetype || '').toLowerCase()
  const ext = path.extname(String(file?.originalname || '')).toLowerCase()

  if (mime.startsWith('image/') || EXTENSIONS.image.includes(ext)) return 'photo'
  if (mime.startsWith('audio/') || EXTENSIONS.audio.includes(ext)) return 'voice'
  /* A phone recording a voice note often labels it video/webm, so the
     extension gets the last word before this falls through to film. */
  if (mime.startsWith('video/') || EXTENSIONS.video.includes(ext)) return 'video'
  return null
}

/* Held in memory only — nothing touches disk until `store.put` writes
   it into the database. A file this size sitting in RAM for the
   length of one request is the same cost multer's diskStorage always
   paid to stream it there in the first place. */
/* Two files at most: the memory itself, and — for a photograph or a film —
   the small still the browser made of it before sending, so the strip and
   the grid never have to decode the big one. */
const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(config.limits.image, config.limits.video, config.limits.audio), files: 2 },
  fileFilter: (_req, file, done) => {
    if (kindOf(file)) return done(null, true)
    done(new Error('That kind of file cannot be added — send a photo, a video or a sound.'))
  },
}).fields([{ name: 'media', maxCount: 1 }, { name: 'thumb', maxCount: 1 }])

/** Delete a file we own. An id that was never stored is not an error. */
function removeFile(id) {
  store.remove(id)
}

/**
 * Wraps the upload so a refusal comes back as a sentence a person can
 * read, rather than as a stack trace. multer reports its failures by
 * calling back with an error instead of throwing, which is why this
 * cannot simply be `app.use(receive)`.
 */
function upload(req, res, next) {
  receive(req, res, (err) => {
    if (!err) {
      /* Back to the one-file shape the routes are written against, with the
         still — when the browser managed to make one — alongside it. */
      req.file = req.files?.media?.[0] || null
      req.thumb = req.files?.thumb?.[0] || null
      return next()
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      const biggest = Math.max(config.limitsMb.image, config.limitsMb.video, config.limitsMb.audio)
      return res.status(400).json({ error: `El fichier kbir barcha — a9sa 7aja tnajjem tzid hiya ${biggest} MB.` })
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Fichier wa7ed f kol marra.' })
    }
    res.status(400).json({ error: err.message || 'El fichier hedha ma tzedech.' })
  })
}

/**
 * The per-kind size rule, applied after the fact: a 100 MB "photo" is
 * refused here before it is ever written into the store. Returns an
 * error sentence, or null when the file is fine.
 */
/* The four kinds are the app's words; the limits are keyed by what the
   file actually is. This is the one place the two meet. */
const LIMIT_OF = { photo: 'image', video: 'video', voice: 'audio' }
const LABEL_OF = { photo: 'A photo', video: 'A video', voice: 'A sound' }

function checkSize(file, kind) {
  const which = LIMIT_OF[kind]
  const max = config.limits[which]
  if (!max || file.size <= max) return null
  return `${LABEL_OF[kind]} can be up to ${config.limitsMb[which]} MB.`
    + ` Yours is ${(file.size / 1048576).toFixed(1)} MB.`
}

/** Hands a checked file to the database, and returns the address it
    can be read back at. */
function saveFile(file) {
  const id = store.put(file.buffer, file.mimetype)
  return { id, url: `/m/${id}` }
}

module.exports = { upload, kindOf, removeFile, checkSize, saveFile, EXTENSIONS }
