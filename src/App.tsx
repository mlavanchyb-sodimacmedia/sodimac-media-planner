import { useMemo, useState } from "react";
import {
  BarChart3,
  FileDown,
  Gift,
  Mail,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import Analytics from "./pages/Analytics";
import BriefInsights from "./components/BriefInsights";
import configJson from "./config/sales_planner_config_v2.json";
import baselinesJson from "./data/forecast_baselines_real.json";

import { buildBenefits } from "./domain/benefits";
import { buildProposalEmail } from "./domain/email";
import { buildPlan, objectiveWeights } from "./domain/engine";
import { buildForecast } from "./domain/forecast";
import { buildScenarios } from "./domain/scenarios";
import { recommendIntelligentMix } from "./domain/intelligentMix";
import { exportPdf } from "./domain/pdf";

import type { ForecastBaselinesFile } from "./domain/forecastBaselines";
import type { Config, Strategy } from "./domain/types";

const config = configJson as Config;
const forecastBaselines = baselinesJson as ForecastBaselinesFile;

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const number = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(value);

type View = "planner" | "analytics";

export default function App() {
  const brands = Object.keys(config.brandMaster);

  const [view, setView] = useState<View>("planner");
  const [brand, setBrand] = useState(brands[0] ?? "");
  const [budget, setBudget] = useState(1_500_000);
  const [event, setEvent] = useState(
    config.events[1] ?? config.events[0] ?? "",
  );
  const [focus, setFocus] = useState(config.focuses[0] ?? "");
  const [brief, setBrief] = useState("");
  const [objective, setObjective] = useState(
    config.drivers[0] ?? "Generar ventas",
  );
  const [manual, setManual] = useState(false);
  const [weights, setWeights] = useState<Strategy>(
    objectiveWeights[objective] ?? {
      awareness: 10,
      consideration: 20,
      performance: 70,
    },
  );
  const [generated, setGenerated] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const family = config.brandMaster[brand] ?? "SIN FAMILIA";

  const effectiveWeights = manual
    ? weights
    : objectiveWeights[objective] ?? weights;

  const weightsTotal =
    effectiveWeights.awareness +
    effectiveWeights.consideration +
    effectiveWeights.performance;

  const plan = useMemo(
    () => buildPlan(config, budget, effectiveWeights),
    [
      budget,
      effectiveWeights.awareness,
      effectiveWeights.consideration,
      effectiveWeights.performance,
    ],
  );

  const benchmark =
    config.benchmarks[family] ?? config.benchmarks["SIN FAMILIA"];

  const intelligentRecommendation = useMemo(
    () =>
      recommendIntelligentMix({
        family,
        objective,
        brief,
        baseWeights: objectiveWeights[objective] ?? {
          awareness: 10,
          consideration: 20,
          performance: 70,
        },
        baselinesFile: forecastBaselines,
      }),
    [family, objective, brief],
  );

  const familyBenchmark = {
    roas: benchmark?.roas ?? null,
    campaigns: benchmark?.campaigns ?? 0,
    confidence: intelligentRecommendation.confidence,
    topGroups: intelligentRecommendation.preferredGroups,
  };

  const forecastScore =
    intelligentRecommendation.confidence === "Alta"
      ? "A"
      : intelligentRecommendation.confidence === "Media"
        ? "B"
        : intelligentRecommendation.confidence === "Baja"
          ? "C"
          : "D";

  const forecast = useMemo(
    () =>
      buildForecast({
        family,
        plan,
        baselinesFile: forecastBaselines,
        configBenchmark: benchmark,
      }),
    [family, plan, benchmark],
  );

  const scenarios = useMemo(
    () => buildScenarios({ budget, forecast }),
    [budget, forecast],
  );

  const scenarioCards = scenarios.map((scenario) => {
    const factor = budget > 0 ? scenario.budget / budget : 0;

    return {
      ...scenario,
      reach: Math.round(forecast.reach * factor),
      sales: Math.round(forecast.sales * factor),
    };
  });

  const baseScenario = scenarioCards[0] ?? {
    reach: forecast.reach,
    sales: forecast.sales,
  };

  const benefits = useMemo(() => buildBenefits(budget), [budget]);

  const totalBenefitValue = benefits.reduce(
    (sum, benefit) => sum + benefit.value,
    0,
  );

  const totalReceivedValue = budget + totalBenefitValue;

  const handleObjectiveChange = (value: string) => {
    setObjective(value);

    if (objectiveWeights[value]) {
      setWeights(objectiveWeights[value]);
    }
  };

  const handleWeightChange = (key: keyof Strategy, value: number) => {
    setWeights((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleApplyRecommendation = () => {
    setManual(true);
    setWeights(intelligentRecommendation.weights);
  };

  const handleCopyEmail = async () => {
    const email = buildProposalEmail({
      brand,
      family,
      event,
      focus,
      objective,
      budget,
      brief,
      formats: plan.map((line) => ({
        displayName: line.displayName,
        budget: line.budget,
      })),
      forecast,
      scenarios,
      benefits,
    });

    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus("Correo copiado");
      window.alert("Correo copiado al portapapeles");
    } catch (error) {
      console.error("No fue posible copiar el correo:", error);
      setCopyStatus("No se pudo copiar");
      window.alert("No fue posible copiar automáticamente el correo.");
    }
  };

  const handleGeneratePdf = async () => {
    await exportPdf(
      "proposal-content",
      `${brand}-propuesta.pdf`,
    );
  };

  const handleGenerateProposal = () => {
    setCopyStatus("");
    setGenerated(true);
  };

  if (view === "analytics") {
    return <Analytics onBack={() => setView("planner")} />;
  }

  return (
    <main>
      <header>
        <div className="brand">
  <img
    src={`${import.meta.env.BASE_URL}logo-sodimac-media.png`}
    alt="Logo Sodimac Media"
    className="header-logo"
  />
</div>

        <nav className="nav" aria-label="Navegación principal">
          <button className="active" onClick={() => setView("planner")}>
            Planner
          </button>

          <button
            className="secondary"
            onClick={() => setView("analytics")}
          >
            Analytics
          </button>
        </nav>
      </header>

      <section className="hero">
        <span>GENERADOR DE PROPUESTAS</span>
        <h1>Convierte un brief en una propuesta comercial.</h1>
        <p>
          Diseñado para PMs: estrategia, mix, racional, benchmark y
          escenarios en una sola experiencia.
        </p>
      </section>

      {!generated ? (
        <section className="builder">
          <article className="panel">
            <div className="eyebrow">01 · BRIEF</div>
            <h2>Contexto de campaña</h2>

            <div className="grid">
              <label>
                Marca
                <select
                  value={brand}
                  onChange={(changeEvent) =>
                    setBrand(changeEvent.target.value)
                  }
                >
                  {brands.map((brandName) => (
                    <option key={brandName} value={brandName}>
                      {brandName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Familia
                <input value={family} disabled />
              </label>

              <label>
                Evento
                <select
                  value={event}
                  onChange={(changeEvent) =>
                    setEvent(changeEvent.target.value)
                  }
                >
                  {config.events.map((eventName) => (
                    <option key={eventName} value={eventName}>
                      {eventName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Foco
                <select
                  value={focus}
                  onChange={(changeEvent) =>
                    setFocus(changeEvent.target.value)
                  }
                >
                  {config.focuses.map((focusName) => (
                    <option key={focusName} value={focusName}>
                      {focusName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Presupuesto
                <input
                  type="number"
                  value={budget}
                  min={0}
                  step={50_000}
                  onChange={(changeEvent) =>
                    setBudget(Number(changeEvent.target.value))
                  }
                />
              </label>
            </div>

            <label>
              ¿Qué quiere lograr la marca?
              <textarea
                value={brief}
                onChange={(changeEvent) => setBrief(changeEvent.target.value)}
                placeholder="Describe el contexto y resultado esperado..."
              />
              <BriefInsights brief={brief} />
            </label>
          </article>

          <article className="panel dark">
            <div className="eyebrow">02 · OBJETIVO</div>
            <h2>Define la intención estratégica</h2>

            <label>
              Objetivo
              <select
                value={objective}
                onChange={(changeEvent) =>
                  handleObjectiveChange(changeEvent.target.value)
                }
              >
                {config.drivers.map((driver) => (
                  <option key={driver} value={driver}>
                    {driver}
                  </option>
                ))}
              </select>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={manual}
                onChange={(changeEvent) =>
                  setManual(changeEvent.target.checked)
                }
              />
              Ajustar pesos manualmente
            </label>

            <div className="weights">
              <label>
                Awareness
                <b>{effectiveWeights.awareness}%</b>
                <input
                  disabled={!manual}
                  type="range"
                  min="0"
                  max="100"
                  value={effectiveWeights.awareness}
                  onChange={(changeEvent) =>
                    handleWeightChange(
                      "awareness",
                      Number(changeEvent.target.value),
                    )
                  }
                />
              </label>

              <label>
                Consideration
                <b>{effectiveWeights.consideration}%</b>
                <input
                  disabled={!manual}
                  type="range"
                  min="0"
                  max="100"
                  value={effectiveWeights.consideration}
                  onChange={(changeEvent) =>
                    handleWeightChange(
                      "consideration",
                      Number(changeEvent.target.value),
                    )
                  }
                />
              </label>

              <label>
                Performance
                <b>{effectiveWeights.performance}%</b>
                <input
                  disabled={!manual}
                  type="range"
                  min="0"
                  max="100"
                  value={effectiveWeights.performance}
                  onChange={(changeEvent) =>
                    handleWeightChange(
                      "performance",
                      Number(changeEvent.target.value),
                    )
                  }
                />
              </label>
            </div>

            <div className="smart-recommendation">
              <div className="smart-recommendation__header">
                <div>
                  <span className="eyebrow">MIX INTELIGENTE</span>
                  <h3>Recomendación histórica</h3>
                </div>

                <span className="confidence-pill">
                  {intelligentRecommendation.confidence}
                </span>
              </div>

              <div className="smart-weights">
                <span>
                  Awareness
                  <b>{intelligentRecommendation.weights.awareness}%</b>
                </span>
                <span>
                  Consideration
                  <b>{intelligentRecommendation.weights.consideration}%</b>
                </span>
                <span>
                  Performance
                  <b>{intelligentRecommendation.weights.performance}%</b>
                </span>
              </div>

              {intelligentRecommendation.preferredGroups.length > 0 && (
                <div className="preferred-groups">
                  {intelligentRecommendation.preferredGroups.map((group) => (
                    <span key={group.group}>
                      {group.group}
                      {group.medianRoas !== null
                        ? ` · ${group.medianRoas}x`
                        : ""}
                    </span>
                  ))}
                </div>
              )}

              <p>{intelligentRecommendation.justification}</p>

              <small>
                Muestra histórica: {intelligentRecommendation.historicalSampleSize}
              </small>

              <button type="button" onClick={handleApplyRecommendation}>
                Aplicar recomendación
              </button>
            </div>

            <div className={weightsTotal === 100 ? "sum ok" : "sum"}>
              Total: {weightsTotal}%
            </div>

            <button
              disabled={weightsTotal !== 100 || budget <= 0}
              onClick={handleGenerateProposal}
            >
              Generar propuesta
            </button>
          </article>
        </section>
      ) : (
        <Proposal />
      )}
    </main>
  );

  function Proposal() {
    const maximumBudget = Math.max(
      ...plan.map((line) => line.budget),
      1,
    );

    return (
      <section id="proposal-content" className="proposal">
        <button className="back" onClick={() => setGenerated(false)}>
          ← Editar brief
        </button>
        

<div className="proposalHead">
  
  <div>

    <h2>
      {brand} · {event} · {family}
    </h2>

    <p>
      {brief || `Campaña ${event} con foco ${focus}.`}
    </p>

  </div>

  <div className="budget">

    {money(budget)}

    <small>
      inversión total
    </small>

  </div>

          <div>           
            <div className="eyebrow">PROPUESTA RECOMENDADA</div>
            <h2>
              {brand} · {event} · {family}
            </h2>
            <p>{brief || `Campaña ${event} con foco ${focus}.`}</p>
          </div>

          <div className="budget">
            {money(budget)}
            <small>inversión total</small>
          </div>
        </div>

        <div className="forecast-score">
          <span>Forecast Score</span>
          <strong>{forecastScore}</strong>
        </div>

        <section className="smart-rationale">
          <div className="smart-rationale-header">
            <h3>🧠 Justificación automática</h3>
            <span className="confidence-pill">
              {intelligentRecommendation.confidence}
            </span>
          </div>

          <p>{intelligentRecommendation.justification}</p>

          {intelligentRecommendation.preferredGroups.length > 0 && (
            <div className="preferred-groups">
              {intelligentRecommendation.preferredGroups.map((group) => (
                <span key={group.group}>
                  {group.group} · muestra: {group.sampleSize}
                </span>
              ))}
            </div>
          )}

          <small>
            Observaciones utilizadas: {intelligentRecommendation.historicalSampleSize}
          </small>
        </section>

        <h3>Mix recomendado</h3>

        <div className="cards">
          {plan.map((line, index) => (
            <article className="mix" key={`${line.displayName}-${index}`}>
              <span>{line.layer}</span>
              <h4>{line.displayName}</h4>
              <strong>{money(line.budget)}</strong>

              <div className="bar">
                <i
                  style={{
                    width: `${(line.budget / maximumBudget) * 100}%`,
                  }}
                />
              </div>

              <p>{line.rationale}</p>
              {line.requiresPricing && <em>Requiere valorización</em>}
            </article>
          ))}
        </div>

        <div className="two">
          <article className="benchmark">
            <TrendingUp />
            <h3>Resultados esperados</h3>

            <small>
              Fuente: {forecast.source}
              {" · "}
              Muestra: {forecast.sampleSize}
              {" · "}
              Confianza: {forecast.confidence}
            </small>

            <div className="benchmark-metrics">
              <div className="benchmark-metric">
                <strong>{number(forecast.reach)}</strong>
                <span>Alcance</span>
              </div>
              <div className="benchmark-metric">
                <strong>{number(forecast.impressions)}</strong>
                <span>Impresiones</span>
              </div>
              <div className="benchmark-metric">
                <strong>{number(forecast.clicks)}</strong>
                <span>Clicks</span>
              </div>
            </div>

            <div className="benchmark-metrics">
              <div className="benchmark-metric">
                <strong>{forecast.ctr}%</strong>
                <span>CTR</span>
              </div>
              <div className="benchmark-metric">
                <strong>{money(forecast.sales)}</strong>
                <span>Ventas</span>
              </div>
              <div className="benchmark-metric">
                <strong>{forecast.roas}x</strong>
                <span>ROAS</span>
              </div>
            </div>
          </article>

          <article className="benchmark">
            <BarChart3 />
            <h3>Benchmark Histórico</h3>

            <div className="benchmark-metrics">
              <div className="benchmark-metric">
                <strong>
                  {familyBenchmark.roas === null
                    ? "N/D"
                    : `${familyBenchmark.roas}x`}
                </strong>
                <span>ROAS histórico</span>
              </div>
              <div className="benchmark-metric">
                <strong>{familyBenchmark.campaigns}</strong>
                <span>Campañas</span>
              </div>
              <div className="benchmark-metric">
                <strong>{familyBenchmark.confidence}</strong>
                <span>Confianza</span>
              </div>
            </div>

            {familyBenchmark.topGroups.length > 0 && (
              <div className="preferred-groups">
                {familyBenchmark.topGroups.map((group) => (
                  <span key={group.group}>{group.group}</span>
                ))}
              </div>
            )}
          </article>
        </div>

        <section className="scenario-section">
          <h3>Escenarios de inversión</h3>

          <div className="scenario-grid">
            {scenarioCards.map((scenario, index) => {
              const incrementalSales = scenario.sales - baseScenario.sales;
              const incrementalReach = scenario.reach - baseScenario.reach;

              return (
                <div
                  key={scenario.name}
                  className={
                    index === 1
                      ? "scenario-card recommended"
                      : "scenario-card"
                  }
                >
                  <h4>{scenario.name}</h4>
                  <small>{scenario.description}</small>

                  <div className="scenario-budget">
                    {money(scenario.budget)}
                  </div>

                  {index === 0 ? (
                    <div className="scenario-metric">
                      <span>Escenario base</span>
                      <strong>Mix recomendado</strong>
                    </div>
                  ) : (
                    <>
                      <div className="scenario-metric">
                        <span>Venta adicional</span>
                        <strong>+{money(incrementalSales)}</strong>
                      </div>

                      <div className="scenario-metric">
                        <span>Audiencia adicional</span>
                        <strong>+{number(incrementalReach)}</strong>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="benefit-section">
          <article className="benefit-card">
            <Gift />
            <h3>Beneficio Sodimac Media</h3>

            <div className="benefit-list">
              {benefits.map((benefit) => (
                <div className="benefit-item" key={benefit.title}>
                  <div>
                    <strong>{benefit.title}</strong>
                    <small>{benefit.description}</small>
                  </div>
                  <b>{money(benefit.value)}</b>
                </div>
              ))}
            </div>

            <div className="benefit-summary">
              <div>
                <span>Valor de beneficios</span>
                <strong>{money(totalBenefitValue)}</strong>
              </div>
              <div>
                <span>Valor total recibido</span>
                <strong>{money(totalReceivedValue)}</strong>
              </div>
            </div>
          </article>
        </div>

        <div className="disclaimer">
          Las métricas son estimaciones referenciales basadas en históricos
          comparables. Sodimac Media no garantiza ni se compromete a obtener
          los resultados proyectados.
        </div>

        <div className="actions">
          <button onClick={handleGeneratePdf}>
            <FileDown />
            Generar PDF
          </button>

          <button className="secondary" onClick={handleCopyEmail}>
            <Mail />
            {copyStatus || "Copiar correo"}
          </button>
        </div>
      </section>
    );
  }
}
