// 数据新鲜度标识：显示行情/转债/情绪三份数据的截至日期与抓取日期
import { useJson, type KlineData } from '../lib/loaders'
import type { CbSnapshot, EmotionData } from '../lib/loaders'

function freshnessOf(dataDate: string, fetched?: string): { label: string; stale: boolean } {
  const today = new Date()
  const d = new Date(dataDate + 'T00:00:00')
  const days = Math.floor((today.getTime() - d.getTime()) / 86400000)
  // 周末不计为过期：周一看到周五数据是正常的
  const day = today.getDay()
  const expected = day === 0 ? 2 : day === 6 ? 1 : day === 1 ? 3 : 1
  return { label: days === 0 ? '今日' : `${days}天前`, stale: days > expected }
}

export default function DataFresh() {
  const klines = useJson<KlineData>('klines_daily.json')
  const cb = useJson<CbSnapshot>('cb_snapshot.json')
  const emotion = useJson<EmotionData>('emotion.json')
  if (!klines || !klines.meta) return null
  const items: { name: string; date: string; fetched?: string }[] = []
  const kEnd = (klines.meta as Record<string, string>).end
  const kFetched = (klines.meta as Record<string, string>).fetched
  if (kEnd) items.push({ name: '行情K线', date: kEnd, fetched: kFetched })
  if (cb?.fetched && cb.list?.length) items.push({ name: '转债快照', date: cb.fetched, fetched: cb.fetched })
  if (emotion?.bk?.length) items.push({ name: '情绪数据', date: emotion.bk[emotion.bk.length - 1].date, fetched: emotion.fetched })
  const latest = items.length ? items.reduce((a, b) => (a.date > b.date ? a : b)) : null
  if (!latest) return null
  const f = freshnessOf(latest.date)
  return (
    <div className="data-fresh" style={{
      marginTop: 26, padding: '9px 14px', borderRadius: 8,
      background: f.stale ? 'var(--up-soft)' : 'var(--paper-2)',
      border: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink-2)',
      display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline',
    }}>
      <b style={{ color: f.stale ? 'var(--up)' : 'var(--ink)' }}>
        数据截至 {latest.date}
      </b>
      {items.map((it) => (
        <span key={it.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
          {it.name} · {it.date}{it.fetched ? `（抓取于 ${it.fetched}）` : ''}
        </span>
      ))}
      <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
        工作日 18:00 自动更新 · 手动更新：python3 scripts/fetch_data.py all
      </span>
    </div>
  )
}
