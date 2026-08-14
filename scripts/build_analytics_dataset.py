from pathlib import Path
import json

import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent

TRAINING_FILE = (
    PROJECT_DIR
    / "data"
    / "processed"
    / "forecast_training_dataset.csv"
)

BASELINES_FILE = (
    PROJECT_DIR
    / "src"
    / "data"
    / "forecast_baselines_real.json"
)

CONFIG_FILE = (
    PROJECT_DIR
    / "src"
    / "config"
    / "sales_planner_config_v2.json"
)

OUTPUT_FILE = (
    PROJECT_DIR
    / "src"
    / "data"
    / "analytics.json"
)


def load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo: {path}")

    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def as_bool(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.strip()
        .str.lower()
        .isin(["true", "1", "yes", "si", "sí"])
    )


def safe_float(value):
    if value is None or pd.isna(value):
        return None

    number = float(value)

    if not np.isfinite(number):
        return None

    return round(number, 4)


def safe_int(value):
    if value is None or pd.isna(value):
        return 0

    return int(value)


def confidence_rank(value: str) -> int:
    ranks = {
        "Alta": 4,
        "Media": 3,
        "Baja": 2,
        "Referencial": 1,
    }

    return ranks.get(value, 0)


def weighted_average(items, value_key, weight_key="sampleSize"):
    valid_items = [
        item
        for item in items
        if item.get(value_key) is not None
        and item.get(weight_key, 0) > 0
    ]

    if not valid_items:
        return None

    total_weight = sum(
        item[weight_key]
        for item in valid_items
    )

    if total_weight <= 0:
        return None

    result = sum(
        item[value_key] * item[weight_key]
        for item in valid_items
    ) / total_weight

    return round(float(result), 4)


def get_master_families(config):
    brand_master = config.get("brandMaster", {})

    families = {
        str(family).strip().upper()
        for family in brand_master.values()
        if family is not None
        and str(family).strip()
    }

    return sorted(families)


def build_match_quality(training):
    counts = (
        training["match_quality"]
        .fillna("unmatched")
        .astype(str)
        .str.lower()
        .value_counts()
    )

    exact = safe_int(counts.get("exact", 0))
    probable = safe_int(counts.get("probable", 0))
    unmatched = safe_int(counts.get("unmatched", 0))
    total = safe_int(len(training))

    def percentage(count):
        if total <= 0:
            return 0.0

        return round(count / total * 100, 2)

    return {
        "total": total,
        "exact": exact,
        "probable": probable,
        "unmatched": unmatched,
        "exactPercentage": percentage(exact),
        "probablePercentage": percentage(probable),
        "unmatchedPercentage": percentage(unmatched),
    }


def build_roas_by_group(group_baselines):
    rows = []

    for baseline in group_baselines:
        rows.append(
            {
                "group": baseline.get("commercialGroup"),
                "roas": baseline.get("medianRoas"),
                "roasP25": baseline.get("roasP25"),
                "roasP75": baseline.get("roasP75"),
                "ctr": baseline.get("medianCtr"),
                "cpm": baseline.get("medianCpm"),
                "cpc": baseline.get("medianCpc"),
                "reachRate": baseline.get("medianReachRate"),
                "reachRateSource": baseline.get("reachRateSource", "historical"),
                "sampleSize": safe_int(baseline.get("sampleSize")),
                "exactSamples": safe_int(baseline.get("exactSamples")),
                "probableSamples": safe_int(baseline.get("probableSamples")),
                "confidence": baseline.get("confidence", "Referencial"),
                "salesForecastEnabled": bool(
                    baseline.get("salesForecastEnabled", False)
                ),
            }
        )

    return sorted(
        rows,
        key=lambda item: (
            item["roas"] is not None,
            item["roas"] or 0,
        ),
        reverse=True,
    )


def build_forecast_quality(group_baselines):
    return sorted(
        [
            {
                "group": baseline.get("commercialGroup"),
                "sampleSize": safe_int(baseline.get("sampleSize")),
                "originalSampleSize": safe_int(
                    baseline.get("originalSampleSize")
                ),
                "excludedAsOutlier": safe_int(
                    baseline.get("excludedAsOutlier")
                ),
                "exactSamples": safe_int(baseline.get("exactSamples")),
                "probableSamples": safe_int(
                    baseline.get("probableSamples")
                ),
                "confidence": baseline.get("confidence", "Referencial"),
                "salesForecastEnabled": bool(
                    baseline.get("salesForecastEnabled", False)
                ),
            }
            for baseline in group_baselines
        ],
        key=lambda item: (
            confidence_rank(item["confidence"]),
            item["sampleSize"],
        ),
        reverse=True,
    )


