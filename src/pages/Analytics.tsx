import analytics from "../data/analytics.json";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type AnalyticsProps = {
  onBack: () => void;
};

export default function Analytics({
  onBack,
}: AnalyticsProps) {
  return (
    <main className="analytics-page">
      <button onClick={onBack}>
        ← Volver al Planner
      </button>

      <h1>📊 Analytics Dashboard</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 24,
        }}
      >
        <div>
          <h4>Familias históricas</h4>
          <h2>{analytics.summary.familiesWithHistory}</h2>
        </div>

        <div>
          <h4>Sin histórico</h4>
          <h2>{analytics.summary.familiesWithoutHistory}</h2>
        </div>

        <div>
          <h4>Baselines</h4>
          <h2>{analytics.summary.baselinesGenerated}</h2>
        </div>

        <div>
          <h4>Observaciones</h4>
          <h2>{analytics.summary.validObservations}</h2>
        </div>
      </div>

      <section className="analytics-panel">

        <h2>Match Quality</h2>

        <div className="analytics-kpis">

          <div className="kpi-card">
            <span>Exactos</span>
            <strong>
              {analytics.matchQuality.exact}
            </strong>
          </div>

          <div className="kpi-card">
            <span>Probables</span>
            <strong>
              {analytics.matchQuality.probable}
            </strong>
          </div>

          <div className="kpi-card">
            <span>Sin Match</span>
            <strong>
              {analytics.matchQuality.unmatched}
            </strong>
          </div>

        </div>

      </section>

      <section className="analytics-panel">

        <h2>Familias</h2>

        <table className="analytics-table">

          <thead>
            <tr>
              <th>Familia</th>
              <th>Muestra</th>
              <th>ROAS</th>
              <th>Confianza</th>
            </tr>
          </thead>

          <tbody>

            {analytics.families.map(
              (family) => (
                <tr key={family.family}>
                  <td>{family.family}</td>
                  <td>{family.sampleSize}</td>
                  <td>{family.roas ?? "-"}</td>
                  <td>{family.confidence}</td>
                </tr>
              ),
            )}

          </tbody>

        </table>

      </section>
      <section className="analytics-panel">

  <h2>ROAS por Grupo</h2>

  <div
    style={{
      width: "100%",
      height: 400,
    }}
  >
    <ResponsiveContainer
      width="100%"
      height="100%"
    >
      <BarChart
        data={analytics.roasByGroup}
      >
        <CartesianGrid
          strokeDasharray="3 3"
        />

        <XAxis
          dataKey="group"
        />

        <YAxis />

        <Tooltip />

        <Bar
          dataKey="roas"
          fill="#ef7d22"
        />

      </BarChart>
    </ResponsiveContainer>
  </div>

</section>

    </main>
  );
}
<section className="analytics-panel">
  <h2>Forecast Quality</h2>

  <table className="analytics-table">
    <thead>
      <tr>
        <th>Grupo</th>
        <th>Muestra</th>
        <th>Exactos</th>
        <th>Probables</th>
        <th>Confianza</th>
      </tr>
    </thead>

    <tbody>
      {analytics.forecastQuality.map((row) => (
        <tr key={row.group}>
          <td>{row.group}</td>
          <td>{row.sampleSize}</td>
          <td>{row.exactSamples}</td>
          <td>{row.probableSamples}</td>
          <td>{row.confidence}</td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
