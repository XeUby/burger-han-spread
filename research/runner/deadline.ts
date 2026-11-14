export function deadlineFetch(fetcher: typeof fetch, deadline: number, now: () => number = Date.now): typeof fetch {
  if (!Number.isFinite(deadline)) throw new Error('Invalid mutation deadline')
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET') return fetcher(input, init)
    const remaining = deadline - now()
    if (remaining <= 0) throw new Error('Mutation deadline reached')
    const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const signal = AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.ceil(remaining))), ...(inherited ? [inherited] : [])])
    return fetcher(input, { ...init, signal })
  }
}
