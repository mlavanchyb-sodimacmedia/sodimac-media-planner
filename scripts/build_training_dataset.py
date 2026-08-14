from pathlib import Path
import re
import unicodedata

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_DIR / "data" / "raw"
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"

PERFORMANCE_FILE = RAW_DIR / "mix de medios Sodimac Media (2).xlsx"
REGISTRY_FILE = RAW_DIR / "Data_registros_20260730_1532.xlsx"

OUTPUT_FILE = PROCESSED_DIR / "forecast_training_dataset.csv"
QUALITY_FILE = PROCESSED_DIR / "forecast_match_quality.csv"


def normalize_text(value) -> str:
    if pd.isna(value):
        return ""

    text = str(value)
    text = text.replace("\u200b", "")
    text = text.replace("\ufeff", "")
    text = text.strip().lower()

    text = unicodedata.normalize("NFKD", text)
    text = "".join(
        character
        for character in text
        if not unicodedata.combining(character)
    )

    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def to_number(value):
    if pd.isna(value):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    text = text.replace("$", "")
    text = text.replace(" ", "")

    if "." in text and "," not in text:
        text = text.replace(".", "")
    elif "," in text:
        text = text.replace(".", "")
        text = text.replace(",", ".")

    try:
        return float(text)
    except ValueError:
        return None


def map_commercial_group(product, product_type=None) -> str:
    normalized = normalize_text(f"{product} {product_type or ''}")

    if any(term in normalized for term in ["search", "shopping", "pmax", "media on"]):
        return "Google"

    if any(term in normalized for term in ["facebook", "instagram", "meta", "dpa", "daba"]):
        return "Meta"

    if normalized in {"sp", "sb"} or any(
        term in normalized for term in ["sponsored", "patrocinado"]
    ):
        return "Sponsored Products"

    if any(
        term in normalized
        for term in [
            "mensajeria",
            "email",
            "emkt",
            "push",
            "whatsapp",
            "sms",
            "trigger",
            "journey",
            "carro abandonado",
            "navegacion",
            "informativo",
        ]
    ):
        return "CRM"

    if any(
        term in normalized
        for term in ["banner", "home", "vitrina", "hotseller", "sodimac ads"]
    ):
        return "Retail Display"

    return "Otros"


def safe_divide(numerator, denominator):
    if pd.isna(numerator) or pd.isna(denominator) or denominator <= 0:
        return None
    return numerator / denominator


def load_performance():
    dataframe = pd.read_excel(
        PERFORMANCE_FILE,
        sheet_name="resumen",
        engine="openpyxl",
    )

    dataframe["brand_key"] = dataframe["marca"].apply(normalize_text)
    dataframe["campaign_key"] = dataframe["nombre de campaña"].apply(normalize_text)
    dataframe["group_key"] = dataframe["Producto"].apply(map_commercial_group)
    dataframe["year"] = pd.to_numeric(dataframe["anio"], errors="coerce")
    dataframe["month"] = pd.to_numeric(dataframe["mes"], errors="coerce")

    for column in ["Impresiones", "alcance", "clicks", "venta"]:
        dataframe[column] = pd.to_numeric(dataframe[column], errors="coerce")

    return (
        dataframe.groupby(
            ["brand_key", "campaign_key", "group_key", "year", "month"],
            dropna=False,
        )
        .agg(
            original_brand=("marca", "first"),
            original_campaign=("nombre de campaña", "first"),
            impressions=("Impresiones", "sum"),
            reach=("alcance", "sum"),
            clicks=("clicks", "sum"),
            sales=("venta", "sum"),
            performance_rows=("Producto", "size"),
        )
        .reset_index()
    )


def load_registry():
    dataframe = pd.read_excel(
        REGISTRY_FILE,
        sheet_name="Registros",
        engine="openpyxl",
    )

    dataframe["brand_key"] = dataframe["Marca"].apply(normalize_text)
    dataframe["campaign_key"] = dataframe["Nombre Campaña"].apply(normalize_text)
    dataframe["group_key"] = dataframe.apply(
        lambda row: map_commercial_group(row["Producto"], row["Tipo"]),
        axis=1,
    )

    dataframe["date_parsed"] = pd.to_datetime(
        dataframe["Fecha inicio"],
        errors="coerce",
        dayfirst=True,
    )
    dataframe["year"] = dataframe["date_parsed"].dt.year
    dataframe["month"] = dataframe["date_parsed"].dt.month

    for column in ["Presupuesto", "Costo", "Contribución"]:
        dataframe[column] = dataframe[column].apply(to_number)

    return (
        dataframe.groupby(
            ["brand_key", "campaign_key", "group_key", "year", "month"],
            dropna=False,
        )
        .agg(
            family=("Familia", "first"),
            original_registry_brand=("Marca", "first"),
            original_registry_campaign=("Nombre Campaña", "first"),
            budget=("Presupuesto", "sum"),
            cost=("Costo", "sum"),
            contribution=("Contribución", "sum"),
            registry_rows=("Producto", "size"),
        )
        .reset_index()
    )


def build_exact_matches(performance, registry):
    exact_keys = ["brand_key", "campaign_key", "group_key", "year", "month"]

    exact = performance.merge(
        registry,
        on=exact_keys,
        how="left",
        indicator=True,
    )

    exact["match_quality"] = exact["_merge"].map(
        {
            "both": "exact",
            "left_only": "unmatched",
            "right_only": "unmatched",
        }
    )

    return exact.drop(columns=["_merge"])


