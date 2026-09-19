// RRG 相对旋转图实验室：RS-Ratio × RS-Momentum 四象限散点（含旋转轨迹）+ 象限轮动回测
// 方法口径：西部证券《相对旋转图RRG框架下的行业研究》(2026-05)，复现自 QuantsPlaybook
import { useMemo, useState } from 'react'
import { useJson, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'
import { SECTOR_BASKET } from './RotationLab'
import type { Metrics } from '../lib/engine'

const QUAD_NAME: Record<number, string> = { 1: '领先', 2: '改善', 3: '滞后', 4: '疲软' }
const QUAD_COLOR: Record<number, string> = { 1: TERM.up, 2: TERM.brass, 3: '#41586f', 4: TERM.cyan }

function smaArr(xs: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < xs.length; i++) {
    if (i < n - 1) { out.push(null); continue }
    let s = 0, c = 0
    for (let j = i - n + 1; j <= i; j++) { const v = xs[j]; if (v != null) { s += v; c++ } }
    out.push(c === n ? s / n : null)
  }
  return out
}

interface QuadInfo { quad: number; dist: number }
type RrgPoint = QuadInfo & { date: string; ratio: number; mom: number }

function computeRRG(
  dates: string[], closeMap: Map<string, number[]>, dateIdx: Map<string, number>,
  N: number, M: number, S: number, codes: string[],
) {
  const T = dates.length
  // 等权基准（行业等权指数）：每日各 ETF 收益均值
  const bench = new Array(T).fill(1)
  {
    let bv = 1
    for (let t = 1; t < T; t++) {
      let r = 0, c = 0
      for (const code of codes) {
        const px = closeMap.get(code)!
        const i = dateIdx.get(dates[t]) as number, i0 = dateIdx.get(dates[t - 1]) as number
        const p1 = px[i], p0 = px[i0]
        if (p0 != null && p1 != null && p0 > 0) { r += p1 / p0 - 1; c++ }
      }
      bv *= 1 + (c ? r / c : 0)
      bench[t] = bv
    }
  }
  const result: Record<string, (RrgPoint | null)[]> = {}
  for (const code of codes) {
    const px = closeMap.get(code)!
    const rs: (number | null)[] = dates.map((d, t) => {
      const p = px[dateIdx.get(d) as number]
      return p != null && bench[t] > 0 ? (p / bench[t]) * 100 : null
    })
    // RS-Ratio = MA_S( 100 × RS_t / RS_{t-N} )
    const ratioRaw: (number | null)[] = rs.map((v, t) =>
      t >= N && v != null && rs[t - N] != null && (rs[t - N] as number) > 0 ? (v / (rs[t - N] as number)) * 100 : null)
    const ratio = smaArr(ratioRaw, S)
    // RS-Momentum = MA_S( 100 × RS-Ratio_t / RS-Ratio_{t-M} )
    const momRaw: (number | null)[] = ratio.map((v, t) =>
      t >= M && v != null && ratio[t - M] != null && (ratio[t - M] as number) > 0 ? (v / (ratio[t - M] as number)) * 100 : null)
    const mom = smaArr(momRaw, S)
    result[code] = dates.map((d, t) => {
      const r = ratio[t], m = mom[t]
      if (r == null || m == null) return null
      const quad = r > 100 ? (m > 100 ? 1 : 4) : (m > 100 ? 2 : 3)
      return { date: d, ratio: r, mom: m, quad, dist: Math.hypot(r - 100, m - 100) }
    })
  }
  return result
}

