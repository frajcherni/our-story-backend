'use strict'
/* ------------------------------------------------------------------
   The database.

   One JSON file, held in memory and written back whenever something
   changes. No engine to install, no migrations, no native module.

   ── the shape ──────────────────────────────────────────────────────

   A GIFT is one love story: one heart, for one person. It is born
   empty in the console, filled by the person it was handed to, and
   then sealed. It has its OWN memories and its own moments; nothing
   is ever shared between two gifts.

     gift {
       id, slug            what the addresses are built from
       reference           what the order is called — 'OS-4821'
       status              'draft'  handed over, being filled
                           'sealed' finished; the heart will open it
       tempHash/tempSalt   the temporary password the shop handed out.
                           Erased at the moment the gift is sealed.
       passHash/passSalt   the password its owner chose when sealing.
                           This is what the recipient types.
       title, subtitle     what the story says once the heart opens
       message             the letter at the very end
       createdAt, updatedAt, openedAt
     }

     memory { id, giftId, kind, position, title, description, date,
              text, mediaUrl, mimeType, file, size, createdAt }

     moment { id, giftId, position, year, title, description }

     session { token, giftId, kind: 'builder' | 'view', expiresAt }

   Memories and moments carry a `giftId` rather than being nested, so
   "this gift's album, in order" is one filter and one sort.

   Writes go to a temporary file and are renamed over the real one. A
   rename is atomic, so a crash can never leave a half-written file.
------------------------------------------------------------------ */
const fs = require('node:fs')
const path = require('node:path')
const nodeCrypto = require('node:crypto')

const config = require('./config')
const seed = require('./seed')
const { randomId, hashSecret } = require('./crypto')

const uid = (prefix) => `${prefix}_${nodeCrypto.randomBytes(5).toString('hex')}`
const nowIso = () => new Date().toISOString()

/* How long someone stays logged in. A gift can be picked up again the
   same day; a recipient's token is shorter, because it is minted
   fresh every time the passcode is accepted. */
const BUILDER_MS = 12 * 60 * 60 * 1000
const VIEW_MS = 6 * 60 * 60 * 1000

