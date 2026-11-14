// OWNER: subagent B. Small, dependency-free text helpers used by the mock AI.

export const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let lets like me more most my myself no nor not now of off on once only or other our ours out over own really right same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours okay ok yeah hmm um uh so well gonna wanna thing things stuff maybe actually basically probably definitely first last next one two three think know want get got going go see look looking let\'s i\'m i\'ll i\'ve it\'s that\'s there\'s don\'t can\'t didn\'t isn\'t won\'t we\'re you\'re they\'re need needs say said tell told talk talked talking session recording screen minute minutes second seconds viewing page searching search using'
  ).split(/\s+/)
)

/** Split text into sentences (keeps punctuation). */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

export function words(text: string): string[] {
  return (text.toLowerCase().replace(/[’]/g, "'").match(/[a-z0-9$¥€£][a-z0-9'$¥€£,.-]*[a-z0-9]|[a-z0-9]/g) ?? []).map((w) => w.replace(/[,.]+$/, ''))
}

/** Very small stemmer for keyword matching ("hotels" ~ "hotel", "booking" ~ "book"). */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/'s$/, '')
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y'
  else if (s.length > 3 && s.endsWith('es') && /(ch|sh|x|ss)es$/.test(s)) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  return s
}

export function contentStems(text: string): string[] {
  return words(text)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem)
}

export function truncate(s: string, n: number): string {
  const t = s.trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s—-]+$/, '')}…`
}

export const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

export function firstName(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || 'there'
}

/** Detects a self-introduction like "Hey, I'm Shilpa." and returns the name. */
export function introducedName(question: string): string | null {
  const m = /\b(?:[Ii]['’]m|[Ii] am|[Mm]y name(?: is|['’]s)|[Tt]his is|[Ii]t['’]s)\s+([A-Z][a-zA-Z'-]{1,24})\b/.exec(question)
  if (!m) return null
  const n = m[1]!
  const bad = new Set(['Not', 'Just', 'So', 'Back', 'Here', 'Trying', 'Curious', 'Wondering', 'Looking', 'Going', 'Still', 'Also', 'The', 'A', 'An', 'Me', 'Sure', 'Really', 'Done', 'Ready', 'Okay', 'Ok'])
  return bad.has(n) ? null : n
}

/** Natural-language list: ["a","b","c"] → "a, b and c" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
