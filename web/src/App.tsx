import { NavLink, Route, Routes } from 'react-router-dom'
import { CATS, STRATEGIES, type Cat } from './content/strategies'
import Home from './pages/Home'
import StrategyPage from './pages/StrategyPage'
import DataPage from './pages/DataPage'
import { ComparePage } from './pages/ComparePage'
import Tape from './components/Tape'
import DataFresh from './components/DataFresh'

export default function App() {
  return (
    <>
      <Tape />
      <div className="shell">
        <aside className="sidebar">
          <NavLink to="/" className="brand" style={{ textDecoration: 'none' }}>
            A股量化策略研习室
            <small>A-SHARE QUANT LAB · 2026</small>
          </NavLink>
          <div className="nav-group">
            <div className="nav-label">总览</div>
            <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="no">--</span>策略地图
            </NavLink>
            <NavLink to="/compare" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="no">--</span>策略对比
            </NavLink>
            <NavLink to="/data" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="no">--</span>数据与方法
            </NavLink>
          </div>
          {CATS.map((c) => (
            <div className="nav-group" key={c.key}>
              <div className="nav-label">{c.name}</div>
              {STRATEGIES.filter((s) => s.cat === (c.key as Cat)).map((s, i) => (
                <NavLink key={s.id} to={'/strategy/' + s.id}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                  <span className="no">{String(i + 1).padStart(2, '0')}</span>{s.title}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <main className="main">
          <div className="container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/strategy/:id" element={<StrategyPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/data" element={<DataPage />} />
            </Routes>
            <DataFresh />
            <footer className="site">
              <span>数据来源：腾讯财经 · 东方财富（涨停池/转债板块）· 参考 a-stock-data 工具包取数方式</span>
              <span>仅供学习研究，不构成投资建议 · 回测含简化假设</span>
            </footer>
          </div>
        </main>
      </div>
    </>
  )
}
