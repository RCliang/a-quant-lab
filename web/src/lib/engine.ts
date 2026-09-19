// 通用回测引擎：信号在 T 日收盘计算，T+1 开盘价执行（避免未来函数）。
// 所有策略图表共用本引擎，保证口径一致。

export interface Bar {
  date: string
  open: number
  close: number
  high: number
  low: number
  vol: number
}

export const sma = (xs: number[], n: number): (number | null)[] => {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i]
    if (i >= n) sum -= xs[i - n]
    out.push(i >= n - 1 ? sum / n : null)
  }
  return out
}

export const ema = (xs: number[], n: number): (number | null)[] => {
  const out: (number | null)[] = []
  const k = 2 / (n + 1)
  let prev: number | null = null
  for (let i = 0; i < xs.length; i++) {
    if (i === n - 1) {
      prev = xs.slice(0, n).reduce((a, b) => a + b, 0) / n
    } else if (i >= n) {
      prev = xs[i] * k + (prev as number) * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export const std = (xs: number[], n: number): (number | null)[] => {
  const out: (number | null)[] = []
  for (let i = 0; i < xs.length; i++) {
    if (i < n - 1) { out.push(null); continue }
    const w = xs.slice(i - n + 1, i + 1)
    const m = w.reduce((a, b) => a + b, 0) / n
    out.push(Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n))
  }
  return out
}

export const macd = (xs: number[], fast = 12, slow = 26, sig = 9) => {
  const ef = ema(xs, fast), es = ema(xs, slow)
  const dif = xs.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null))
  const valid = dif.map((v) => v ?? 0)
  const deaRaw = ema(valid, sig)
  const dea = dif.map((v, i) => (v == null ? null : deaRaw[i]))
  const hist = dif.map((v, i) => (v != null && dea[i] != null ? v - (dea[i] as number) : null))
  return { dif, dea, hist }
}

export const rollingMax = (xs: number[], n: number): (number | null)[] =>
  xs.map((_, i) => (i < n ? null : Math.max(...xs.slice(i - n, i))))
export const rollingMin = (xs: number[], n: number): (number | null)[] =>
  xs.map((_, i) => (i < n ? null : Math.min(...xs.slice(i - n, i))))

export const pctChange = (xs: number[], n: number): (number | null)[] =>
  xs.map((v, i) => (i < n || xs[i - n] === 0 ? null : v / xs[i - n] - 1))

// ── 信号策略：pos(t) = 目标仓位 ∈ {0..1}，基于截至 t 收盘的信息 ──
export type SignalFn = (i: number) => number

export interface Trade {
  inDate: string; inPx: number; outDate: string; outPx: number
  ret: number; bars: number
}

export interface BacktestResult {
  dates: string[]
  equity: number[]          // 策略净值（初始=1）
  bench: number[]           // 买入持有净值
  pos: number[]             // 实际仓位（T+1 执行后）
  rawPos: number[]          // 信号仓位（未执行延迟）
  trades: Trade[]
  metrics: Metrics
}

export interface Metrics {
  totalRet: number; cagr: number; maxDD: number; sharpe: number
  winRate: number; trades: number; benchRet: number; benchCagr: number
  benchMaxDD: number; exposure: number; years: number
}

export const calcMetrics = (equity: number[], bench: number[], dates: string[], trades: Trade[], pos: number[]): Metrics => {
  const n = equity.length
  const years = Math.max(n / 244, 1e-9)
  const totalRet = equity[n - 1] - 1
  const cagr = Math.pow(equity[n - 1], 1 / years) - 1
  const benchRet = bench[n - 1] - 1
  const benchCagr = Math.pow(bench[n - 1], 1 / years) - 1
  let peak = equity[0], maxDD = 0
  for (const v of equity) { peak = Math.max(peak, v); maxDD = Math.min(maxDD, v / peak - 1) }
  let bpeak = bench[0], benchMaxDD = 0
  for (const v of bench) { bpeak = Math.max(bpeak, v); benchMaxDD = Math.min(benchMaxDD, v / bpeak - 1) }
  const rets: number[] = []
  for (let i = 1; i < n; i++) if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1)
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1))
  const sharpe = sd > 0 ? (mean * 244) / (sd * Math.sqrt(244)) : 0
  const wins = trades.filter((t) => t.ret > 0).length
  const exposure = pos.reduce((a, b) => a + b, 0) / (pos.length || 1)
  return { totalRet, cagr, maxDD, sharpe, winRate: trades.length ? wins / trades.length : 0, trades: trades.length, benchRet, benchCagr, benchMaxDD, exposure, years }
}

export interface BacktestOpts {
  feeBps?: number          // 单边费率（万分之）
  execNextOpen?: boolean   // 默认 true
}

