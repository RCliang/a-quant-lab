// 策略对比页：同一日历上叠加多个策略净值 + 回撤 + 指标表 + 月收益相关性
// 口径统一：全部用本站回测引擎的默认参数计算，费率可调
import { useMemo, useState } from 'react'
import { sma, macd, std, rollingMax, rollingMin, runSignalBacktest, runGrid, runRotation, type Bar } from '../lib/engine'
import { useJson, toBars, fmtPct, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { SECTOR_BASKET, SIZE_BASKET, DUAL_BASKET } from '../charts/RotationLab'
import { runQuadRotation } from '../charts/RrgLab'
import { Slider } from '../charts/IndicatorLab'

const LINE_COLORS = ['#e8c987', '#5b9bd5', '#c8402a', '#4fc39a', '#9d7bb8', '#54b4c4', '#e08b5a', '#8fae5d', '#d8dee6']

interface SeriesOut {
  key: string
  name: string
  color: string
  nav: number[]       // 与全局日期轴对齐
  metrics: { cagr: number; mdd: number; sharpe: number; total: number }
}

function metricsOf(nav: number[]): SeriesOut['metrics'] {
  const n = nav.length
  const years = n / 244
  const total = nav[n - 1] - 1
  const cagr = Math.pow(nav[n - 1], 1 / years) - 1
  let peak = nav[0], mdd = 0
  for (const v of nav) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1) }
  const rets: number[] = []
  for (let i = 1; i < n; i++) rets.push(nav[i] / nav[i - 1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1)
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1))
  const sharpe = sd > 0 ? (mean * 244) / (sd * Math.sqrt(244)) : 0
  return { cagr, mdd, sharpe, total }
}

// 单标的三种信号（与 IndicatorLab 同口径：T 收盘信号、T+1 开盘执行）
function signalStrategy(bars: Bar[], kind: 'sma' | 'donchian' | 'boll', feeBps: number): number[] {
  const closes = bars.map((b) => b.close)
  let sig: (i: number) => number
  if (kind === 'sma') {
    const f = sma(closes, 20), s = sma(closes, 60)
    sig = (i) => (f[i] != null && s[i] != null ? ((f[i] as number) > (s[i] as number) ? 1 : 0) : 0)
  } else if (kind === 'donchian') {
    const hh = rollingMax(closes, 20), ll = rollingMin(closes, 10)
    let held = false
    const raw = (i: number) => (hh[i] != null && closes[i] > (hh[i] as number) ? 1 : (ll[i] != null && closes[i] < (ll[i] as number) ? 0 : -1))
    sig = (i) => { const v = raw(i); if (v === 1) held = true; else if (v === 0) held = false; return held ? 1 : 0 }
  } else {
    const mid = sma(closes, 20), sd = std(closes, 20)
    const lower = mid.map((v, i) => (v != null && sd[i] != null ? v - 2 * (sd[i] as number) : null))
    let held = false
    const raw = (i: number) => {
      if (lower[i] == null || mid[i] == null) return 0
      if (closes[i] <= (lower[i] as number)) return 1
      if (closes[i] >= (mid[i] as number)) return 0
      return -1
    }
    sig = (i) => { const v = raw(i); if (v === 1) held = true; else if (v === 0) held = false; return held ? 1 : 0 }
  }
  return runSignalBacktest(bars, sig, { feeBps }).equity
}

function bollUnused() { return macd([]) } // 保持 import 副作用最小（macd 未用于对比，留待扩展）

