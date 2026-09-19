// 指标实验室：双均线 / MACD / 布林带 / 唐奇安突破，参数可调，客户端实时回测
import { useMemo, useState } from 'react'
import type { Bar } from '../lib/engine'
import { sma, ema, macd, std, rollingMax, rollingMin, runSignalBacktest } from '../lib/engine'
import { useJson, toBars, fmtPct, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'

export type IndicatorKind = 'sma' | 'macd' | 'boll' | 'donchian'

const UNIVERSE: { code: string; label: string }[] = [
  { code: 'sh600519', label: '贵州茅台' },
  { code: 'sz300750', label: '宁德时代' },
  { code: 'sh510300', label: '沪深300ETF' },
  { code: 'sz159915', label: '创业板ETF' },
  { code: 'sh512480', label: '半导体ETF' },
  { code: 'sh512690', label: '酒ETF' },
  { code: 'sz512880', label: '证券ETF' },
  { code: 'sh000001', label: '上证指数' },
]

export function IndicatorLab({ initialKind = 'sma' }: { initialKind?: IndicatorKind }) {
  const data = useJson<KlineData>('klines_daily.json')
  const [code, setCode] = useState('sh600519')
  const [kind, setKind] = useState<IndicatorKind>(initialKind)
  const [fast, setFast] = useState(20)
  const [slow, setSlow] = useState(60)
  const [band, setBand] = useState(2)
  const [donN, setDonN] = useState(20)
  const [donExit, setDonExit] = useState(10)
  const [feeBps, setFeeBps] = useState(10)

  const bars: Bar[] = useMemo(() => {
    if (!data) return []
    const e = data[code] as KlineEntry | undefined
    return e ? toBars(e) : []
  }, [data, code])

  const bt = useMemo(() => {
    if (bars.length < slow + 5) return null
    const closes = bars.map((b) => b.close)
    let signal: (i: number) => number
    let overlay: { dates: string[]; series: { name: string; data: (number | null)[]; color: string }[] } = { dates: [], series: [] }
    if (kind === 'sma') {
      const f = sma(closes, fast), s = sma(closes, slow)
      signal = (i) => (f[i] != null && s[i] != null ? ((f[i] as number) > (s[i] as number) ? 1 : 0) : 0)
      overlay = { dates: bars.map((b) => b.date), series: [
        { name: `MA${fast}`, data: f, color: TERM.brass },
        { name: `MA${slow}`, data: s, color: TERM.blue },
      ] }
    } else if (kind === 'macd') {
      const m = macd(closes)
      signal = (i) => {
        if (i === 0) return 0
        const a = m.dif[i], b = m.dea[i], pa = m.dif[i - 1], pb = m.dea[i - 1]
        if (a == null || b == null || pa == null || pb == null) return 0
        return (pa <= pb && a > b) ? 1 : (a > b ? 1 : 0)  // 金叉后持有，死叉离场
      }
      overlay = { dates: bars.map((b) => b.date), series: [
        { name: 'DIF', data: m.dif, color: TERM.brass },
        { name: 'DEA', data: m.dea, color: TERM.blue },
      ] }
    } else if (kind === 'boll') {
      const mid = sma(closes, 20), sd = std(closes, 20)
      const upper = mid.map((v, i) => (v != null && sd[i] != null ? v + band * (sd[i] as number) : null))
      const lower = mid.map((v, i) => (v != null && sd[i] != null ? v - band * (sd[i] as number) : null))
      signal = (i) => {
        // 触及下轨且次日收复 → 买入；触及中轨/上轨离场
        if (lower[i] == null || mid[i] == null) return 0
        if (closes[i] <= (lower[i] as number)) return 1
        if (closes[i] >= (mid[i] as number)) return 0
        return -1 // 保持原状
      }
      // 处理 -1（保持）：转成显式状态机
      let held = false
      const sig2 = signal
      signal = (i) => {
        const v = sig2(i)
        if (v === 1) held = true
        else if (v === 0) held = false
        return held ? 1 : 0
      }
      overlay = { dates: bars.map((b) => b.date), series: [
        { name: '布林上轨', data: upper, color: TERM.cyan },
        { name: '布林中轨', data: mid, color: TERM.text },
        { name: '布林下轨', data: lower, color: TERM.cyan },
      ] }
    } else {
      const hh = rollingMax(closes, donN), ll = rollingMin(closes, donExit)
      signal = (i) => (hh[i] != null && closes[i] > (hh[i] as number) ? 1 : (ll[i] != null && closes[i] < (ll[i] as number) ? 0 : -1))
      let held = false
      const sig2 = signal
      signal = (i) => {
        const v = sig2(i)
        if (v === 1) held = true
        else if (v === 0) held = false
        return held ? 1 : 0
      }
      overlay = { dates: bars.map((b) => b.date), series: [
        { name: `${donN}日最高`, data: hh, color: TERM.up },
        { name: `${donExit}日最低`, data: ll, color: TERM.down },
      ] }
    }
    return { bt: runSignalBacktest(bars, signal, { feeBps }), overlay, closes }
  }, [bars, kind, fast, slow, band, donN, donExit, feeBps])

  const opt = useMemo(() => {
    if (!bt) return null
    const { bt: r, overlay, closes } = bt
    const buyMarks = [] as { coord: [string, number] }[]
    const sellMarks = [] as { coord: [string, number] }[]
    r.trades.slice(-80).forEach((t) => {
      buyMarks.push({ coord: [t.inDate, t.inPx] })
      sellMarks.push({ coord: [t.outDate, t.outPx] })
    })
    const zoomStart = 55
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...tooltipStyle() },
      legend: { top: 4, textStyle: { color: TERM.text, fontSize: 11 }, data: [...overlay.series.map((s) => s.name), '策略净值', '买入持有'] },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 56, right: 20, top: 32, height: '48%' },
        { left: 56, right: 20, top: '66%', height: '26%' },
      ],
      xAxis: [
        { type: 'category', data: r.dates, gridIndex: 0, ...baseAxis(), boundaryLabel: false, axisLabel: { show: false } },
        { type: 'category', data: r.dates, gridIndex: 1, ...baseAxis() },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, ...baseAxis() },
        { type: 'value', gridIndex: 1, ...baseAxis() },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: zoomStart, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1], start: zoomStart, end: 100, bottom: 2, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } },
      ],
      series: [
        ...overlay.series.map((s) => ({
          name: s.name, type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0,
          data: s.data, symbol: 'none', lineStyle: { width: 1, color: s.color }, itemStyle: { color: s.color }, emphasis: { disabled: true },
        })),
        {
          name: '收盘价', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: closes, symbol: 'none',
          lineStyle: { width: 1.2, color: '#d8dee6', opacity: 0.9 }, itemStyle: { color: '#d8dee6' },
          markPoint: {
            symbol: 'triangle', symbolSize: 8,
            data: [
              ...buyMarks.map((m) => ({ ...m, symbolRotate: 0, itemStyle: { color: TERM.up }, symbolPosition: 'start' as const, symbolOffset: [0, '60%'] })),
              ...sellMarks.map((m) => ({ ...m, symbol: 'triangle', symbolRotate: 180, itemStyle: { color: TERM.cyan }, symbolOffset: [0, '-60%'] })),
            ],
          },
        },
        { name: '策略净值', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: r.equity, symbol: 'none', lineStyle: { width: 1.4, color: TERM.brass } },
        { name: '买入持有', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: r.bench, symbol: 'none', lineStyle: { width: 1, color: TERM.text, type: 'dashed' as const } },
      ],
    } as const
  }, [bt])

  const { hostRef } = useChart(() => (opt as object) as never, [opt])

  const m = bt?.bt.metrics
  return (
    <div className="terminal">
      <div className="panel-controls">
        <div className="ctrl">
          <label>标的</label>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {UNIVERSE.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </div>
        <div className="ctrl">
          <label>策略信号</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as IndicatorKind)}>
            <option value="sma">双均线交叉</option>
            <option value="macd">MACD 金叉死叉</option>
            <option value="boll">布林带均值回归</option>
            <option value="donchian">唐奇安突破</option>
          </select>
        </div>
        {kind === 'sma' && (
          <>
            <Slider label="快线" value={fast} min={5} max={60} step={1} onChange={setFast} />
            <Slider label="慢线" value={slow} min={20} max={250} step={5} onChange={setSlow} />
          </>
        )}
        {kind === 'boll' && <Slider label="σ 倍数" value={band} min={1} max={3} step={0.25} onChange={setBand} />}
        {kind === 'donchian' && (
          <>
            <Slider label="入场 N 日" value={donN} min={10} max={120} step={5} onChange={setDonN} />
            <Slider label="离场 M 日" value={donExit} min={5} max={40} step={1} onChange={setDonExit} />
          </>
        )}
        <Slider label="单边费率" value={feeBps} min={0} max={30} step={1} onChange={setFeeBps} unit="‱" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      {m && (
        <div className="metrics">
          <Metric label="策略年化" v={m.cagr} />
          <Metric label="买入持有年化" v={m.benchCagr} />
          <Metric label="最大回撤" v={m.maxDD} />
          <Metric label="基准回撤" v={m.benchMaxDD} />
          <Metric label="夏普" v={m.sharpe} raw digits={2} />
          <Metric label="胜率" v={m.winRate} />
          <Metric label="交易次数" v={m.trades} raw digits={0} />
          <Metric label="平均仓位" v={m.exposure} />
        </div>
      )}
    </div>
  )
}

export function Slider({ label, value, min, max, step, onChange, unit = '' }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; unit?: string
}) {
  return (
    <div className="ctrl">
      <label>{label}<output>{value}{unit}</output></label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export function Metric({ label, v, raw, digits = 1 }: { label: string; v: number; raw?: boolean; digits?: number }) {
  const txt = raw ? v.toFixed(digits) : fmtPct(v, digits)
  const cls = raw ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : ''
  return <div className="metric"><span>{label}</span><b className={cls}>{txt}</b></div>
}
