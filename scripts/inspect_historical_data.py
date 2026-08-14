from pathlib import Path
import pandas as pd

PROJECT_DIR = Path(__file__).resolve().parent.parent

RAW_DIR = PROJECT_DIR / "data" / "raw"

PERFORMANCE_FILE = (
    RAW_DIR / "mix de medios Sodimac Media (2).xlsx"
)

REGISTRY_FILE = (
    RAW_DIR / "Data_registros_20260730_1532.xlsx"
)

def inspect_workbook(path: Path):

    print()
    print("=" * 80)
    print(path.name)
    print("=" * 80)

    if not path.exists():
        print("NO ENCONTRADO")
        return

    workbook = pd.ExcelFile(
        path,
        engine="openpyxl"
    )

    print("HOJAS:")

    for sheet in workbook.sheet_names:
        print("-", sheet)

    for sheet in workbook.sheet_names:

        print()
        print("-" * 80)
        print(sheet)
        print("-" * 80)

        df = pd.read_excel(
            path,
            sheet_name=sheet,
            engine="openpyxl"
        )

        print(
            f"Filas: {len(df)}"
        )

        print(
            f"Columnas: {len(df.columns)}"
        )

        print()

        for col in df.columns:
            print(repr(col))

        print()

        print(
            df.head(3).to_string(index=False)
        )

def main():

    inspect_workbook(
        PERFORMANCE_FILE
    )

    inspect_workbook(
        REGISTRY_FILE
    )

if __name__ == "__main__":
    main()