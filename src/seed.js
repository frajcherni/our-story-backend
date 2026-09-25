'use strict'
/* ------------------------------------------------------------------
   What the database contains the very first time it is started.

   The twelve memories and five moments the story ships with, so the
   site looks like a finished gift on day one — and every one of them
   is visible and editable in the workshop.

   They are written in the same Tunisian the rest of the app speaks,
   because the demo gift is also the example of what to write.

   The photographs live in the site's own `public/memories/` folder,
   which is why their addresses have no /media in front.
------------------------------------------------------------------ */

const memories = [
  { kind: 'photo', title: 'Ewwel taswira', description: 'Ki mazelna ma na3rfouch belli hedha bech ywalli kol chay.', date: 'El bidaya', mediaUrl: '/memories/1.jpg' },
  { kind: 'note', title: 'Fikra', text: 'Fama l7dhat 3omrha ma tetnsa.', description: 'To93od, f skout, barcha ba3d ma yfout nharha.' },
  { kind: 'photo', title: 'Dhik el 3achiya', description: 'El dhaw kan hani w ma3adch fama 7aja okhra tehem.', date: 'Wa9t el ghroub', mediaUrl: '/memories/2.jpg' },
  { kind: 'photo', title: 'Blasa b3ida', description: 'Blasa ma3neha chay ken 3la khater kont enti fiha.', date: 'Fel tri9', mediaUrl: '/memories/4.jfif' },
  { kind: 'note', title: 'Binetna', text: 'W9aft na3ded el ayem, w bdit na3ded el l7dhat.', description: 'Kol wa7da fihom 3andha esmek.' },
  { kind: 'photo', title: 'Nod7ku 3la wala chay', description: 'El far7a elli ma3andhech sabab w ma test7a9ech wa7ed.', date: 'Nhar 3adi', mediaUrl: '/memories/5.webp' },
  { kind: 'note', title: 'F skout', text: 'Enti el blasa el mfadhla 3andi ki 3a9li ylawwej 3la el hdouna.' },
  { kind: 'photo', title: 'Mazelna hne', description: 'Ba3d kol chay, w wara kol chay.', date: 'A7na', mediaUrl: '/memories/img5.jpeg' },
  { kind: 'photo', title: 'El 7ajet esghar', description: 'Yed, chwaya chouf, w thenya t3addi akthar mel lezem.', date: 'Tafasil', mediaUrl: '/memories/img2.jpeg' },
  { kind: 'note', title: 'W3ed', text: 'Kan lezemni nekhtar marra okhra, nekhtarek enti. Kol marra.', description: 'Bla ma nfakker, w bla nihaya.' },
  { kind: 'photo', title: 'El lila', description: 'W kol lila jeya ba3dha.', date: 'Tawa', mediaUrl: '/memories/img3.jpeg' },
  { kind: 'note', title: 'Mazelna nekketbou', text: '7kayetna ma3andhech safha akhira.', description: '3andha ken el safha elli baadha.' },
]

const moments = [
  { year: '2022', title: 'Men fin bda kol chay', description: 'Ewwel message, ewwel chouf, w bidayet kol chay ja mour hakka.' },
  { year: '2023', title: 'Dhkeryet zeydin', description: 'Ayem wallew 3adet, w 3adet wallew 7ayet.' },
  { year: '2024', title: 'A7la l7dhatna', description: 'El 3am elli fih w9afna net5ayylou el mosta9bel w bdina nabniwh.' },
  { year: '2025', title: 'Mazelna nekketbou f 7kayetna…', description: 'Ahda, a3ma9, w akthar y9in men 9bal.' },
  { year: '2026', title: 'W hedhi ken el bidaya.', description: 'Kol chay 7atta lteww kan ken el fasl el awwel.' },
]

const gift = {
  title: '7kayetna',
  subtitle: 'Kol chay elli kan mkhabbi fel qalb, ha houwa hne — ma7foudh, w mazel yodrob.',
  message: 'Fama 7kayat titketbou.\nW 7kayetna tit7ess.',
}

/* The finished example's passcode, printed at boot the first time. */
const demoPasscode = 'amour'

module.exports = { gift, demoPasscode, memories, moments }