export function ComparePage() {
  const data = useJson<KlineData>('klines_daily.json')
  const [feeBps, setFeeBps] = useState(10)
  const [disabled, setDisabled] = useState<Set<string>>(new Set())

  const out = useMemo(() => {
    if (!data) return null
    const bar300 = toBars(data['sh510300'] as KlineEntry)
    const mk = (code: string) => toBars(data[code] as KlineEntry)
    const asRotation = (codes: string[], lookback: number, holdN: number, rebalance: number, absFilter: boolean) => {
      const assets = codes
        .map((c) => { const e = data[c] as KlineEntry | undefined; return e ? { code: c, name: e.name, dates: e.d, close: e.c } : null })
        .filter(Boolean) as { code: string; name: string; dates: string[]; close: number[] }[]
      return runRotation(assets, { lookback, holdN, rebalance, absFilter, feeBps })
    }
    const rrg = (() => {
      const codes = SECTOR_BASKET
      const closeMap = new Map(codes.map((c) => [c, (data[c] as KlineEntry).c]))
      const dateIdx = new Map<string, number>()
      const dset = new Set<string>()
      codes.forEach((c) => { (data[c] as KlineEntry).d.forEach((d) => { dset.add(d); }) })
      const dates = [...dset].sort()
      dates.forEach((d, i) => dateIdx.set(d, i))
      const r = runQuadRotation(dates, rrgCompute(data, codes), closeMap, dateIdx, codes, 6, feeBps)
      return { ...r, dates }
    })()

    const raw: { key: string; name: string; dates: string[]; eq: number[] }[] = [
      { key: 'sma', name: '双均线 20/60', dates: bar300.map((b) => b.date), eq: signalStrategy(bar300, 'sma', feeBps) },
      { key: 'don', name: '唐奇安 20/10', dates: bar300.map((b) => b.date), eq: signalStrategy(bar300, 'donchian', feeBps) },
      { key: 'boll', name: '布林均值回归', dates: bar300.map((b) => b.date), eq: signalStrategy(bar300, 'boll', feeBps) },
      { key: 'grid', name: '网格 2.5%×20份', dates: bar300.map((b) => b.date), eq: (() => { const r = runGrid(bar300, { stepPct: 2.5, parts: 20, feeBps }); return r.equity })() },
      { key: 'mom', name: '行业ETF动量轮动', dates: asRotation(SECTOR_BASKET, 20, 3, 10, false).dates, eq: asRotation(SECTOR_BASKET, 20, 3, 10, false).equity },
      { key: 'size', name: '大小盘轮动(绝对动量)', dates: asRotation(SIZE_BASKET, 20, 1, 5, true).dates, eq: asRotation(SIZE_BASKET, 20, 1, 5, true).equity },
      { key: 'dual', name: '双动量多资产', dates: asRotation(DUAL_BASKET, 60, 3, 20, true).dates, eq: asRotation(DUAL_BASKET, 60, 3, 20, true).equity },
      { key: 'rrg', name: 'RRG 象限轮动', dates: rrg.dates, eq: rrg.eq },
      { key: 'bh', name: '沪深300ETF 买入持有', dates: bar300.map((b) => b.date), eq: bar300.map((b, i) => b.close / bar300[0].open) },
    ]
    void mk
    // 对齐全局日历（前向填充）
    const dset = new Set<string>()
    raw.forEach((r) => r.dates.forEach((d) => dset.add(d)))
    const dates = [...dset].sort()
    const series: SeriesOut[] = raw.map((r, i) => {
      const map = new Map<string, number>()
      r.dates.forEach((d, j) => map.set(d, r.eq[j]))
      const nav: number[] = []
      let last = 1
      for (const d of dates) { const v = map.get(d); if (v != null) last = v; nav.push(last) }
      return { key: r.key, name: r.name, color: LINE_COLORS[i % LINE_COLORS.length], nav, metrics: metricsOf(nav) }
    })
    // 月收益相关性
    const monthKey = (d: string) => d.slice(0, 7)
    const monthOf = series.map((s) => {
      const m = new Map<string, [number, number]>()
      s.nav.forEach((v, i) => {
        const k = monthKey(dates[i])
        const cur = m.get(k)
        if (!cur) m.set(k, [v, v]); else cur[1] = v
      })
      return { first: new Map([...m].map(([k, v]) => [k, v[0]])), last: new Map([...m].map(([k, v]) => [k, v[1]])) }
    })
    const months = [...new Set(dates.map(monthKey))].sort()
    const monthly = series.map((_, si) => months.map((mo) => {
      const f = monthOf[si].first.get(mo), l = monthOf[si].last.get(mo)
      return f && l && f > 0 ? l / f - 1 : null
    }))
    const corr: number[][] = monthly.map((a) => monthly.map((b) => {
      const pairs = months.map((_, i) => [a[i], b[i]]).filter((p): p is [number, number] => p[0] != null && p[1] != null)
      if (pairs.length < 12) return NaN
      const n = pairs.length
      const ma = pairs.reduce((s, p) => s + p[0], 0) / n
      const mb = pairs.reduce((s, p) => s + p[1], 0) / n
      let sab = 0, sa = 0, sb = 0
      pairs.forEach(([x, y]) => { sab += (x - ma) * (y - mb); sa += (x - ma) ** 2; sb += (y - mb) ** 2 })
      return sab / Math.sqrt(sa * sb)
    }))
    return { dates, series, corr }
  }, [data, feeBps])

  const visible = out ? out.series.filter((s) => !disabled.has(s.key)) : []

  const opt = useMemo(() => {
    if (!out || !visible.length) return null
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', ...tooltipStyle(), valueFormatter: (v: number) => (v * 100).toFixed(0) + '%' },
      legend: { top: 0, type: 'scroll' as const, textStyle: { color: TERM.text, fontSize: 11 }, pageTextStyle: { color: TERM.text } },
      grid: [
        { left: 56, right: 16, top: 46, height: '52%' },
        { left: 56, right: 16, top: '74%', height: '18%' },
      ],
      xAxis: [
        { type: 'category', data: out.dates, gridIndex: 0, ...baseAxis(), axisLabel: { show: false } },
        { type: 'category', data: out.dates, gridIndex: 1, ...baseAxis() },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, ...baseAxis(), axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => (v * 100).toFixed(0) + '%' } },
        { type: 'value', gridIndex: 1, ...baseAxis(), axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => (v * 100).toFixed(0) + '%' } },
      ],
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', xAxisIndex: [0, 1], bottom: 2, height: 15, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } }],
      series: [
        ...visible.map((s) => ({
          name: s.name, type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: s.nav, symbol: 'none',
          lineStyle: { width: s.key === 'bh' ? 1 : 1.5, color: s.color, type: s.key === 'bh' ? ('dashed' as const) : ('solid' as const) },
          itemStyle: { color: s.color },
        })),
        ...visible.map((s) => {
          let peak = s.nav[0]
          const dd = s.nav.map((v) => { peak = Math.max(peak, v); return +(v / peak - 1).toFixed(4) })
          return { name: s.name, type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: dd, symbol: 'none', lineStyle: { width: 1, color: s.color }, itemStyle: { color: s.color } }
        }),
      ],
    }
  }, [out, visible])

  const { hostRef } = useChart(() => opt as never, [opt])

  if (!out) return <div className="terminal"><div className="chart-host tall" /></div>
  return (
    <>
      <div className="page-head">
        <div className="crumb">OVERVIEW · COMPARE</div>
        <h1>策略对比</h1>
        <p className="oneline">
          同一日历、同一费率、同一引擎口径下叠加 9 条曲线：谁涨得稳、谁回撤深、谁和谁其实是一回事。
          每个策略按其策略页的默认参数计算（点击图例可隐藏/显示曲线）。
        </p>
      </div>

      <section className="section" style={{ marginTop: 4 }}>
        <div className="terminal">
          <div className="panel-controls">
            <Slider label="统一单边费率" value={feeBps} min={0} max={30} step={1} onChange={setFeeBps} unit="‱" />
            <div className="ctrl" style={{ minWidth: 200 }}>
              <label>参与对比的策略（点击切换）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                {out.series.map((s) => (
                  <label key={s.key} className="toggle" style={{ fontSize: 11.5 }}>
                    <input type="checkbox" checked={!disabled.has(s.key)}
                      onChange={(e) => {
                        const next = new Set(disabled)
                        if (e.target.checked) next.delete(s.key); else next.add(s.key)
                        setDisabled(next)
                      }} />
                    <span style={{ color: s.color, fontFamily: 'var(--font-mono)' }}>■</span>{s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div ref={hostRef} className="chart-host tall" />
        </div>
      </section>

      <section className="section">
        <h2><span className="secno">01</span>绩效指标（区间：2018-01 至今）</h2>
        <table className="tbl">
          <thead><tr><th>策略</th><th>总收益</th><th>年化</th><th>最大回撤</th><th>夏普</th></tr></thead>
          <tbody>
            {[...visible].sort((a, b) => b.metrics.cagr - a.metrics.cagr).map((s) => (
              <tr key={s.key}>
                <td><span style={{ color: s.color, fontFamily: 'var(--font-mono)' }}>■</span> {s.name}</td>
                <td className="mono" style={{ color: s.metrics.total >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(s.metrics.total, 0)}</td>
                <td className="mono" style={{ color: s.metrics.cagr >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(s.metrics.cagr, 1)}</td>
                <td className="mono" style={{ color: 'var(--down)' }}>{fmtPct(s.metrics.mdd, 1)}</td>
                <td className="mono">{s.metrics.sharpe.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2><span className="secno">02</span>月收益相关性（越红越同涨同跌）</h2>
        <div className="callout warn" style={{ marginTop: 0 }}>
          相关性高的策略放在一起起不到分散作用。动量轮动系（行业轮动 / 大小盘 / 双动量 / RRG）彼此相关性通常偏高——它们的底层都是"追强势"，只是挑选口径不同。
        </div>
        <table className="tbl" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr><th style={{ width: 130 }}>策略</th>{visible.map((s) => <th key={s.key} style={{ fontSize: 11 }}>{s.name}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((s, i) => (
              <tr key={s.key}>
                <td>{s.name}</td>
                {visible.map((t, j) => {
                  const v = out.corr[out.series.findIndex((x) => x.key === s.key)][out.series.findIndex((x) => x.key === t.key)]
                  const alpha = isNaN(v) ? 0 : Math.min(Math.abs(v), 1)
                  const bg = i === j ? 'var(--paper-2)' : (v >= 0 ? `rgba(200,64,42,${alpha * 0.55})` : `rgba(14,122,85,${alpha * 0.55})`)
                  return <td key={t.key} className="mono" style={{ background: bg, color: Math.abs(v) > 0.55 && i !== j ? '#fff' : 'inherit', textAlign: 'center' }}>{v.toFixed(2)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

// RRG 指标计算（与 RrgLab 内部实现一致）
function rrgCompute(data: KlineData, codes: string[]) {
  const closeMap = new Map<string, number[]>()
  const dateIdx = new Map<string, number>()
  const dset = new Set<string>()
  codes.forEach((c) => {
    const e = data[c] as KlineEntry
    closeMap.set(c, e.c)
    e.d.forEach((d, i) => { dset.add(d); dateIdx.set(d, i) })
  })
  const dates = [...dset].sort()
  const T = dates.length
  const N = 220, M = 60, S = 20
  const bench = new Array(T).fill(1)
  {
    let v = 1
    for (let t = 1; t < T; t++) {
      let r = 0, c = 0
      for (const code of codes) {
        const px = closeMap.get(code)!
        const i = dateIdx.get(dates[t]) as number, i0 = dateIdx.get(dates[t - 1]) as number
        const p1 = px[i], p0 = px[i0]
        if (p0 != null && p1 != null && p0 > 0) { r += p1 / p0 - 1; c++ }
      }
      v *= 1 + (c ? r / c : 0)
      bench[t] = v
    }
  }
  const smaArr = (xs: (number | null)[], n: number) => {
    const o: (number | null)[] = []
    for (let i = 0; i < xs.length; i++) {
      if (i < n - 1) { o.push(null); continue }
      let s = 0, c = 0
      for (let j = i - n + 1; j <= i; j++) { const v = xs[j]; if (v != null) { s += v; c++ } }
      o.push(c === n ? s / n : null)
    }
    return o
  }
  const rrg: Record<string, ({ quad: number; dist: number } | null)[]> = {}
  for (const code of codes) {
    const px = closeMap.get(code)!
    const rs: (number | null)[] = dates.map((d, t) => {
      const p = px[dateIdx.get(d) as number]
      return p != null && bench[t] > 0 ? (p / bench[t]) * 100 : null
    })
    const ratioRaw: (number | null)[] = rs.map((v, t) =>
      t >= N && v != null && rs[t - N] != null && (rs[t - N] as number) > 0 ? (v / (rs[t - N] as number)) * 100 : null)
    const ratio = smaArr(ratioRaw, S)
    const momRaw: (number | null)[] = ratio.map((v, t) =>
      t >= M && v != null && ratio[t - M] != null && (ratio[t - M] as number) > 0 ? (v / (ratio[t - M] as number)) * 100 : null)
    const mom = smaArr(momRaw, S)
    rrg[code] = dates.map((d, t) => {
      const r = ratio[t], m = mom[t]
      if (r == null || m == null) return null
      const quad = r > 100 ? (m > 100 ? 1 : 4) : (m > 100 ? 2 : 3)
      return { quad, dist: Math.hypot(r - 100, m - 100) }
    })
  }
  return rrg
}
