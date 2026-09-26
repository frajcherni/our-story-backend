'use strict'
/* ------------------------------------------------------------------
   /api/admin — one screen, one job.

   An order comes in, an empty gift goes out. You type the reference
   the order is known by and a temporary password, and you get back a
   link to hand to the customer. Nothing else happens here: the gift
   itself is built by the person you hand that link to.

   The console never sees a gift's memories and never sets its final
   password. It creates the door and hands over the key.
------------------------------------------------------------------ */
const express = require('express')

const config = require('../config')
const db = require('../db')
const media = require('../media')
const { hashSecret, normalizeReference, constantTimeEquals } = require('../crypto')

const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminKey) {
    return res.status(503).json({
      error: 'El console mazel ma 3andhech clé. 7ott ADMIN_KEY fi server/.env w 3awed chghel el serveur.',
      configured: false,
    })
  }
  if (!constantTimeEquals(req.get('x-admin-key'), config.adminKey)) {
    return res.status(401).json({ error: 'El clé hedhi ma te7elch el console.' })
  }
  next()
})

router.post('/session', (_req, res) => res.json({ ok: true }))

/* What a gift looks like from the console: what it is called, what it
   holds, and where its two doors are. Never its passwords. */
const card = (gift) => ({
  id: gift.id,
  slug: gift.slug,
  reference: gift.reference,
  status: gift.status,
  title: gift.title,
  counts: db.countsOf(gift.id),
  createdAt: gift.createdAt,
  updatedAt: gift.updatedAt,
  openedAt: gift.openedAt,
  opens: gift.opens,
  buildPath: `/build/${gift.slug}`,
  viewPath: `/g/${gift.slug}`,
})

/* ── every gift ────────────────────────────────────────────────── */
router.get('/gifts', (_req, res) => {
  const gifts = [...db.state.gifts]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(card)

  res.json({
    gifts,
    totals: {
      gifts: gifts.length,
      draft: gifts.filter((g) => g.status === 'draft').length,
      sealed: gifts.filter((g) => g.status === 'sealed').length,
      memories: db.state.memories.length,
      bytes: db.state.memories.reduce((sum, m) => sum + (m.size || 0), 0),
    },
  })
})

/* ── a new, empty gift ─────────────────────────────────────────────
   It is born a draft: there is no password on it that anybody chose,
   so the heart refuses to open it until its owner has sealed it. */
router.post('/gifts', (req, res) => {
  const body = req.body || {}
  const reference = normalizeReference(body.reference)
  const temp = String(body.tempPassword || '').trim()

  if (!reference) return res.status(400).json({ error: 'A3ti el commande référence.' })
  if (reference.length < 2) return res.status(400).json({ error: 'El référence 9sira barcha.' })
  if (reference.length > 64) return res.status(400).json({ error: 'El référence twila barcha.' })
  if (!temp) return res.status(400).json({ error: 'Ekhtar mot de passe mo2aqqat bech ta3tih lel client.' })
  if (temp.length < 4) return res.status(400).json({ error: 'El mot de passe el mo2aqqat lazmou 4 7roufat 3al a9al.' })
  if (temp.length > 64) return res.status(400).json({ error: 'El mot de passe el mo2aqqat twil barcha.' })

  /* One reference names one physical order, so two gifts may not
     share it — the console would have no way to tell them apart. */
  if (db.state.gifts.some((g) => g.reference === reference)) {
    return res.status(409).json({ error: `“${reference}” mesta3mla deja f cadeau okhra.` })
  }

  const { hash, salt } = hashSecret(temp)
  const gift = db.makeGift({
    slug: db.freeSlug(body.title || reference, db.state.gifts),
    reference,
    status: 'draft',
    tempHash: hash,
    tempSalt: salt,
    title: String(body.title || '').trim() || 'Our Story',
  })

  db.state.gifts.push(gift)
  db.save()

  /* The temporary password is echoed once, here, because the person
     who typed it has to be able to pass it on. It is a hash from now
     on and this is the last time it can be read. */
  res.status(201).json({ ok: true, gift: card(gift), tempPassword: temp })
})

/** Delete a gift, and everything it held. */
router.delete('/gifts/:id', (req, res) => {
  const gift = db.giftByAny(req.params.id)
  if (!gift) return res.status(404).json({ error: 'El cadeau hedha ma3adch mawjoud.' })

  /* The files first: once the rows are gone there is nothing left to
     say which files on disk were ever ours. */
  for (const memory of db.state.memories) {
    if (memory.giftId !== gift.id) continue
    if (memory.file) media.removeFile(memory.file)
    if (memory.thumbFile) media.removeFile(memory.thumbFile)
  }
  db.state.memories = db.state.memories.filter((m) => m.giftId !== gift.id)
  db.state.moments = db.state.moments.filter((t) => t.giftId !== gift.id)
  db.dropSessionsOf(gift.id)
  db.state.gifts = db.state.gifts.filter((g) => g.id !== gift.id)

  db.save()
  res.json({ ok: true })
})

/* ── a new temporary password ──────────────────────────────────────
   The customer lost the one they were given, and the gift is not
   sealed yet. A sealed gift has an owner's password the console has
   never known and cannot replace. */
router.post('/gifts/:id/reset', (req, res) => {
  const gift = db.giftByAny(req.params.id)
  if (!gift) return res.status(404).json({ error: 'El cadeau hedha ma3adch mawjoud.' })
  if (gift.status === 'sealed') {
    return res.status(409).json({
      error: 'El cadeau hedha kammel. El code mte3ou 3and elli sakkrou — el console ma tnajjemch tbaddlou.',
    })
  }

  const temp = String(req.body?.tempPassword || '').trim()
  if (temp.length < 4) return res.status(400).json({ error: 'El mot de passe el mo2aqqat lazmou 4 7roufat 3al a9al.' })

  const { hash, salt } = hashSecret(temp)
  gift.tempHash = hash
  gift.tempSalt = salt
  db.dropSessionsOf(gift.id)
  db.touch(gift)
  db.save()

  res.json({ ok: true, gift: card(gift), tempPassword: temp })
})

module.exports = router
