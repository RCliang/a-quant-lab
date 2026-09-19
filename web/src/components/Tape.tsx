// 顶部行情纸带：真实数据的一行式滚动行情（signature 元素）
import { useMemo } from 'react'
import { useJson, type KlineData, type KlineEntry, type CbSnapshot } from '../lib/loaders'

function lastPct(e: KlineEntry): number {
  const c = e.c
  const n = c.length
  if (n < 2) return 0
  const prev = c[n - 2] || 1
  return (c[n - 1] / prev - 1) * 100
}

export default function Tape() {
  const data = useJson<KlineData>('klines_daily.json')
  const cb = useJson<CbSnapshot>('cb_snapshot.json')

  const items = useMemo(() => {
    const out: { name: string; pct: number; info?: string }[] = []
    const picks = ['sh000001', 'sh000300', 'sz399006', 'sh510300', 'sz512100', 'sh512480',
      'sh512690', 'sz512880', 'sh518880', 'sh513100', 'sh000832', 'sh600519']
    if (data) {
      for (const code of picks) {
        const e = data[code] as KlineEntry | undefined
        if (e && e.c?.length) out.push({ name: e.name, pct: lastPct(e) })
      }
    }
    if (cb && cb.list?.length) {
      const priced = cb.list.filter((b) => b.price > 0)
      const low = [...priced].sort((a, b) => a.dl - b.dl)[0]
      const hi = [...priced.filter((b) => b.prem != null)].sort((a, b) => b.prem - a.prem)[0]
      if (low) out.push({ name: `双低王·${low.name}`, pct: 0, info: `双低 ${low.dl.toFixed(0)}` })
      if (hi) out.push({ name: `溢价王·${hi.name}`, pct: 0, info: `溢价 +${hi.prem.toFixed(0)}%` })
    }
    return out
  }, [data, cb])

  if (!items.length) return <div className="tape" aria-hidden="true" />
  const strip = (
    <span>
      {items.map((it, i) => (
        <span className="tape-item" key={i}>
          <b>{it.name}</b>{' '}
          {it.info != null
            ? <span style={{ color: '#e8c987' }}>{it.info}</span>
            : <span className={it.pct >= 0 ? 'tape-up' : 'tape-down'}>
                {it.pct >= 0 ? '▲' : '▼'} {Math.abs(it.pct).toFixed(2)}%
              </span>}
        </span>
      ))}
    </span>
  )
  return (
    <div className="tape" aria-hidden="true">
      <div className="tape-inner">{strip}{strip}</div>
    </div>
  )
}
