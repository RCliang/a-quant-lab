export default function DataPage() {
  return (
    <>
      <div className="page-head">
        <div className="crumb">DATA & METHOD</div>
        <h1>数据与方法</h1>
        <p className="oneline">本站所有图表基于真实公开数据，按 a-stock-data 工具包的数据源方式直连获取。以下说明每个数据文件、接口与回测口径。</p>
      </div>

      <section className="section">
        <h2><span className="secno">SRC</span>数据源清单</h2>
        <div>
          <div className="src-item">
            <span className="tagmono">klines_daily</span>
            <div>
              <b>ETF / 指数 / 个股 日K（前复权）</b> —— 腾讯财经 <code>web.ifzq.gtimg.cn/appstock/app/fqkline/get</code>，
              640 根/页向前翻页，零鉴权不封IP。覆盖 8 只宽基/资产 ETF、12 只行业 ETF、7 个指数、5 只个股，2018-01 至今约 2100 个交易日。
            </div>
          </div>
          <div className="src-item">
            <span className="tagmono">cb_snapshot</span>
            <div>
              <b>可转债实时快照</b> —— 东财 push2 行情 <code>api/qt/clist/get</code>，板块 <code>b:MK0354</code>（沪深可转债）。
              其中 f235=转股价、f236=转股价值、f237=转股溢价率、f240=强赎触发价（字段经 2026-09 实测校验：溢价率与价格/转股价值完全自洽）。
              双低 = 价格 + 溢价率。
            </div>
          </div>
          <div className="src-item">
            <span className="tagmono">cb_price_hist</span>
            <div>
              <b>转债历史日K（2023 起）</b> —— 腾讯日K逐券抓取。宇宙 = 上市日 ≤2022-07-01 且未在窗口前退市（东财 datacenter
              <code>RPT_BOND_CB_LIST</code> 提供含退市债的完整名单），**包含期间退市券以缓解幸存者偏差**；按退市日截断序列，
              代码复用段（如 127017）通过 120 日缺口检测剔除。
            </div>
          </div>
          <div className="src-item">
            <span className="tagmono">cb_intraday</span>
            <div>
              <b>转债 5 分钟 / 1 分钟 K</b> —— 腾讯 <code>ifzq.gtimg.cn/appstock/app/kline/mkline</code>，选取成交额最活跃的存续券。
            </div>
          </div>
          <div className="src-item">
            <span className="tagmono">emotion</span>
            <div>
              <b>涨停池情绪数据（近 80 交易日）</b> —— 东财 push2ex 三池：<code>getTopicZTPool</code>（涨停）、
              <code>getTopicZBPool</code>（炸板）、<code>getYesterdayZTPool</code>（昨涨停今日表现，旧端点 getTopicYZTPool 已 404，实测改名）。
              衍生指标：炸板率 = 炸板 ÷ (涨停+炸板)、连板最高度、连板梯队分布、昨涨停溢价均值。
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2><span className="secno">OSS</span>GitHub 开源项目（已人工核实存在）</h2>
        <div className="prose">
          <p>调研过程中检索到的 GitHub 资源，只收录能打开、内容相符的仓库：</p>
          <ul>
            <li><a href="https://github.com/hugo2046/QuantsPlaybook" target="_blank" rel="noreferrer">hugo2046/QuantsPlaybook</a> —— 券商金工研报复现集。本站已将其 <b>近一年更新</b>（RRG 行业轮动、均线收敛因子、两个网络因子项目）完整解析：研读笔记见 <a href={import.meta.env.BASE_URL + 'research/00-总览.md'} target="_blank" rel="noreferrer">research/00-总览.md</a>（另有 01~05 五份分册），新策略已上线「RRG 相对旋转图」「均线收敛因子」「学术前沿网络因子」三页。</li>
            <li><a href="https://github.com/icekale/strong-stock-screener" target="_blank" rel="noreferrer">icekale/strong-stock-screener</a> —— A股短线强势股选股工作台：强势股筛选、早盘竞价雷达、板块资金流、短线情绪、K线复盘（与「打板/情绪周期」两页的指标体系呼应）。</li>
            <li><a href="https://github.com/paulhybryant/convertible_bond" target="_blank" rel="noreferrer">paulhybryant/convertible_bond</a> —— 可转债策略与量化数据收集（含强赎/回售条款数据整理，与「可转债」三页互补）。</li>
          </ul>
          <div className="callout warn">
            诚实说明：调研报告里还出现过「寻龙诀·一进二打板」「bondTrader」两个 GitHub 项目名，
            本次复核未能找到对应仓库（疑为改名或转私有），相关引用已从正文移除/改写为"口径未复核"。
            另：QuantsPlaybook 克隆时 GitHub 直连不稳，RRG 项目部分源码文件未取全，内容以研报 md + 三份实现指南为准。
          </div>
        </div>
      </section>

      <section className="section">
        <h2><span className="secno">ENG</span>回测引擎口径</h2>
        <div className="prose">
          <ul>
            <li><b>信号执行</b>：信号在 T 日收盘计算，T+1 开盘价成交（<code>execNextOpen</code>），杜绝未来函数。</li>
            <li><b>成本</b>：单边费率按万分比（‱）计，可在每个实验室拖动调整；默认 10‱（万1）。</li>
            <li><b>指标</b>：年化 = 净值^(1/年数) − 1（244 交易日/年）；最大回撤按净值峰值；夏普 = 日均收益×244 ÷ (日波动×√244)；胜率按逐笔交易。</li>
            <li><b>轮动类</b>：等权基准 = 池内全部资产每日收益均值；换手摩擦按调仓日权重变动收取。</li>
            <li><b>网格</b>：以日内最高/最低价触格（同日多格成交简化处理），底仓可选。</li>
          </ul>
        </div>
        <div className="callout warn">
          回测的诚实声明：未建模滑点与冲击成本；转债价格轮动未含溢价率历史（公开免费源缺失）；涨停池数据为收盘口径（无法还原"盘中是否封死"）；
          所有"公开回测数据"引用自网络资料，样本期各异，**不构成投资建议**。
        </div>
      </section>

      <section className="section">
        <h2><span className="secno">RUN</span>复现方式</h2>
        <div className="prose">
          <p>本站为纯静态 React 应用。取数脚本零第三方依赖（Python 标准库直连 HTTP）：</p>
          <ul>
            <li><code>scripts/fetch_lib.py</code> —— 腾讯 K线分页器（含"param error"翻页终止、空载荷退避重试、绝不缓存空结果）、东财 datacenter/涨停池/转债快照端点。</li>
            <li><code>scripts/fetch_data.py</code> —— 按模块抓取并输出 JSON 到 <code>web/public/data/</code>。</li>
            <li>前端引擎 <code>web/src/lib/engine.ts</code> —— 指标库 + 信号回测 + 多资产轮动 + 网格，全部在浏览器端实时计算，参数即拖即得。</li>
          </ul>
        </div>
      </section>
    </>
  )
}