export function runQuadRotation(
  dates: string[], rrg: Record<string, (QuadInfo | null)[]>, closeMap: Map<string, number[]>,
  dateIdx: Map<string, number>, codes: string[], maxN: number, feeBps: number,
) {
  // 月末调仓：每个自然月最后一个交易日，用当日象限选下月持仓（1+2象限，超 maxN 取距中心最远）
  const monthLast = new Map<string, number>()
  dates.forEach((d, t) => {
    const ym = d.slice(0, 7)
    monthLast.set(ym, t)
  })
  const rebDays = [...monthLast.values()].sort((a, b) => a - b).filter((t) => t >= 0)
  const fee = feeBps / 10000
  let equity = 1
  let w: Record<string, number> = {}
  const eq: number[] = []
  const benchArr: number[] = []
  let benchV = 1
  let lastReb = -1
  const holdLog: { date: string; names: string[] }[] = []
  const nameOf: Record<string, string> = {}
  for (let t = 0; t < dates.length; t++) {
    if (t > 0) {
      let r = 0, c = 0, br = 0, bc = 0
      for (const code of codes) {
        const px = closeMap.get(code)!
        const i = dateIdx.get(dates[t]) as number, i0 = dateIdx.get(dates[t - 1]) as number
        const p1 = px[i], p0 = px[i0]
        if (p0 != null && p1 != null && p0 > 0) {
          br += p1 / p0 - 1; bc++
          if (w[code]) { r += w[code] * (p1 / p0 - 1); c += w[code] }
        }
      }
      equity *= 1 + (c > 0 ? r / c : 0)
      benchV *= 1 + (bc ? br / bc : 0)
    }
    if (rebDays.includes(t) && t !== lastReb) {
      const picked = codes
        .map((code) => ({ code, p: rrg[code]?.[t] }))
        .filter((x) => x.p && (x.p.quad === 1 || x.p.quad === 2))
        .sort((a, b) => (b.p as RrgPoint).dist - (a.p as RrgPoint).dist)
        .slice(0, maxN)
      const nw: Record<string, number> = {}
      picked.forEach((x) => { nw[x.code] = 1 / Math.max(picked.length, 1) })
      let turn = 0
      for (const code of codes) turn += Math.abs((nw[code] ?? 0) - (w[code] ?? 0))
      equity *= 1 - (turn / 2) * fee * 2
      w = nw
      lastReb = t
      holdLog.push({ date: dates[t], names: picked.map((x) => x.code) })
    }
    eq.push(equity)
    benchArr.push(benchV)
  }
  void nameOf
  // 绩效
  const n = eq.length
  const years = n / 244
  const cagr = Math.pow(eq[n - 1], 1 / years) - 1
  const benchCagr = Math.pow(benchArr[n - 1], 1 / years) - 1
  let peak = eq[0], mdd = 0
  for (const v of eq) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1) }
  let bp = benchArr[0], bmdd = 0
  for (const v of benchArr) { bp = Math.max(bp, v); bmdd = Math.min(bmdd, v / bp - 1) }
  const rets: number[] = []
  for (let i = 1; i < n; i++) rets.push(eq[i] / eq[i - 1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1)
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1))
  const sharpe = sd > 0 ? (mean * 244) / (sd * Math.sqrt(244)) : 0
  const metrics = { cagr, benchCagr, maxDD: mdd, benchMaxDD: bmdd, sharpe } as Metrics
  return { eq, bench: benchArr, metrics, holdLog }
}

