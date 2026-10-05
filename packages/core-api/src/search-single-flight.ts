export interface SearchOutcome {
  body: Record<string, unknown>
  status: 200 | 400 | 502 | 503
}

const maxInFlightSearches = 256
const inFlightSearches = new Map<string, Promise<SearchOutcome>>()

export async function coalesceSearchMiss(
  key: string,
  operation: () => Promise<SearchOutcome>
): Promise<SearchOutcome> {
  const existing = inFlightSearches.get(key)
  if (existing) return existing

  if (inFlightSearches.size >= maxInFlightSearches) {
    return operation()
  }

  const pending = Promise.resolve().then(operation)
  inFlightSearches.set(key, pending)
  try {
    return await pending
  } finally {
    if (inFlightSearches.get(key) === pending) inFlightSearches.delete(key)
  }
}

export function getInFlightSearchCount() {
  return inFlightSearches.size
}
