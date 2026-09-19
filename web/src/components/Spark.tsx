// 首页卡片迷你走势图（浅色主题 sparkline）
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export default function Spark({ values, color }: { values: number[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !values.length) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    const first = values[0]
    chart.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
      yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
      series: [{
        type: 'line', data: values, symbol: 'none',
        lineStyle: { width: 1.4, color },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: color + '33' }, { offset: 1, color: color + '00' }] } },
      }],
    })
    const onR = () => chart.resize()
    window.addEventListener('resize', onR)
    return () => { window.removeEventListener('resize', onR); chart.dispose() }
  }, [values, color])
  return <div ref={ref} className="spark" />
}
