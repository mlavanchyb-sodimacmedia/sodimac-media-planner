from pathlib import Path
import json
import re
import unicodedata

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_DIR / "data" / "raw"

PERFORMANCE_FILE = (
    RAW_DIR / "mix de medios Sodimac Media (2).xlsx"
)

OUTPUT_FILE = (
    PROJECT_DIR
    / "src"
    / "data"
    / "forecast_baselines.json"
)


def normalize_text(value) -> str:
    """
    Normaliza mayúsculas, tildes, espacios
    y caracteres invisibles.
    """
    if pd.isna(value):
        return ""

    text = str(value)

    # Elimina caracteres invisibles frecuentes.
    text = text.replace("\u200b", "")
    text = text.replace("\ufeff", "")

    text = text.strip().lower()

    # Elimina tildes solo para comparar/mapping.
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
        r"\s+",
        " ",
        text,
    )

    return text


def map_commercial_group(product) -> str:
    normalized = normalize_text(product)

    if normalized in {
        "search",
        "shopping",
        "pmax",
    }:
        return "Google"

    if normalized in {
        "facebook",
        "instagram",
        "dpa",
        "daba",
    }:
        return "Meta"

    if normalized in {
        "sp",
        "sb",
        "patrocinado",
        "sponsored products",
        "sponsored brands",
    }:
        return "Sponsored Products"

    if normalized in {
        "emkt",
        "push",
        "whatsapp",
        "trigger-journey",
        "carro abandonado",
        "navegacion",
        "informativo",
    }:
        return "CRM"

    if normalized in {
        "banners",
        "banner",
    }:
        return "Retail Display"

    return "Otros"


def safe_ratio(
    numerator: float,
    denominator: float,
):
    if pd.isna(numerator):
        return None

    if pd.isna(denominator):
        return None

    if denominator <= 0:
        return None

    return numerator / denominator


def confidence(sample_size: int) -> str:
    if sample_size >= 30:
        return "Alta"

    if sample_size >= 10:
        return "Media"

    if sample_size >= 5:
        return "Baja"

    return "Referencial"


def valid_median(series: pd.Series):
    clean = (
        pd.to_numeric(
            series,
            errors="coerce",
        )
        .replace(
            [float("inf"), float("-inf")],
            pd.NA,
        )
        .dropna()
    )

    if clean.empty:
        return None

    return round(
        float(clean.median()),
        4,
    )


def main():
    dataframe = pd.read_excel(
        PERFORMANCE_FILE,
        sheet_name="resumen",
        engine="openpyxl",
    )

    numeric_columns = [
        "Impresiones",
        "alcance",
        "clicks",
        "venta",
        "anio",
        "mes",
        "dia",
    ]

    for column in numeric_columns:
        dataframe[column] = pd.to_numeric(
            dataframe[column],
            errors="coerce",
        )

    dataframe["producto_normalizado"] = (
        dataframe["Producto"].apply(
            normalize_text,
        )
    )

    dataframe["grupo_comercial"] = (
        dataframe["Producto"].apply(
            map_commercial_group,
        )
    )

    dataframe["ctr_fila"] = dataframe.apply(
        lambda row: (
            safe_ratio(
                row["clicks"],
                row["Impresiones"],
            )
            * 100
            if safe_ratio(
                row["clicks"],
                row["Impresiones"],
            )
            is not None
            else None
        ),
        axis=1,
    )

    dataframe["reach_rate_fila"] = dataframe.apply(
        lambda row: (
            safe_ratio(
                row["alcance"],
                row["Impresiones"],
            )
            if safe_ratio(
                row["alcance"],
                row["Impresiones"],
            )
            is not None
            else None
        ),
        axis=1,
    )

    dataframe["sales_per_click_fila"] = (
        dataframe.apply(
            lambda row: safe_ratio(
                row["venta"],
                row["clicks"],
            ),
            axis=1,
        )
    )

    output = {
        "metadata": {
            "source": PERFORMANCE_FILE.name,
            "sheet": "resumen",
            "totalRows": int(len(dataframe)),
            "method": "mediana histórica",
            "note": (
                "CTR solo se calcula en filas con "
                "impresiones mayores que cero. "
                "ROAS queda pendiente del cruce "
                "con registros comerciales."
            ),
        },
        "groups": {},
        "products": {},
    }

    # Baseline por grupo comercial.
    for group_name, group in dataframe.groupby(
        "grupo_comercial",
        dropna=False,
    ):
        if group_name == "Otros":
            continue

        rows_with_impressions = int(
            (group["Impresiones"].fillna(0) > 0).sum()
        )

        rows_with_reach = int(
            group["alcance"].notna().sum()
        )

        rows_with_sales = int(
            group["venta"].notna().sum()
        )

        total_impressions = float(
            group["Impresiones"].fillna(0).sum()
        )

        total_clicks = float(
            group["clicks"].fillna(0).sum()
        )

        total_sales = float(
            group["venta"].fillna(0).sum()
        )

        weighted_ctr = safe_ratio(
            total_clicks,
            total_impressions,
        )

        output["groups"][group_name] = {
            "sampleSize": int(len(group)),
            "rowsWithImpressions": rows_with_impressions,
            "rowsWithReach": rows_with_reach,
            "rowsWithSales": rows_with_sales,
            "medianCtr": valid_median(
                group["ctr_fila"],
            ),
            "weightedCtr": (
                round(weighted_ctr * 100, 4)
                if weighted_ctr is not None
                else None
            ),
            "medianReachRate": valid_median(
                group["reach_rate_fila"],
            ),
            "medianSalesPerClick": valid_median(
                group["sales_per_click_fila"],
            ),
            "totalSales": round(total_sales),
            "roas": None,
            "confidence": confidence(
                rows_with_impressions
                if rows_with_impressions > 0
                else len(group)
            ),
        }

    # Baseline por producto normalizado.
    for product_name, group in dataframe.groupby(
        "producto_normalizado",
        dropna=False,
    ):
        if not product_name:
            continue

        total_impressions = float(
            group["Impresiones"].fillna(0).sum()
        )

        total_clicks = float(
            group["clicks"].fillna(0).sum()
        )

        weighted_ctr = safe_ratio(
            total_clicks,
            total_impressions,
        )

        output["products"][product_name] = {
            "displayName": str(
                group["Producto"].dropna().iloc[0]
            ),
            "commercialGroup": str(
                group["grupo_comercial"].iloc[0]
            ),
            "sampleSize": int(len(group)),
            "medianCtr": valid_median(
                group["ctr_fila"],
            ),
            "weightedCtr": (
                round(weighted_ctr * 100, 4)
                if weighted_ctr is not None
                else None
            ),
            "medianReachRate": valid_median(
                group["reach_rate_fila"],
            ),
            "totalSales": round(
                float(
                    group["venta"].fillna(0).sum()
                )
            ),
            "roas": None,
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
    print(
        f"Generado correctamente: {OUTPUT_FILE}"
    )

    print()
    print("GRUPOS GENERADOS:")

    for group_name, values in output[
        "groups"
    ].items():
        print(
            f"- {group_name}: "
            f"muestra={values['sampleSize']}, "
            f"CTR={values['weightedCtr']}, "
            f"confianza={values['confidence']}"
        )


if __name__ == "__main__":
    main()