export function runSignalBacktest(bars: Bar[], signal: SignalFn, opts: BacktestOpts = {}): BacktestResult {
  const fee = (opts.feeBps ?? 10) / 10000
  const execNextOpen = opts.execNextOpen ?? true
  const n = bars.length
  const rawPos = bars.map((_, i) => Math.max(0, Math.min(1, signal(i))))
  const equity: number[] = [1]
  const bench: number[] = [bars.length ? bars[0].close / bars[0].close : 1]
  const pos: number[] = [0]
  const trades: Trade[] = []
  let cur: Trade | null = null
  let units = 0 // 持仓份额（净值口径）
  let cash = 1  // 净值口径现金
  for (let i = 1; i < n; i++) {
    const target = execNextOpen ? rawPos[i - 1] : rawPos[i]
    const px = execNextOpen ? bars[i].open : bars[i].close
    const prevPx = bars[i - 1].close
    const curPosW = units * prevPx / (cash + units * prevPx || 1)
    if (Math.abs(target - curPosW) > 0.001) {
      const totalV = cash + units * px
      const turn = Math.abs(target - curPosW) * totalV
      cash = totalV * (1 - target) - turn * fee
      units = (totalV * target - turn * fee) / px
      if (target > curPosW && cur === null) cur = { inDate: bars[i].date, inPx: px, outDate: '', outPx: 0, ret: 0, bars: 0 }
      if (target < curPosW && cur) {
        cur.outDate = bars[i].date; cur.outPx = px
        cur.ret = cur.outPx / cur.inPx - 1 - 2 * fee
        cur.bars = i - bars.findIndex((b) => b.date === cur!.inDate)
        trades.push(cur); cur = null
      }
    }
    const v = cash + units * bars[i].close
    equity.push(v)
    bench.push(bench[i - 1] * (bars[i].close / prevPx))
    pos.push(units * bars[i].close / (v || 1))
  }
  const metrics = calcMetrics(equity, bench, bars.map((b) => b.date), trades, pos)
  return { dates: bars.map((b) => b.date), equity, bench, pos, rawPos, trades, metrics }
}

// ── 动量轮动回测（多资产）──────────────────────────────
export interface AssetSeries { code: string; name: string; dates: string[]; close: number[] }

export interface RotationOpts {
  lookback: number        // 动量窗口（交易日）
  holdN: number
  rebalance: number       // 调仓间隔（交易日）
  absFilter?: boolean     // 绝对动量：动量≤0 不持有（空仓）
  feeBps?: number
}

export interface RotationResult {
  dates: string[]
  equity: number[]
  bench: number[]         // 等权基准（每日再平衡）
  holdings: { date: string; codes: string[] }[]
  metrics: Metrics
  turnover: number
}

export function runRotation(assets: AssetSeries[], opts: RotationOpts, benchCode?: string): RotationResult {
  // 对齐日历：以全部日期并集为准
  const dateSet = new Set<string>()
  assets.forEach((a) => a.dates.forEach((d) => dateSet.add(d)))
  const dates = [...dateSet].sort()
  const dIdx = new Map(dates.map((d, i) => [d, i]))
  const px: (number | null)[][] = assets.map((a) => {
    const arr: (number | null)[] = new Array(dates.length).fill(null)
    a.dates.forEach((d, i) => { arr[dIdx.get(d) as number] = a.close[i] })
    return arr
  })
  const firstValid = px.map((p) => p.findIndex((v) => v != null))
  const fee = (opts.feeBps ?? 10) / 10000
  const weights: number[] = new Array(assets.length).fill(0)
  let equity = 1
  const eqArr: number[] = []
  // 等权基准（各资产每日收益均值，缺失日跳过）
  const benchArr: number[] = []
  let benchV = 1
  let lastReb = -Infinity
  const holdings: { date: string; codes: string[] }[] = []
  let buys = 0
  for (let t = 0; t < dates.length; t++) {
    // 当日收益（按昨日权重）
    if (t > 0) {
      let portRet = 0, wsum = 0
      for (let a = 0; a < assets.length; a++) {
        const p0 = px[a][t - 1], p1 = px[a][t]
        if (p0 != null && p1 != null && weights[a] > 0) {
          portRet += weights[a] * (p1 / p0 - 1)
          wsum += weights[a]
        }
      }
      if (wsum > 0) equity *= 1 + portRet
      // 基准
      let bret = 0, bn = 0
      for (let a = 0; a < assets.length; a++) {
        const p0 = px[a][t - 1], p1 = px[a][t]
        if (p0 != null && p1 != null) { bret += p1 / p0 - 1; bn++ }
      }
      benchV *= 1 + (bn ? bret / bn : 0)
    }
    // 调仓日：用截至昨收的动量排序，今日收盘价执行（简化：当日无未来信息——动量用 t-1）
    if (t - lastReb >= opts.rebalance && t >= opts.lookback) {
      const mom = assets.map((_, a) => {
        const i0 = t - opts.lookback
        const p0 = px[a][i0], p1 = px[a][t - 1]
        if (p0 == null || p1 == null || i0 < firstValid[a]) return null
        return p1 / p0 - 1
      })
      const ranked = mom
        .map((m, a) => ({ m, a }))
        .filter((x) => x.m != null)
        .sort((x, y) => (y.m as number) - (x.m as number))
      const picked = ranked.filter((x) => !opts.absFilter || (x.m as number) > 0).slice(0, opts.holdN)
      const newW = new Array(assets.length).fill(0)
      picked.forEach((x) => { newW[x.a] = 1 / Math.max(picked.length, 1) })
      const changed = newW.some((w, a) => Math.abs(w - weights[a]) > 1e-6)
      if (changed) { buys += picked.length; holdings.push({ date: dates[t], codes: picked.map((x) => assets[x.a].code) }) }
      newW.forEach((w, a) => {
        const turn = Math.abs(w - weights[a])
        if (turn > 1e-6) equity *= 1 - turn * fee
        weights[a] = w
      })
      lastReb = t
    }
    eqArr.push(equity)
    benchArr.push(benchV)
  }
  const trades: Trade[] = []  // 轮动策略不计算逐笔
  const metrics = calcMetrics(eqArr, benchArr, dates, trades, new Array(dates.length).fill(1))
  return { dates, equity: eqArr, bench: benchArr, holdings, metrics, turnover: buys }
}