/* ── names ─────────────────────────────────────────────────────── */
function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function freeSlug(wanted, gifts, exceptId = null) {
  const base = slugify(wanted) || 'our-story'
  const taken = (s) => gifts.some((g) => g.slug === s && g.id !== exceptId)
  if (!taken(base)) return base
  for (let n = 2; n < 500; n += 1) if (!taken(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${randomId(4)}`
}

/* ── rows ──────────────────────────────────────────────────────── */

const KINDS = ['photo', 'video', 'voice', 'note']

function makeGift(input = {}) {
  return {
    id: input.id || uid('g'),
    slug: input.slug || 'our-story',
    reference: input.reference || '',
    status: input.status === 'sealed' ? 'sealed' : 'draft',
    tempHash: input.tempHash || null,
    tempSalt: input.tempSalt || null,
    passHash: input.passHash || null,
    passSalt: input.passSalt || null,
    title: input.title || '7kayetna',
    subtitle: input.subtitle || '',
    message: input.message || '',
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    openedAt: input.openedAt || null,
    opens: input.opens || 0,
  }
}

function makeMemory(input = {}, position = 0) {
  return {
    id: input.id || uid('m'),
    giftId: input.giftId || null,
    kind: KINDS.includes(input.kind) ? input.kind : 'note',
    position,
    title: input.title || '',
    description: input.description || '',
    date: input.date || '',
    text: input.text || '',
    mediaUrl: input.mediaUrl || '',
    thumbnail: input.thumbnail || input.mediaUrl || '',
    mimeType: input.mimeType || '',
    file: input.file || null,
    size: input.size || 0,
    createdAt: input.createdAt || nowIso(),
  }
}

function makeMoment(input = {}, position = 0) {
  return {
    id: input.id || uid('t'),
    giftId: input.giftId || null,
    position,
    year: input.year || '',
    title: input.title || '',
    description: input.description || '',
  }
}

/* ── the first run ─────────────────────────────────────────────────
   One gift, already sealed, holding the twelve memories and five
   moments the site shipped with — so there is a finished example to
   open on day one. Its passcode is printed at boot. */
function freshState() {
  const pass = hashSecret(seed.demoPasscode)
  const gift = makeGift({
    slug: 'our-story',
    reference: 'OS-0001',
    status: 'sealed',
    passHash: pass.hash,
    passSalt: pass.salt,
    ...seed.gift,
  })
  return {
    gifts: [gift],
    memories: seed.memories.map((m, i) => makeMemory({ ...m, giftId: gift.id }, i)),
    moments: seed.moments.map((t, i) => makeMoment({ ...t, giftId: gift.id }, i)),
    sessions: [],
  }
}

/* A file from an older version, hand-edited or truncated, still has
   to produce a database this server can work with. */
function repair(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.gifts)) return freshState()

  const gifts = raw.gifts.map((g) => makeGift(g))
  const known = new Set(gifts.map((g) => g.id))
  const keep = (row) => known.has(row.giftId)

  return {
    gifts,
    memories: (Array.isArray(raw.memories) ? raw.memories : [])
      .map((m, i) => makeMemory(
        /* An older file called this `type` and used 'image'/'audio'/'text'. */
        { ...m, kind: m.kind || { image: 'photo', audio: 'voice', text: 'note', video: 'video' }[m.type] },
        Number.isFinite(m?.position) ? m.position : i,
      ))
      .filter(keep),
    moments: (Array.isArray(raw.moments) ? raw.moments : [])
      .map((t, i) => makeMoment(t, Number.isFinite(t?.position) ? t.position : i))
      .filter(keep),
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).filter(keep),
  }
}

function write(state) {
  const temp = `${config.dataFile}.tmp`
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(temp, config.dataFile)
}

function load() {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
  fs.mkdirSync(config.uploadDir, { recursive: true })

  try {
    const raw = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'))
    const repaired = repair(raw)
    /* An older file has just been reshaped in memory. Write it back so
       the ids it invented are permanent. */
    if (!Array.isArray(raw.gifts) || !Array.isArray(raw.sessions)) write(repaired)
    return repaired
  } catch (err) {
    if (err.code !== 'ENOENT') {
      const rescued = `${config.dataFile}.broken-${Date.now()}`
      try { fs.renameSync(config.dataFile, rescued) } catch { /* nothing to move */ }
      console.warn(`  ⚠  db.json could not be read (${err.message}).`)
      console.warn(`     The old file is kept as ${path.basename(rescued)}; starting fresh.`)
    }
    const state = freshState()
    write(state)
    return state
  }
}

const state = load()

function save() {
  write(state)
}

/* ── reading it back ───────────────────────────────────────────── */

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0)

const giftBySlug = (slug) => state.gifts.find((g) => g.slug === String(slug || ''))
const giftById = (id) => state.gifts.find((g) => g.id === id)
const giftByAny = (key) => giftById(key) || giftBySlug(key)

const memoriesOf = (giftId) =>
  state.memories.filter((m) => m.giftId === giftId).sort(byPosition)

const momentsOf = (giftId) =>
  state.moments.filter((t) => t.giftId === giftId).sort(byPosition)

/** How many of each kind a gift holds — what the console's list shows. */
function countsOf(giftId) {
  const mine = state.memories.filter((m) => m.giftId === giftId)
  const of = (kind) => mine.filter((m) => m.kind === kind).length
  return {
    photos: of('photo'),
    videos: of('video'),
    voices: of('voice'),
    notes: of('note'),
    total: mine.length,
    bytes: mine.reduce((sum, m) => sum + (m.size || 0), 0),
  }
}

const nextPosition = (list) =>
  list.reduce((max, item) => Math.max(max, item.position ?? 0), -1) + 1

function resequence(list) {
  list.sort(byPosition).forEach((item, i) => { item.position = i })
  return list
}

const touch = (gift) => { if (gift) gift.updatedAt = nowIso() }

/* ── sessions ──────────────────────────────────────────────────────
   A token is bound to exactly one gift, so one minted for a gift is
   worth nothing against another. Sealing drops every session the gift
   had, which is what makes the temporary password stop working at
   the same instant it stops existing. */

function openSession(gift, kind) {
  const token = randomId(32)
  const ms = kind === 'view' ? VIEW_MS : BUILDER_MS
  state.sessions.push({
    token,
    giftId: gift.id,
    kind,
    expiresAt: new Date(Date.now() + ms).toISOString(),
  })
  pruneSessions()
  save()
  return token
}

function resolveSession(token, kind) {
  if (!token) return null
  const found = state.sessions.find((s) => s.token === token && s.kind === kind)
  if (!found) return null
  if (new Date(found.expiresAt).getTime() < Date.now()) return null
  const gift = giftById(found.giftId)
  return gift ? { session: found, gift } : null
}

function dropSessionsOf(giftId) {
  state.sessions = state.sessions.filter((s) => s.giftId !== giftId)
}

function pruneSessions() {
  const now = Date.now()
  state.sessions = state.sessions.filter((s) => new Date(s.expiresAt).getTime() > now)
}

module.exports = {
  state, save, uid, nowIso, slugify, freeSlug, touch, KINDS,
  makeGift, makeMemory, makeMoment,
  giftBySlug, giftById, giftByAny, memoriesOf, momentsOf, countsOf,
  nextPosition, resequence, byPosition,
  openSession, resolveSession, dropSessionsOf, pruneSessions,
}
