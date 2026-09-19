import { useParams, Link } from 'react-router-dom'
import { STRATEGIES, CATS, type Block } from '../content/strategies'
import { IndicatorLab } from '../charts/IndicatorLab'
import { RotationLab } from '../charts/RotationLab'
import { GridLab } from '../charts/GridLab'
import { EmotionChart } from '../charts/EmotionChart'
import { CbScatter } from '../charts/CbScatter'
import { CbRotationLab } from '../charts/CbRotationLab'
import { CbIntradayLab } from '../charts/CbIntradayLab'
import { RrgLab } from '../charts/RrgLab'
import { ConvergenceLab } from '../charts/ConvergenceLab'
import { MaHeatmap } from '../charts/MaHeatmap'

// 轻量内联 markdown：**加粗** 与 `代码`
function MD({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9em', background: 'var(--paper-2)', padding: '1px 5px', borderRadius: 4 }}>{p.slice(1, -1)}</code>
        return p
      })}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p': return <p key={i}><MD text={b.md} /></p>
          case 'ul': return (
            <ul key={i}>{b.items.map((it, j) => <li key={j}><MD text={it} /></li>)}</ul>
          )
          case 'steps': return (
            <ol className="rule-steps" key={i}>
              {b.items.map(([t, d], j) => <li key={j}><b>{t}</b><MD text={d} /></li>)}
            </ol>
          )
          case 'table': return (
            <table className="tbl" key={i}>
              <thead><tr>{b.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k} className={b.mono?.includes(k) ? 'mono' : ''}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )
          case 'note': return <div key={i} className={'callout ' + (b.kind === 'info' ? '' : b.kind)}><MD text={b.md} /></div>
          default: return null
        }
      })}
    </div>
  )
}

function ChartByComp({ comp, props, title }: { comp: string; props?: Record<string, unknown>; title: string }) {
  switch (comp) {
    case 'indicator': return <IndicatorLab initialKind={(props?.initialKind as never) ?? 'sma'} />
    case 'rotation': return <RotationLab defaultBasket={(props?.defaultBasket as never) ?? 'sector'} defaultLookback={(props?.defaultLookback as number) ?? 20} />
    case 'grid': return <GridLab />
    case 'emotion': return <EmotionChart />
    case 'cbscatter': return <CbScatter />
    case 'cbrotation': return <CbRotationLab />
    case 'cbt0': return <CbIntradayLab />
    case 'rrg': return <RrgLab />
    case 'convergence': return <ConvergenceLab />
    default: return null
  }
}

export default function StrategyPage() {
  const { id } = useParams()
  const s = STRATEGIES.find((x) => x.id === id)
  if (!s) return <div className="prose"><p>未找到策略。<Link to="/">返回策略地图</Link></p></div>
  const cat = CATS.find((c) => c.key === s.cat)!
  const idx = STRATEGIES.filter((x) => x.cat === s.cat).findIndex((x) => x.id === s.id)
  const prev = STRATEGIES[STRATEGIES.indexOf(s) - 1]
  const next = STRATEGIES[STRATEGIES.indexOf(s) + 1]

  const sec = (no: string, title: string, blocks: Block[] | undefined) => blocks && (
    <section className="section">
      <h2><span className="secno">{no}</span>{title}</h2>
      <Blocks blocks={blocks} />
    </section>
  )

  return (
    <>
      <div className="page-head">
        <div className="crumb">{cat.name.toUpperCase()} · {String(idx + 1).padStart(2, '0')} / {STRATEGIES.filter((x) => x.cat === s.cat).length}</div>
        <h1>{s.title}</h1>
        <p className="oneline">{s.oneline}</p>
        <div className="meta" style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {s.tags.map((t) => <span className="chip brass" key={t}>{t}</span>)}
        </div>
      </div>

      {s.chart && (
        <section className="section" style={{ marginTop: 22 }}>
          <h2><span className="secno">LIVE</span>{s.chart.title}</h2>
          {/* key：切换策略时强制重挂载图表组件，避免轮动实验室等组件继承上一个策略的内部状态 */}
          <div key={s.id}>
            <ChartByComp comp={s.chart.comp} props={s.chart.props} title={s.chart.title} />
          </div>
          {s.chart.note && <div className="prose" style={{ marginTop: 8 }}><p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{s.chart.note}</p></div>}
          {s.chart.extra === 'ma-heatmap' && <MaHeatmap />}
        </section>
      )}

      {sec('01', '原理', s.sections.overview)}
      {sec('02', '可量化规则', s.sections.rules)}
      {sec('03', '关键参数', s.sections.params)}
      {sec('04', '适用与失效行情', s.sections.env)}
      {sec('05', '优点 · 缺点 · 陷阱', s.sections.risk)}
      {sec('06', '公开回测数据', s.sections.backtests)}
      <section className="section">
        <h2><span className="secno">REF</span>来源与延伸阅读</h2>
        <div className="prose">
          <ul>
            {s.sections.refs.map((r) => <li key={r}><a href={r} target="_blank" rel="noreferrer">{r}</a></li>)}
          </ul>
        </div>
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 13.5 }}>
        {prev ? <Link to={'/strategy/' + prev.id}>← {prev.title}</Link> : <span />}
        {next ? <Link to={'/strategy/' + next.id}>{next.title} →</Link> : <span />}
      </nav>
    </>
  )
}
