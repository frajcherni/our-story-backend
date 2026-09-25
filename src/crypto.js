'use strict'
/* ------------------------------------------------------------------
   Secrets.

   Three passwords exist in this system and none of them is ever
   stored: the temporary one the shop hands the customer, the one the
   customer chooses when they finish their gift, and the console key.
   The first two are scrypt hashes in the database; the third lives in
   .env and is compared flat.
------------------------------------------------------------------ */
const crypto = require('node:crypto')

/* An alphabet with no 0/O/1/l in it, so a code can be read off a
   screen, said out loud, or copied from a card without a mistake. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'

function randomId(length = 12) {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/* scrypt, deliberately slow. The passwords here are short and human
   ("lune-8412"), so the key derivation is what actually protects them
   if the database is ever copied. */
const SCRYPT = { N: 16384, r: 8, p: 1 }

function hashSecret(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(plain), salt, 32, SCRYPT).toString('hex')
  return { hash, salt }
}

function verifySecret(plain, hash, salt) {
  try {
    if (!hash || !salt) return false
    const test = crypto.scryptSync(String(plain), salt, 32, SCRYPT)
    const real = Buffer.from(hash, 'hex')
    return real.length === test.length && crypto.timingSafeEqual(real, test)
  } catch {
    return false
  }
}

/* The reference is read off an order slip and typed back by someone
   who did not choose it, so casing and stray spaces must not lock
   anyone out. Dashes stay significant — "OS-4821" and "OS4821" being
   the same would be the more surprising rule. */
function normalizeReference(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/* A flat comparison, for the console key that lives in .env where a
   slow hash would buy nothing. */
function constantTimeEquals(given, expected) {
  const a = Buffer.from(String(given ?? ''), 'utf8')
  const b = Buffer.from(String(expected ?? ''), 'utf8')
  if (!b.length || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

module.exports = {
  randomId, hashSecret, verifySecret, normalizeReference, constantTimeEquals,
}
