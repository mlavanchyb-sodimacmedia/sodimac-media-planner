from pathlib import Path
import re
import unicodedata

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_DIR / "data" / "raw"
OUTPUT_DIR = PROJECT_DIR / "data" / "processed"

PERFORMANCE_FILE = (
    RAW_DIR / "mix de medios Sodimac Media (2).xlsx"
)

REGISTRY_FILE = (
    RAW_DIR / "Data_registros_20260730_1532.xlsx"
)


def normalize_text(value) -> str:
    if pd.isna(value):
        return ""

    text = str(value)
    text = text.replace("\u200b", "")
    text = text.replace("\ufeff", "")
    text = text.strip().lower()

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(character)
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def to_number(value):
    if pd.isna(value):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    text = text.replace("$", "")
    text = text.replace(" ", "")

    # Formato chileno: 1.500.000
    if "." in text and "," not in text:
        text = text.replace(".", "")

    # Decimal chileno: 1.500,50
    elif "," in text:
        text = text.replace(".", "")
        text = text.replace(",", ".")

    try:
        return float(text)
    except ValueError:
        return None


def map_commercial_group(
    product,
    product_type=None,
) -> str:
    normalized = normalize_text(
        f"{product} {product_type or ''}",
    )

    if any(
        word in normalized
        for word in [
            "search",
            "shopping",
            "pmax",
            "media on",
        ]
    ):
        return "Google"

    if any(
        word in normalized
        for word in [
            "facebook",
            "instagram",
            "meta",
            "dpa",
            "daba",
        ]
    ):
        return "Meta"

    if any(
        word in normalized
        for word in [
            "sponsored",
            "patrocinado",
        ]
    ) or normalized in {"sp", "sb"}:
        return "Sponsored Products"

    if any(
        word in normalized
        for word in [
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
        word in normalized
        for word in [
            "banner",
            "home",
            "vitrina",
            "hotseller",
            "sodimac ads",
        ]
    ):
        return "Retail Display"

    return "Otros"


def load_performance():
    dataframe = pd.read_excel(
        PERFORMANCE_FILE,
        sheet_name="resumen",
        engine="openpyxl",
    )

    dataframe["brand_key"] = (
        dataframe["marca"].apply(normalize_text)
    )

    dataframe["campaign_key"] = (
        dataframe["nombre de campaña"]
        .apply(normalize_text)
    )

    dataframe["group_key"] = (
        dataframe["Producto"]
        .apply(map_commercial_group)
    )

    dataframe["year"] = pd.to_numeric(
        dataframe["anio"],
        errors="coerce",
    )

    dataframe["month"] = pd.to_numeric(
        dataframe["mes"],
        errors="coerce",
    )

    for column in [
        "Impresiones",
        "alcance",
        "clicks",
        "venta",
    ]:
        dataframe[column] = pd.to_numeric(
            dataframe[column],
            errors="coerce",
        )

    return dataframe


def load_registry():
    dataframe = pd.read_excel(
        REGISTRY_FILE,
        sheet_name="Registros",
        engine="openpyxl",
    )

    dataframe["brand_key"] = (
        dataframe["Marca"].apply(normalize_text)
    )

    dataframe["campaign_key"] = (
        dataframe["Nombre Campaña"]
        .apply(normalize_text)
    )

    dataframe["group_key"] = (
        dataframe.apply(
            lambda row: map_commercial_group(
                row["Producto"],
                row["Tipo"],
            ),
            axis=1,
        )
    )

    dataframe["date_parsed"] = pd.to_datetime(
        dataframe["Fecha inicio"],
        errors="coerce",
        dayfirst=True,
    )

    dataframe["year"] = (
        dataframe["date_parsed"].dt.year
    )

    dataframe["month"] = (
        dataframe["date_parsed"].dt.month
    )

    for column in [
        "Presupuesto",
        "Costo",
        "Contribución",
    ]:
        dataframe[column] = (
            dataframe[column].apply(to_number)
        )

    return dataframe


def main():
    performance = load_performance()
    registry = load_registry()

    performance_summary = (
        performance.groupby(
            [
                "brand_key",
                "campaign_key",
                "group_key",
                "year",
                "month",
            ],
            dropna=False,
        )
        .agg(
            impressions=("Impresiones", "sum"),
            reach=("alcance", "sum"),
            clicks=("clicks", "sum"),
            sales=("venta", "sum"),
        )
        .reset_index()
    )

    registry_summary = (
        registry.groupby(
            [
                "brand_key",
                "campaign_key",
                "group_key",
                "year",
                "month",
            ],
            dropna=False,
        )
        .agg(
            family=("Familia", "first"),
            budget=("Presupuesto", "sum"),
            cost=("Costo", "sum"),
            contribution=("Contribución", "sum"),
        )
        .reset_index()
    )

    joined = performance_summary.merge(
        registry_summary,
        on=[
            "brand_key",
            "campaign_key",
            "group_key",
            "year",
            "month",
        ],
        how="left",
        indicator=True,
    )

    joined["matched"] = (
        joined["_merge"] == "both"
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joined.to_csv(
        OUTPUT_DIR / "campaign_match_diagnostic.csv",
        index=False,
        encoding="utf-8-sig",
    )

    total = len(joined)
    matched = int(joined["matched"].sum())
    unmatched = total - matched

    match_rate = (
        matched / total * 100
        if total > 0
        else 0
    )

    print()
    print("=" * 70)
    print("DIAGNÓSTICO DE CRUCE")
    print("=" * 70)

    print(f"Registros performance: {total:,}")
    print(f"Coincidencias exactas: {matched:,}")
    print(f"Sin coincidencia: {unmatched:,}")
    print(f"Tasa de match: {match_rate:.2f}%")

    print()
    print("MATCH POR GRUPO:")

    group_result = (
        joined.groupby("group_key")
        .agg(
            registers=("matched", "size"),
            matched=("matched", "sum"),
        )
        .reset_index()
    )

    group_result["match_rate"] = (
        group_result["matched"]
        / group_result["registers"]
        * 100
    )

    print(
        group_result.to_string(
            index=False,
        )
    )

    print()
    print(
        "Archivo generado:",
        OUTPUT_DIR / "campaign_match_diagnostic.csv",
    )


if __name__ == "__main__":
    main()