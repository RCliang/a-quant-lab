// 均线收敛因子实验室：factor = -log(1 + std(MA1, MA5, MA10, MA20, MA60, MA120))
// 口径：开源证券《形态识别：均线的收敛与发散》(2024-04)；本实验室做单标的时序事件研究（研报为截面选股因子）
import { useMemo, useState } from 'react'
import { useJson, toBars, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'
import type { Bar } from '../lib/engine'

const UNIVERSE = [
  { code: 'sh600519', label: '贵州茅台' }, { code: 'sz300750', label: '宁德时代' },
  { code: 'sz000001', label: '平安银行' }, { code: 'sh600036', label: '招商银行' },
  { code: 'sh510300', label: '沪深300ETF' }, { code: 'sz159915', label: '创业板ETF' },
  { code: 'sh512480', label: '半导体ETF' }, { code: 'sz512880', label: '证券ETF' },
]

function sma(xs: number[], n: number): number[] {
  const out = new Array(xs.length).fill(NaN)
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    s += xs[i]
    if (i >= n) s -= xs[i - n]
    if (i >= n - 1) out[i] = s / n
  }
  return out
}
function stdOf(vals: number[]): number {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length)
}
function nanSma(xs: number[], n: number): (number | null)[] {
  const raw = sma(xs, n)
  return raw.map((v) => (isFinite(v) ? v : null))
}

