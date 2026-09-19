// ETF 动量轮动实验室：行业轮动 / 大小盘轮动 / 双动量（含绝对动量过滤）
import { useMemo, useState } from 'react'
import { runRotation, type AssetSeries } from '../lib/engine'
import { useJson, fmtPct, type KlineData, type KlineEntry } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider, Metric } from './IndicatorLab'

export const SECTOR_BASKET = ['sz512880', 'sh512690', 'sz512010', 'sh512480', 'sz515030',
  'sh512800', 'sh512660', 'sz512200', 'sh512400', 'sz159928', 'sh515790', 'sh512000']
export const SIZE_BASKET = ['sh510300', 'sh510500', 'sz512100', 'sz159915']
export const DUAL_BASKET = ['sh510300', 'sh510500', 'sz512100', 'sh518880', 'sh513100', 'sh511260']

const BASKETS: { key: string; name: string; codes: string[] }[] = [
  { key: 'sector', name: '行业ETF池（12只）', codes: SECTOR_BASKET },
  { key: 'size', name: '宽基大小盘池（4只）', codes: SIZE_BASKET },
  { key: 'dual', name: '多资产双动量池（6只·含黄金/国债/纳指）', codes: DUAL_BASKET },
]

export function RotationLab({ defaultBasket = 'sector', defaultLookback = 20 }: { defaultBasket?: string; defaultLookback?: number }) {
  const data = useJson<KlineData>('klines_daily.json')
  const [basketKey, setBasketKey] = useState(defaultBasket)
  const [lookback, setLookback] = useState(defaultLookback)
  const [holdN, setHoldN] = useState(3)
  const [rebalance, setRebalance] = useState(10)
  const [absFilter, setAbsFilter] = useState(false)
  const [feeBps, setFeeBps] = useState(10)

  const assets: AssetSeries[] = useMemo(() => {
    const bk = BASKETS.find((b) => b.key === basketKey) ?? BASKETS[0]
    return bk.codes
      .map((c) => {
        const e = data?.[c] as KlineEntry | undefined
        if (!e) return null
        return { code: c, name: e.name, dates: e.d, close: e.c }
      })
      .filter(Boolean) as AssetSeries[]
  }, [data, basketKey])

  const res = useMemo(() => {
    if (assets.length === 0) return null
    return runRotation(assets, { lookback, holdN, rebalance, absFilter, feeBps })
  }, [assets, lookback, holdN, rebalance, absFilter, feeBps])

  const opt = useMemo(() => {
    if (!res) return null
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', ...tooltipStyle(), valueFormatter: (v: number) => (v * 100).toFixed(1) + '%' },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      grid: { left: 56, right: 16, top: 30, bottom: 44 },
      xAxis: { type: 'category', data: res.dates, ...baseAxis() },
      yAxis: {
        type: 'value', ...baseAxis(), scale: true,
        axisLabel: { ...baseAxis().axisLabel, formatter: (v: number) => (v * 100).toFixed(0) + '%' },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 6, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } }],
      series: [
        { name: '轮动策略', type: 'line', data: res.equity, symbol: 'none', lineStyle: { width: 1.6, color: TERM.brass } },
        { name: '等权基准', type: 'line', data: res.bench, symbol: 'none', lineStyle: { width: 1, color: TERM.text, type: 'dashed' } },
      ],
    }
  }, [res])
  const { hostRef } = useChart(() => opt as never, [opt])

  const m = res?.metrics
  return (
    <div className="terminal">
      <div className="panel-controls">
        <div className="ctrl">
          <label>ETF 池</label>
          <select value={basketKey} onChange={(e) => setBasketKey(e.target.value)}>
            {BASKETS.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
          </select>
        </div>
        <Slider label="动量窗口" value={lookback} min={5} max={120} step={5} onChange={setLookback} unit="日" />
        <Slider label="持有数量" value={holdN} min={1} max={6} step={1} onChange={setHoldN} unit="只" />
        <Slider label="调仓间隔" value={rebalance} min={5} max={60} step={5} onChange={setRebalance} unit="日" />
        <Slider label="单边费率" value={feeBps} min={0} max={30} step={1} onChange={setFeeBps} unit="‱" />
        <div className="ctrl">
          <label>&nbsp;</label>
          <label className="toggle">
            <input type="checkbox" checked={absFilter} onChange={(e) => setAbsFilter(e.target.checked)} />
            绝对动量过滤（动量≤0 空仓）
          </label>
        </div>
      </div>
      <div ref={hostRef} className="chart-host tall" />
      {m && (
        <div className="metrics">
          <Metric label="策略年化" v={m.cagr} />
          <Metric label="等权基准年化" v={m.benchCagr} />
          <Metric label="最大回撤" v={m.maxDD} />
          <Metric label="基准回撤" v={m.benchMaxDD} />
          <Metric label="夏普" v={m.sharpe} raw digits={2} />
          <Metric label="平均仓位" v={m.exposure} />
          <div className="metric"><span>最近持仓名单</span>
            <b style={{ fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 400 }}>
              {res && res.holdings.length
                ? res.holdings[res.holdings.length - 1].codes.map((c) => (assets.find((a) => a.code === c)?.name ?? c)).join(' · ')
                : absFilter ? '（空仓中）' : '—'}
            </b>
          </div>
        </div>
      )}
    </div>
  )
}