def build_families(family_group_baselines, master_families):
    baselines_by_family = {}

    for baseline in family_group_baselines:
        family = str(
            baseline.get("family") or "SIN FAMILIA"
        ).strip().upper()

        baselines_by_family.setdefault(family, []).append(baseline)

    family_names = sorted(
        set(master_families)
        | set(baselines_by_family.keys())
    )

    rows = []

    for family in family_names:
        baselines = baselines_by_family.get(family, [])
        valid_baselines = [
            baseline
            for baseline in baselines
            if safe_int(baseline.get("sampleSize")) >= 5
        ]

        sample_size = sum(
            safe_int(baseline.get("sampleSize"))
            for baseline in valid_baselines
        )

        exact_samples = sum(
            safe_int(baseline.get("exactSamples"))
            for baseline in valid_baselines
        )

        probable_samples = sum(
            safe_int(baseline.get("probableSamples"))
            for baseline in valid_baselines
        )

        groups = sorted(
            [
                {
                    "group": baseline.get("commercialGroup"),
                    "sampleSize": safe_int(baseline.get("sampleSize")),
                    "roas": baseline.get("medianRoas"),
                    "ctr": baseline.get("medianCtr"),
                    "confidence": baseline.get(
                        "confidence", "Referencial"
                    ),
                    "salesForecastEnabled": bool(
                        baseline.get("salesForecastEnabled", False)
                    ),
                }
                for baseline in valid_baselines
            ],
            key=lambda item: item["sampleSize"],
            reverse=True,
        )

        confidence_values = [
            baseline.get("confidence", "Referencial")
            for baseline in valid_baselines
        ]

        family_confidence = (
            min(
                confidence_values,
                key=confidence_rank,
            )
            if confidence_values
            else "Sin histórico"
        )

        rows.append(
            {
                "family": family,
                "hasHistory": len(valid_baselines) > 0,
                "sampleSize": sample_size,
                "exactSamples": exact_samples,
                "probableSamples": probable_samples,
                "groupCount": len(valid_baselines),
                "roas": weighted_average(
                    valid_baselines,
                    "medianRoas",
                ),
                "ctr": weighted_average(
                    valid_baselines,
                    "medianCtr",
                ),
                "confidence": family_confidence,
                "groups": groups,
            }
        )

    return sorted(
        rows,
        key=lambda item: (
            item["hasHistory"],
            item["sampleSize"],
        ),
        reverse=True,
    )


def main():
    if not TRAINING_FILE.exists():
        raise FileNotFoundError(
            f"No existe el dataset de entrenamiento: {TRAINING_FILE}"
        )

    training = pd.read_csv(
        TRAINING_FILE,
        encoding="utf-8-sig",
    )

    baselines_file = load_json(BASELINES_FILE)
    config = load_json(CONFIG_FILE)

    baselines = baselines_file.get("baselines", [])

    group_baselines = [
        baseline
        for baseline in baselines
        if baseline.get("level") == "group"
    ]

    family_group_baselines = [
        baseline
        for baseline in baselines
        if baseline.get("level") == "family_group"
    ]

    master_families = get_master_families(config)
    families = build_families(
        family_group_baselines,
        master_families,
    )

    match_quality = build_match_quality(training)

    if "sample_is_valid" in training.columns:
        valid_observations = safe_int(
            as_bool(training["sample_is_valid"]).sum()
        )
    else:
        valid_observations = 0

    families_with_history = sum(
        1
        for family in families
        if family["hasHistory"]
    )

    families_without_history = sum(
        1
        for family in families
        if not family["hasHistory"]
    )

    output = {
        "metadata": {
            "trainingSource": TRAINING_FILE.name,
            "baselinesSource": BASELINES_FILE.name,
            "configSource": CONFIG_FILE.name,
            "method": baselines_file.get("metadata", {}).get(
                "method",
                "No especificado",
            ),
            "disclaimer": baselines_file.get("metadata", {}).get(
                "disclaimer",
                "Estimaciones referenciales basadas en históricos.",
            ),
        },
        "summary": {
            "familiesWithHistory": families_with_history,
            "familiesWithoutHistory": families_without_history,
            "totalFamilies": len(families),
            "baselinesGenerated": len(baselines),
            "familyGroupBaselines": len(family_group_baselines),
            "groupBaselines": len(group_baselines),
            "totalTrainingRows": safe_int(len(training)),
            "validObservations": valid_observations,
        },
        "matchQuality": match_quality,
        "roasByGroup": build_roas_by_group(group_baselines),
        "forecastQuality": build_forecast_quality(group_baselines),
        "families": families,
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
    print("ANALYTICS GENERADO")
    print("=" * 72)
    print(f"Familias con histórico: {families_with_history}")
    print(f"Familias sin histórico: {families_without_history}")
    print(f"Baselines generados: {len(baselines)}")
    print(f"Observaciones válidas: {valid_observations}")
    print(f"Matches exactos: {match_quality['exact']}")
    print(f"Matches probables: {match_quality['probable']}")
    print(f"Sin match: {match_quality['unmatched']}")
    print()
    print("Archivo generado:", OUTPUT_FILE)


if __name__ == "__main__":
    main()