def build_probable_candidates(registry):
    relaxed_keys = ["brand_key", "group_key", "year", "month"]

    candidate_counts = (
        registry.groupby(relaxed_keys, dropna=False)
        .size()
        .reset_index(name="candidate_count")
    )

    unique_candidates = registry.merge(
        candidate_counts,
        on=relaxed_keys,
        how="left",
    )

    unique_candidates = unique_candidates[
        unique_candidates["candidate_count"] == 1
    ].copy()

    columns = relaxed_keys + [
        "campaign_key",
        "family",
        "original_registry_brand",
        "original_registry_campaign",
        "budget",
        "cost",
        "contribution",
        "registry_rows",
        "candidate_count",
    ]

    return unique_candidates[columns]


def apply_probable_matches(exact_result, registry):
    relaxed_keys = ["brand_key", "group_key", "year", "month"]

    matched = exact_result[
        exact_result["match_quality"] == "exact"
    ].copy()

    unmatched = exact_result[
        exact_result["match_quality"] == "unmatched"
    ].copy()

    registry_columns = [
        "family",
        "original_registry_brand",
        "original_registry_campaign",
        "budget",
        "cost",
        "contribution",
        "registry_rows",
    ]

    unmatched = unmatched.drop(
        columns=[
            column
            for column in registry_columns
            if column in unmatched.columns
        ]
    )

    probable_candidates = build_probable_candidates(registry)

    probable = unmatched.merge(
        probable_candidates,
        on=relaxed_keys,
        how="left",
        suffixes=("", "_registry"),
    )

    probable["match_quality"] = probable["budget"].apply(
        lambda value: "probable" if pd.notna(value) else "unmatched"
    )

    if "campaign_key_registry" in probable.columns:
        probable = probable.rename(
            columns={
                "campaign_key_registry": "probable_registry_campaign_key",
            }
        )

    return pd.concat(
        [matched, probable],
        ignore_index=True,
        sort=False,
    )


def calculate_metrics(dataframe):
    dataframe["ctr"] = dataframe.apply(
        lambda row: (
            safe_divide(row["clicks"], row["impressions"]) * 100
            if safe_divide(row["clicks"], row["impressions"]) is not None
            else None
        ),
        axis=1,
    )

    dataframe["reach_rate"] = dataframe.apply(
        lambda row: safe_divide(row["reach"], row["impressions"]),
        axis=1,
    )

    dataframe["roas"] = dataframe.apply(
        lambda row: safe_divide(row["sales"], row["budget"]),
        axis=1,
    )

    dataframe["cpm"] = dataframe.apply(
        lambda row: (
            safe_divide(row["budget"], row["impressions"]) * 1000
            if safe_divide(row["budget"], row["impressions"]) is not None
            else None
        ),
        axis=1,
    )

    dataframe["cpc"] = dataframe.apply(
        lambda row: safe_divide(row["budget"], row["clicks"]),
        axis=1,
    )

    dataframe["margin_rate"] = dataframe.apply(
        lambda row: safe_divide(row["contribution"], row["budget"]),
        axis=1,
    )

    dataframe["sample_is_valid"] = (
        dataframe["match_quality"].isin(["exact", "probable"])
        & dataframe["budget"].fillna(0).gt(0)
        & dataframe["group_key"].ne("Otros")
    )

    return dataframe


def print_quality_summary(dataframe):
    print()
    print("=" * 72)
    print("DATASET DE ENTRENAMIENTO")
    print("=" * 72)
    print(f"Registros totales: {len(dataframe):,}")

    quality = dataframe["match_quality"].value_counts(dropna=False)

    for quality_name, count in quality.items():
        percentage = count / len(dataframe) * 100 if len(dataframe) > 0 else 0
        print(f"{quality_name}: {count:,} ({percentage:.2f}%)")

    print()
    print("MATCH POR GRUPO:")

    group_quality = (
        dataframe.groupby(["group_key", "match_quality"], dropna=False)
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    print(group_quality.to_string(index=False))

    print()
    print(
        "Registros válidos para baseline:",
        int(dataframe["sample_is_valid"].sum()),
    )

    print()
    print("ROAS VÁLIDO POR GRUPO:")

    valid = dataframe[
        dataframe["sample_is_valid"] & dataframe["roas"].notna()
    ].copy()

    if valid.empty:
        print("No se encontraron registros con ROAS válido.")
        return

    # Solo mostrar medianas. La limpieza de outliers se hará en el siguiente script.
    roas_summary = (
        valid.groupby("group_key")
        .agg(
            samples=("roas", "size"),
            median_roas=("roas", "median"),
            median_ctr=("ctr", "median"),
            median_cpm=("cpm", "median"),
            median_cpc=("cpc", "median"),
        )
        .reset_index()
    )
    print(roas_summary.to_string(index=False))


def main():
    performance = load_performance()
    registry = load_registry()

    exact_result = build_exact_matches(performance, registry)
    training_dataset = apply_probable_matches(exact_result, registry)
    training_dataset = calculate_metrics(training_dataset)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    training_dataset.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    quality_columns = [
        "original_brand",
        "original_campaign",
        "group_key",
        "year",
        "month",
        "family",
        "budget",
        "sales",
        "match_quality",
        "sample_is_valid",
        "roas",
    ]

    existing_quality_columns = [
        column
        for column in quality_columns
        if column in training_dataset.columns
    ]

    training_dataset[existing_quality_columns].to_csv(
        QUALITY_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print_quality_summary(training_dataset)

    print()
    print("Dataset generado:", OUTPUT_FILE)
    print("Auditoría generada:", QUALITY_FILE)


if __name__ == "__main__":
    main()
