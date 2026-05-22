// Word pool for the Creator's type-to-confirm challenge. Picking a couple of
// these at random (joined by a hyphen) gives a short, unambiguous phrase the
// consultant retypes to confirm a sensitive action — same idea as GitHub's
// "type the repository name to confirm" prompt.
//
// Vocabulary is intentionally Odoo / mountain oriented, while staying
// lowercase, accent-free and easy to type so confirmation never fails on a
// keyboard-layout detail.
export const CREATOR_WORDS: string[] = [
  'odoo', 'studio', 'module', 'modele', 'champ', 'vue', 'rapport', 'qweb',
  'menu', 'action', 'record', 'domaine', 'xmlid', 'societe', 'facture',
  'commande', 'devis', 'client', 'produit', 'stock', 'crm', 'vente', 'achat',
  'compta', 'kanban', 'liste', 'formulaire', 'serveur', 'cron', 'automatisation',
  'migration', 'source', 'branche', 'commit', 'depot', 'instance', 'base',
  'sommet', 'alpage', 'aiguille', 'arete', 'creste', 'col', 'refuge', 'sentier',
  'piolet', 'cordee', 'moraine', 'glacier', 'neve', 'serac', 'vallon', 'torrent',
  'cascade', 'rocher', 'falaise', 'panorama', 'altitude', 'bivouac', 'piolet',
  'crampon', 'edelweiss', 'chamois', 'bouquetin', 'sapin', 'meleze', 'ubac',
  'adret', 'combe', 'plateau', 'cairn', 'balise', 'trace', 'pente', 'neige',
]

/** Build a confirmation phrase: `count` distinct random words joined by '-'. */
export function makeChallenge(count = 2): string {
  const pool = [...CREATOR_WORDS]
  const picked: string[] = []
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked.join('-')
}
