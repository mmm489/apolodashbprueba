export function normalizeSupplierKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\bS\s*L\s*U\b/g, "SLU")
    .replace(/\bS\s*A\s*U\b/g, "SAU")
    .replace(/\bS\s*C\s*P\b/g, "SCP")
    .replace(/\bS\s*L\b/g, "SL")
    .replace(/\bS\s*A\b/g, "SA")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCanonicalSupplierNames(values: Iterable<string>) {
  const candidates = new Map<string, Map<string, number>>();

  for (const rawValue of values) {
    const value = rawValue.trim();
    const key = normalizeSupplierKey(value);
    if (!key) continue;

    const names = candidates.get(key) ?? new Map<string, number>();
    names.set(value, (names.get(value) ?? 0) + 1);
    candidates.set(key, names);
  }

  const canonical = new Map<string, string>();
  for (const [key, names] of candidates) {
    const best = [...names.entries()].sort((a, b) => {
      const byFrequency = b[1] - a[1];
      if (byFrequency !== 0) return byFrequency;

      const byQuality = supplierNameQuality(b[0]) - supplierNameQuality(a[0]);
      if (byQuality !== 0) return byQuality;

      return a[0].localeCompare(b[0], "es");
    })[0]?.[0];

    if (best) canonical.set(key, best);
  }

  return canonical;
}

function supplierNameQuality(value: string) {
  let score = 0;
  if (value === value.trim()) score += 1;
  if (!/\s{2,}/.test(value)) score += 1;
  if (!/\s+[,.;:]/.test(value)) score += 1;
  if (!/\s+-\s+/.test(value)) score += 1;
  if (value.normalize("NFD") !== value) score += 1;
  return score;
}
