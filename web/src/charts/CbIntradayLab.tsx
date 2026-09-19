// 可转债 T+0 日内演示：5 分钟 K 线 + 日内均线策略（教学演示，非实盘建议）
import { useMemo, useState } from 'react'
import { sma, runSignalBacktest } from '../lib/engine'
import { useJson, type CbIntraday } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'

function timeLabel(t: string) {
  // 202609181015 → 09-18 10:15
  const s = String(t)
  if (s.length < 12) return s
  return `${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
}

export function CbIntradayLab() {
  const intraday = useJson<CbIntraday>('cb_intraday.json')
  const snap = useJson<{ list: { code: string; name: string }[] }>('cb_snapshot.json')
  const codes = Object.keys(intraday?.data ?? {})
  const [code, setCode] = useState('')
  const [fast, setFast] = useState(10)
  const [slow, setSlow] = useState(30)
  const [feeBps, setFeeBps] = useState(3)
  const sel = code || codes[0]
  const nameOf = (c: string) => {
    const bare = c.replace(/^(sh|sz)/, '')
    const hit = snap?.list.find((b) => b.code === bare)
    return hit ? `${hit.name} ${c}` : c
  }

  const result = useMemo(() => {
    if (!intraday || !sel) return null
    const bars = (intraday.data[sel]?.m5 ?? []).map((b) => ({ ...b, date: timeLabel(b.time), vol: b.vol }))
    if (bars.length < slow + 10) return null
    const closes = bars.map((b) => b.close)
    const f = sma(closes, fast), s = sma(closes, slow)
    let held = false
    const signal = (i: number) => {
      if (f[i] == null || s[i] == null) return 0
      if ((f[i] as number) > (s[i] as number)) held = true
      else held = false
      return held ? 1 : 0
    }
    return { bars, bt: runSignalBacktest(bars, signal, { feeBps }), f, s }
  }, [intraday, sel, fast, slow, feeBps])

  const opt = useMemo(() => {
    if (!result) return null
    const { bars, bt, f, s } = result
    const marks = bt.trades.flatMap((t) => ([
      { coord: [t.inDate, t.inPx] as [string, number], sym: 'triangle', rot: 0, color: TERM.up, off: [0, '60%'] as never },
      { coord: [t.outDate, t.outPx] as [string, number], sym: 'triangle', rot: 180, color: TERM.cyan, off: [0, '-60%'] as never },
    ]))
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...tooltipStyle() },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      grid: { left: 56, right: 18, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: bars.map((b) => b.date), ...baseAxis() },
      yAxis: { type: 'value', scale: true, ...baseAxis(), axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => v.toFixed(1) } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 4, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } }],
      series: [
        {
          name: '价格(5分钟)', type: 'line', data: bars.map((b) => b.close), symbol: 'none',
          lineStyle: { width: 1.2, color: '#d8dee6' },
          markPoint: {
            symbolSize: 9,
            data: marks.map((m) => ({ coord: m.coord, symbol: m.sym, symbolRotate: m.rot, symbolOffset: m.off, itemStyle: { color: m.color } })),
          },
        },
        { name: `MA${fast}`, type: 'line', data: f, symbol: 'none', lineStyle: { width: 1, color: TERM.brass } },
        { name: `MA${slow}`, type: 'line', data: s, symbol: 'none', lineStyle: { width: 1, color: TERM.blue } },
      ],
    }
  }, [result, fast, slow])
  const { hostRef } = useChart(() => opt as never, [opt])

  if (!intraday) return <div className="terminal"><div className="chart-host" /></div>
  const m = result?.bt.metrics
  return (
    <div className="terminal">
      <div className="panel-controls">
        <div className="ctrl">
          <label>转债（5分钟线 · 近320根）</label>
          <select value={sel} onChange={(e) => setCode(e.target.value)}>
            {codes.map((c) => <option key={c} value={c}>{nameOf(c)}</option>)}
          </select>
        </div>
        <Slider label="快线 MA" value={fast} min={3} max={30} step={1} onChange={setFast} unit="根" />
        <Slider label="慢线 MA" value={slow} min={10} max={90} step={5} onChange={setSlow} unit="根" />
        <Slider label="单边费率" value={feeBps} min={0} max={30} step={1} onChange={setFeeBps} unit="‱" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      {m && (
        <div className="metrics">
          <Metric label="策略收益(区间)" v={m.totalRet} />
          <Metric label="买入持有(区间)" v={m.benchRet} />
          <Metric label="交易次数" v={m.trades} raw digits={0} />
          <Metric label="胜率" v={m.winRate} />
          <Metric label="平均仓位" v={m.exposure} />
        </div>
      )}
    </div>
  )
}
