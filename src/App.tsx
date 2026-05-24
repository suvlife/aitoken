import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Cpu,
  Database,
  FileDown,
  Network,
  RefreshCw,
  RotateCcw,
  Server,
  TrendingUp,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  ComposedChart,
  ReferenceLine,
  XAxis,
  YAxis
} from "recharts";
import { calculateScenario, clampNumber, formatMoney, formatTokens } from "./lib/calculator";
import { marketDefaults } from "./lib/marketData";
import type { MarketDefaults, ModelPriceMode, ModelProfile, Scenario } from "./lib/types";

const COLORS = ["#059669", "#d97706", "#dc2626", "#2563eb", "#65a30d", "#7c3aed", "#0891b2"];
const CHART_GRID = "#e2e8f0";
const CHART_AXIS = "#64748b";
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #d7dee8",
  borderRadius: 8,
  boxShadow: "0 16px 42px rgba(15, 23, 42, 0.12)",
  color: "#1f2937"
};

const createScenario = (defaults: MarketDefaults): Scenario => ({
  years: 5,
  gpuCount: 10000,
  accelerator: { ...defaults.accelerators[0] },
  models: defaults.models.map((model) => ({ ...model, priceMode: model.priceMode ?? "market" })),
  infra: { ...defaults.infra },
  efficiency: { ...defaults.efficiency },
  financial: { ...defaults.financial }
});

