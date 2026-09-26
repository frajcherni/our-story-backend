'use strict'
/* ------------------------------------------------------------------
   /api/build/:slug — the workshop.

   The customer's side of the gift. They arrive with the temporary
   password the shop gave them, and from then on this is theirs: they
   add memories, rewrite them, reorder them, throw them away, write
   the letter, and finally seal it with a password of their own.

   Sealing is the moment the gift stops being a workshop and becomes
   a gift: the temporary password is erased, every session open on it
   is dropped, and the heart will open it from then on.

   Every write answers with the whole gift, so the workshop never has
   to guess what changed — it redraws from one truth.
------------------------------------------------------------------ */
const express = require('express')

const config = require('../config')
const db = require('../db')
const media = require('../media')
const { hashSecret, verifySecret } = require('../crypto')

/* How long each written thing is allowed to be.
   The workshop stops typing at these numbers and the story cuts at them
   too, so they belong here as well: an edit used to come in through
   PATCH uncapped, which meant the one route that could put a thousand
   words on a card was the one that rewrote an existing one. */
const MOST = { title: 140, text: 320, description: 300, date: 60, year: 20 }

const capped = (value, field) => String(value ?? '').slice(0, MOST[field])

const router = express.Router({ mergeParams: true })

/* ── what the workshop sees ────────────────────────────────────── */
const forBuilder = (m) => ({
  id: m.id,
  kind: m.kind,
  position: m.position,
  title: m.title,
  description: m.description,
  date: m.date,
  text: m.text,
  mediaUrl: m.mediaUrl,
  thumbnail: m.thumbnail || m.mediaUrl,
  /* No still of its own means it was added before the workshop started
     resizing, so the story is decoding the full original everywhere. */
  heavy: Boolean(m.file) && !m.thumbFile && (m.kind === 'photo' || m.kind === 'video'),
  size: m.size,
  createdAt: m.createdAt,
})

function contentOf(gift) {
  return {
    gift: {
      slug: gift.slug,
      reference: gift.reference,
      status: gift.status,
      title: gift.title,
      subtitle: gift.subtitle,
      message: gift.message,
      createdAt: gift.createdAt,
    },
    /* ONE list, in the author's order. Photographs, voices, written
       pages and films sit in the sequence they were added in, which
       is the sequence the gift will be read in. A gift is not four
       collections; it is one album. */
    items: db.memoriesOf(gift.id).map(forBuilder),
    moments: db.momentsOf(gift.id),
    counts: db.countsOf(gift.id),
    limitsMb: config.limitsMb,
  }
}

/* ── the door ──────────────────────────────────────────────────────
   What to ask for, and nothing else. No memory leaves this route:
   the album stays on the server until a password has been accepted. */
router.get('/:slug', (req, res) => {
  const gift = db.giftBySlug(req.params.slug)
  if (!gift) return res.status(404).json({ error: 'El lien hedha wfa wa9tou, wella 3omrou ma ken.' })

  res.json({
    slug: gift.slug,
    title: gift.title,
    sealed: gift.status === 'sealed',
    /* A draft still answers to the password the shop handed out; once
       it is sealed, only the one its owner chose will do. */
    asks: gift.status === 'sealed' ? 'owner' : 'temporary',
  })
})

/* ── coming in ─────────────────────────────────────────────────── */
router.post('/:slug/session', (req, res) => {
  const gift = db.giftBySlug(req.params.slug)
  if (!gift) return res.status(404).json({ error: 'El lien hedha wfa wa9tou, wella 3omrou ma ken.' })

  const given = String(req.body?.password || '').trim()
  if (!given) return res.status(400).json({ error: 'Ekteb el mot de passe mte3ek.' })

  const ok = gift.status === 'sealed'
    ? verifySecret(given, gift.passHash, gift.passSalt)
    : (!!gift.tempHash && verifySecret(given, gift.tempHash, gift.tempSalt))

  if (!ok) return res.status(401).json({ error: 'El mot de passe hedha mahouch sa7i7.' })

  res.json({ ok: true, token: db.openSession(gift, 'builder'), content: contentOf(gift) })
})

/* Everything below needs a session, and a session is bound to one
   gift — so a token minted for another gift is as good as none. */
function guard(req, res, next) {
  const found = db.resolveSession(req.get('x-build-token'), 'builder')
  if (!found || found.gift.slug !== req.params.slug) {
    return res.status(401).json({ error: 'El session mte3ek wfat. 3awed ekteb el mot de passe.' })
  }
  req.gift = found.gift
  next()
}

const answer = (res, gift, extra = {}) => res.json({ ok: true, content: contentOf(gift), ...extra })

