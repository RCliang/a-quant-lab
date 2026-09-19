// ECharts 挂载封装 + 终端配色
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export const TERM = {
  bg: 'transparent',
  text: '#9fb0c0',
  textStrong: '#e8edf3',
  axisLine: '#25384e',
  splitLine: '#1a2a3d',
  up: '#c8402a',
  upSoft: 'rgba(200,64,42,0.55)',
  down: '#0e7a55',
  downSoft: 'rgba(14,122,85,0.55)',
  blue: '#5b9bd5',
  brass: '#e8c987',
  purple: '#9d7bb8',
  cyan: '#54b8c4',
}

export function useChart(optionFactory: () => echarts.EChartsOption, deps: unknown[]) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    if (!hostRef.current) return
    const option = optionFactory()
    if (option == null) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(hostRef.current, undefined, { renderer: 'canvas' })
    }
    chartRef.current.setOption(option, true)
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null }, [])
  const resize = () => chartRef.current?.resize()
  return { hostRef, resize }
}

export const baseAxis = () => ({
  axisLine: { lineStyle: { color: TERM.axisLine } },
  axisLabel: { color: TERM.text, fontSize: 10.5 },
  splitLine: { lineStyle: { color: TERM.splitLine } },
  axisPointer: { label: { backgroundColor: '#16273a' } },
})

export const tooltipStyle = () => ({
  backgroundColor: '#16273a',
  borderColor: '#25384e',
  textStyle: { color: '#e8edf3', fontSize: 12 },
})