const toYi = (value: number) => Number((value / 100000000).toFixed(2));
const toPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatPb = (tb: number) => `${(tb / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} PB`;
const manualPriceSource = (inputPricePerMTok: number, outputPricePerMTok: number) =>
  `用户手动设置：输入${inputPricePerMTok}元/百万tokens，输出${outputPricePerMTok}元/百万tokens；同步市场价格不会覆盖。`;

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inputWrap">
        <input
          type="number"
          value={Number.isInteger(value) ? value : Number(value.toFixed(4))}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max ?? Number.POSITIVE_INFINITY))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <label className="field rangeField">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <b>
        {value.toLocaleString()}
        {suffix ?? ""}
      </b>
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
  sub
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="metric">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export default function App() {
  const [defaults, setDefaults] = useState(marketDefaults);
  const [scenario, setScenario] = useState<Scenario>(() => createScenario(marketDefaults));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("默认价格已按公开资料预置，可随时手动覆盖。");
  const reportRef = useRef<HTMLDivElement>(null);
  const controlPanelRef = useRef<HTMLElement>(null);

  const result = useMemo(() => calculateScenario(scenario), [scenario]);
  const allocatedCards = scenario.models.reduce((sum, model) => sum + Math.max(0, model.allocatedCards), 0);
  const unallocatedCards = scenario.gpuCount - allocatedCards;
  const tokenPriceRealizationRate =
    scenario.financial.tokenPriceRealizationRate ?? defaults.financial.tokenPriceRealizationRate;
  const revenueDeductionRate = scenario.financial.revenueDeductionRate ?? defaults.financial.revenueDeductionRate;

  useEffect(() => {
    const updateControlPanelHeight = () => {
      const panel = controlPanelRef.current;
      if (!panel || window.matchMedia("(max-width: 1180px)").matches) return;

      const panelTop = panel.getBoundingClientRect().top;
      const availableHeight = Math.max(360, window.innerHeight - panelTop - 14);
      panel.style.setProperty("--control-panel-height", `${availableHeight}px`);
    };

    updateControlPanelHeight();
    const frame = window.requestAnimationFrame(updateControlPanelHeight);
    window.addEventListener("resize", updateControlPanelHeight);
    window.addEventListener("scroll", updateControlPanelHeight, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateControlPanelHeight);
      window.removeEventListener("scroll", updateControlPanelHeight);
    };
  }, []);

  const updateGpuCount = (nextGpuCount: number) => {
    setScenario((previous) => {
      const ratio = nextGpuCount / previous.gpuCount;
      return {
        ...previous,
        gpuCount: nextGpuCount,
        models: previous.models.map((model) => ({
          ...model,
          allocatedCards: Math.max(0, Math.round(model.allocatedCards * ratio))
        }))
      };
    });
  };

  const updateModel = (id: string, patch: Partial<ModelProfile>) => {
    setScenario((previous) => ({
      ...previous,
      models: previous.models.map((model) => (model.id === id ? { ...model, ...patch } : model))
    }));
  };

  const updateModelTokenPrice = (
    id: string,
    patch: Pick<Partial<ModelProfile>, "inputPricePerMTok" | "outputPricePerMTok">
  ) => {
    setScenario((previous) => ({
      ...previous,
      models: previous.models.map((model) => {
        if (model.id !== id) return model;
        const nextModel = { ...model, ...patch };
        return {
          ...nextModel,
          priceMode: "manual",
          priceSource: manualPriceSource(nextModel.inputPricePerMTok, nextModel.outputPricePerMTok)
        };
      })
    }));
  };

  const applyMarketPrice = (id: string) => {
    const marketModel = defaults.models.find((model) => model.id === id);
    if (!marketModel) return;
    updateModel(id, {
      inputPricePerMTok: marketModel.inputPricePerMTok,
      outputPricePerMTok: marketModel.outputPricePerMTok,
      priceMode: "market",
      priceSource: marketModel.priceSource
    });
  };

  const updateModelPriceMode = (id: string, priceMode: ModelPriceMode) => {
    if (priceMode === "market") {
      applyMarketPrice(id);
      return;
    }

    setScenario((previous) => ({
      ...previous,
      models: previous.models.map((model) =>
        model.id === id
          ? {
              ...model,
              priceMode: "manual",
              priceSource: manualPriceSource(model.inputPricePerMTok, model.outputPricePerMTok)
            }
          : model
      )
    }));
  };

  const resetDefaults = () => {
    setScenario(createScenario(defaults));
    setRefreshNote("已恢复当前默认价格与工程参数。");
  };

  const refreshMarket = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/market/refresh");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        defaults: MarketDefaults;
        collection: { label: string; status: string; note: string }[];
        warnings: string[];
      };
      const protectedManualCount = scenario.models.filter((model) => model.priceMode === "manual").length;
      setDefaults(payload.defaults);
      setScenario((previous) => ({
        ...previous,
        accelerator: {
          ...previous.accelerator,
          unitPriceRmb: payload.defaults.accelerators[0]?.unitPriceRmb ?? previous.accelerator.unitPriceRmb
        },
        models: previous.models.map((model) => {
          const refreshed = payload.defaults.models.find((item) => item.id === model.id);
          if (model.priceMode === "manual") {
            return model;
          }
          return refreshed
            ? {
                ...model,
                inputPricePerMTok: refreshed.inputPricePerMTok,
                outputPricePerMTok: refreshed.outputPricePerMTok,
                priceMode: "market",
                priceSource: refreshed.priceSource
              }
            : model;
        })
      }));
      const fetched = payload.collection.filter((item) => item.status === "fetched").length;
      const manualNote = protectedManualCount > 0 ? `；${protectedManualCount}个手动Tokens单价已保留` : "";
      setRefreshNote(`已采集 ${fetched}/${payload.collection.length} 个外部价格源；解析失败字段继续使用当前值${manualNote}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setRefreshNote(`价格采集失败：${message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const target = reportRef.current;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#f6f8fb",
      useCORS: true,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight
    });
    const pdf = new jsPDF("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    pdf.save(`国产AI-Tokens工厂ROI-${scenario.gpuCount}卡.pdf`);
  };

  const costPie = [
    { name: "GPU卡", value: result.costs.gpuCapex },
    { name: "服务器", value: result.costs.serverCapex },
    { name: "网络", value: result.costs.networkCapex },
    { name: "存储", value: result.costs.storageCapex },
    { name: "机柜配套", value: result.costs.rackCapex },
    { name: "实施与预备", value: result.costs.deploymentCapex + result.costs.contingencyCapex }
  ];
  const opexItems = [
    { name: "电费", value: result.costs.annualElectricityCost, note: `${result.sizing.facilityPowerKw.toFixed(0)}kW × 8760 × ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元/kWh` },
    { name: "冷却/补水", value: result.costs.annualWaterCost, note: `按电费的 ${(scenario.infra.waterCostRateOfElectricity * 100).toFixed(1)}%` },
    { name: "机柜租赁", value: result.costs.annualRackRent, note: `${result.sizing.rackCount.toLocaleString()}柜 × ${scenario.infra.rackMonthlyRentRmb.toLocaleString()}元/月 × 12` },
    { name: "运维人力/备件", value: result.costs.annualOmCost, note: `按总CAPEX的 ${(scenario.infra.omRateOfCapex * 100).toFixed(1)}%/年` },
    { name: "平台软件/监控", value: result.costs.annualSoftwareCost, note: `按总CAPEX的 ${(scenario.infra.softwareRateOfCapex * 100).toFixed(1)}%/年` },
    { name: "公网/安全/专线", value: result.costs.annualInternetSecurityCost, note: `${formatMoney(scenario.infra.internetAndSecurityMonthlyRmb)}/月 × 12` }
  ];

  const yearlyChart = result.yearly.map((item) => ({
    year: `Y${item.year}`,
    tokenListRevenue: toYi(item.tokenListRevenue),
    tokenRevenue: toYi(item.tokenRevenue),
    tokenDeduction: toYi(item.tokenRevenueDeduction),
    rentalGrossRevenue: toYi(item.rentalGrossRevenue),
    rentalRevenue: toYi(item.rentalRevenue),
    rentalDeduction: toYi(item.rentalRevenueDeduction),
    opex: toYi(item.opex),
    depreciation: toYi(item.depreciation),
    accountingCost: toYi(item.opex + item.depreciation),
    tokenProfit: toYi(item.tokenAccountingProfit),
    rentalProfit: toYi(item.rentalAccountingProfit),
    tokenCashFlow: toYi(item.tokenCashFlow),
    rentalCashFlow: toYi(item.rentalCashFlow),
    tokenCumulativeCashFlow: toYi(item.tokenCumulativeCashFlow),
    rentalCumulativeCashFlow: toYi(item.rentalCumulativeCashFlow),
    tokenRoi: Number((item.tokenRoi * 100).toFixed(1)),
    rentalRoi: Number((item.rentalRoi * 100).toFixed(1)),
    tokenAccountingRoi: Number((item.tokenAccountingRoi * 100).toFixed(1)),
    rentalAccountingRoi: Number((item.rentalAccountingRoi * 100).toFixed(1))
  }));

  const modelChart = result.models.map((model) => ({
    name: model.name.replace("DeepSeek-", "DS-").replace("Doubao-", "豆包-"),
    revenue: toYi(model.annualRevenue),
    tps: Number(model.practicalTpsPerCard.toFixed(1)),
    cards: model.allocatedCards
  }));

  const paybackText = (value: number | null) => (value ? `${value.toFixed(1)}年` : "5年内未回本");
  const firstYear = result.yearly[0];
  const lastYear = result.yearly[result.yearly.length - 1];
  const horizonTokenRevenue = result.yearly.reduce((sum, row) => sum + row.tokenRevenue, 0);
  const horizonRentalRevenue = result.yearly.reduce((sum, row) => sum + row.rentalRevenue, 0);
  const netRevenueFactor = tokenPriceRealizationRate * Math.max(0, 1 - revenueDeductionRate);
  const throughputRealization =
    result.totalAnnualEngineeringOutputTokens > 0
      ? result.totalAnnualOutputTokens / result.totalAnnualEngineeringOutputTokens
      : 0;
  const averageInputOutputRatio =
    result.totalAnnualOutputTokens > 0 ? result.totalAnnualInputTokens / result.totalAnnualOutputTokens : 0;

  return (
    <div className="appShell" ref={reportRef}>
      <header className="topbar">
        <div>
          <p>国产AI计算卡 · 智算集群 · Tokens工厂</p>
          <h1>投资收益测算工作台</h1>
        </div>
        <div className="topActions" data-export-hide="true">
          <button className="ghostButton" onClick={refreshMarket} disabled={isRefreshing}>
            <RefreshCw size={17} className={isRefreshing ? "spin" : ""} />
            自动采集价格
          </button>
          <button className="ghostButton" onClick={resetDefaults}>
            <RotateCcw size={17} />
            恢复默认
          </button>
          <button className="primaryButton" onClick={exportPdf}>
            <FileDown size={18} />
            导出PDF
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="controlPanel" ref={controlPanelRef}>
          <section className="panel">
            <div className="panelTitle">
              <Cpu size={18} />
              <h2>集群规模</h2>
            </div>
            <RangeField label="GPU卡数" value={scenario.gpuCount} min={10000} max={100000} step={1000} onChange={updateGpuCount} suffix="张" />
            <NumberField label="测算周期" value={scenario.years} min={1} max={10} suffix="年" onChange={(years) => setScenario((s) => ({ ...s, years }))} />
            <NumberField
              label="单卡采购价"
              value={scenario.accelerator.unitPriceRmb}
              step={1000}
              suffix="元"
              onChange={(unitPriceRmb) =>
                setScenario((s) => ({ ...s, accelerator: { ...s.accelerator, unitPriceRmb } }))
              }
            />
            <NumberField
              label="每服务器卡数"
              value={scenario.infra.cardsPerServer}
              min={1}
              max={16}
              suffix="张"
              onChange={(cardsPerServer) => setScenario((s) => ({ ...s, infra: { ...s.infra, cardsPerServer } }))}
            />
            <p className="sourceHint">{scenario.accelerator.priceNote}</p>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Server size={18} />
              <h2>服务器与机房</h2>
            </div>
            <NumberField
              label="服务器非GPU价格"
              value={scenario.infra.serverBasePriceRmb}
              step={10000}
              suffix="元/台"
              onChange={(serverBasePriceRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, serverBasePriceRmb } }))
              }
            />
            <NumberField
              label="非GPU功耗"
              value={scenario.infra.serverBasePowerWatts}
              step={50}
              suffix="W/台"
              onChange={(serverBasePowerWatts) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, serverBasePowerWatts } }))
              }
            />
            <NumberField
              label="PUE"
              value={scenario.infra.pue}
              step={0.01}
              min={1}
              max={2.5}
              onChange={(pue) => setScenario((s) => ({ ...s, infra: { ...s.infra, pue } }))}
            />
            <NumberField
              label="电价"
              value={scenario.infra.electricityPriceRmbPerKwh}
              step={0.01}
              suffix="元/kWh"
              onChange={(electricityPriceRmbPerKwh) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, electricityPriceRmbPerKwh } }))
              }
            />
            <p className="sourceHint">
              电价只影响年度OPEX、利润和现金ROI，不改变一次性CAPEX。顶部“年OPEX”与下方“功耗与水电”会直接跟随电价变化。
            </p>
            <NumberField
              label="机柜月租"
              value={scenario.infra.rackMonthlyRentRmb}
              step={100}
              suffix="元/柜"
              onChange={(rackMonthlyRentRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, rackMonthlyRentRmb } }))
              }
            />
            <NumberField
              label="机柜基础建设"
              value={scenario.infra.rackSetupPriceRmb}
              step={5000}
              suffix="元/柜"
              onChange={(rackSetupPriceRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, rackSetupPriceRmb } }))
              }
            />
            <NumberField
              label="PDU单柜成本"
              value={scenario.infra.pduPriceRmbPerRack}
              step={1000}
              suffix="元/柜"
              onChange={(pduPriceRmbPerRack) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, pduPriceRmbPerRack } }))
              }
            />
            <NumberField
              label="机柜内线缆辅材"
              value={scenario.infra.rackCablingPriceRmbPerRack}
              step={1000}
              suffix="元/柜"
              onChange={(rackCablingPriceRmbPerRack) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, rackCablingPriceRmbPerRack } }))
              }
            />
            <p className="sourceHint">
              机柜基础建设默认不包含PDU。PDU按A/B路计量PDU、空开、安装分摊单列；机柜内线缆辅材覆盖理线架、标签、扎带、电源线等。
            </p>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Network size={18} />
              <h2>H3C网络与存储价格</h2>
            </div>
            <p className="sourceHint">
              Leaf/Spine默认采用{scenario.infra.leafSwitchModel}：{scenario.infra.leafSwitchPortSpec}。
            </p>
            <NumberField
              label={`${scenario.infra.leafSwitchModel} Leaf单价`}
              value={scenario.infra.leafSwitchPriceRmb}
              step={10000}
              suffix="元/台"
              onChange={(leafSwitchPriceRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, leafSwitchPriceRmb } }))
              }
            />
            <NumberField
              label={`${scenario.infra.spineSwitchModel} Spine单价`}
              value={scenario.infra.spineSwitchPriceRmb}
              step={10000}
              suffix="元/台"
              onChange={(spineSwitchPriceRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, spineSwitchPriceRmb } }))
              }
            />
            <NumberField
              label={`${scenario.infra.opticalModuleModel} 单价`}
              value={scenario.infra.opticalEndpointPriceRmb}
              step={500}
              suffix="元/个"
              onChange={(opticalEndpointPriceRmb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, opticalEndpointPriceRmb } }))
              }
            />
            <NumberField
              label={`${scenario.infra.fiberCableModel} 辅材`}
              value={scenario.infra.fiberCablingPriceRmbPerLink}
              step={100}
              suffix="元/链路"
              onChange={(fiberCablingPriceRmbPerLink) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, fiberCablingPriceRmbPerLink } }))
              }
            />
            <NumberField
              label="存储可用容量"
              value={scenario.infra.storageTbPerCard}
              step={0.1}
              suffix="TB/卡"
              onChange={(storageTbPerCard) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, storageTbPerCard } }))
              }
            />
            <NumberField
              label="最低可用存储"
              value={scenario.infra.minSharedStorageTb}
              step={500}
              suffix="TB"
              onChange={(minSharedStorageTb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, minSharedStorageTb } }))
              }
            />
            <NumberField
              label="存储冗余系数"
              value={scenario.infra.storageRedundancyFactor}
              step={0.05}
              min={1}
              max={3}
              onChange={(storageRedundancyFactor) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, storageRedundancyFactor } }))
              }
            />
            <NumberField
              label="共享存储单价"
              value={scenario.infra.storagePriceRmbPerTb}
              step={100}
              suffix="元/TB"
              onChange={(storagePriceRmbPerTb) =>
                setScenario((s) => ({ ...s, infra: { ...s.infra, storagePriceRmbPerTb } }))
              }
            />
            <p className="sourceHint">
              {scenario.infra.networkPriceNote} 400G短距链路默认采用{scenario.infra.opticalModuleSpec}，实际项目应按机房距离、原厂维保和集采折扣复核。
            </p>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Zap size={18} />
              <h2>推理效率</h2>
            </div>
            <NumberField
              label="带宽效率"
              value={scenario.efficiency.memoryBandwidthEfficiency}
              step={0.01}
              max={0.9}
              onChange={(memoryBandwidthEfficiency) =>
                setScenario((s) => ({ ...s, efficiency: { ...s.efficiency, memoryBandwidthEfficiency } }))
              }
            />
            <NumberField
              label="连续批处理增益"
              value={scenario.efficiency.continuousBatchGain}
              step={1}
              min={1}
              max={64}
              onChange={(continuousBatchGain) =>
                setScenario((s) => ({ ...s, efficiency: { ...s.efficiency, continuousBatchGain } }))
              }
            />
            <NumberField
              label="集群利用率"
              value={scenario.efficiency.servingUtilization}
              step={0.01}
              max={1}
              onChange={(servingUtilization) =>
                setScenario((s) => ({ ...s, efficiency: { ...s.efficiency, servingUtilization } }))
              }
            />
            <NumberField
              label="可售卖率"
              value={scenario.efficiency.sellThroughRate}
              step={0.01}
              max={1}
              onChange={(sellThroughRate) =>
                setScenario((s) => ({ ...s, efficiency: { ...s.efficiency, sellThroughRate } }))
              }
            />
            <NumberField
              label="GPU平均功耗系数"
              value={scenario.efficiency.gpuPowerLoadFactor}
              step={0.01}
              max={1}
              onChange={(gpuPowerLoadFactor) =>
                setScenario((s) => ({ ...s, efficiency: { ...s.efficiency, gpuPowerLoadFactor } }))
              }
            />
          </section>

          <section className="panel">
            <div className="panelTitle">
              <TrendingUp size={18} />
              <h2>商业参数</h2>
            </div>
            <NumberField
              label="租卡价格"
              value={scenario.financial.rentalPricePerCardHourRmb}
              step={0.1}
              suffix="元/卡时"
              onChange={(rentalPricePerCardHourRmb) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, rentalPricePerCardHourRmb } }))
              }
            />
            <NumberField
              label="租卡利用率"
              value={scenario.financial.rentalUtilization}
              step={0.01}
              max={1}
              onChange={(rentalUtilization) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, rentalUtilization } }))
              }
            />
            <NumberField
              label="官方价成交系数"
              value={tokenPriceRealizationRate}
              step={0.01}
              max={1}
              onChange={(tokenPriceRealizationRate) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, tokenPriceRealizationRate } }))
              }
            />
            <NumberField
              label="收入扣减率"
              value={revenueDeductionRate}
              step={0.01}
              max={0.5}
              onChange={(revenueDeductionRate) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, revenueDeductionRate } }))
              }
            />
            <p className="sourceHint">
              官方价成交系数默认0.75，表示公开API价经过大客户折扣、长约折扣、缓存优惠和竞争报价后的成交折扣；收入扣减率默认6%，用于预留渠道、支付、坏账、免费额度和服务补偿等扣减，可按实际合同改。
            </p>
            <NumberField
              label="Token需求增长"
              value={scenario.financial.tokenDemandGrowthRate}
              step={0.01}
              max={1}
              onChange={(tokenDemandGrowthRate) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, tokenDemandGrowthRate } }))
              }
            />
            <NumberField
              label="Token价格年降"
              value={scenario.financial.tokenPriceErosionRate}
              step={0.01}
              max={1}
              onChange={(tokenPriceErosionRate) =>
                setScenario((s) => ({ ...s, financial: { ...s.financial, tokenPriceErosionRate } }))
              }
            />
          </section>
        </aside>

        <section className="dashboard">
          <section className="statusStrip">
            <Metric icon={<Calculator size={20} />} label="总CAPEX" value={formatMoney(result.costs.totalCapex)} sub={`折旧 ${formatMoney(result.costs.annualDepreciation)}/年`} />
            <Metric icon={<CircleDollarSign size={20} />} label="年OPEX" value={formatMoney(result.costs.annualOpex)} sub={`水电 ${formatMoney(result.costs.annualElectricityCost + result.costs.annualWaterCost)}；电价 ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元/kWh`} />
            <Metric icon={<Zap size={20} />} label="年输出Tokens" value={`${formatTokens(result.totalAnnualOutputTokens)}`} sub={`工程上限 ${formatTokens(result.totalAnnualEngineeringOutputTokens)}；输入 ${formatTokens(result.totalAnnualInputTokens)}`} />
            <Metric icon={<TrendingUp size={20} />} label={`${scenario.years}年Tokens净收入`} value={formatMoney(horizonTokenRevenue)} sub={`首年 ${formatMoney(firstYear.tokenRevenue)}，末年 ${formatMoney(lastYear.tokenRevenue)}；回本 ${paybackText(result.tokenPaybackYear)}`} />
            <Metric icon={<Cpu size={20} />} label={`${scenario.years}年租卡净收入`} value={formatMoney(horizonRentalRevenue)} sub={`首年 ${formatMoney(firstYear.rentalRevenue)}，末年 ${formatMoney(lastYear.rentalRevenue)}；回本 ${paybackText(result.rentalPaybackYear)}`} />
          </section>

          <section className="notice">
            <AlertTriangle size={18} />
            <span>{refreshNote}</span>
            <b>
              模型分配 {allocatedCards.toLocaleString()} 张；
              {unallocatedCards >= 0 ? `空余 ${unallocatedCards.toLocaleString()} 张` : `超配 ${Math.abs(unallocatedCards).toLocaleString()} 张`}
            </b>
          </section>

          <section className="insightGrid">
            <article>
              <CheckCircle2 size={18} />
              <strong>年度不是写死</strong>
              <p>
                Token收入按“需求增长 {toPercent(scenario.financial.tokenDemandGrowthRate)} × 价格年降 {toPercent(scenario.financial.tokenPriceErosionRate)}”逐年滚动，净变化约 {(((1 + scenario.financial.tokenDemandGrowthRate) * (1 - scenario.financial.tokenPriceErosionRate) - 1) * 100).toFixed(1)}%/年，所以默认图形会显得接近平。
              </p>
            </article>
            <article>
              <CircleDollarSign size={18} />
              <strong>租卡当前不回本</strong>
              <p>
                当前租价 {scenario.financial.rentalPricePerCardHourRmb.toFixed(2)} 元/卡时，{scenario.years}年末累计现金流 {formatMoney(lastYear.rentalCumulativeCashFlow)}；按当前OPEX和利用率，回本首年租价需约 {result.rentalBreakEvenPricePerCardHour.toFixed(2)} 元/卡时。
              </p>
            </article>
            <article>
              <ClipboardList size={18} />
              <strong>ROI口径</strong>
              <p>
                ROI曲线采用累计现金回本口径：先扣一次性CAPEX，再逐年扣OPEX。年度损益表会另行扣折旧，避免把同一笔设备投资重复扣两次。
              </p>
            </article>
          </section>

          <section className="explainGrid">
            <article>
              <Zap size={18} />
              <h3>年输出Tokens怎么算</h3>
              <p>
                当前模型组合的工程上限为 {formatTokens(result.totalAnnualEngineeringOutputTokens)} 输出tokens/年；实际输出 = 工程上限 × 集群利用率 {toPercent(scenario.efficiency.servingUtilization)} × 可售卖率 {toPercent(scenario.efficiency.sellThroughRate)} × 可用性 {toPercent(scenario.efficiency.availability)} = {formatTokens(result.totalAnnualOutputTokens)}。
              </p>
            </article>
            <article>
              <Database size={18} />
              <h3>输入Tokens怎么算</h3>
              <p>
                输入不是按卡直接生成，而是按各模型“输入:输出”比例汇总：Σ(模型输出tokens × 输入:输出比例)。当前加权平均比例约 {averageInputOutputRatio.toFixed(2)}，所以输入tokens为 {formatTokens(result.totalAnnualInputTokens)}。
              </p>
            </article>
            <article>
              <CircleDollarSign size={18} />
              <h3>净收入系数</h3>
              <p>
                官方价是公开零售价，不等于实际成交价。默认净收入 = 官方价收入 × {tokenPriceRealizationRate.toFixed(2)} × {(1 - revenueDeductionRate).toFixed(2)}，也就是官方价的 {(netRevenueFactor * 100).toFixed(1)}%；这两个系数是合同折扣和经营扣减假设，不是固定事实。
              </p>
            </article>
            <article>
              <ClipboardList size={18} />
              <h3>折损系数</h3>
              <p>
                实际产能占工程上限约 {(throughputRealization * 100).toFixed(1)}%。这里把排队波峰、维护、故障、客户需求不满载、不可售冗余和调度碎片都从理论产能里扣掉。
              </p>
            </article>
          </section>

          <section className="chartGrid">
            <div className="panel wide">
              <div className="panelTitle">
                <TrendingUp size={18} />
                <h2>5年收入、OPEX、折旧与利润</h2>
              </div>
              <div className="chartBox chartBoxLarge">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={yearlyChart} margin={{ top: 14, right: 22, left: 0, bottom: 8 }}>
                    <defs>
                      <linearGradient id="tokenNetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="rentalNetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" />
                    <XAxis dataKey="year" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} unit="亿" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend />
                    <Area type="monotone" dataKey="tokenRevenue" name="Tokens净收入" stroke="#059669" strokeWidth={3} fill="url(#tokenNetFill)" activeDot={{ r: 6 }} />
                    <Area type="monotone" dataKey="rentalRevenue" name="租卡净收入" stroke="#d97706" strokeWidth={3} fill="url(#rentalNetFill)" activeDot={{ r: 5 }} />
                    <Area type="monotone" dataKey="accountingCost" name="OPEX+折旧" stroke="#dc2626" strokeWidth={2.5} fill="url(#costFill)" strokeDasharray="7 4" />
                    <Line type="monotone" dataKey="tokenProfit" name="Tokens会计利润" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="rentalProfit" name="租卡会计利润" stroke="#ef4444" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="chartNote">
                顶部周期净收入 = Σ各年净收入；Y1使用当前价格和需求，Y2起按需求增长与价格年降滚动。单年净收入 = 官方价收入 × 官方价成交系数 {tokenPriceRealizationRate.toFixed(2)} × 扣减后留存 {(1 - revenueDeductionRate).toFixed(2)}，当前约等于官方价的 {(netRevenueFactor * 100).toFixed(1)}%。
              </p>
            </div>

            <div className="panel">
              <div className="panelTitle">
                <Calculator size={18} />
                <h2>CAPEX拆分</h2>
              </div>
              <div className="chartBox">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costPie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
                      {costPie.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(Number(value ?? 0))} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="miniList">
                {costPie.map((item, index) => (
                  <span key={item.name}>
                    <i style={{ background: COLORS[index % COLORS.length] }} />
                    {item.name} {formatMoney(item.value)}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">
                <Network size={18} />
                <h2>累计现金ROI/回本曲线</h2>
              </div>
              <div className="chartBox">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yearlyChart}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" />
                    <XAxis dataKey="year" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend />
                    <ReferenceLine y={0} stroke={CHART_AXIS} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="tokenRoi" name="Tokens现金ROI" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="rentalRoi" name="租卡现金ROI" stroke="#d97706" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="chartNote">现金ROI = (-CAPEX + 累计净经营现金流) / CAPEX；折旧只进入年度会计利润，不再作为现金支出重复扣除。</p>
            </div>

            <div className="panel wide">
              <div className="panelTitle">
                <Zap size={18} />
                <h2>模型吞吐与收入</h2>
              </div>
              <div className="chartBox">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelChart}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" />
                    <XAxis dataKey="name" stroke={CHART_AXIS} />
                    <YAxis yAxisId="left" stroke={CHART_AXIS} unit="亿" />
                    <YAxis yAxisId="right" orientation="right" stroke={CHART_AXIS} unit="t/s" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="年收入" fill="#059669" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="tps" name="实际TPS/卡" stroke="#d97706" strokeWidth={3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <ClipboardList size={18} />
              <h2>年度损益与现金流</h2>
            </div>
            <div className="tableWrap">
              <table className="financialTable">
                <thead>
                  <tr>
                    <th>年份</th>
                    <th>Tokens官方价收入</th>
                    <th>Tokens净收入</th>
                    <th>租卡净收入</th>
                    <th>OPEX</th>
                    <th>折旧</th>
                    <th>Tokens会计利润</th>
                    <th>租卡会计利润</th>
                    <th>Tokens累计现金流</th>
                    <th>租卡累计现金流</th>
                    <th>现金ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearly.map((row) => (
                    <tr key={row.year}>
                      <td>Y{row.year}</td>
                      <td>{formatMoney(row.tokenListRevenue)}</td>
                      <td>{formatMoney(row.tokenRevenue)}</td>
                      <td>{formatMoney(row.rentalRevenue)}</td>
                      <td>{formatMoney(row.opex)}</td>
                      <td>{formatMoney(row.depreciation)}</td>
                      <td className={row.tokenAccountingProfit >= 0 ? "positive" : "negative"}>{formatMoney(row.tokenAccountingProfit)}</td>
                      <td className={row.rentalAccountingProfit >= 0 ? "positive" : "negative"}>{formatMoney(row.rentalAccountingProfit)}</td>
                      <td className={row.tokenCumulativeCashFlow >= 0 ? "positive" : "negative"}>{formatMoney(row.tokenCumulativeCashFlow)}</td>
                      <td className={row.rentalCumulativeCashFlow >= 0 ? "positive" : "negative"}>{formatMoney(row.rentalCumulativeCashFlow)}</td>
                      <td>
                        Token {(row.tokenRoi * 100).toFixed(1)}% / 租卡 {(row.rentalRoi * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Database size={18} />
              <h2>模型部署与售卖价格</h2>
            </div>
            <p className="sourceHint">
              输入价和输出价单位均为元/百万tokens。修改任一Tokens单价会自动切换为手动价；同步市场价格只更新“市场价”模式的模型，不覆盖手动价。
            </p>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>价格模式</th>
                    <th>卡数</th>
                    <th>参数/活跃</th>
                    <th>量化</th>
                    <th>输入价</th>
                    <th>输出价</th>
                    <th>输入:输出</th>
                    <th>理论TPS/卡</th>
                    <th>TPS/卡</th>
                    <th>年输出</th>
                    <th>年收入</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.models.map((model) => {
                    const modelResult = result.models.find((item) => item.id === model.id);
                    return (
                      <tr key={model.id}>
                        <td>
                          <strong>{model.name}</strong>
                          <small>{model.priceSource}</small>
                        </td>
                        <td>
                          <select
                            className="priceModeSelect"
                            value={model.priceMode ?? "market"}
                            onChange={(event) => updateModelPriceMode(model.id, event.target.value as ModelPriceMode)}
                          >
                            <option value="market">市场价</option>
                            <option value="manual">手动价</option>
                          </select>
                          <button type="button" className="miniButton" onClick={() => applyMarketPrice(model.id)}>
                            同步此模型
                          </button>
                          <small>{(model.priceMode ?? "market") === "manual" ? "手动价保留" : "随市场同步"}</small>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={model.allocatedCards}
                            min={0}
                            step={100}
                            onChange={(event) => updateModel(model.id, { allocatedCards: Number(event.target.value) })}
                          />
                        </td>
                        <td>
                          <span>{model.totalParamsB}B / {model.activeParamsB}B</span>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={model.quantBits}
                            min={4}
                            max={16}
                            step={1}
                            onChange={(event) => updateModel(model.id, { quantBits: Number(event.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={model.inputPricePerMTok}
                            min={0}
                            step={0.1}
                            onChange={(event) => updateModelTokenPrice(model.id, { inputPricePerMTok: Number(event.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={model.outputPricePerMTok}
                            min={0}
                            step={0.1}
                            onChange={(event) => updateModelTokenPrice(model.id, { outputPricePerMTok: Number(event.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={model.inputToOutputRatio}
                            min={0}
                            step={0.1}
                            onChange={(event) => updateModel(model.id, { inputToOutputRatio: Number(event.target.value) })}
                          />
                        </td>
                        <td>{modelResult?.engineeringTpsPerCard.toFixed(1)}</td>
                        <td>{modelResult?.practicalTpsPerCard.toFixed(1)}</td>
                        <td>{modelResult ? formatTokens(modelResult.annualOutputTokens) : "-"}</td>
                        <td>{modelResult ? formatMoney(modelResult.annualRevenue) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detailGrid">
            <div className="panel">
              <div className="panelTitle">
                <Server size={18} />
                <h2>服务器配置</h2>
              </div>
              <dl className="specList">
                <div><dt>服务器台数</dt><dd>{result.sizing.serverCount.toLocaleString()}台</dd></div>
                <div><dt>单台配置</dt><dd>{scenario.infra.cardsPerServer}x {scenario.accelerator.name}，双CPU，2TB DDR5，8x NVMe，2x400G NIC</dd></div>
                <div><dt>单卡规格</dt><dd>{scenario.accelerator.memoryGb}GB HBM，{scenario.accelerator.memoryBandwidthGbps}GB/s，{scenario.accelerator.fp16Tflops}TFLOPS FP16，TDP {scenario.accelerator.tdpWatts}W</dd></div>
                <div><dt>非GPU单价</dt><dd>{formatMoney(scenario.infra.serverBasePriceRmb)}/台</dd></div>
                <div><dt>服务器CAPEX</dt><dd>{formatMoney(result.costs.serverCapex)}</dd></div>
              </dl>
            </div>
            <div className="panel">
              <div className="panelTitle">
                <Network size={18} />
                <h2>网络与机柜</h2>
              </div>
              <dl className="specList">
                <div><dt>Leaf型号</dt><dd>{scenario.infra.leafSwitchModel}，{scenario.infra.leafSwitchPortSpec}</dd></div>
                <div><dt>Spine型号</dt><dd>{scenario.infra.spineSwitchModel}，{scenario.infra.spineSwitchPortSpec}</dd></div>
                <div><dt>Leaf/Spine</dt><dd>{result.sizing.leafSwitches} / {result.sizing.spineSwitches} 台，{scenario.infra.leafDownlinkPorts}:{scenario.infra.leafUplinkPorts} 下联/上联</dd></div>
                <div><dt>管理交换机</dt><dd>{result.sizing.managementSwitches} 台 {scenario.infra.managementSwitchModel}，{scenario.infra.managementSwitchPortSpec}</dd></div>
                <div><dt>服务器端口</dt><dd>{result.sizing.serverNetworkPorts.toLocaleString()} 个400G端口，{scenario.infra.nicPortsPerServer}口/服务器</dd></div>
                <div><dt>机柜数量</dt><dd>{result.sizing.rackCount.toLocaleString()} 柜，按{scenario.infra.rackPowerKw}kW/柜与{scenario.infra.serversPerRack}台/柜双约束</dd></div>
                <div><dt>PDU/辅材</dt><dd>PDU {formatMoney(result.costs.pduCapex)}，机柜内线缆 {formatMoney(result.costs.rackCablingCapex)}</dd></div>
                <div><dt>机柜CAPEX</dt><dd>{formatMoney(result.costs.rackCapex)}</dd></div>
                <div><dt>光模块型号</dt><dd>{scenario.infra.opticalModuleModel}，{scenario.infra.opticalModuleSpec}</dd></div>
                <div><dt>光模块数量</dt><dd>{result.sizing.opticalEndpoints.toLocaleString()} 个 = 服务器-Leaf {result.sizing.serverLeafOpticalModules.toLocaleString()} + Leaf-Spine {result.sizing.leafSpineOpticalModules.toLocaleString()}</dd></div>
                <div><dt>光纤链路</dt><dd>{result.sizing.fiberCableLinks.toLocaleString()} 条 = 服务器-Leaf {result.sizing.serverLeafCableLinks.toLocaleString()} + Leaf-Spine {result.sizing.leafSpineLinks.toLocaleString()}</dd></div>
                <div><dt>光纤辅材</dt><dd>{formatMoney(result.costs.fiberCablingCapex)}，{formatMoney(scenario.infra.fiberCablingPriceRmbPerLink)}/链路</dd></div>
                <div><dt>网络CAPEX</dt><dd>{formatMoney(result.costs.networkCapex)}</dd></div>
              </dl>
            </div>
            <div className="panel">
              <div className="panelTitle">
                <Database size={18} />
                <h2>高性能存储</h2>
              </div>
              <dl className="specList">
                <div><dt>可用容量</dt><dd>{formatPb(result.sizing.usableStorageTb)}，按{scenario.infra.storageTbPerCard.toFixed(2)}TB/卡与最低{formatPb(scenario.infra.minSharedStorageTb)}双约束</dd></div>
                <div><dt>原始采购</dt><dd>{formatPb(result.sizing.rawStorageTb)}，冗余系数 {scenario.infra.storageRedundancyFactor.toFixed(2)}</dd></div>
                <div><dt>存储单价</dt><dd>{formatMoney(scenario.infra.storagePriceRmbPerTb)}/TB</dd></div>
                <div><dt>存储功耗</dt><dd>{result.sizing.storagePowerKw.toFixed(0)} kW</dd></div>
                <div><dt>存储CAPEX</dt><dd>{formatMoney(result.costs.storageCapex)}</dd></div>
              </dl>
            </div>
            <div className="panel">
              <div className="panelTitle">
                <Zap size={18} />
                <h2>功耗与水电</h2>
              </div>
              <dl className="specList">
                <div><dt>IT功率</dt><dd>{result.sizing.itPowerKw.toFixed(0)} kW</dd></div>
                <div><dt>设施功率</dt><dd>{result.sizing.facilityPowerKw.toFixed(0)} kW</dd></div>
                <div><dt>年用电量</dt><dd>{result.sizing.annualEnergyKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh</dd></div>
                <div><dt>电价</dt><dd>{scenario.infra.electricityPriceRmbPerKwh.toFixed(2)} 元/kWh</dd></div>
                <div><dt>年水电成本</dt><dd>{formatMoney(result.costs.annualElectricityCost + result.costs.annualWaterCost)}</dd></div>
                <div><dt>年OPEX</dt><dd>{formatMoney(result.costs.annualOpex)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <CircleDollarSign size={18} />
              <h2>年度运营成本拆分</h2>
            </div>
            <div className="opexGrid">
              {opexItems.map((item) => (
                <div key={item.name} className="opexItem">
                  <span>{item.name}</span>
                  <strong>{formatMoney(item.value)}</strong>
                  <small>{((item.value / result.costs.annualOpex) * 100).toFixed(1)}% · {item.note}</small>
                </div>
              ))}
            </div>
            <p className="chartNote">
              年度OPEX不含折旧，也不含一次性CAPEX。电价、PUE、机柜月租、运维费率、软件费率和公网安全费用都会直接改变这张运营成本表。
            </p>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Calculator size={18} />
              <h2>公式诊断</h2>
            </div>
            <div className="formulaGrid">
              {result.formulas.map((line) => (
                <article className="formula" key={line.title}>
                  <h3>{line.title}</h3>
                  <code>{line.formula}</code>
                  <strong>{line.value}</strong>
                  <p>{line.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <AlertTriangle size={18} />
              <h2>来源与边界</h2>
            </div>
            <div className="sourceGrid">
              {defaults.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  <strong>{source.label}</strong>
                  <span>{source.note}</span>
                  <small>截至 {source.asOf}</small>
                </a>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
