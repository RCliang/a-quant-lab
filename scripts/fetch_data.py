# -*- coding: utf-8 -*-
"""为前端网站产出全部数据 JSON。用法：
  python3 scripts/fetch_data.py klines    # ETF/指数/个股 日K
  python3 scripts/fetch_data.py cb        # 可转债列表快照 + 低价轮动历史 + 分钟K
  python3 scripts/fetch_data.py emotion   # 涨停/炸板/昨涨停池 → 情绪周期日序列
  python3 scripts/fetch_data.py all
输出: web/public/data/*.json
"""
import json
import os
import sys
import time
import datetime as dt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_lib import (tencent_daily_kline, tencent_minute_kline, tencent_quote,
                       eastmoney_cb_list, em_zt_pool, em_zb_pool, em_yzt_pool,
                       em_cb_snapshot, em_bk_kline, http_get, save_cache)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "web", "public", "data")
# 抓取截止日 = 今天（此前硬编码 2026-09-18，导致自动更新永远抓不到新数据）
TODAY = dt.date.today().isoformat()

os.makedirs(OUT, exist_ok=True)


def write_json(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ {name}: {os.path.getsize(path)/1024:.0f} KB")


# ---------------------------------------------------------------- 标的池
# ETF（波段/轮动/网格）——优先流动性好、历史长
ETF_BROAD = {
    "sh510300": "沪深300ETF", "sh510500": "中证500ETF", "sz512100": "中证1000ETF",
    "sz159915": "创业板ETF", "sh588000": "科创50ETF", "sh518880": "黄金ETF",
    "sh513100": "纳指ETF", "sh511260": "十年国债ETF",
}
ETF_SECTOR = {
    "sz512880": "证券ETF", "sh512690": "酒ETF", "sz512010": "医药ETF",
    "sh512480": "半导体ETF", "sz515030": "新能源车ETF", "sh512800": "银行ETF",
    "sh512660": "军工ETF", "sz512200": "房地产ETF", "sh512400": "有色金属ETF",
    "sz159928": "消费ETF", "sh515790": "光伏ETF", "sh512000": "券商ETF",
}
INDICES = {
    "sh000001": "上证指数", "sh000300": "沪深300", "sh000905": "中证500",
    "sz399006": "创业板指", "sh000688": "科创50", "sh000852": "中证1000",
    "sh000832": "中证转债",
}
STOCKS = {
    "sh600519": "贵州茅台", "sz300750": "宁德时代", "sz000001": "平安银行",
    "sh600036": "招商银行", "sh601318": "中国平安",
}


def extend_with_sina(code: str, base_path: str):
    """腾讯故障降级：读上一期 klines_daily.json 里该标的的序列，用新浪日线追加其后的新日期。
    返回与主流程相同的 dict 结构；无底仓或无新数据时返回 None。"""
    from fetch_lib import sina_daily_recent
    try:
        base = json.load(open(base_path, encoding="utf-8")).get(code)
        if not base or not base.get("d"):
            return None
        last = base["d"][-1]
        fresh = []
        try:
            recent = sina_daily_recent(code, 300)
            fresh = [r for r in recent if r["date"] > last]
        except Exception as e:  # noqa: BLE001
            print(f"  sina 增量失败 {code}: {e}（沿用上一期底仓）")
        return {
            "name": base.get("name") or code,
            "d": base["d"] + [r["date"] for r in fresh],
            "o": base["o"] + [round(r["open"], 3) for r in fresh],
            "c": base["c"] + [round(r["close"], 3) for r in fresh],
            "h": base["h"] + [round(r["high"], 3) for r in fresh],
            "l": base["l"] + [round(r["low"], 3) for r in fresh],
            "v": base["v"] + [round(r["vol"], 0) for r in fresh],
        }
    except Exception as e:  # noqa: BLE001
        print(f"  sina 降级失败 {code}: {e}")
        return None


def fetch_klines():
    start, end = "2018-01-01", TODAY
    result = {"meta": {"start": start, "end": end, "source": "腾讯财经 fqkline (前复权) · 故障时新浪增量降级",
                       "fetched": dt.date.today().isoformat()}}
    todo = {}
    todo.update(ETF_BROAD); todo.update(ETF_SECTOR); todo.update(INDICES); todo.update(STOCKS)
    quotes = {}
    try:
        quotes = tencent_quote(list(todo.keys()))
    except Exception as e:  # noqa: BLE001
        print("quote fail", e)
    for code, fallback_name in todo.items():
        try:
            rows = tencent_daily_kline(code, start, end)
        except Exception:  # noqa: BLE001
            rows = []
        if not rows:
            # 腾讯 fqkline 故障时的降级：以上一期数据为底，用新浪日线补增量
            rows = extend_with_sina(code, os.path.join(OUT, "klines_daily.json"))
            if rows:
                print(f"△ {code} {fallback_name}: 腾讯不可用，新浪增量 +{len(rows['d'])}根")
                result[code] = rows
                time.sleep(0.3)
                continue
            print(f"✗ {code} {fallback_name} 无数据，跳过")
            continue
        result[code] = {
            "name": (quotes.get(code, {}) or {}).get("name") or fallback_name,
            "d": [r["date"] for r in rows],
            "o": [round(r["open"], 3) for r in rows],
            "c": [round(r["close"], 3) for r in rows],
            "h": [round(r["high"], 3) for r in rows],
            "l": [round(r["low"], 3) for r in rows],
            "v": [round(r["vol"], 0) for r in rows],
        }
        print(f"✓ {code} {result[code]['name']}: {len(rows)}根")
        time.sleep(0.2)
    write_json("klines_daily.json", result)


# ---------------------------------------------------------------- 可转债
def fetch_cb():
    print("拉取可转债快照（东财 push2 clist b:MK0354，带转股溢价率）...")
    snap = None
    try:
        rows = em_cb_snapshot()
        print(f"快照条数: {len(rows)}")
        snap = []
        for r in rows:
            try:
                price = float(r.get("f2") or 0)
                prem = float(r.get("f237") or 0)
            except (TypeError, ValueError):
                continue
            if price <= 0:
                continue
            conv_value = r.get("f236")
            scale_wan = r.get("f6")           # 成交额(元)
            mcap = r.get("f20")               # 剩余面值×现价(元)
            snap.append({
                "code": r.get("f12"), "name": r.get("f14"),
                "price": round(price, 3), "prem": round(prem, 2),
                "dl": round(price + prem, 2),
                "conv_value": round(float(conv_value), 2) if isinstance(conv_value, (int, float)) else None,
                "conv_price": r.get("f235"),
                "redeem_trig": r.get("f240"),
                "stock_code": r.get("f232"), "stock_name": r.get("f234"),
                "amount": round(float(scale_wan), 0) if isinstance(scale_wan, (int, float)) else 0,
                "remain_yi": round(float(mcap) / float(price) / 1e8, 2) if isinstance(mcap, (int, float)) and price else None,
                "listing": str(r.get("f242") or ""),
            })
    except Exception as e:  # noqa: BLE001
        print(f"快照接口失败({e})，尝试复用已有文件")
        try:
            snap = json.load(open(os.path.join(OUT, "cb_snapshot.json"), encoding="utf-8"))["list"]
        except Exception:  # noqa: BLE001
            snap = None
    if snap:
        write_json("cb_snapshot.json", {"fetched": dt.date.today().isoformat(),
                                        "count": len(snap), "list": snap})
        print("快照样本:", json.dumps(snap[0], ensure_ascii=False))

    # 历史K线：2023-01-02 起的轮动回测宇宙
    # 宇宙: 上市日 ≤ 2022-07-01 且 (未退市 或 退市日 ≥ 2023-01-10)
    cb_all = eastmoney_cb_list()
    w_start, w_end = "2023-01-01", TODAY
    uni = []
    for r in cb_all:
        listing = (r.get("LISTING_DATE") or "")[:10]
        delist = (r.get("DELIST_DATE") or "")[:10]
        if not listing:
            continue
        if listing <= "2022-07-01" and (not delist or delist >= "2023-01-10"):
            uni.append(r)
    print("回测宇宙（上市≤2022-07 且 未在窗口前退市）:", len(uni))

    # 日历轴：用中证转债指数
    idx_rows = tencent_daily_kline("sh000832", w_start, w_end)
    axis = [r["date"] for r in idx_rows]
    axis_idx = {d: i for i, d in enumerate(axis)}
    bench = [round(r["close"], 3) for r in idx_rows]

    series = {}
    skipped = 0
    for i, r in enumerate(uni):
        code = r.get("SECURITY_CODE")
        pre = "sh" if code.startswith(("11",)) else "sz"
        full = pre + code
        try:
            rows = tencent_daily_kline(full, w_start, w_end)
        except Exception:  # noqa: BLE001
            rows = []
        delist = (r.get("DELIST_DATE") or "")[:10]
        if rows and delist:
            rows = [x for x in rows if x["date"] <= delist]
        # 代码复用检测：段间缺口>120自然日 → 只保留第一段（原债券）
        segs, cur = [], [rows[0]] if rows else []
        for a, b in zip(rows, rows[1:]):
            gap = (dt.date.fromisoformat(b["date"]) - dt.date.fromisoformat(a["date"])).days
            if gap > 120:
                segs.append(cur); cur = []
            cur.append(b)
        if cur:
            segs.append(cur)
        if len(segs) > 1:
            print(f"⚠ {code} {r.get('SECURITY_NAME_ABBR')} 检测到 {len(segs)} 段（代码复用?），取第一段")
            rows = segs[0]
        if len(rows) < 60:
            skipped += 1
            continue
        closes = [round(x["close"], 3) for x in rows]
        dts = [x["date"] for x in rows]
        series[code] = {
            "name": r.get("SECURITY_NAME_ABBR"),
            "listing": (r.get("LISTING_DATE") or "")[:10],
            "delist": delist or None,
            "s": axis_idx.get(dts[0], 0),
            "c": closes, "d": dts,
        }
        if (i + 1) % 40 == 0:
            print(f"  ... {i+1}/{len(uni)}")
        time.sleep(0.15)
    print(f"宇宙 {len(uni)}, 有效序列 {len(series)}, 跳过 {skipped}")
    write_json("cb_price_hist.json", {
        "axis": axis, "bench": bench,
        "meta": {"window": [w_start, w_end], "universe_rule": "上市日≤2022-07-01 且 未在2023-01-10前退市（含期间退市债，缓解幸存者偏差）"},
        "series": series})

    # 分钟K（T+0 演示）：选 3 只活跃券（按成交额）
    intraday_codes = []
    snap_sorted = sorted([s for s in snap if s.get("price") and 100 <= s["price"] <= 135],
                         key=lambda x: -(x.get("amount") or 0))
    for s in snap_sorted[:6]:
        c = s["code"]
        if c.startswith(("11",)):
            intraday_codes.append("sh" + c)
        elif c.startswith(("12",)):
            intraday_codes.append("sz" + c)
        if len(intraday_codes) == 3:
            break
    intraday = {}
    for full in intraday_codes:
        try:
            m5 = tencent_minute_kline(full, "m5", 320)
            m1 = tencent_minute_kline(full, "m1", 242)
            intraday[full] = {"m5": m5, "m1": m1}
            print(f"✓ 分钟K {full}: m5={len(m5)} m1={len(m1)}")
        except Exception as e:  # noqa: BLE001
            print(f"✗ 分钟K {full}: {e}")
    names = {("sh" if c.startswith("11") else "sz") + c: None for c in []}
    write_json("cb_intraday.json", {"fetched": dt.date.today().isoformat(), "data": intraday})


# ---------------------------------------------------------------- 打板情绪
def fetch_emotion(days: int = 80):
    # 涨停池三池（push2ex 仅保留约15个交易日，早于窗口的日子返回空池）
    try:
        idx_rows = tencent_daily_kline("sh000001", "2026-04-01", TODAY)
        dates = [r["date"].replace("-", "") for r in idx_rows][-days:]
    except Exception:  # noqa: BLE001
        # 腾讯故障降级：用东财 BK0815 昨日涨停指数的日期做轴（同为交易日历）
        print("腾讯日线不可用，情绪模块日历轴降级为 BK0815")
        dates = [x["date"].replace("-", "") for x in em_bk_kline("90.BK0815", beg="20260401")][-days:]
    out = []
    for d in dates:
        zt = em_zt_pool(d) or []
        zb = em_zb_pool(d) or []
        yzt = em_yzt_pool(d) or []
        zt_n, zb_n = len(zt), len(zb)
        max_lb = max([x.get("lbc") or 1 for x in zt], default=0)
        lb_dist = {}
        for x in zt:
            lb = min(x.get("lbc") or 1, 7)
            lb_dist[lb] = lb_dist.get(lb, 0) + 1
        yzt_pcts = [float(x.get("zdp")) for x in yzt if x.get("zdp") is not None]
        yzt_avg = round(sum(yzt_pcts) / len(yzt_pcts), 2) if yzt_pcts else None
        zb_rate = round(zb_n / (zb_n + zt_n) * 100, 1) if (zb_n + zt_n) > 0 else None
        out.append({"date": d, "zt": zt_n, "zb": zb_n, "zb_rate": zb_rate,
                    "max_lb": max_lb, "lb_dist": lb_dist, "yzt_avg": yzt_avg, "yzt_n": len(yzt)})
        print(d, f"涨停{zt_n} 炸板{zb_n} 炸板率{zb_rate}% 高度{max_lb} 昨停溢价{yzt_avg}")
    # 长周期情绪：昨日涨停指数 BK0815（日涨跌幅 ≈ 昨涨停股今日平均溢价）
    bk = em_bk_kline("90.BK0815", beg="20240101")
    print(f"BK0815 昨日涨停指数: {len(bk)} 天 {bk[0]['date']} → {bk[-1]['date']}")
    write_json("emotion.json", {"fetched": dt.date.today().isoformat(),
                                "days": out, "bk": bk})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("klines", "all"):
        fetch_klines()
    if cmd in ("cb", "all"):
        fetch_cb()
    if cmd in ("emotion", "all"):
        fetch_emotion()
    print("done")
