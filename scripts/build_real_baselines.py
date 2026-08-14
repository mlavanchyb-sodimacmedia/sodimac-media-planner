from pathlib import Path
import json

import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent

INPUT_FILE = (
    PROJECT_DIR
    / "data"
    / "processed"
    / "forecast_training_dataset.csv"
)

OUTPUT_FILE = (
    PROJECT_DIR
    / "src"
    / "data"
    / "forecast_baselines_real.json"
)


DEFAULT_REACH_RATE_BY_GROUP = {
    "CRM": 1.00,
    "Google": 0.55,
    "Meta": 0.55,
    "Retail Display": 0.60,
    "Sponsored Products": 0.50,
}

DEFAULT_REACH_RATE_GLOBAL = 0.55


def normalize_family(value):
    if pd.isna(value):
        return "SIN FAMILIA"

    family = str(value).strip().upper()
    return family or "SIN FAMILIA"


def clean_numeric(series):
    return (
        pd.to_numeric(series, errors="coerce")
        .replace([np.inf, -np.inf], np.nan)
        .dropna()
    )


def median_or_none(series):
    values = clean_numeric(series)

    if values.empty:
        return None

    return round(float(values.median()), 4)


def percentile_or_none(series, percentile):
    values = clean_numeric(series)

    if values.empty:
        return None

    return round(float(values.quantile(percentile)), 4)


def confidence(sample_size):
    if sample_size >= 30:
        return "Alta"

    if sample_size >= 10:
        return "Media"

    if sample_size >= 5:
        return "Baja"

    return "Referencial"


def remove_roas_outliers(dataframe):
    valid = dataframe[
        dataframe["roas"].notna()
        & dataframe["roas"].ge(0)
        & dataframe["budget"].fillna(0).gt(0)
    ].copy()

    if len(valid) < 10:
        return valid

    lower_limit = valid["roas"].quantile(0.05)
    upper_limit = valid["roas"].quantile(0.95)

    return valid[
        valid["roas"].between(
            lower_limit,
            upper_limit,
            inclusive="both",
        )
    ].copy()


def reach_rate_with_fallback(cleaned, commercial_group):
    historical_reach_rate = median_or_none(cleaned["reach_rate"])

    if historical_reach_rate is not None and historical_reach_rate > 0:
        return historical_reach_rate, "historical"

    fallback_rate = DEFAULT_REACH_RATE_BY_GROUP.get(
        commercial_group,
        DEFAULT_REACH_RATE_GLOBAL,
    )

    return fallback_rate, "fallback"


def build_baseline(
    dataframe,
    level,
    family=None,
    commercial_group=None,
):
    original_sample_size = len(dataframe)
    cleaned = remove_roas_outliers(dataframe)
    sample_size = len(cleaned)

    median_roas = median_or_none(cleaned["roas"])
    median_ctr = median_or_none(cleaned["ctr"])
    median_cpm = median_or_none(cleaned["cpm"])
    median_cpc = median_or_none(cleaned["cpc"])
    median_margin_rate = median_or_none(cleaned["margin_rate"])

    median_reach_rate, reach_rate_source = reach_rate_with_fallback(
        cleaned,
        commercial_group,
    )

    exact_samples = int(
        (cleaned["match_quality"] == "exact").sum()
    )

    probable_samples = int(
        (cleaned["match_quality"] == "probable").sum()
    )

    sales_forecast_enabled = (
        sample_size >= 5
        and median_roas is not None
        and median_roas > 0
    )

    return {
        "level": level,
        "family": family,
        "commercialGroup": commercial_group,
        "originalSampleSize": int(original_sample_size),
        "sampleSize": int(sample_size),
        "excludedAsOutlier": int(original_sample_size - sample_size),
        "exactSamples": exact_samples,
        "probableSamples": probable_samples,
        "medianRoas": median_roas,
        "roasP25": percentile_or_none(cleaned["roas"], 0.25),
        "roasP75": percentile_or_none(cleaned["roas"], 0.75),
        "medianCtr": median_ctr,
        "medianCpm": median_cpm,
        "medianCpc": median_cpc,
        "medianReachRate": median_reach_rate,
        "reachRateSource": reach_rate_source,
        "medianMarginRate": median_margin_rate,
        "confidence": confidence(sample_size),
        "salesForecastEnabled": sales_forecast_enabled,
    }


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"No existe: {INPUT_FILE}")

    dataframe = pd.read_csv(
        INPUT_FILE,
        encoding="utf-8-sig",
    )

    numeric_columns = [
        "budget",
        "cost",
        "contribution",
        "impressions",
        "reach",
        "clicks",
        "sales",
        "ctr",
        "reach_rate",
        "roas",
        "cpm",
        "cpc",
        "margin_rate",
    ]

    for column in numeric_columns:
        if column in dataframe.columns:
            dataframe[column] = pd.to_numeric(
                dataframe[column],
                errors="coerce",
            )

    dataframe["family"] = dataframe["family"].apply(
        normalize_family
    )

    valid_flag = (
        dataframe["sample_is_valid"]
        .astype(str)
        .str.lower()
        .isin(["true", "1"])
    )

    eligible = dataframe[
        valid_flag
        & dataframe["group_key"].ne("Otros")
        & dataframe["budget"].fillna(0).gt(0)
        & dataframe["match_quality"].isin(["exact", "probable"])
    ].copy()

    baselines = []

    for (family_name, group_name), group in eligible.groupby(
        ["family", "group_key"],
        dropna=False,
    ):
        baselines.append(
            build_baseline(
                dataframe=group,
                level="family_group",
                family=str(family_name),
                commercial_group=str(group_name),
            )
        )

    for group_name, group in eligible.groupby(
        "group_key",
        dropna=False,
    ):
        baselines.append(
            build_baseline(
                dataframe=group,
                level="group",
                commercial_group=str(group_name),
            )
        )

    baselines.append(
        build_baseline(
            dataframe=eligible,
            level="global",
            commercial_group=None,
        )
    )

    output = {
        "metadata": {
            "source": "forecast_training_dataset.csv",
            "method": "mediana con filtro percentil 5-95",
            "allowedMatchQuality": ["exact", "probable"],
            "fallbackOrder": [
                "family_group",
                "group",
                "global",
                "config_benchmark",
            ],
            "eligibleRows": int(len(eligible)),
            "reachRateFallbacks": DEFAULT_REACH_RATE_BY_GROUP,
            "globalReachRateFallback": DEFAULT_REACH_RATE_GLOBAL,
            "disclaimer": (
                "Estimaciones referenciales basadas en históricos. "
                "Cuando no existe una tasa histórica de alcance, "
                "se usa un fallback por grupo comercial."
            ),
        },
        "baselines": baselines,
    }

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            output,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print()
    print("=" * 72)
    print("BASELINES REALES GENERADOS")
    print("=" * 72)
    print(f"Registros elegibles: {len(eligible):,}")
    print(f"Baselines generados: {len(baselines):,}")
    print()
    print("RESUMEN POR GRUPO:")

    for baseline in baselines:
        if baseline["level"] != "group":
            continue

        print(
            f"- {baseline['commercialGroup']}: "
            f"muestra={baseline['sampleSize']}, "
            f"ROAS={baseline['medianRoas']}, "
            f"CTR={baseline['medianCtr']}, "
            f"reachRate={baseline['medianReachRate']}, "
            f"reachSource={baseline['reachRateSource']}, "
            f"confianza={baseline['confidence']}, "
            f"ventas={baseline['salesForecastEnabled']}"
        )

    print()
    print("Archivo generado:", OUTPUT_FILE)


if __name__ == "__main__":
    main()
