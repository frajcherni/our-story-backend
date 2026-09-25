'use strict'
/* ------------------------------------------------------------------
   Start.

   The banner exists because the things that quietly break this server
   are all invisible from the machine it runs on: a console with no
   key, a port already taken, and — most of all — not knowing which
   address goes to whom. Every gift has two, and they are not
   interchangeable: one is for the person filling the gift, the other
   for the person receiving it.
------------------------------------------------------------------ */
const app = require('./app')
const config = require('./config')
const db = require('./db')
const seed = require('./seed')

const server = app.listen(config.port, () => {
  const gifts = db.state.gifts
  const drafts = gifts.filter((g) => g.status === 'draft').length

  console.log('')
  console.log('  ♥  Our Story — the heart is beating')
  console.log('')
  console.log(`     api      →  http://localhost:${config.port}/api/health`)
  console.log(`     console  →  ${config.clientUrl}/admin`)
  console.log('')
  console.log(`     ${gifts.length} gift${gifts.length === 1 ? '' : 's'}` +
    `${drafts ? `, ${drafts} still being filled` : ''}` +
    `, ${db.state.memories.length} memories`)

  for (const gift of gifts.slice(0, 6)) {
    console.log('')
    console.log(`     ${gift.reference}  ${gift.title}  ${gift.status === 'sealed' ? '· finished' : '· being filled'}`)
    console.log(`       fill it  →  ${config.clientUrl}/build/${gift.slug}`)
    console.log(`       open it  →  ${config.clientUrl}/g/${gift.slug}`)
  }
  if (gifts.length > 6) console.log(`\n     …and ${gifts.length - 6} more, in the console.`)

  /* The seeded example is the only gift whose passcode this server can
     ever print: every other one is chosen by its owner and stored as
     a hash the moment they seal it. */
  const demo = gifts.find((g) => g.reference === 'OS-0001')
  if (demo && gifts.length === 1) {
    console.log('')
    console.log(`     The example gift opens with the passcode: ${seed.demoPasscode}`)
  }

  console.log('')
  console.log(`     database →  server/data/db.json`)
  console.log(`     files    →  server/uploads/`)

  if (!config.adminKey) {
    console.log('')
    console.log('     ⚠  ADMIN_KEY is empty, so /admin will not open.')
    console.log('        Put one in server/.env and start the server again.')
  }
  console.log('')
})

/* A port already in use is the most common first-run failure, and
   Node's own message for it does not say what to do about it. */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('')
    console.error(`  ✖  Port ${config.port} is already being used by something else.`)
    console.error('     Close it, or set another PORT in server/.env.')
    console.error('')
    process.exit(1)
  }
  throw err
})

/* Expired sessions, swept hourly so the file does not fill with dead
   tokens on a server that is left running. */
const sweep = setInterval(() => {
  const before = db.state.sessions.length
  db.pruneSessions()
  if (db.state.sessions.length !== before) db.save()
}, 60 * 60 * 1000)
sweep.unref()

const stop = () => server.close(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
