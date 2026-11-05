// Crypto snapshot for the News briefing: free public data, read straight from the browser.
// CoinGecko has a tight keyless rate limit, so a snapshot is reused for 5 minutes across reloads.

export interface Coin {
  id: string
  symbol: string
  name: string
  usd: number
  idr: number | null
  change24h: number | null
  change7d: number | null
  /** Hourly prices over the last 7 days */
  spark: number[]
}

export interface FearGreed {
  value: number
  label: string
  yesterday: number | null
  lastWeek: number | null
}

export interface Market {
  capUsd: number
  capChange24h: number
  btcDominance: number
}

export interface CryptoSnapshot {
  coins: Coin[] | null
  fearGreed: FearGreed | null
  market: Market | null
  at: number
}

const COINS = 'bitcoin,ethereum,bitget-token'
const GECKO = 'https://api.coingecko.com/api/v3'
const CACHE_KEY = 'ledger.crypto'
export const CRYPTO_TTL = 5 * 60e3

const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function loadCoins(): Promise<Coin[]> {
  type Row = {
    id: string
    symbol: string
    name: string
    current_price: number
    price_change_percentage_24h_in_currency: number | null
    price_change_percentage_7d_in_currency: number | null
    sparkline_in_7d?: { price: number[] }
  }
  const [rows, idr] = await Promise.all([
    getJson<Row[]>(`${GECKO}/coins/markets?vs_currency=usd&ids=${COINS}&sparkline=true&price_change_percentage=24h,7d`),
    getJson<Record<string, { idr: number }>>(`${GECKO}/simple/price?ids=${COINS}&vs_currencies=idr`).catch(() => null),
  ])
  return COINS.split(',').flatMap((id) => {
    const r = rows.find((x) => x.id === id)
    if (!r) return []
    return [
      {
        id,
        symbol: r.symbol.toUpperCase(),
        name: r.name,
        usd: r.current_price,
        idr: idr?.[id]?.idr ?? null,
        change24h: r.price_change_percentage_24h_in_currency,
        change7d: r.price_change_percentage_7d_in_currency,
        spark: r.sparkline_in_7d?.price ?? [],
      },
    ]
  })
}

async function loadFearGreed(): Promise<FearGreed> {
  const { data } = await getJson<{ data: { value: string; value_classification: string }[] }>('https://api.alternative.me/fng/?limit=8')
  const at = (i: number) => (data[i] ? Number(data[i].value) : null)
  return { value: Number(data[0].value), label: data[0].value_classification, yesterday: at(1), lastWeek: at(7) }
}

async function loadMarket(): Promise<Market> {
  const { data } = await getJson<{
    data: { total_market_cap: { usd: number }; market_cap_change_percentage_24h_usd: number; market_cap_percentage: { btc: number } }
  }>(`${GECKO}/global`)
  return { capUsd: data.total_market_cap.usd, capChange24h: data.market_cap_change_percentage_24h_usd, btcDominance: data.market_cap_percentage.btc }
}

const readCache = (): CryptoSnapshot | null => {
  try {
    const s = localStorage.getItem(CACHE_KEY)
    return s ? (JSON.parse(s) as CryptoSnapshot) : null
  } catch {
    return null
  }
}

/** Latest snapshot. Each part loads on its own, and a part that fails keeps its last known value. */
export async function loadCrypto(force = false): Promise<CryptoSnapshot> {
  const cached = readCache()
  if (!force && cached && Date.now() - cached.at < CRYPTO_TTL && cached.coins && cached.fearGreed && cached.market) return cached
  const [coins, fearGreed, market] = await Promise.allSettled([loadCoins(), loadFearGreed(), loadMarket()])
  const snapshot: CryptoSnapshot = {
    coins: coins.status === 'fulfilled' ? coins.value : (cached?.coins ?? null),
    fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : (cached?.fearGreed ?? null),
    market: market.status === 'fulfilled' ? market.value : (cached?.market ?? null),
    at: Date.now(),
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    /* storage unavailable: just refetch next time */
  }
  return snapshot
}

/** Whole dollars for big prices, cents for small ones (BGB at $5.40 shouldn't read as $5) */
export const formatUsd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)
export const formatUsdCompact = (n: number) => `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)}`
export const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