export function ConvergenceLab() {
  const data = useJson<KlineData>('klines_daily.json')
  const [code, setCode] = useState('sh600519')
  const [fwd, setFwd] = useState(20)
  const [thr, setThr] = useState(90)
  const [volWin, setVolWin] = useState(0) // 0=同一组均线；演示保持一致

  const result = useMemo(() => {
    if (!data) return null
    const e = data[code] as KlineEntry | undefined
    if (!e) return null
    const bars: Bar[] = toBars(e)
    if (bars.length < 320) return null
    const closes = bars.map((b) => b.close)
    const vols = bars.map((b) => b.vol)
    const windows = [5, 10, 20, 60, 120]
    const pMAS = [closes, ...windows.map((w) => sma(closes, w))]
    const vMAS0 = [vols, ...windows.map((w) => sma(vols, w))]
    const vMAS = volWin ? [sma(vols, volWin), ...windows.map((w) => sma(vols, w))] : vMAS0
    const pcf: number[] = []
    const vcf: number[] = []
    for (let i = 0; i < bars.length; i++) {
      const pv = pMAS.map((m) => m[i])
      const vv = vMAS.map((m) => m[i])
      pcf.push(i >= 120 && pv.every((v) => isFinite(v)) ? -Math.log(1 + stdOf(pv)) : NaN)
      vcf.push(i >= 120 && vv.every((v) => isFinite(v)) ? -Math.log(1 + stdOf(vv)) : NaN)
    }
    // 滚动 250 日分位（避免未来函数）：事件 = 当日因子分位 ≥ thr%
    const events: number[] = []
    const pcfPct = new Array(bars.length).fill(NaN)
    const vcfPct = new Array(bars.length).fill(NaN)
    const lookback = 250
    for (let i = lookback; i < bars.length; i++) {
      for (const [arr, store] of [[pcf, pcfPct], [vcf, vcfPct]] as [number[], number[]][]) {
        const w = arr.slice(i - lookback + 1, i + 1).filter((v) => !isNaN(v))
        if (w.length < 100) continue
        const rank = w.filter((v) => v <= arr[i]).length
        store[i] = rank / w.length
      }
      if (!isNaN(pcfPct[i]) && pcfPct[i] >= thr / 100) events.push(i)
    }
    // 前瞻 N 日收益（收盘→收盘）：事件组 vs 全样本
    const fwdRet = (i: number) => (i + fwd < bars.length && closes[i] > 0 ? closes[i + fwd] / closes[i] - 1 : null)
    const evRets = events.map(fwdRet).filter((v): v is number => v != null)
    const allRets = bars.map((_, i) => fwdRet(i)).filter((v): v is number => v != null)
    const stat = (xs: number[]) => ({
      n: xs.length,
      mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN,
      median: xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN,
      win: xs.length ? xs.filter((v) => v > 0).length / xs.length : NaN,
    })
    return { bars, closes, pcf, vcf, pcfPct, vcfPct, events, evStat: stat(evRets), allStat: stat(allRets) }
  }, [data, code, fwd, thr, volWin])

  const opt = useMemo(() => {
    if (!result) return null
    const { bars, closes, pcf, vcf, events } = result
    const dates = bars.map((b) => b.date)
    const startIdx = 130
    const marks = events.filter((i) => i >= startIdx).map((i) => ({ coord: [dates[i], closes[i]] as [string, number] }))
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...tooltipStyle() },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 56, right: 18, top: 30, height: '38%' },
        { left: 56, right: 18, top: '56%', height: '15%' },
        { left: 56, right: 18, top: '78%', height: '15%' },
      ],
      xAxis: [0, 1, 2].map((g) => ({
        type: 'category', data: dates, gridIndex: g, ...baseAxis(),
        axisLabel: { show: g === 2, ...baseAxis().axisLabel },
      })),
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, ...baseAxis() },
        { type: 'value', gridIndex: 1, ...baseAxis(), axisLabel: { show: false } },
        { type: 'value', gridIndex: 2, ...baseAxis(), axisLabel: { show: false } },
      ],
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1, 2], start: 30, end: 100 }],
      series: [
        {
          name: '收盘价', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: closes.slice(startIdx), symbol: 'none',
          lineStyle: { width: 1.1, color: '#d8dee6' },
          markPoint: { symbolSize: 7, data: marks.map((m) => ({ coord: m.coord, itemStyle: { color: TERM.up } })), label: { show: false } },
        },
        { name: 'PCF 价格收敛度', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: pcf.slice(startIdx).map((v) => (isNaN(v) ? null : v)), symbol: 'none', lineStyle: { width: 1, color: TERM.brass } },
        { name: 'VCF 量收敛度', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: vcf.slice(startIdx).map((v) => (isNaN(v) ? null : v)), symbol: 'none', lineStyle: { width: 1, color: TERM.cyan } },
      ],
    }
  }, [result])
  const { hostRef } = useChart(() => opt as never, [opt])

  if (!result) return <div className="terminal"><div className="chart-host" /></div>
  const { evStat, allStat, events } = result
  return (
    <div className="terminal">
      <div className="panel-controls">
        <div className="ctrl">
          <label>标的</label>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {UNIVERSE.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </div>
        <Slider label="前瞻窗口" value={fwd} min={5} max={60} step={5} onChange={setFwd} unit="日" />
        <Slider label="收敛阈值(分位)" value={thr} min={70} max={99} step={1} onChange={setThr} unit="%" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      <div className="metrics">
        <div className="metric"><span>收敛事件数(250日分位≥{thr}%)</span><b>{events.length}</b></div>
        <div className="metric"><span>事件后{fwd}日·均值</span><b className={evStat.mean > 0 ? 'pos' : 'neg'}>{(evStat.mean * 100).toFixed(2)}%</b></div>
        <div className="metric"><span>全样本{fwd}日·均值</span><b>{(allStat.mean * 100).toFixed(2)}%</b></div>
        <div className="metric"><span>事件后·中位数</span><b className={evStat.median > 0 ? 'pos' : 'neg'}>{(evStat.median * 100).toFixed(2)}%</b></div>
        <div className="metric"><span>事件后·胜率</span><b>{(evStat.win * 100).toFixed(0)}%</b></div>
        <div className="metric"><span>全样本·胜率</span><b>{(allStat.win * 100).toFixed(0)}%</b></div>
      </div>
      <div style={{ padding: '0 14px 12px', color: '#7d8ea1', fontSize: 11.5 }}>
        因子 = −log(1 + std(MA₁,MA₅,MA₁₀,MA₂₀,MA₆₀,MA₁₂₀))（开源证券91口径，价格用前复权近似）。事件 = 因子处于滚动250日分位≥阈值；
        收敛度越高说明各周期成本越趋同。⚠️ 研报结论是**截面选股因子**（PCF 弱 RankIC 2.78%、VCF 7.69%、TRCF 10.31%），
        本实验室是单标的时序事件研究，用于直观感受"收敛→变盘"，不能直接外推研报数字。
      </div>
    </div>
  )
}

export const _nc = nanSma
