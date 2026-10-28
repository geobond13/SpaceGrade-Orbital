// A second check beside the citation check: do the quantities in the answer appear
// in what the tools returned? Citations prove a source exists; this catches a number
// the model made up or carried over wrongly. It cannot tell "29 m/s lost" from
// "29 m/s remaining", which is why critical values are also rendered from the decision record.

const UNIT = String.raw`(?:m\/s|scc\/s|psia|psi|°C|°|%|Ah|Wh|kg|Hz|min|days?|W|V|m|s|h)(?![a-zA-Z])`
const QUANTITY = new RegExp(String.raw`(?<![\w.])(T\+)?(\d+(?:\.\d+)?(?:e-?\d+)?)\s?(${UNIT})?`, 'g')

export interface QuantityCheck {
  /** Quantities with a unit (or a T+ time) found in the answer. */
  checked: number
  /** Those whose value no tool result contains, e.g. "29 m/s". */
  unmatched: string[]
}

/** Every number anywhere in the tool data, including numbers inside strings. */
export function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value)
  else if (typeof value === 'string') for (const m of value.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)) out.push(Number(m[0]))
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, out)
  return out
}

/** A stated value matches a source value if the source rounds to it at the stated precision, or is within 1 %. */
function matches(stated: string, sources: number[]): boolean {
  const v = Number(stated)
  const decimals = stated.includes('e') ? 3 : (stated.split('.')[1]?.length ?? 0)
  const tol = 0.5 * 10 ** -decimals + 1e-9
  return sources.some((s) => Math.abs(Math.abs(s) - v) <= tol || (v !== 0 && Math.abs(Math.abs(s) - v) / v <= 0.01))
}

export function checkQuantities(text: string, sources: unknown[]): QuantityCheck {
  const pool = sources.flatMap((s) => numbersIn(s))
  const found = new Set<string>()
  for (const m of text.replace(/\[[^\]]*\]/g, '').matchAll(QUANTITY)) {
    const [whole, tPlus, value, unit] = m
    // Bare numbers (record ids, counts, years) carry no physical claim worth checking.
    if (!tPlus && !unit) continue
    found.add(`${whole.trim()}|${value}`)
  }
  const unmatched = [...found].filter((k) => !matches(k.split('|')[1], pool)).map((k) => k.split('|')[0])
  return { checked: found.size, unmatched }
}
