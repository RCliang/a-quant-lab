# -*- coding: utf-8 -*-
"""A股数据获取库（零第三方依赖，参考 a-stock-data skill 的数据源方式）
数据源：
  1. 腾讯财经 web.ifzq.gtimg.cn —— 日K(前复权qfq)/分钟K，零鉴权不封IP（skill §1.2/备用源K线行）
  2. 东财 datacenter-web —— 可转债列表 RPT_BOND_CB_LIST（含已退市债，可消除幸存者偏差）
  3. 东财 push2ex —— 涨停池/炸板池/昨涨停池（skill §8.1 打板层）
"""
import json
import os
import re
import ssl
import time
import random
import urllib.request
from typing import Optional

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data_cache")
_em_last_call = [0.0]


def http_get(url: str, headers: Optional[dict] = None, timeout: int = 20,
             retries: int = 3, throttle: float = 0.0) -> bytes:
    """带重试与可选节流的 GET。throttle>0 时作为两次请求最小间隔。"""
    if throttle > 0:
        wait = throttle - (time.time() - _em_last_call[0])
        if wait > 0:
            time.sleep(wait + random.uniform(0.05, 0.3))
    hs = {"User-Agent": UA}
    if headers:
        hs.update(headers)
    last_err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=hs)
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                data = r.read()
            if throttle > 0:
                _em_last_call[0] = time.time()
            return data
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (i + 1) + random.uniform(0, 1))
    raise RuntimeError(f"GET failed: {url[:120]} ... {last_err}")


def cache_path(key: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)
    return os.path.join(CACHE_DIR, safe + ".json")


def load_cached(key: str, max_age_s: float):
    p = cache_path(key)
    if os.path.exists(p) and time.time() - os.path.getmtime(p) < max_age_s:
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:  # noqa: BLE001
            return None
    return None