export function RrgLab() {
  const data = useJson<KlineData>('klines_daily.json')
  const [N, setN] = useState(220)
  const [M, setM] = useState(60)
  const [S, setS] = useState(20)
  const [maxN, setMaxN] = useState(6)
  const [feeBps, setFeeBps] = useState(3)
  const [cursor, setCursor] = useState(1) // 0..1 比例位置，避免依赖数据长度

  const prepared = useMemo(() => {
    if (!data) return null
    const codes: string[] = []
    const nameOf: Record<string, string> = {}
    const closeMap = new Map<string, number[]>()
    const dateIdxMap = new Map<string, number>()
    for (const code of SECTOR_BASKET) {
      const e = data[code] as KlineEntry | undefined
      if (!e) continue
      codes.push(code); nameOf[code] = e.name; closeMap.set(code, e.c)
      e.d.forEach((d, i) => dateIdxMap.set(d, i))
    }
    const dateSet = new Set<string>()
    codes.forEach((c) => { const e = data[c] as KlineEntry; e.d.forEach((d) => dateSet.add(d)) })
    const dates = [...dateSet].sort()
    if (dates.length < N + M + S + 10) return null
    const rrg = computeRRG(dates, closeMap, dateIdxMap, N, M, S, codes)
    const bt = runQuadRotation(dates, rrg, closeMap, dateIdxMap, codes, maxN, feeBps)
    return { dates, rrg, bt, nameOf, codes }
  }, [data, N, M, S, maxN, feeBps])

  const idx = prepared ? Math.min(prepared.dates.length - 1, Math.max(0, Math.round(cursor * (prepared.dates.length - 1)))) : 0

  const scatterOpt = useMemo(() => {
    if (!prepared) return null
    const { dates, rrg, nameOf } = prepared
    const trailLen = 60
    const series: object[] = []
    // 轨迹线
    for (const code of prepared.codes) {
      const seg = (rrg[code] ?? []).slice(Math.max(0, idx - trailLen), idx + 1)
        .filter((p): p is RrgPoint => p != null)
      if (seg.length < 2) continue
      series.push({
        type: 'line', silent: true, data: seg.map((p) => [p.ratio, p.mom]),
        lineStyle: { width: 1, color: QUAD_COLOR[seg[seg.length - 1].quad], opacity: 0.4 },
        symbol: 'none', z: 1,
      })
    }
    // 当前点
    const pts = prepared.codes.map((code) => {
      const p = rrg[code]?.[idx]
      return p ? { value: [p.ratio, p.mom], name: code, quad: p.quad, dist: p.dist } : null
    }).filter(Boolean) as { value: number[]; name: string; quad: number; dist: number }[]
    // 动态轴范围：包含全部轨迹与当前点，中心 100 必须在图内
    let lo = 100, hi = 100
    for (const code of prepared.codes) {
      for (const p of (rrg[code] ?? []).slice(Math.max(0, idx - 250), idx + 1)) {
        if (!p) continue
        lo = Math.min(lo, p.ratio, p.mom); hi = Math.max(hi, p.ratio, p.mom)
      }
    }
    const pad = Math.max(4, (hi - lo) * 0.08)
    const xMin = Math.min(100, lo - pad), xMax = Math.max(100, hi + pad)
    series.push({
      type: 'scatter', data: pts, z: 3, symbolSize: 14,
      itemStyle: { color: (p: { data: { quad: number } }) => QUAD_COLOR[p.data.quad] },
      label: { show: true, formatter: (p: { data: { name: string } }) => nameOf[p.data.name] ?? '', position: 'right', color: '#cfd9e4', fontSize: 10 },
    })
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: { ...tooltipStyle(), formatter: (p: { data: { name: string; value: number[]; quad: number; dist: number } }) =>
        `<b>${prepared.nameOf[p.data.name] ?? ''}</b>（${p.data.name}）<br/>RS-Ratio ${p.data.value[0].toFixed(1)} · RS-Mom ${p.data.value[1].toFixed(1)}<br/>象限：${QUAD_NAME[p.data.quad]} · 距中心 ${p.data.dist.toFixed(1)}` },
      grid: { left: 52, right: 24, top: 30, bottom: 44 },
      xAxis: { type: 'value', name: 'RS-Ratio', min: xMin, max: xMax, ...baseAxis(), nameTextStyle: { color: TERM.text }, splitLine: { lineStyle: { color: TERM.splitLine } } },
      yAxis: { type: 'value', name: 'RS-Mom', min: xMin, max: xMax, ...baseAxis(), nameTextStyle: { color: TERM.text }, splitLine: { lineStyle: { color: TERM.splitLine } } },
      series: [
        ...series,
        { type: 'line', data: [[xMin, xMin], [xMax, xMax]], silent: true, symbol: 'none', lineStyle: { color: '#3d5169', type: 'dashed', width: 1 }, z: 0 },
      ],
      markLine: undefined,
      graphic: [],
      // 中心线用 markLine 实现：
      ...({} as object),
    }
  }, [prepared, idx])

  // 在 scatterOpt 上补 markLine（中心 100 线）
  if (scatterOpt) {
    const pts = scatterOpt.series.find((s: { type?: string }) => s.type === 'scatter')
    if (pts) (pts as { markLine?: object }).markLine = {
      silent: true, symbol: 'none',
      data: [{ xAxis: 100 }, { yAxis: 100 }],
      lineStyle: { color: '#3d5169', type: 'dashed' }, label: { show: false },
    }
  }

  const btOpt = useMemo(() => {
    if (!prepared) return null
    const { bt, dates } = prepared
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', ...tooltipStyle(), valueFormatter: (v: number) => (v * 100).toFixed(1) + '%' },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      grid: { left: 56, right: 16, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: dates, ...baseAxis() },
      yAxis: { type: 'value', scale: true, ...baseAxis(), axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => (v * 100).toFixed(0) + '%' } },
      dataZoom: [{ type: 'inside' }],
      series: [
        { name: 'RRG 象限轮动(1+2)', type: 'line', data: bt.eq, symbol: 'none', lineStyle: { width: 1.5, color: TERM.brass } },
        { name: '行业ETF等权', type: 'line', data: bt.bench, symbol: 'none', lineStyle: { width: 1, color: TERM.text, type: 'dashed' } },
      ],
    }
  }, [prepared])
  const { hostRef } = useChart(() => scatterOpt as never, [scatterOpt])
  const { hostRef: btRef } = useChart(() => btOpt as never, [btOpt])

  if (!prepared) return <div className="terminal"><div className="chart-host" /></div>
  const lastHold = prepared.bt.holdLog[prepared.bt.holdLog.length - 1]
  return (
    <div className="terminal">
      <div className="panel-controls">
        <Slider label="RS-Ratio 回看" value={N} min={120} max={260} step={10} onChange={setN} unit="日" />
        <Slider label="RS-Mom 回看" value={M} min={20} max={120} step={10} onChange={setM} unit="日" />
        <Slider label="平滑窗口" value={S} min={5} max={40} step={5} onChange={setS} unit="日" />
        <Slider label="最多持有" value={maxN} min={2} max={8} step={1} onChange={setMaxN} unit="只" />
        <Slider label="单边费率" value={feeBps} min={0} max={20} step={1} onChange={setFeeBps} unit="‱" />
      </div>
      <div className="terminal-head" style={{ paddingTop: 0 }}>
        <span className="t">RRG 四象限 · {prepared.dates[idx]}</span>
        <span className="d">基准 = 12只行业ETF等权 · 拖动下方滑块观察行业顺时针旋转</span>
      </div>
      <div style={{ padding: '4px 14px 0' }}>
        <input type="range" min={0} max={1} step={0.001} value={cursor} style={{ width: '100%', accentColor: '#a8762a' }}
          onChange={(e) => setCursor(Number(e.target.value))} aria-label="RRG 观察日期" />
      </div>
      <div ref={hostRef} className="chart-host" />
      <div className="terminal-head" style={{ borderTop: '1px solid var(--panel-line)' }}>
        <span className="t">象限轮动回测（月末 · 持有 领先+改善 象限 · 超 {maxN} 只取距中心最远）</span>
      </div>
      <div ref={btRef} className="chart-host" />
      <div className="metrics">
        <Metric label="轮动年化" v={prepared.bt.metrics.cagr} />
        <Metric label="等权基准年化" v={prepared.bt.metrics.benchCagr} />
        <Metric label="轮动总收益" v={prepared.bt.metrics.cagr == null ? NaN : prepared.bt.eq[prepared.bt.eq.length - 1] - 1} />
        <Metric label="基准总收益" v={prepared.bt.metrics.benchCagr == null ? NaN : prepared.bt.bench[prepared.bt.bench.length - 1] - 1} />
        <Metric label="最大回撤" v={prepared.bt.metrics.maxDD} />
        <Metric label="夏普" v={prepared.bt.metrics.sharpe} raw digits={2} />
        <div className="metric"><span>最新持仓</span>
          <b style={{ fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 400 }}>
            {lastHold ? lastHold.names.map((c) => prepared.nameOf[c] ?? c).join(' · ') : '空仓'}
          </b>
        </div>
      </div>
      <div style={{ padding: '0 14px 12px', color: '#7d8ea1', fontSize: 11.5 }}>
        诚实结果：仅用 12 只行业 ETF（研报用中信一级全行业 + 扩散指标过滤）时，纯象限轮动长期跑输等权基准——
        与研报年化 20.6% 的差距主要来自标的池与"扩散指标"缺失（QuantsPlaybook 项目文档亦有同样结论）。
        拖动参数感受 RS-Ratio/Momentum 对信号的敏感度，本身就是最好的过拟合教学。
      </div>
    </div>
  )
}
