// 数据加载器：读取 /data/*.json（由 scripts/fetch_data.py 产出）
import { useEffect, useState } from 'react'
import type { Bar } from './engine'

export interface KlineEntry { name: string; d: string[]; o: number[]; c: number[]; h: number[]; l: number[]; v: number[] }
export interface KlineData { meta: Record<string, string>; [code: string]: KlineEntry | Record<string, string> }

export interface CbSnapItem {
  code: string; name: string; price: number; prem: number; dl: number
  conv_value: number | null; conv_price: number | null; redeem_trig: number | null
  stock_code: string; stock_name: string; amount: number; remain_yi: number | null; listing: string
}
export interface CbSnapshot { fetched: string; count: number; list: CbSnapItem[] }

export interface CbSeries { name: string; listing: string; delist: string | null; s: number; c: number[]; d: string[] }
export interface CbPriceHist { axis: string[]; bench: number[]; meta: Record<string, string>; series: Record<string, CbSeries> }

export interface CbIntraday { fetched: string; data: Record<string, { m5: IntradayBar[]; m1: IntradayBar[] }> }
export interface IntradayBar { time: string; open: number; close: number; high: number; low: number; vol: number }

export interface EmotionDay {
  date: string; zt: number; zb: number; zb_rate: number | null; max_lb: number
  lb_dist: Record<string, number>; yzt_avg: number | null; yzt_n: number
}
export interface EmotionBkDay { date: string; close: number; pct: number | null; open: number; high: number; low: number }
export interface EmotionData { fetched: string; days: EmotionDay[]; bk?: EmotionBkDay[] }

const cache: Record<string, unknown> = {}
export function useJson<T>(path: string): T | null {
  const [data, setData] = useState<T | null>(() => (cache[path] as T) ?? null)
  useEffect(() => {
    if (cache[path]) return
    let alive = true
    fetch(import.meta.env.BASE_URL + 'data/' + path)
      .then((r) => r.json())
      .then((j) => { cache[path] = j; if (alive) setData(j) })
      .catch((e) => console.error('load fail', path, e))
    return () => { alive = false }
  }, [path])
  return data
}

export function toBars(e: KlineEntry): Bar[] {
  return e.d.map((d, i) => ({ date: d, open: e.o[i], close: e.c[i], high: e.h[i], low: e.l[i], vol: e.v[i] }))
}

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null || !isFinite(v) ? '—' : (v * 100).toFixed(digits) + '%'
export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || !isFinite(v) ? '—' : v.toFixed(digits)
