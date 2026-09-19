// ETF 网格交易实验室：间距 / 份数 / 底仓 可调
import { useMemo, useState } from 'react'
import { runGrid } from '../lib/engine'
import { useJson, toBars, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'

const POOL = [
  { code: 'sh510300', label: '沪深300ETF' },
  { code: 'sz512100', label: '中证1000ETF' },
  { code: 'sh512880', label: '证券ETF' },
  { code: 'sh518880', label: '黄金ETF' },
  { code: 'sz159915', label: '创业板ETF' },
  { code: 'sh512690', label: '酒ETF' },
]

export function GridLab() {
  const data = useJson<KlineData>('klines_daily.json')
  const [code, setCode] = useState('sh510300')
  const [stepPct, setStepPct] = useState(2.5)
  const [parts, setParts] = useState(20)
  const [basePct, setBasePct] = useState(0)
  const [feeBps, setFeeBps] = useState(5)
  const [range, setRange] = useState(3) // 回看年数

  const bars = useMemo(() => {
    if (!data) return []
    const e = data[code] as KlineEntry | undefined
    if (!e) return []
    const all = toBars(e)
    const cutoff = all.length - Math.round(range * 244)
    return cutoff > 0 ? all.slice(cutoff) : all
  }, [data, code, range])

  const res = useMemo(() => {
    if (bars.length < 50) return null
    return runGrid(bars, { stepPct, parts, feeBps, basePct })
  }, [bars, stepPct, parts, basePct, feeBps])

  const opt = useMemo(() => {
    if (!res) return null
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', ...tooltipStyle() },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      grid: [
        { left: 56, right: 18, top: 30, height: '55%' },
        { left: 56, right: 18, top: '72%', height: '20%' },
      ],
      xAxis: [
        { type: 'category', data: res.dates, gridIndex: 0, ...baseAxis(), axisLabel: { show: false } },
        { type: 'category', data: res.dates, gridIndex: 1, ...baseAxis() },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, ...baseAxis() },
        { type: 'value', gridIndex: 1, ...baseAxis() },
      ],
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', xAxisIndex: [0, 1], bottom: 2, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } }],
      series: [
        {
          name: '收盘价', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: bars.map((b) => b.close),
          symbol: 'none', lineStyle: { width: 1.2, color: '#d8dee6' },
        },
        {
          name: '买入', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0,
          data: res.buys.map((b) => [b.date, b.px]), symbolSize: 6,
          itemStyle: { color: TERM.up },
        },
        {
          name: '卖出', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0,
          data: res.sells.map((b) => [b.date, b.px]), symbolSize: 6, symbol: 'rect',
          itemStyle: { color: TERM.cyan },
        },
        { name: '网格净值', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: res.equity, symbol: 'none', lineStyle: { width: 1.4, color: TERM.brass } },
        { name: '买入持有', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: res.bench, symbol: 'none', lineStyle: { width: 1, color: TERM.text, type: 'dashed' } },
      ],
    }
  }, [res, bars])
  const { hostRef } = useChart(() => opt as never, [opt])

  const m = res?.metrics
  return (
    <div className="terminal">
      <div className="panel-controls">
        <div className="ctrl">
          <label>标的</label>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {POOL.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </div>
        <Slider label="网格间距" value={stepPct} min={0.5} max={8} step={0.25} onChange={setStepPct} unit="%" />
        <Slider label="资金份数" value={parts} min={4} max={40} step={1} onChange={setParts} unit="份" />
        <Slider label="底仓比例" value={basePct} min={0} max={80} step={10} onChange={setBasePct} unit="%" />
        <Slider label="回看区间" value={range} min={1} max={8} step={0.5} onChange={setRange} unit="年" />
        <Slider label="单边费率" value={feeBps} min={0} max={30} step={1} onChange={setFeeBps} unit="‱" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      {m && res && (
        <div className="metrics">
          <Metric label="网格年化" v={m.cagr} />
          <Metric label="买入持有年化" v={m.benchCagr} />
          <Metric label="最大回撤" v={m.maxDD} />
          <Metric label="基准回撤" v={m.benchMaxDD} />
          <div className="metric"><span>成交格数</span><b>{res.filled}</b></div>
          <div className="metric"><span>每格理论毛利</span><b className="pos">{(res.perGridRet * 100).toFixed(2)}%</b></div>
        </div>
      )}
    </div>
  )
}
