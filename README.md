# A股量化策略研习室（A-Share Quant Lab）

深度调研适合中国A股的量化策略（短线打板 / 波段 / 中期配置 / ETF 轮动 / 可转债 T+0 / 因子研究），
并做成可交互的 React 学习网站：**每个策略给出原理、可量化规则、参数、适用/失效行情与坑**，
其中 15 个策略配有 **真实行情数据的可交互回测实验室**——拖动参数，净值曲线立刻重算。

2026-09 扩展：解析了 [QuantsPlaybook](https://github.com/hugo2046/QuantsPlaybook) **近一年更新**的 4 个项目
（筛选方法与全文笔记见 `research/quantsplaybook_2025-2026/`，站点内亦可访问 `/research/00-总览.md`），
新增 3 个策略页：**RRG 相对旋转图行业轮动**（四象限散点+轨迹+轮动回测）、
**均线收敛发散因子**（开源证券91，PCF/VCF 事件研究）、**学术前沿网络关系因子**（d-LE-SC / 中心度）。

2026-09 三大功能：
1. **自动更新**：`scripts/update_all.sh` 一键更新数据并重建；已配置工作日 18:00 定时任务；站内页脚有「数据截至」新鲜度横条。
2. **参数热力图 + 样本外验证**（双均线页内）：快线×慢线 99 组合网格扫描，全样本/样本内(前70%)/样本外(后30%) 三联热力图共用色标，自动生成"样本内最优 → 样本外排名/衰减"结论——把过拟合变成看得见的东西。
3. **策略对比页** `/compare`：9 个策略同一日历同一费率叠加净值 + 回撤副图 + 绩效表 + 月收益相关性矩阵（动量系策略高度相关的教学实证）。

## 运行

```bash
# 1) 取数（零第三方依赖，Python 标准库直连公开接口）
python3 scripts/fetch_data.py all        # 输出 JSON 到 web/public/data/

# 2) 前端
cd web && npm install && npm run dev     # http://127.0.0.1:5173
```

## 数据来源（参考 a-stock-data 工具包的数据源方式，全部零 key）

| 文件 | 内容 | 来源 |
|---|---|---|
| `klines_daily.json` | 8只宽基/资产ETF + 12只行业ETF + 7指数 + 5个股，日K前复权，2018 起 | 腾讯财经 `web.ifzq.gtimg.cn` fqkline |
| `cb_snapshot.json` | 全市场存续转债快照（价格/转股价/转股价值/溢价率/强赎触发价/剩余规模） | 东财 push2 `clist` 板块 `b:MK0354` |
| `cb_price_hist.json` | 转债日K宇宙（上市≤2022-07，含168只期间退市券，缓解幸存者偏差） | 腾讯日K + 东财 datacenter `RPT_BOND_CB_LIST` |
| `cb_intraday.json` | 3只活跃转债 5分钟/1分钟K | 腾讯 `mkline` |
| `emotion.json` | 涨停/炸板/昨涨停三池（近15日）+ 昨日涨停指数 BK0815 长历史 | 东财 push2ex / push2his |

实测踩坑记录（都写进了 `scripts/fetch_lib.py` 注释）：
腾讯 fqkline 翻页到退市品种尽头会返回 `param error`；偶发空载荷需退避重试且**绝不缓存空结果**；
东财昨涨停池端点已由 `getTopicYZTPool` 改名为 `getYesterdayZTPool`；涨停池仅保留约15个交易日；
push2 转债板块无 `m:t` 形式，需用板块号 `b:MK0354`，溢价率在 `f237`（与 价格/转股价值 完全自洽）；
退市转债代码会被新债复用（如 127017），需按退市日截断 + 120日缺口检测。

## 回测引擎口径（web/src/lib/engine.ts）

- 信号在 **T 日收盘计算、T+1 开盘价执行**（无未来函数）；单边费率按万分比可调。
- 轮动：动量排序在调仓日收盘执行；等权基准=池内资产日收益均值；绝对动量过滤可开关。
- 网格：现金/份额分离记账，每份=1/份数资金，日内按 low/high 触格（先买后卖的简化次序）。
- 指标：年化=净值^(1/年数)−1（244交易日/年）；夏普=日收益年化/波动年化。

## 结构

```
scripts/          fetch_lib.py（数据源封装）+ fetch_data.py（按模块产数）
web/src/
  content/        strategies.ts —— 17个策略的结构化调研内容
  charts/         7个交互实验室（指标/轮动/网格/情绪/双低散点/低价轮动/T+0）
  lib/            engine.ts 回测引擎 · loaders.ts 数据加载 · echart.ts 封装
  pages/          Home / StrategyPage / DataPage
```

仅供学习研究，不构成投资建议；回测含简化假设（滑点、涨跌停禁买等未完全建模）。