router.get('/:slug/content', guard, (req, res) => answer(res, req.gift))

/* ── adding a memory ───────────────────────────────────────────────
   One route for all four kinds: what arrives decides what it is. A
   file makes a photograph, a film or a voice; no file makes a
   written page. */
router.post('/:slug/memories', media.upload, (req, res, next) => {
  /* multer has to run before the guard so the multipart body is
     parsed. The file itself is only ever held in memory at this
     point — nothing is written into the store until the session and
     the size below both check out — so an unauthorised upload has
     nothing to clean up. */
  const found = db.resolveSession(req.get('x-build-token'), 'builder')
  if (!found || found.gift.slug !== req.params.slug) {
    return res.status(401).json({ error: 'El session mte3ek wfat. 3awed ekteb el mot de passe.' })
  }
  req.gift = found.gift
  next()
}, (req, res) => {
  /* A sealed gift can still be added to by its owner — they hold the
     password, and a story is allowed to keep growing. */
  const gift = req.gift
  const body = req.body || {}

  const kind = req.file ? media.kindOf(req.file) : 'note'
  if (req.file) {
    const tooBig = media.checkSize(req.file, kind)
    if (tooBig) return res.status(400).json({ error: tooBig })
  }

  const text = capped(String(body.text || '').trim(), 'text')
  const title = capped(String(body.title || '').trim(), 'title')

  if (!req.file && !text && !title) {
    return res.status(400).json({ error: 'El dhikra el maktouba t7taj 3nwen wella chwaya kelmet.' })
  }

  /* Only now — session and size both good — does the file actually
     get written into the database, along with the small still the browser
     made of it. Without that still the strip and the grid would be
     decoding the full photograph to fill a 64px heart. */
  const saved = req.file ? media.saveFile(req.file) : null
  const still = req.thumb ? media.saveFile(req.thumb) : null

  const memory = db.makeMemory({
    giftId: gift.id,
    kind,
    title,
    description: capped(String(body.description || '').trim(), 'description'),
    date: capped(String(body.date || '').trim(), 'date'),
    text,
    mediaUrl: saved?.url || '',
    thumbnail: still?.url || saved?.url || '',
    thumbFile: still?.id || null,
    mimeType: req.file?.mimetype || '',
    file: saved?.id || null,
    size: req.file?.size || 0,
  }, db.nextPosition(db.memoriesOf(gift.id)))

  db.state.memories.push(memory)
  db.touch(gift)
  db.save()
  answer(res, gift, { added: memory.id })
})

