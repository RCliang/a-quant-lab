// 可转债低价轮动回测：真实日K历史（2023 起，含期间退市券）
import { useMemo, useState } from 'react'
import { calcMetrics, type Metrics } from '../lib/engine'
import { useJson, type CbPriceHist } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'

interface Bond {
  code: string; name: string
  map: Map<string, number>   // date → close
}

interface RotResult {
  dates: string[]
  equity: number[]
  bench: number[]
  metrics: Metrics
  lastHold: string[]
}

function runCbRotation(
  hist: CbPriceHist,
  holdN: number, rebalance: number, priceMin: number, priceMax: number, feeBps: number,
): RotResult | null {
  const axis = hist.axis
  const bonds: Bond[] = Object.entries(hist.series).map(([code, s]) => {
    const map = new Map<string, number>()
    s.d.forEach((d, i) => map.set(d, s.c[i]))
    return { code, name: s.name, map }
  })
  const byCode = new Map(bonds.map((b) => [b.code, b]))
  const pxAt = (b: Bond, t: number) => b.map.get(axis[t]) ?? null
  const weights = new Map<string, number>()
  let equity = 1
  const eq: number[] = []
  let lastReb = -1
  const lastHold: string[] = []
  const fee = feeBps / 10000
  for (let t = 0; t < axis.length; t++) {
    if (t > 0) {
      for (const [code, w] of weights) {
        if (w <= 0) continue
        const b = byCode.get(code)
        if (!b) continue
        const p0 = pxAt(b, t - 1), p1 = pxAt(b, t)
        if (p0 != null && p1 != null) equity *= 1 + w * (p1 / p0 - 1)
        // p1 缺失 = 当日退市/停牌：该部分净值原地冻结，调仓时自然清理
      }
    }
    if (t - lastReb >= rebalance && t >= 20) {
      const ranked = bonds
        .map((b) => ({ b, px: pxAt(b, t) }))
        .filter((x) => x.px != null && x.px >= priceMin && x.px <= priceMax)
        .sort((a, c) => (a.px as number) - (c.px as number))
        .slice(0, holdN)
      const newW = new Map<string, number>()
      ranked.forEach((x) => newW.set(x.b.code, 1 / Math.max(ranked.length, 1)))
      const all = new Set([...weights.keys(), ...newW.keys()])
      let turn = 0
      all.forEach((k) => { turn += Math.abs((newW.get(k) ?? 0) - (weights.get(k) ?? 0)) })
      equity *= 1 - (turn / 2) * fee * 2
      weights.clear()
      newW.forEach((v, k) => weights.set(k, v))
      lastReb = t
      lastHold.length = 0
      ranked.forEach((x) => lastHold.push(`${x.b.name}(${x.px!.toFixed(1)})`))
    }
    eq.push(equity)
  }
  if (eq.length < 50) return null
  const benchEq = hist.bench.map((v) => v / hist.bench[0])
  const metrics = calcMetrics(eq, benchEq, axis, [], new Array(eq.length).fill(1))
  return { dates: axis, equity: eq, bench: benchEq, metrics, lastHold }
}

export function CbRotationLab() {
  const hist = useJson<CbPriceHist>('cb_price_hist.json')
  const [holdN, setHoldN] = useState(10)
  const [rebalance, setRebalance] = useState(5)
  const [priceMin, setPriceMin] = useState(100)
  const [priceMax, setPriceMax] = useState(150)
  const [feeBps, setFeeBps] = useState(15)

  const res = useMemo(() => {
    if (!hist) return null
    return runCbRotation(hist, holdN, rebalance, priceMin, priceMax, feeBps)
  }, [hist, holdN, rebalance, priceMin, priceMax, feeBps])

  const opt = useMemo(() => {
    if (!res) return null
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', ...tooltipStyle(), valueFormatter: (v: number) => (v * 100).toFixed(1) + '%' },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      grid: { left: 56, right: 16, top: 30, bottom: 44 },
      xAxis: { type: 'category', data: res.dates, ...baseAxis() },
      yAxis: { type: 'value', scale: true, ...baseAxis(), axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => (v * 100).toFixed(0) + '%' } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 6, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } }],
      series: [
        { name: '低价轮动', type: 'line', data: res.equity, symbol: 'none', lineStyle: { width: 1.6, color: TERM.brass } },
        { name: '中证转债', type: 'line', data: res.bench, symbol: 'none', lineStyle: { width: 1, color: TERM.text, type: 'dashed' } },
      ],
    }
  }, [res])
  const { hostRef } = useChart(() => opt as never, [opt])

  return (
    <div className="terminal">
      <div className="panel-controls">
        <Slider label="持有只数" value={holdN} min={5} max={30} step={1} onChange={setHoldN} unit="只" />
        <Slider label="调仓间隔" value={rebalance} min={5} max={40} step={1} onChange={setRebalance} unit="日" />
        <Slider label="价格下限" value={priceMin} min={60} max={120} step={1} onChange={setPriceMin} unit="元" />
        <Slider label="价格上限" value={priceMax} min={100} max={200} step={5} onChange={setPriceMax} unit="元" />
        <Slider label="单边费率" value={feeBps} min={0} max={50} step={5} onChange={setFeeBps} unit="‱" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      {res && (
        <div className="metrics">
          <Metric label="策略年化" v={res.metrics.cagr} />
          <Metric label="中证转债年化" v={res.metrics.benchCagr} />
          <Metric label="最大回撤" v={res.metrics.maxDD} />
          <Metric label="基准回撤" v={res.metrics.benchMaxDD} />
          <Metric label="夏普" v={res.metrics.sharpe} raw digits={2} />
          <Metric label="总收益" v={res.metrics.totalRet} />
          <div className="metric"><span>当前持仓名单</span>
            <b style={{ fontSize: 11.5, fontFamily: 'var(--font-body)', fontWeight: 400 }}>
              {res.lastHold.length ? res.lastHold.slice(0, 6).join(' · ') + (res.lastHold.length > 6 ? ' …' : '') : '—'}
            </b>
          </div>
        </div>
      )}
      <div style={{ padding: '0 14px 12px', color: '#7d8ea1', fontSize: 11.5 }}>
        宇宙：上市≤2022-07-01 且未在窗口前退市的全部转债（含期间退市券，缓解幸存者偏差；价格序列按退市日截断，代码复用段已剔除）。策略按价格最低 N 只等权轮动，未含溢价率历史（公开源缺失），双低版请结合上方散点理解。
      </div>
    </div>
  )
}
