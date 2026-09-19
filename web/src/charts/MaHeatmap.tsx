// 参数热力图 + 样本外验证：双均线 快线×慢线 网格扫描，三联热力图共享色标
// 教学点：样本内最优参数在样本外通常衰减——"过拟合不可见"在这里变得可见
import { useMemo, useState } from 'react'
import { useJson, toBars, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis } from '../lib/echart'
import { sma } from '../lib/engine'
import type { Bar } from '../lib/engine'

const UNIVERSE = [
  { code: 'sh510300', label: '沪深300ETF' },
  { code: 'sz159915', label: '创业板ETF' },
  { code: 'sh600519', label: '贵州茅台' },
  { code: 'sz512100', label: '中证1000ETF' },
]
const FASTS = [5, 10, 15, 20, 25, 30, 40, 50, 60]
const SLOWS = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240]
const FEE = 10 / 10000

// 在 [lo, hi) 窗口内按信号（快>慢 持有）计算期末净值（指标可用窗口前历史，T+1 开盘执行）
function windowNav(bars: Bar[], fastMa: (number | null)[], slowMa: (number | null)[], lo: number, hi: number): number {
  let units = 0, cash = 1
  for (let i = lo + 1; i < hi; i++) {
    const f = fastMa[i - 1], s = slowMa[i - 1]
    const target = f != null && s != null && f > s ? 1 : 0
    const px = bars[i].open
    const prevPx = bars[i - 1].close
    const curW = units * prevPx / (cash + units * prevPx || 1)
    if (target !== curW) {
      const totalV = cash + units * px
      const turn = Math.abs(target - curW) * totalV
      cash = totalV * (1 - target) - turn * FEE
      units = (totalV * target - turn * FEE) / px
    }
  }
  return cash + units * bars[hi - 1].close
}

interface Cell { f: number; s: number; full: number; is: number; oos: number }