/** The words on a memory. */
router.patch('/:slug/memories/:id', guard, (req, res) => {
  const memory = db.state.memories.find((m) => m.id === req.params.id && m.giftId === req.gift.id)
  if (!memory) return res.status(404).json({ error: 'El dhikra hedhi ma3adhech mawjouda.' })

  const body = req.body || {}
  for (const field of ['title', 'description', 'date', 'text']) {
    if (field in body) memory[field] = capped(body[field], field)
  }
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/* ── swapping a memory's file for a lighter one ────────────────────
   Same picture, fewer pixels. A photograph added before the workshop
   started resizing them is a phone's full 4032×3024 original, and the
   story decodes that to fill a 64px heart. The browser downloads it,
   resizes it and sends it back through here; the words, the order and
   the date are untouched, so nothing anybody wrote is at risk. */
router.post('/:slug/memories/:id/media', media.upload, (req, res, next) => {
  const found = db.resolveSession(req.get('x-build-token'), 'builder')
  if (!found || found.gift.slug !== req.params.slug) {
    return res.status(401).json({ error: 'El session mte3ek wfat. 3awed ekteb el mot de passe.' })
  }
  req.gift = found.gift
  next()
}, (req, res) => {
  const memory = db.state.memories.find((m) => m.id === req.params.id && m.giftId === req.gift.id)
  if (!memory) return res.status(404).json({ error: 'El dhikra hedhi ma3adhech mawjouda.' })
  if (!req.file) return res.status(400).json({ error: 'Ma jech 7atta fichier.' })

  /* It has to stay the kind of memory it already is — a photograph
     cannot quietly become a film because of what was sent here. */
  const kind = media.kindOf(req.file)
  if (kind !== memory.kind) {
    return res.status(400).json({ error: 'El fichier ejdid mouch nafs naw3 el dhikra.' })
  }
  const tooBig = media.checkSize(req.file, kind)
  if (tooBig) return res.status(400).json({ error: tooBig })

  const saved = media.saveFile(req.file)
  const still = req.thumb ? media.saveFile(req.thumb) : null

  /* The old blobs go only once the new ones are safely stored. */
  if (memory.file) media.removeFile(memory.file)
  if (memory.thumbFile) media.removeFile(memory.thumbFile)

  memory.mediaUrl = saved.url
  memory.file = saved.id
  memory.thumbnail = still?.url || saved.url
  memory.thumbFile = still?.id || null
  memory.mimeType = req.file.mimetype || ''
  memory.size = req.file.size || 0

  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/** Throw one away, and its file with it. */
router.delete('/:slug/memories/:id', guard, (req, res) => {
  const index = db.state.memories.findIndex((m) => m.id === req.params.id && m.giftId === req.gift.id)
  if (index === -1) return res.status(404).json({ error: 'El dhikra hedhi ma3adhech mawjouda.' })

  const [removed] = db.state.memories.splice(index, 1)
  if (removed.file) media.removeFile(removed.file)
  if (removed.thumbFile) media.removeFile(removed.thumbFile)

  db.resequence(db.memoriesOf(req.gift.id))
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/** One order for the whole album, given as the complete list of ids. */
router.post('/:slug/order', guard, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const rank = new Map(ids.map((id, i) => [id, i]))
  const mine = db.memoriesOf(req.gift.id)
  mine.forEach((m) => {
    m.position = rank.has(m.id) ? rank.get(m.id) : ids.length + (m.position ?? 0)
  })
  db.resequence(mine)
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/** What the story says: its title, its line, and its letter. */
router.patch('/:slug/words', guard, (req, res) => {
  const body = req.body || {}
  if ('title' in body) req.gift.title = String(body.title ?? '').trim().slice(0, 120) || '7kayetna'
  if ('subtitle' in body) req.gift.subtitle = String(body.subtitle ?? '').slice(0, 200)
  if ('message' in body) req.gift.message = String(body.message ?? '').slice(0, 400)
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/* ── the moments on the timeline ───────────────────────────────── */

router.post('/:slug/moments', guard, (req, res) => {
  const body = req.body || {}
  const moment = db.makeMoment({
    giftId: req.gift.id,
    year: capped(String(body.year || '').trim(), 'year'),
    title: capped(String(body.title || '').trim(), 'title'),
    description: capped(String(body.description || '').trim(), 'description'),
  }, db.nextPosition(db.momentsOf(req.gift.id)))

  db.state.moments.push(moment)
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

router.patch('/:slug/moments/:id', guard, (req, res) => {
  const moment = db.state.moments.find((t) => t.id === req.params.id && t.giftId === req.gift.id)
  if (!moment) return res.status(404).json({ error: 'El l7dha hedhi ma3adhech mawjouda.' })

  const body = req.body || {}
  for (const field of ['year', 'title', 'description']) {
    if (field in body) moment[field] = capped(body[field], field)
  }
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

router.delete('/:slug/moments/:id', guard, (req, res) => {
  const index = db.state.moments.findIndex((t) => t.id === req.params.id && t.giftId === req.gift.id)
  if (index === -1) return res.status(404).json({ error: 'El l7dha hedhi ma3adhech mawjouda.' })

  db.state.moments.splice(index, 1)
  db.resequence(db.momentsOf(req.gift.id))
  db.touch(req.gift)
  db.save()
  answer(res, req.gift)
})

/* ── sealing ───────────────────────────────────────────────────────
   The owner's password takes over and the temporary one stops
   existing. Every session open at that moment is dropped, including
   this one — so a fresh token is handed back, and the person sealing
   the gift stays exactly where they are. */
router.post('/:slug/finish', guard, (req, res) => {
  const gift = req.gift
  const password = String(req.body?.password || '').trim()
  const confirm = String(req.body?.confirm || '').trim()

  if (!password) return res.status(400).json({ error: 'Ekhtar el code mte3 el cadeau.' })
  if (password.length < 4) return res.status(400).json({ error: 'El code lazmou 4 7roufat 3al a9al.' })
  if (password.length > 64) return res.status(400).json({ error: 'El code twil barcha.' })
  if (password !== confirm) return res.status(400).json({ error: 'Ez-zouz codes mouch kif kif.' })
  if (db.memoriesOf(gift.id).length === 0) {
    return res.status(400).json({ error: 'Zid dhikra wa7da 3al a9al 9bal ma tkammel.' })
  }

  const { hash, salt } = hashSecret(password)
  gift.passHash = hash
  gift.passSalt = salt
  gift.tempHash = null
  gift.tempSalt = null
  gift.status = 'sealed'
  db.touch(gift)

  db.dropSessionsOf(gift.id)
  const token = db.openSession(gift, 'builder')
  db.save()

  answer(res, gift, { token, sealed: true })
})

module.exports = router
