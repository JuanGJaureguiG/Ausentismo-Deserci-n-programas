import openpyxl, json
from collections import defaultdict

SRC = "/mnt/user-data/uploads/3__Historico_Ausentismo_y_Deserción_STH_-_Programas_31-8-2026.xlsx"
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

def parse_sheet(sheet_name):
    ws = wb[sheet_name]
    rows = ws.iter_rows(min_row=2, values_only=True)
    # (cu, programa, periodo) -> [poblacion, ausentes/desertores]
    agg = defaultdict(lambda: [0, 0])
    periods_set = set()
    cus_set = set()
    for row in rows:
        cu_raw = row[0]
        if cu_raw is None:
            continue
        cu = cu_raw.replace('CU ', '').strip()
        programa = (row[3] or '').strip()
        periodo = row[4]
        pob = row[5] or 0
        cnt = row[6] or 0
        key = (cu, programa, periodo)
        agg[key][0] += pob
        agg[key][1] += cnt
        periods_set.add(periodo)
        cus_set.add(cu)
    return agg, sorted(periods_set), sorted(cus_set)

aus_agg, aus_periods, aus_cus = parse_sheet('Ausentismo por Programa')
des_agg, des_periods, des_cus = parse_sheet('Deserción por Programa')

def sort_periods(periods):
    return sorted(periods, key=lambda p: (int(p.split('-')[0]), int(p.split('-')[1])))

aus_periods = sort_periods(aus_periods)
des_periods = sort_periods(des_periods)

print('Ausentismo: rows', len(aus_agg), 'periods', aus_periods[0], '...', aus_periods[-1], len(aus_periods), 'CUs', aus_cus)
print('Deserción: rows', len(des_agg), 'periods', des_periods[0], '...', des_periods[-1], len(des_periods), 'CUs', des_cus)

# ---------------------------------------------------------------
# series por CU (y Sede total) sumando todos los programas
# ---------------------------------------------------------------
def build_cu_series(agg, periods, cus):
    period_idx = {p: i for i, p in enumerate(periods)}
    pob_by_cu = {cu: [0] * len(periods) for cu in cus}
    cnt_by_cu = {cu: [0] * len(periods) for cu in cus}
    pob_sede = [0] * len(periods)
    cnt_sede = [0] * len(periods)
    for (cu, programa, periodo), (pob, cnt) in agg.items():
        i = period_idx[periodo]
        pob_by_cu[cu][i] += pob
        cnt_by_cu[cu][i] += cnt
        pob_sede[i] += pob
        cnt_sede[i] += cnt

    series = {}
    for cu in cus:
        series[cu] = [round(cnt_by_cu[cu][i] / pob_by_cu[cu][i] * 100, 2) if pob_by_cu[cu][i] else None for i in range(len(periods))]
    series['Sede Tolima-Huila'] = [round(cnt_sede[i] / pob_sede[i] * 100, 2) if pob_sede[i] else None for i in range(len(periods))]
    return series

aus_cu_series = build_cu_series(aus_agg, aus_periods, aus_cus)
des_cu_series = build_cu_series(des_agg, des_periods, des_cus)

# ---------------------------------------------------------------
# lista de programas con periodos completos (para tabla y alertas)
# ---------------------------------------------------------------
def build_programs_list(agg, periods):
    by_prog = defaultdict(dict)
    for (cu, programa, periodo), (pob, cnt) in agg.items():
        by_prog[(cu, programa)][periodo] = (pob, cnt)

    out = []
    for (cu, programa), pmap in by_prog.items():
        periods_dict = {}
        pct_series, idx_series = [], []
        for idx, p in enumerate(periods):
            if p in pmap:
                pob, cnt = pmap[p]
                pct = round(cnt / pob * 100, 2) if pob else None
                periods_dict[p] = {"pct": pct, "cnt": cnt, "pob": pob}
                if pct is not None:
                    pct_series.append(pct); idx_series.append(idx)
            else:
                periods_dict[p] = {"pct": None, "cnt": None, "pob": None}

        active_sems = len(pct_series)
        avg_pct = round(sum(pct_series) / active_sems, 2) if active_sems else None

        slope = 0
        if active_sems >= 2:
            n = active_sems
            sx = sum(idx_series); sy = sum(pct_series)
            sxx = sum(x * x for x in idx_series); sxy = sum(x * y for x, y in zip(idx_series, pct_series))
            denom = (n * sxx - sx * sx)
            slope = round((n * sxy - sx * sy) / denom, 4) if denom else 0

        out.append({
            "cu": cu, "programa": programa,
            "avg_pct": avg_pct, "trend_slope": slope, "active_sems": active_sems,
            "periods": periods_dict
        })
    return out

aus_programs = build_programs_list(aus_agg, aus_periods)
des_programs = build_programs_list(des_agg, des_periods)

data = {
    "ausentismo": {"periods": aus_periods, "cu_series": aus_cu_series, "programs": aus_programs},
    "desercion": {"periods": des_periods, "cu_series": des_cu_series, "programs": des_programs},
    "as_of": "31 de agosto de 2026"
}

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

import os
print("data.json size:", round(os.path.getsize("data.json")/1024, 1), "KB")
print("programas ausentismo:", len(aus_programs), " desercion:", len(des_programs))
