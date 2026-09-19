import { Link } from 'react-router-dom'
import { CATS, STRATEGIES, type Cat } from '../content/strategies'
import { useJson, type KlineData, type KlineEntry } from '../lib/loaders'
import Spark from '../components/Spark'

const SPARK_CODES: Record<string, string> = {
  'swing-ma': 'sh600519', 'swing-macd': 'sz300750', 'swing-boll': 'sh510300',
  'swing-donchian': 'sz159915', 'swing-grid': 'sh510300', 'etf-sector-rotation': 'sh512480',
  'etf-size-rotation': 'sh510500', 'medium-dual-momentum': 'sh518880', 'medium-valuation': 'sh000300',
  'short-emotion': 'sh000001', 'short-daban': 'sz512880', 'short-longtou': 'sh512690',
  'short-breakout': 'sh512480', 'short-lowbuy': 'sh512690', 'cb-dilow': 'sh000832',
  'cb-lowprice': 'sh000832', 'cb-t0': 'sh000832',
  'etf-rrg': 'sh512800', 'factor-convergence': 'sh600519', 'research-network': 'sh000300',
}

export default function Home() {
  const data = useJson<KlineData>('klines_daily.json')
  const total = STRATEGIES.length
  const nCharts = STRATEGIES.filter((s) => s.chart).length

  return (
    <>
      <div className="hero">
        <div className="kicker">A-SHARE QUANT LAB · 深度调研 × 真实数据 × 可交互回测</div>
        <h1>把 A 股的策略江湖，<br />装进一台可以动手实验的<span className="up-c">研报终端</span>。</h1>
        <p className="lead">
          {total} 个适合中国A股的量化策略——短线打板、波段、中期配置、ETF 轮动、可转债 T+0。
          每一个都给出原理、可量化的规则、参数与坑，其中 {nCharts} 个配有真实行情数据的可交互回测：
          拖动参数，净值曲线立刻重算。
        </p>
        <div className="hero-stats">
          <div className="hs"><b>{total}</b><span>策略深度调研</span></div>
          <div className="hs"><b>{nCharts}</b><span>交互回测实验室</span></div>
          <div className="hs"><b>6.5<span style={{ fontSize: 13 }}>年</span></b><span>日K数据跨度</span></div>
          <div className="hs"><b>300<span style={{ fontSize: 13 }}>+</span></b><span>可转债实时快照</span></div>
        </div>
      </div>

      {CATS.map((c) => (
        <section key={c.key}>
          <h2 className="cat-title"><span className="dot" style={{ background: c.color }} />{c.name}</h2>
          <p className="cat-sub">{c.desc}</p>
          <div className="grid-cards">
            {STRATEGIES.filter((s) => s.cat === (c.key as Cat)).map((s, i) => {
              const code = SPARK_CODES[s.id]
              const e = data?.[code] as KlineEntry | undefined
              const values = e ? e.c.slice(-250) : []
              const up = values.length > 1 && values[values.length - 1] >= values[0]
              return (
                <Link to={'/strategy/' + s.id} className="scard" key={s.id}>
                  <div className="row1">
                    <h3>{s.title}</h3>
                    <span className="no">{c.key.slice(0, 2).toUpperCase()}·{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <p>{s.oneline}</p>
                  {values.length > 10 && <Spark values={values} color={up ? '#c8402a' : '#0e7a55'} />}
                  <div className="meta">
                    {s.chart && <span className="chip brass">可交互回测</span>}
                    {s.tags.slice(0, 3).map((t) => <span className="chip" key={t}>{t}</span>)}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      <section className="section">
        <h2><span className="secno">读法</span>这份研习室怎么用</h2>
        <div className="prose">
          <ul>
            <li><b>先看「情绪周期」</b>（短线分类）：它是所有短线策略的总开关，配了近 80 个交易日的真实涨停池数据。</li>
            <li><b>每个实验室都在撒谎边缘试探</b>：回测有简化（T+1 执行、费率、滑点），请拖动参数观察"参数敏感性"——曲线对参数越敏感，越可能过拟合。</li>
            <li><b>红色代表上涨、绿色代表下跌</b>，遵循 A 股习惯。所有回测引擎口径一致：信号 T 日收盘计算、T+1 开盘价执行、按万分比费率扣费。</li>
            <li>数据与方法细节见 <Link to="/data">数据与方法</Link> 页。</li>
          </ul>
        </div>
      </section>
    </>
  )
}
