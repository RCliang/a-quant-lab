// 情绪周期图：上=昨涨停指数 BK0815 日溢价（长历史），下=近15日涨停家数/炸板率（真实涨停池）
import { useMemo } from 'react'
import { useJson, type EmotionData } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'

export function EmotionChart() {
  const data = useJson<EmotionData>('emotion.json')
  const opt = useMemo(() => {
    if (!data?.bk?.length) return null
    const bk = data.bk
    const dates = bk.map((d) => d.date)
    const pcts = bk.map((d) => d.pct)
    const closes = bk.map((d) => d.close / bk[0].close)
    // 退潮段标记：连续3日溢价<0
    const areas: { xAxis: [string, string]; color: string }[] = []
    let run = 0, start = ''
    bk.forEach((d, i) => {
      if ((d.pct ?? 0) < 0) {
        if (run === 0) start = dates[i]
        run++
        if (run >= 3 && (i === bk.length - 1 || (bk[i + 1].pct ?? 0) >= 0)) {
          areas.push({ xAxis: [start, dates[i]], color: 'rgba(14,122,85,0.16)' })
          run = 0
        }
      } else run = 0
    })
    // 近15日涨停池
    const poolDays = (data.days ?? []).filter((d) => d.zt > 0).slice(-15)
    const poolDates = poolDays.map((d) => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`)
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...tooltipStyle() },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 } },
      axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
      grid: [
        { left: 48, right: 16, top: 30, height: '52%' },
        { left: 48, right: 16, top: '70%', height: '22%' },
      ],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0, ...baseAxis(), axisLabel: { show: false } },
        { type: 'category', data: poolDates, gridIndex: 1, ...baseAxis() },
      ],
      yAxis: [
        { type: 'value', name: '昨涨停溢价%', gridIndex: 0, ...baseAxis(), nameTextStyle: { color: TERM.text }, splitLine: { show: true, lineStyle: { color: TERM.splitLine } } },
        { type: 'log', name: '指数(对数)', gridIndex: 0, ...baseAxis(), nameTextStyle: { color: TERM.text }, splitLine: { show: false }, axisLabel: { color: TERM.brass, fontSize: 10.5 } },
        { type: 'value', name: '家数/高度', gridIndex: 1, ...baseAxis(), nameTextStyle: { color: TERM.text } },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0] },
        { type: 'slider', xAxisIndex: [0], bottom: 2, height: 16, borderColor: TERM.axisLine, backgroundColor: '#0d1826', fillerColor: 'rgba(232,201,135,0.12)', handleStyle: { color: TERM.brass }, textStyle: { color: TERM.text, fontSize: 9 } },
      ],
      series: [
        {
          name: '昨涨停溢价(日)', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: pcts,
          itemStyle: { color: (p: { value: number }) => (p.value >= 0 ? TERM.up : TERM.down) },
          markArea: {
            silent: true,
            data: areas.map((a) => [{ xAxis: a.xAxis[0], itemStyle: { color: a.color } }, { xAxis: a.xAxis[1] }]),
          },
          markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: '#3d5169' }, label: { show: false } },
        },
        {
          name: '昨日涨停指数(对数轴)', type: 'line', xAxisIndex: 0, yAxisIndex: 1, data: closes,
          symbol: 'none', lineStyle: { width: 1.3, color: TERM.brass },
        },
        {
          name: '涨停家数(近15日)', type: 'bar', xAxisIndex: 1, yAxisIndex: 2, data: poolDays.map((d) => d.zt),
          itemStyle: { color: TERM.upSoft }, barWidth: '55%',
        },
        {
          name: '连板高度', type: 'line', xAxisIndex: 1, yAxisIndex: 2, data: poolDays.map((d) => d.max_lb),
          symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.2, color: TERM.brass }, itemStyle: { color: TERM.brass },
        },
        {
          name: '炸板率%', type: 'line', xAxisIndex: 1, yAxisIndex: 2, data: poolDays.map((d) => d.zb_rate),
          symbol: 'none', lineStyle: { width: 1, color: TERM.cyan, type: 'dashed' },
        },
      ],
    }
  }, [data])
  const { hostRef } = useChart(() => opt as never, [opt])
  if (!data) return <div className="terminal"><div className="chart-host" /></div>
  const pool = (data.days ?? []).filter((d) => d.zt > 0)
  const latest = pool[pool.length - 1]
  return (
    <div className="terminal">
      {latest && (
        <div className="panel-controls" style={{ justifyContent: 'space-between' }}>
          <span style={{ color: '#e8edf3', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>
            {`${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`} ｜
            涨停 <b style={{ color: '#ff8f75' }}>{latest.zt}</b> 家 ·
            炸板率 <b style={{ color: (latest.zb_rate ?? 0) > 30 ? '#4fc39a' : '#e8edf3' }}>{latest.zb_rate ?? '—'}%</b> ·
            连板高度 <b style={{ color: '#e8c987' }}>{latest.max_lb}</b> 板 ·
            昨停溢价 <b style={{ color: (latest.yzt_avg ?? 0) >= 0 ? '#ff8f75' : '#4fc39a' }}>{latest.yzt_avg ?? '—'}%</b>
          </span>
          <span style={{ color: '#7d8ea1', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            数据源：东财 push2ex 三池 + BK0815 昨日涨停指数 · {data.fetched}
          </span>
        </div>
      )}
      <div ref={hostRef} className="chart-host tall" />
      <div style={{ padding: '0 14px 12px', color: '#7d8ea1', fontSize: 11.5 }}>
        绿色背景带 = 退潮预警段（昨涨停溢价连续 3 日为负）——调研报告的口径下，这段行情里所有短线接力策略都应降仓或空仓。
        注：涨停池明细仅保留约 15 个交易日（东财限制），更长历史用「昨日涨停指数」的日涨跌幅刻画情绪。
      </div>
    </div>
  )
}