// ── 网格回测 ────────────────────────────────────────
export interface GridOpts {
  stepPct: number        // 网格间距 %
  parts: number          // 资金份数
  feeBps: number
  basePct?: number       // 底仓比例 %
}
export interface GridResult {
  dates: string[]
  equity: number[]
  bench: number[]
  buys: { date: string; px: number }[]
  sells: { date: string; px: number }[]
  metrics: Metrics
  filled: number
  perGridRet: number
}

export function runGrid(bars: Bar[], opts: GridOpts): GridResult {
  const step = opts.stepPct / 100
  const fee = opts.feeBps / 10000
  // 会计口径：总资金=1，每份现金 partCash；买入按份支付现金换入份额（股数），净值=现金+份额×收盘价
  const partCash = 1 / opts.parts
  const baseParts = opts.basePct ? Math.floor((opts.basePct / 100) * opts.parts) : 0
  let cash = 1
  let shares = 0
  let partsHeld = 0
  let avgSharesPerPart = 0   // 每份平均股数（卖出按平均值出）
  let gridAnchor = bars[0].open
  const equity: number[] = []
  const bench: number[] = []
  const buys: { date: string; px: number }[] = []
  const sells: { date: string; px: number }[] = []
  let filled = 0
  // 建底仓
  if (baseParts > 0) {
    const cost = baseParts * partCash
    cash -= cost
    shares += cost * (1 - fee) / bars[0].open
    partsHeld = baseParts
    avgSharesPerPart = (cost * (1 - fee) / bars[0].open)
  }
  for (const b of bars) {
    // 跌触格 → 买入一份（同日多格依次触发；先买后卖的次序为简化假设）
    while (partsHeld < opts.parts && gridAnchor * (1 - step) >= b.low) {
      const buyPx = gridAnchor * (1 - step)
      cash -= partCash
      const got = partCash * (1 - fee) / buyPx
      avgSharesPerPart = (avgSharesPerPart * partsHeld + got) / (partsHeld + 1)
      shares += got
      partsHeld++
      buys.push({ date: b.date, px: buyPx })
      filled++
      gridAnchor = buyPx
    }
    // 涨触格 → 卖出一份
    while (partsHeld > baseParts && gridAnchor * (1 + step) <= b.high) {
      const sellPx = gridAnchor * (1 + step)
      cash += avgSharesPerPart * sellPx * (1 - fee)
      shares -= avgSharesPerPart
      partsHeld--
      sells.push({ date: b.date, px: sellPx })
      filled++
      gridAnchor = sellPx
    }
    equity.push(cash + shares * b.close)
    bench.push(b.close / bars[0].open)
  }
  const pos = equity.map((v, i) => (shares * bars[i].close) / (v || 1))
  const metrics = calcMetrics(equity, bench, bars.map((b) => b.date), [], pos)
  return { dates: bars.map((b) => b.date), equity, bench, buys, sells, metrics, filled, perGridRet: step - 2 * fee }
}