def save_cache(key: str, obj):
    with open(cache_path(key), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


# ---------------------------------------------------------------- 腾讯 K线
def _norm6(code: str) -> str:
    """剥掉显式前缀，只留 6 位数字码"""
    return re.sub(r"^(sh|sz|bj)", "", code.lower().strip())


def _get_prefix(code: str) -> str:
    """市场前缀规则（skill get_prefix 简化版：本脚本入参一律带显式 sh/sz 前缀）"""
    c = code.lower()
    if c.startswith(("sh", "sz", "bj")):
        return c[:2]
    raise ValueError(f"本工具要求显式前缀，如 sh510300，收到 {code}")


def tencent_daily_kline(code: str, start: str, end: str,
                        use_cache_days: float = 0.5) -> list:
    """腾讯日K（前复权）。返回 [{date, open, close, high, low, vol}] 升序。
    每次最多取 ~640 根，向前翻页直到 start。指数/债券 qfq 参数同样可用
    （无复权因子时返回 day 键，一并处理）。"""
    cache_key = f"td_{code}_{start}_{end}"
    cached = load_cached(cache_key, use_cache_days * 86400)
    if cached is not None:
        return cached
    pre = _get_prefix(code)
    code = _norm6(code)
    all_rows = {}
    cursor_end = end
    empty_retries = 0
    for _page in range(30):
        url = (f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
               f"param={pre}{code},day,{start},{cursor_end},640,qfq")
        try:
            data = json.loads(http_get(url, headers={"Referer": "https://gu.qq.com/"}))
        except Exception:  # noqa: BLE001
            if all_rows:   # 已有数据时翻页失败可容忍（提前结束）
                break
            raise
        if not isinstance(data, dict) or not isinstance(data.get("data"), dict):
            # 日期区间越界（如退市品种翻页到头）时腾讯返回 param error → 视为翻页结束
            if "param error" in str(data.get("msg", "")):
                break
            raise ValueError(f"tencent kline 异常载荷: {str(data)[:120]}")
        node = data["data"].get(f"{pre}{code}") or {}
        if not isinstance(node, dict):
            node = {}
        rows = node.get("qfqday") or node.get("day") or []
        if not rows:
            # 腾讯偶发返回空载荷（限流表现）：退避重试而非立即结束，且绝不缓存空结果
            if not all_rows and empty_retries < 3:
                empty_retries += 1
                time.sleep(1.0 + random.uniform(0, 1))
                continue
            break
        for r in rows:
            # [date, open, close, high, low, volume, ...]
            all_rows[r[0]] = {"date": r[0], "open": float(r[1]), "close": float(r[2]),
                              "high": float(r[3]), "low": float(r[4]), "vol": float(r[5]) if len(r) > 5 else 0}
        oldest = min(r[0] for r in rows)
        if oldest <= start or len(rows) < 2:
            break
        # 向前翻页：cursor_end = oldest 的前一日
        cursor_end = oldest
        time.sleep(0.25 + random.uniform(0, 0.2))
    out = [all_rows[k] for k in sorted(all_rows)]
    out = [r for r in out if start <= r["date"] <= end]
    if out:
        save_cache(cache_key, out)
    return out


def tencent_minute_kline(code: str, period: str = "m5", count: int = 320) -> list:
    """腾讯分钟K。period: m1/m5/m15/m30/m60。
    ⚠️ skill 踩坑提醒：第7字段是换手率基点不是成交额；返回 [time, open, close, high, low, vol, {}, ...]"""
    pre = _get_prefix(code)
    code = _norm6(code)
    cache_key = f"tm_{code}_{period}_{count}"
    cached = load_cached(cache_key, 3600 * 3)
    if cached is not None:
        return cached
    url = (f"https://ifzq.gtimg.cn/appstock/app/kline/mkline?"
           f"param={pre}{code},{period},,{count}")
    data = json.loads(http_get(url, headers={"Referer": "https://gu.qq.com/"}))
    node = data.get("data", {}).get(f"{pre}{code}", {})
    rows = node.get(period) or []
    out = [{"time": r[0], "open": float(r[1]), "close": float(r[2]),
            "high": float(r[3]), "low": float(r[4]), "vol": float(r[5]) if len(r) > 5 else 0}
           for r in rows]
    save_cache(cache_key, out)
    return out


def tencent_quote(codes: list) -> dict:
    """腾讯实时行情（skill §1.2），返回 {code: {name, price, ...}}"""
    pre_map = {}
    for c in codes:
        pre_map[f"{_get_prefix(c)}{_norm6(c)}"] = _norm6(c)
    url = "https://qt.gtimg.cn/q=" + ",".join(pre_map.keys())
    text = http_get(url).decode("gbk", "ignore")
    result = {}
    for line in text.strip().split(";"):
        if "=" not in line or '"' not in line:
            continue
        key = line.split("=")[0].split("_")[-1]
        vals = line.split('"')[1].split("~")
        if len(vals) < 46:
            continue
        code = pre_map.get(key, key[2:])
        result[code] = {
            "name": vals[1], "price": float(vals[3]) if vals[3] else 0,
            "change_pct": float(vals[32]) if vals[32] else 0,
            "turnover_pct": float(vals[38]) if vals[38] else 0,
        }
    return result


# ---------------------------------------------------------------- 东财 可转债
def eastmoney_cb_list(max_pages: int = 6, page_size: int = 200) -> list:
    """东财可转债全列表（含已退市债）。关键页缓存 1 天。
    注意 skill 铁律：东财接口串行 + 间隔 ≥1s（em_get 方式）。"""
    cache_key = "em_cb_list_full"
    cached = load_cached(cache_key, 86400)
    if cached is not None:
        return cached
    out = []
    for page in range(1, max_pages + 1):
        url = ("https://datacenter-web.eastmoney.com/api/data/v1/get?"
               "reportName=RPT_BOND_CB_LIST&columns=ALL&filter="
               f"&pageNumber={page}&pageSize={page_size}&source=WEB&client=WEB")
        d = json.loads(http_get(url, throttle=1.2))
        res = (d.get("result") or {})
        rows = res.get("data") or []
        if not rows:
            break
        out.extend(rows)
        if page >= (res.get("pages") or 1):
            break
    save_cache(cache_key, out)
    return out


# ---------------------------------------------------------------- 东财 打板池
_ZT_UT = "7eea3edcaed734bea9cbfc24409ed989"


def em_zt_pool(date_yyyymmdd: str) -> list:
    """东财涨停池（skill §8.1）。字段：c代码 n名称 lbc连板数 zbc炸板次数 hybk行业 fund封单资金"""
    url = (f"https://push2ex.eastmoney.com/getTopicZTPool?ut={_ZT_UT}&dpt=wz.ztzt"
           f"&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date={date_yyyymmdd}")
    d = json.loads(http_get(url, throttle=1.1))
    return ((d.get("data") or {}).get("pool")) or []


def em_zb_pool(date_yyyymmdd: str) -> list:
    """东财炸板池（涨停后开板）"""
    url = (f"https://push2ex.eastmoney.com/getTopicZBPool?ut={_ZT_UT}&dpt=wz.ztzt"
           f"&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date={date_yyyymmdd}")
    d = json.loads(http_get(url, throttle=1.1))
    return ((d.get("data") or {}).get("pool")) or []


def em_yzt_pool(date_yyyymmdd: str) -> list:
    """东财昨涨停池（昨日涨停今日表现）→ 平均涨幅 = 昨日涨停今日溢价。
    ⚠️ 旧端点 getTopicYZTPool 已下线(404)，2026-09 实测改名为 getYesterdayZTPool。
    字段: c代码 n名称 zdp今日涨幅 ylbc昨日连板数 hybk行业"""
    url = (f"https://push2ex.eastmoney.com/getYesterdayZTPool?ut={_ZT_UT}&dpt=wz.ztzt"
           f"&Pageindex=0&pagesize=1000&sort=zs%3Adesc&date={date_yyyymmdd}")
    d = json.loads(http_get(url, throttle=1.1))
    return ((d.get("data") or {}).get("pool")) or []


_CB_FS = "b:MK0354"  # 沪深可转债板块（2026-09 实测探测得到）


def em_bk_kline(secid: str = "90.BK0815", beg: str = "20240101") -> list:
    """东财板块指数日K（如 90.BK0815 = 昨日涨停指数）。
    涨停池 push2ex 仅保留约15个交易日，长周期情绪数据用 BK0815 的日涨跌幅代替
    （其日涨跌幅 ≈ 昨日涨停股今日平均溢价）。"""
    url = ("https://push2his.eastmoney.com/api/qt/stock/kline/get?"
           f"secid={secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57"
           f"&klt=101&fqt=1&beg={beg}&end=20500101")
    d = json.loads(http_get(url, throttle=1.0))
    kl = ((d.get("data") or {}).get("klines")) or []
    out = []
    prev_close = None
    for row in kl:
        p = row.split(",")
        date_str, close = p[0], float(p[2])
        pct = (close / prev_close - 1) * 100 if prev_close else None
        out.append({"date": date_str, "close": close, "pct": round(pct, 2) if pct is not None else None,
                    "open": float(p[1]), "high": float(p[3]), "low": float(p[4])})
        prev_close = close
    return out


def em_cb_snapshot() -> list:
    """东财 push2 clist 沪深可转债快照。字段实测（2026-09）：
    f12代码 f14名称 f2现价 f3涨跌幅 f6成交额 f20总市值(=剩余面值×现价,亿/1e8)
    f232正股代码 f234正股名 f235转股价 f236转股价值 f237转股溢价率%
    f240强赎触发价 f242上市日(yyyymmdd)"""
    out = []
    page = 1
    while True:
        url = ("https://push2.eastmoney.com/api/qt/clist/get?"
               f"pn={page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12&fs={_CB_FS}"
               "&fields=f12,f14,f2,f3,f6,f8,f20,f232,f234,f235,f236,f237,f240,f242")
        d = json.loads(http_get(url, throttle=1.0))
        diff = ((d.get("data") or {}).get("diff")) or []
        if not diff:
            break
        out.extend(diff)
        total = (d.get("data") or {}).get("total") or 0
        if len(out) >= total or page > 12:
            break
        page += 1
    return out
