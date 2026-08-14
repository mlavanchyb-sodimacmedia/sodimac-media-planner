type Props = {
  brief: string;
};

export default function BriefInsights({
  brief,
}: Props) {

  const text =
    brief.toLowerCase();

  const insights = [];

  if (
    text.includes("cyber")
  ) {
    insights.push(
      "Evento comercial: Cyber",
    );
  }

  if (
    text.includes("venta")
  ) {
    insights.push(
      "Objetivo: Performance",
    );
  }

  if (
    text.includes("tráfico")
  ) {
    insights.push(
      "Objetivo: Consideración",
    );
  }

  if (
    text.includes("lanzamiento")
  ) {
    insights.push(
      "Objetivo: Awareness",
    );
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="brief-insights">

      <h4>
        🤖 IA detectó
      </h4>

      {insights.map(
        (item) => (
          <div key={item}>
            ✓ {item}
          </div>
        ),
      )}

    </div>
  );
}
