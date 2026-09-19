// 可转债双低全景散点：价格 × 转股溢价率，气泡=剩余规模，颜色=双低是否入选
import { useMemo, useState } from 'react'
import { useJson, fmtNum, type CbSnapshot } from '../lib/loaders'
import { useChart, TERM, baseAxis, tooltipStyle } from '../lib/echart'
import { Slider } from './IndicatorLab'

export function CbScatter() {
  const snap = useJson<CbSnapshot>('cb_snapshot.json')
  const [dlMax, setDlMax] = useState(170)
  const [priceMin, setPriceMin] = useState(100)
  const [priceMax, setPriceMax] = useState(160)

  const pts = useMemo(() => {
    if (!snap) return []
    return snap.list
      .filter((b) => b.prem != null && b.price > 0)
      .map((b) => ({
        ...b,
        // 调研报告的标准剔除规则：正股 ST、剩余规模 <0.3 亿
        excluded: (b.stock_name ?? '').includes('ST') || (b.remain_yi ?? 0) < 0.3,
      }))
      .map((b) => ({ ...b, inPool: !b.excluded && b.dl <= dlMax && b.price >= priceMin && b.price <= priceMax }))
  }, [snap, dlMax, priceMin, priceMax])

  const picked = useMemo(() =>
    pts.filter((p) => p.inPool).sort((a, b) => a.dl - b.dl), [pts])

  const opt = useMemo(() => {
    if (!pts.length) return null
    const mk = (arr: typeof pts, color: string, name: string, sym: string, size: number) => ({
      name, type: 'scatter', data: arr.map((p) => ({
        value: [p.price, p.prem],
        symbolSize: Math.max(3, Math.min(16, Math.sqrt(Math.max(p.remain_yi ?? 0.5, 0.3)) * 3.4)) * (size / 10),
        code: p.code, name: p.name, dl: p.dl, remain: p.remain_yi, stock: p.stock_name,
      })),
      symbol: sym as never,
      itemStyle: { color, opacity: 0.75 },
    })
    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        ...tooltipStyle(),
        formatter: (p: { data: { name: string; code: string; value: number[]; dl: number; remain: number; stock: string } }) =>
          `<b>${p.data.name}</b> (${p.data.code})<br/>正股：${p.data.stock}<br/>价格 ${p.data.value[0]} · 溢价率 ${p.data.value[1]}%<br/>双低 ${fmtNum(p.data.dl)} · 剩余规模 ${fmtNum(p.data.remain)}亿`,
      },
      legend: { top: 2, textStyle: { color: TERM.text, fontSize: 11 }, data: ['池外', `双低池（${picked.length}只）`] },
      grid: { left: 52, right: 20, top: 34, bottom: 40 },
      xAxis: {
        type: 'value', name: '转债价格(元)', nameTextStyle: { color: TERM.text }, min: priceMin - 5, max: Math.max(priceMax + 10, 180),
        ...baseAxis(),
      },
      yAxis: {
        type: 'value', name: '转股溢价率 %', nameTextStyle: { color: TERM.text }, min: -10, max: 300,
        ...baseAxis(),
      },
      dataZoom: [{ type: 'inside' }],
      series: [
        mk(pts.filter((p) => !p.inPool), '#41586f', '池外', 'circle', 10),
        mk(pts.filter((p) => p.inPool), TERM.up, `双低池（${picked.length}只）`, 'circle', 10),
      ],
    }
  }, [pts, picked, priceMin, priceMax])

  const { hostRef } = useChart(() => opt as never, [opt])
  if (!snap) return <div className="terminal"><div className="chart-host" /></div>
  return (
    <div className="terminal">
      <div className="panel-controls">
        <Slider label="双低上限" value={dlMax} min={120} max={220} step={2} onChange={setDlMax} />
        <Slider label="价格下限" value={priceMin} min={60} max={130} step={1} onChange={setPriceMin} unit="元" />
        <Slider label="价格上限" value={priceMax} min={100} max={220} step={2} onChange={setPriceMax} unit="元" />
      </div>
      <div ref={hostRef} className="chart-host tall" />
      <div style={{ borderTop: '1px solid var(--panel-line)' }}>
        <div style={{ padding: '10px 14px 6px', color: '#e8c987', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          双低榜 TOP 12（双低 = 价格 + 溢价率，气泡大小 = 剩余规模）
        </div>
        <table className="tbl" style={{ margin: '0 10px 12px', width: 'auto', minWidth: 'calc(100% - 20px)' }}>
          <thead><tr><th>#</th><th>转债</th><th>正股</th><th>价格</th><th>溢价率</th><th>双低</th><th>剩余(亿)</th></tr></thead>
          <tbody>
            {picked.slice(0, 12).map((p, i) => (
              <tr key={p.code}>
                <td className="mono">{i + 1}</td>
                <td>{p.name}</td><td>{p.stock_name}</td>
                <td className="mono">{p.price}</td>
                <td className="mono">{p.prem}%</td>
                <td className="mono">{fmtNum(p.dl)}</td>
                <td className="mono">{fmtNum(p.remain_yi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
