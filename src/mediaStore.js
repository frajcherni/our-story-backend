'use strict'
/* ------------------------------------------------------------------
   The media store.

   Every photograph, film and voice note lives here now — one JSON
   file next to db.json, holding each file's bytes as base64 under a
   random id. `/m/:id` (see routes/media.js) is the one place that
   reads a blob back out of it.

   Kept apart from db.json on purpose: that file is rewritten whole on
   every touch anywhere in the app — renaming one gift's letter would
   otherwise mean rewriting every megabyte of every video in every
   other gift too. This file is only rewritten when a file is actually
   added or removed.

   Same trade-off db.json already makes, carried one step further: the
   whole store is held in memory and read once at boot. That is fine
   for a handful of family photos and clips; it stops being fine long
   before a real media library would. If this ever needs to hold a lot
   of video, it should become actual files on disk (or object storage)
   addressed by these same ids — nothing above this module would need
   to change to get there.
------------------------------------------------------------------ */
const fs = require('node:fs')
const path = require('node:path')

const config = require('./config')
const { randomId } = require('./crypto')

const FILE = path.join(path.dirname(config.dataFile), 'media.json')

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const blobs = load()

function write() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const temp = `${FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(blobs), 'utf8')
  fs.renameSync(temp, FILE)
}

/** Stores a buffer, returns the id it can be read back with. */
function put(buffer, mimeType) {
  const id = randomId(16)
  blobs[id] = {
    mimeType: mimeType || 'application/octet-stream',
    size: buffer.length,
    data: buffer.toString('base64'),
    createdAt: new Date().toISOString(),
  }
  write()
  return id
}

/** A file we own, or null if the id is unknown — never a thrown error. */
function get(id) {
  const row = blobs[String(id || '')]
  if (!row) return null
  return { mimeType: row.mimeType, size: row.size, buffer: Buffer.from(row.data, 'base64') }
}

/** Delete a blob we own. An id that was never stored is not an error. */
function remove(id) {
  if (!id || !blobs[id]) return
  delete blobs[id]
  write()
}

module.exports = { put, get, remove }
