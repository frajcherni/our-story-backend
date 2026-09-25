'use strict'
/* ------------------------------------------------------------------
   /m/:id — a file's bytes, read back out of the database.

   Every upload lives in media.json now instead of on disk (see
   ../mediaStore.js); this is the one place that hands one back out.

   Range support is not optional here: without it a phone cannot seek
   a <video>, and Safari refuses to play one at all.
------------------------------------------------------------------ */
const express = require('express')
const store = require('../mediaStore')

const router = express.Router()

router.get('/:id', (req, res) => {
  const blob = store.get(req.params.id)
  if (!blob) return res.status(404).end()

  res.set({
    'Content-Type': blob.mimeType,
    'Accept-Ranges': 'bytes',
    // The id is random and a blob never changes once stored, so this
    // is as cacheable as a file can be.
    'Cache-Control': 'public, max-age=31536000, immutable',
  })

  const range = req.headers.range
  if (!range) {
    res.set('Content-Length', blob.size)
    return res.end(blob.buffer)
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  const start = match?.[1] ? parseInt(match[1], 10) : 0
  const end = match?.[2] ? parseInt(match[2], 10) : blob.size - 1

  if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || end >= blob.size) {
    res.set('Content-Range', `bytes */${blob.size}`)
    return res.status(416).end()
  }

  res.status(206)
  res.set({
    'Content-Range': `bytes ${start}-${end}/${blob.size}`,
    'Content-Length': end - start + 1,
  })
  res.end(blob.buffer.subarray(start, end + 1))
})

module.exports = router
