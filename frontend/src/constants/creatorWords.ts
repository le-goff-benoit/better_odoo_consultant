// Word pool for the Creator's type-to-confirm challenge. Picking a couple of
// these at random (joined by a hyphen) gives a short, unambiguous phrase the
// consultant retypes to confirm a sensitive action — same idea as GitHub's
// "type the repository name to confirm" prompt.
//
// All lowercase, accent-free and easy to type, so confirmation never fails on
// a keyboard-layout detail.
export const CREATOR_WORDS: string[] = [
  'arbre', 'maison', 'route', 'livre', 'pomme', 'chaise', 'table', 'porte',
  'jardin', 'soleil', 'lune', 'etoile', 'riviere', 'montagne', 'foret', 'plage',
  'ocean', 'nuage', 'pluie', 'vent', 'neige', 'glace', 'terre', 'pierre',
  'sable', 'herbe', 'fleur', 'racine', 'branche', 'feuille', 'fruit', 'graine',
  'metal', 'verre', 'papier', 'tissu', 'corde', 'brique', 'pont', 'tour',
  'place', 'chemin', 'sentier', 'gare', 'port', 'phare', 'moulin', 'ferme',
  'grange', 'cave', 'grenier', 'cuisine', 'salon', 'bureau', 'atelier',
  'marche', 'boutique', 'musee', 'theatre', 'ecole', 'banque', 'usine',
  'champ', 'vigne', 'verger', 'prairie', 'etang', 'source', 'vague', 'marais',
  'colline', 'vallee', 'plaine', 'desert', 'falaise', 'grotte', 'canyon',
  'glacier', 'volcan', 'comete', 'planete', 'galaxie', 'horizon', 'aurore',
  'brume', 'orage', 'eclair', 'tonnerre', 'prisme', 'cristal', 'diamant',
  'saphir', 'ambre', 'cuivre', 'bronze', 'argent', 'platine', 'corail',
  'perle', 'ancre',
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
