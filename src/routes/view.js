'use strict'
/* ------------------------------------------------------------------
   /api/view/:slug — the recipient's side.

   The heart is the door. Touching it asks for the passcode; the
   passcode is compared here, against a scrypt hash, and only then do
   the memories leave the server. Nothing about a gift's contents can
   be learned from this route without it.
------------------------------------------------------------------ */
const express = require('express')

const db = require('../db')
const { verifySecret } = require('../crypto')

const router = express.Router({ mergeParams: true })

/* ── what the story is given ───────────────────────────────────────
   Only the fields it draws with. What a memory weighs and where its
   file sits on disk are the workshop's business. */
const forStory = (m) => ({
  id: m.id,
  /* The story's renderers still speak the old four words, and this is
     the one place the two vocabularies meet. */
  type: { photo: 'image', voice: 'audio', note: 'text', video: 'video' }[m.kind] || 'text',
  title: m.title,
  description: m.description,
  date: m.date,
  text: m.text,
  mediaUrl: m.mediaUrl,
  thumbnail: m.thumbnail || m.mediaUrl,
})

const contentOf = (gift) => ({
  gift: {
    slug: gift.slug,
    title: gift.title,
    subtitle: gift.subtitle,
    message: gift.message,
  },
  memories: db.memoriesOf(gift.id).map(forStory),
  moments: db.momentsOf(gift.id).map((t) => ({
    year: t.year,
    title: t.title,
    description: t.description,
  })),
})

/* ── a light hand on the door ──────────────────────────────────────
   A passcode is a short love-note of a word, so the thing that
   actually protects it is not being allowed to guess it a thousand
   times. Twelve tries per address per quarter of an hour. */
const ATTEMPTS = new Map()
const WINDOW_MS = 15 * 60 * 1000
const MAX_TRIES = 12

function tooManyTries(key) {
  const now = Date.now()
  const times = (ATTEMPTS.get(key) || []).filter((t) => now - t < WINDOW_MS)
  ATTEMPTS.set(key, times)
  if (ATTEMPTS.size > 500) {
    for (const [k, list] of ATTEMPTS) {
      if (!list.some((t) => now - t < WINDOW_MS)) ATTEMPTS.delete(k)
    }
  }
  return times.length >= MAX_TRIES
}

const noteTry = (key) => {
  const times = ATTEMPTS.get(key) || []
  times.push(Date.now())
  ATTEMPTS.set(key, times)
}

/* The gift the bare address opens: the first one there is. */
const resolve = (slug) => (slug ? db.giftBySlug(slug) : db.state.gifts[0])

/* ── the door's wording, and nothing more ──────────────────────────
   No memory, no count, no hint of what is inside. */
router.get('/:slug?/gate', (req, res) => {
  const gift = resolve(req.params.slug)
  if (!gift) {
    return res.status(404).json({ error: 'Ma famech 7keya fel adresse hedhi.', missing: true })
  }
  if (gift.status !== 'sealed') {
    /* It exists, but its author has not finished it — there is no
       passcode yet, so the gate says so rather than offering a field
       that cannot work. */
    return res.status(409).json({
      error: 'El cadeau hedha mazel 9a3ed yet3amel.',
      unfinished: true,
      title: gift.title,
    })
  }
  res.json({ slug: gift.slug, title: gift.title })
})

/* ── the passcode ──────────────────────────────────────────────── */
router.post('/:slug?/unlock', (req, res) => {
  const gift = resolve(req.params.slug)
  if (!gift) return res.status(404).json({ error: 'Ma famech 7keya fel adresse hedhi.', missing: true })
  if (gift.status !== 'sealed') {
    return res.status(409).json({ error: 'El cadeau hedha mazel 9a3ed yet3amel.', unfinished: true })
  }

  const key = `${gift.slug}:${req.ip}`
  if (tooManyTries(key)) {
    return res.status(429).json({ error: 'Jarrebt barcha. Estanna chwaya d9aye9 w 3awed.' })
  }

  const given = String(req.body?.passcode || '').trim()
  if (!given) return res.status(400).json({ error: 'Ekteb el code.' })

  if (!verifySecret(given, gift.passHash, gift.passSalt)) {
    noteTry(key)
    return res.status(401).json({ error: 'El code hedha mahouch sa7i7.' })
  }

  gift.opens = (gift.opens || 0) + 1
  gift.openedAt = db.nowIso()
  ATTEMPTS.delete(key)

  const token = db.openSession(gift, 'view')
  db.save()

  res.json({ ok: true, token, ...contentOf(gift) })
})

/* Coming back with a token still in hand — a refresh, a second tab —
   without having to type the passcode again. */
router.get('/:slug?/content', (req, res) => {
  const found = db.resolveSession(req.get('x-view-token'), 'view')
  if (!found) return res.status(401).json({ error: '3awed ekteb el code.' })

  const wanted = req.params.slug
  if (wanted && found.gift.slug !== wanted) {
    return res.status(401).json({ error: '3awed ekteb el code.' })
  }
  res.json({ ok: true, ...contentOf(found.gift) })
})

module.exports = router
