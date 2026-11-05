import { useEffect, useState, type PointerEvent } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { formatIDR } from '../../lib/format'
import { CRYPTO_TTL, formatPct, formatUsd, formatUsdCompact, loadCrypto, type Coin, type CryptoSnapshot, type FearGreed, type Market } from '../../lib/crypto'
import { Card, CardTitle, IconButton, Skeleton, cx } from '../ui'

/** The market at a glance: sentiment, the tracked coins, and the size of the whole market */
export function CryptoCard() {
  const [snap, setSnap] = useState<CryptoSnapshot | null>(null)
  const [busy, setBusy] = useState(true)

  const refresh = (force: boolean) => {
    setBusy(true)
    loadCrypto(force)
      .then(setSnap)
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    refresh(false)
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(false), CRYPTO_TTL)
    return () => clearInterval(t)
  }, [])

  const time = snap ? new Date(snap.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <Card>
      <CardTitle
        action={
          <IconButton label="Refresh prices" onClick={() => refresh(true)} disabled={busy} className="-my-2 text-muted">
            <ArrowsClockwise size={17} className={busy ? 'animate-spin' : undefined} />
          </IconButton>
        }
      >
        Crypto
      </CardTitle>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {!snap ? (
          [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            {snap.fearGreed ? <Sentiment fg={snap.fearGreed} /> : <Missing label="Fear & Greed" />}
            {snap.coins?.length ? snap.coins.map((c) => <CoinTile key={c.id} coin={c} />) : <Missing label="Coin prices" />}
            {snap.market ? <MarketTile market={snap.market} /> : <Missing label="Market totals" />}
          </>
        )}
      </div>
      <p className="mt-5 text-[12px] text-muted">
        {time ? `Updated ${time}. ` : ''}Data from CoinGecko and Alternative.me.
      </p>
    </Card>
  )
}

const Missing = ({ label }: { label: string }) => (
  <div>
    <p className="mb-2 text-[13px] text-muted">{label}</p>
    <p className="text-[14px] text-muted">Couldn't load this. Try the refresh button in a minute.</p>
  </div>
)

function Change({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return null
  return (
    <span className={cx('tabular-nums', value >= 0 ? 'text-income' : 'text-expense')}>
      {formatPct(value)} <span className="text-muted">{suffix}</span>
    </span>
  )
}

/** 0-100 on a fear-to-greed scale, with where it stood yesterday and a week ago */
function Sentiment({ fg }: { fg: FearGreed }) {
  const past = (n: number | null, when: string) => (n === null ? null : `${when} ${n}`)
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">Fear & Greed</p>
      <p className="font-display text-[28px] leading-[1.15] tabular-nums">{fg.value}</p>
      <p className="mb-3 text-[14px]">{fg.label}</p>
      <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--color-expense), var(--color-line-strong), var(--color-income))' }} role="img" aria-label={`${fg.value} out of 100, ${fg.label}`}>
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-ink" style={{ left: `${fg.value}%` }} />
      </div>
      <p className="mt-2.5 text-[12px] tabular-nums text-muted">{[past(fg.yesterday, 'Yesterday'), past(fg.lastWeek, 'Last week')].filter(Boolean).join(', ')}</p>
    </div>
  )
}

function CoinTile({ coin }: { coin: Coin }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[13px] text-muted">
        {coin.name} <span className="text-muted/80">{coin.symbol}</span>
      </p>
      <p className="font-display text-[28px] leading-[1.15] tabular-nums">{formatUsd(coin.usd)}</p>
      {coin.idr !== null && <p className="truncate text-[13px] tabular-nums text-muted">{formatIDR(coin.idr)}</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
        <Change value={coin.change24h} suffix="24h" />
        <Change value={coin.change7d} suffix="7d" />
      </p>
      <Sparkline prices={coin.spark} label={`${coin.name} price, last 7 days`} />
    </div>
  )
}

/** Seven days of hourly prices. Hover or drag to read a point. */
function Sparkline({ prices, label }: { prices: number[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (prices.length < 2) return null
  const W = 200
  const H = 40
  const min = Math.min(...prices)
  const span = Math.max(...prices) - min || 1
  const x = (i: number) => (i / (prices.length - 1)) * W
  const y = (p: number) => H - 3 - ((p - min) / span) * (H - 6)
  const line = prices.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(prices.length - 1, Math.round(((e.clientX - r.left) / r.width) * (prices.length - 1)))))
  }
  const hoursAgo = hover === null ? 0 : prices.length - 1 - hover
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-10 w-full touch-none" role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <p className="mt-1 text-[12px] tabular-nums text-muted">
        {hover === null ? 'Last 7 days' : `${formatUsd(prices[hover])}, ${hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`}`}
      </p>
    </div>
  )
}

function MarketTile({ market }: { market: Market }) {
  return (
    <div className="sm:col-span-2 lg:col-span-1">
      <p className="mb-2 text-[13px] text-muted">Whole market</p>
      <p className="font-display text-[28px] leading-[1.15] tabular-nums">{formatUsdCompact(market.capUsd)}</p>
      <p className="mt-1 text-[13px]">
        <Change value={market.capChange24h} suffix="24h" />
      </p>
      <p className="mt-3 text-[13px] text-muted">Bitcoin dominance</p>
      <p className="text-[16px] tabular-nums">{market.btcDominance.toFixed(1)}%</p>
    </div>
  )
}