export function MaHeatmap() {
  const data = useJson<KlineData>('klines_daily.json')
  const [code, setCode] = useState('sh510300')

  const result = useMemo(() => {
    if (!data) return null
    const e = data[code] as KlineEntry | undefined
    if (!e) return null
    const bars = toBars(e)
    if (bars.length < 400) return null
    const closes = bars.map((b) => b.close)
    const fastMa = new Map<number, (number | null)[]>(FASTS.map((f) => [f, sma(closes, f)]))
    const slowMa = new Map<number, (number | null)[]>(SLOWS.map((s) => [s, sma(closes, s)]))
    const T = bars.length
    const split = Math.floor(T * 0.7)
    const cells: Cell[] = []
    for (const f of FASTS) {
      for (const s of SLOWS) {
        if (s <= f) continue
        const fm = fastMa.get(f)!, sm = slowMa.get(s)!
        const yearsFull = (T - s) / 244
        const yearsIs = (split - s) / 244
        const yearsOos = (T - split) / 244
        cells.push({
          f, s,
          full: Math.pow(windowNav(bars, fm, sm, s, T), 1 / yearsFull) - 1,
          is: Math.pow(windowNav(bars, fm, sm, s, split), 1 / yearsIs) - 1,
          oos: Math.pow(windowNav(bars, fm, sm, split, T), 1 / yearsOos) - 1,
        })
      }
    }
    const isSorted = [...cells].sort((a, b) => b.is - a.is)
    const bestIs = isSorted[0]
    const oosSorted = [...cells].sort((a, b) => b.oos - a.oos)
    const bestOos = oosSorted[0]
    const bestIsOosRank = oosSorted.findIndex((c) => c.f === bestIs.f && c.s === bestIs.s) + 1
    const cur = cells.find((c) => c.f === 20 && c.s === 60)
    return { cells, bestIs, bestOos, bestIsOosRank, cur, split, splitDate: bars[split].date }
  }, [data, code])

  const opt = useMemo(() => {
    if (!result) return null
    const { cells, cur } = result
    let lo = Infinity, hi = -Infinity
    cells.forEach((c) => { lo = Math.min(lo, c.full, c.is, c.oos); hi = Math.max(hi, c.full, c.is, c.oos) })
    const mkData = (key: 'full' | 'is' | 'oos') => cells.map((c) => [FASTS.indexOf(c.f), SLOWS.indexOf(c.s), +(c[key] * 100).toFixed(2)])
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: '#16273a', borderColor: '#25384e', textStyle: { color: '#e8edf3', fontSize: 12 },
        formatter: (p: { data: [number, number, number] }) =>
          `快线 ${FASTS[p.data[0]]} / 慢线 ${SLOWS[p.data[1]]}<br/>年化 <b>${p.data[2].toFixed(1)}%</b>`,
      },
      visualMap: {
        min: +(lo * 100).toFixed(1), max: +(hi * 100).toFixed(1), calculable: false,
        orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 90, itemWidth: 12,
        textStyle: { color: TERM.text, fontSize: 10 },
        formatter: (v: number) => v.toFixed(0) + '%',
        inRange: { color: ['#0e7a55', '#7a8377', '#c8402a'] },
      },
      grid: [
        { left: 58, top: 40, width: '24%', height: '56%' },
        { left: '38.5%', top: 40, width: '24%', height: '56%' },
        { left: '69%', top: 40, width: '24%', height: '56%' },
      ],
      xAxis: [0, 1, 2].map((g) => ({
        type: 'category', data: FASTS.map(String), gridIndex: g,
        name: '快线周期', nameLocation: 'middle', nameGap: 22,
        ...baseAxis(), splitArea: { show: true },
      })),
      yAxis: [0, 1, 2].map((g) => ({
        type: 'category', data: SLOWS.map(String), gridIndex: g,
        name: '慢线', ...baseAxis(), splitArea: { show: true },
      })),
      title: [
        { text: '全样本年化', left: '11%', top: 8, textStyle: { color: TERM.textStrong, fontSize: 12 } },
        { text: `样本内（前70% · 至 ${result.splitDate}）`, left: '42%', top: 8, textStyle: { color: TERM.textStrong, fontSize: 12 } },
        { text: '样本外（后30%）', left: '74%', top: 8, textStyle: { color: TERM.textStrong, fontSize: 12 } },
      ],
      series: (['full', 'is', 'oos'] as const).map((key, g) => ({
        name: key, type: 'heatmap', xAxisIndex: g, yAxisIndex: g,
        data: mkData(key), label: { show: false },
        itemStyle: { borderColor: '#101d2b', borderWidth: 1 },
        markPoint: g === 0 && cur ? {
          symbol: 'rect', symbolSize: [36, 20],
          itemStyle: { color: 'transparent', borderColor: '#e8c987', borderWidth: 2 },
          data: [{ coord: [FASTS.indexOf(20), SLOWS.indexOf(60)] }],
          label: { show: false },
        } : undefined,
      })),
    }
  }, [result])
  const { hostRef } = useChart(() => opt as never, [opt])

  if (!result) return <div className="terminal"><div className="chart-host" style={{ height: 300 }} /></div>
  const { bestIs, bestOos, bestIsOosRank } = result
  const decay = bestIs.oos - bestIs.is
  return (
    <div className="terminal" style={{ marginTop: 14 }}>
      <div className="terminal-head">
        <span className="t">参数热力图 · 双均线 快线×慢线 网格扫描（99 组合 · 单边费率万10 · T+1 开盘执行）</span>
        <span className="d">三张图共用同一色标：样本内的颜色在样本外还在吗？</span>
      </div>
      <div className="panel-controls">
        <div className="ctrl">
          <label>标的</label>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {UNIVERSE.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </div>
      </div>
      <div ref={hostRef} className="chart-host" style={{ height: 380 }} />
      <div style={{ padding: '4px 14px 14px' }}>
        <div className="callout" style={{ marginTop: 0 }}>
          <b>样本外验证：</b>样本内最优参数 <b>{bestIs.f}/{bestIs.s}</b>
          （样本内年化 {(bestIs.is * 100).toFixed(1)}%）→ 样本外年化 <b>{(bestIs.oos * 100).toFixed(1)}%</b>
          ，在全部 99 组参数中排第 <b>{bestIsOosRank}</b> 名（样本外真正最优是 {bestOos.f}/{bestOos.s}，年化 {(bestOos.oos * 100).toFixed(1)}%）。
          样本内→样本外变化 <b>{decay >= 0 ? '+' : ''}{(decay * 100).toFixed(1)} 个百分点</b>。
          {decay < -0.03 ? '—— 这就是过拟合的样子：样本内的"最优"在样本外明显退化。' : '—— 本样本衰减有限，换个标的或再切一刀试试。'}
        </div>
        <div style={{ color: '#7d8ea1', fontSize: 12 }}>
          金框标出上方主实验室默认的 20/60 组合。同一色标下，直接对比三张图同格颜色：颜色跨越红绿两端的参数最不稳健。
        </div>
      </div>
    </div>
  )
}
