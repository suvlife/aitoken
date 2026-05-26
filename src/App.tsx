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
import { calculateScenario, clampNumber, formatMoney, formatTokens } from "./lib/calculator";
import { marketDefaults } from "./lib/marketData";
import type { MarketDefaults, ModelPriceMode, ModelProfile, Scenario } from "./lib/types";

const createScenario = (defaults: MarketDefaults): Scenario => ({
  years: 5,
  gpuCount: 10000,
  accelerator: { ...defaults.accelerators[0] },
  models: defaults.models.map((model) => ({ ...model, priceMode: model.priceMode ?? "market" })),
  infra: { ...defaults.infra },
  efficiency: { ...defaults.efficiency },
  financial: { ...defaults.financial }
});

const toPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatPb = (tb: number) => `${(tb / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} PB`;
const compactMoney = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
  code,
  label,
  value,
  sub
}: {
  code: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="metric">
      <div className="metricIcon">{code}</div>
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
  const pdfReportRef = useRef<HTMLDivElement>(null);
  const controlPanelRef = useRef<HTMLElement>(null);

  const result = useMemo(() => calculateScenario(scenario), [scenario]);
  const allocatedCards = scenario.models.reduce((sum, model) => sum + Math.max(0, model.allocatedCards), 0);
  const unallocatedCards = scenario.gpuCount - allocatedCards;
  const effectiveAllocatedCards = result.models.reduce((sum, model) => sum + Math.max(0, model.allocatedCards), 0);
  const allocationScale = allocatedCards > scenario.gpuCount ? scenario.gpuCount / allocatedCards : 1;
  const tokenPriceRealizationRate =
    scenario.financial.tokenPriceRealizationRate ?? defaults.financial.tokenPriceRealizationRate;
  const revenueDeductionRate = scenario.financial.revenueDeductionRate ?? defaults.financial.revenueDeductionRate;
  const netRevenueFactor = tokenPriceRealizationRate * Math.max(0, 1 - revenueDeductionRate);

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
    if (!pdfReportRef.current) return;
    const sections = Array.from(pdfReportRef.current.querySelectorAll<HTMLElement>(".pdfSection"));
    if (sections.length === 0) return;

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 8;
    const renderWidth = pageWidth - margin * 2;
    const renderHeight = pageHeight - margin * 2;
    let hasPage = false;

    for (const section of sections) {
      const canvas = await html2canvas(section, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: section.scrollWidth,
        windowHeight: section.scrollHeight
      });

      const sliceHeight = Math.floor((renderHeight * canvas.width) / renderWidth);
      let offset = 0;

      while (offset < canvas.height) {
        const currentSliceHeight = Math.min(sliceHeight, canvas.height - offset);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentSliceHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) break;

        context.drawImage(
          canvas,
          0,
          offset,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          canvas.width,
          currentSliceHeight
        );

        if (hasPage) {
          pdf.addPage();
        }
        hasPage = true;

        const pageImageHeight = (currentSliceHeight * renderWidth) / canvas.width;
        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, renderWidth, pageImageHeight, undefined, "FAST");
        offset += currentSliceHeight;
      }
    }

    pdf.save(`AI-Tokens工厂测算报告-${scenario.gpuCount}卡.pdf`);
  };

  const capexSummaryRows = [
    { item: "GPU卡", basis: `${scenario.gpuCount.toLocaleString()}张 × ${formatMoney(scenario.accelerator.unitPriceRmb)}/张`, amount: result.costs.gpuCapex },
    { item: "AI服务器", basis: `${result.sizing.serverCount.toLocaleString()}台 × ${formatMoney(scenario.infra.serverBasePriceRmb)}/台，不含GPU`, amount: result.costs.serverCapex },
    { item: "H3C网络与光互联", basis: `Leaf ${result.sizing.leafSwitches}台、Spine ${result.sizing.spineSwitches}台、光模块${result.sizing.opticalEndpoints.toLocaleString()}个`, amount: result.costs.networkCapex },
    { item: "高性能共享存储", basis: `${formatPb(result.sizing.usableStorageTb)}可用 × ${scenario.infra.storageRedundancyFactor.toFixed(2)}冗余 = ${formatPb(result.sizing.rawStorageTb)}采购`, amount: result.costs.storageCapex },
    { item: "机柜/PDU/柜内辅材", basis: `${result.sizing.rackCount.toLocaleString()}柜 × (机柜基础+PDU+柜内线缆)`, amount: result.costs.rackCapex },
    { item: "部署实施", basis: `硬件小计 × ${(scenario.infra.deploymentRateOfCapex * 100).toFixed(1)}%`, amount: result.costs.deploymentCapex },
    { item: "预备费", basis: `(硬件小计+部署实施) × ${(scenario.infra.contingencyRate * 100).toFixed(1)}%`, amount: result.costs.contingencyCapex },
    { item: "合计", basis: `总CAPEX，按${scenario.financial.depreciationYears}年折旧`, amount: result.costs.totalCapex }
  ];

  const hardwareCapexRows = [
    {
      item: `${scenario.accelerator.name} AI计算卡`,
      quantity: `${scenario.gpuCount.toLocaleString()}张`,
      unit: formatMoney(scenario.accelerator.unitPriceRmb),
      formula: "GPU卡数 × 单卡采购价",
      amount: result.costs.gpuCapex
    },
    {
      item: "8卡AI服务器非GPU部分",
      quantity: `${result.sizing.serverCount.toLocaleString()}台`,
      unit: formatMoney(scenario.infra.serverBasePriceRmb),
      formula: `ceil(${scenario.gpuCount.toLocaleString()} / ${scenario.infra.cardsPerServer}) × 服务器非GPU单价`,
      amount: result.costs.serverCapex
    },
    {
      item: `${scenario.infra.leafSwitchModel} Leaf交换机`,
      quantity: `${result.sizing.leafSwitches.toLocaleString()}台`,
      unit: formatMoney(scenario.infra.leafSwitchPriceRmb),
      formula: "ceil(服务器台数 / 单台Leaf可承载服务器数)",
      amount: result.sizing.leafSwitches * scenario.infra.leafSwitchPriceRmb
    },
    {
      item: `${scenario.infra.spineSwitchModel} Spine交换机`,
      quantity: `${result.sizing.spineSwitches.toLocaleString()}台`,
      unit: formatMoney(scenario.infra.spineSwitchPriceRmb),
      formula: "ceil(Leaf上联总端口 / Spine端口数)",
      amount: result.sizing.spineSwitches * scenario.infra.spineSwitchPriceRmb
    },
    {
      item: `${scenario.infra.managementSwitchModel} 管理交换机`,
      quantity: `${result.sizing.managementSwitches.toLocaleString()}台`,
      unit: formatMoney(scenario.infra.managementSwitchPriceRmb),
      formula: "ceil(服务器台数 / 48)",
      amount: result.sizing.managementSwitches * scenario.infra.managementSwitchPriceRmb
    },
    {
      item: `${scenario.infra.opticalModuleModel} 光模块`,
      quantity: `${result.sizing.opticalEndpoints.toLocaleString()}个`,
      unit: formatMoney(scenario.infra.opticalEndpointPriceRmb),
      formula: "(服务器-Leaf链路 + Leaf-Spine链路) × 2端",
      amount: result.sizing.opticalEndpoints * scenario.infra.opticalEndpointPriceRmb
    },
    {
      item: `${scenario.infra.fiberCableModel} 光纤/跳线/标签辅材`,
      quantity: `${result.sizing.fiberCableLinks.toLocaleString()}条链路`,
      unit: formatMoney(scenario.infra.fiberCablingPriceRmbPerLink),
      formula: "服务器-Leaf链路 + Leaf-Spine链路",
      amount: result.costs.fiberCablingCapex
    },
    {
      item: "高性能共享存储",
      quantity: `${formatPb(result.sizing.rawStorageTb)}原始容量`,
      unit: `${formatMoney(scenario.infra.storagePriceRmbPerTb)}/TB`,
      formula: "max(最低容量, GPU卡数×TB/卡) × 冗余系数 × 元/TB",
      amount: result.costs.storageCapex
    },
    {
      item: "机柜基础建设",
      quantity: `${result.sizing.rackCount.toLocaleString()}柜`,
      unit: formatMoney(scenario.infra.rackSetupPriceRmb),
      formula: "机柜数 × 单柜基础建设费",
      amount: result.costs.rackBaseCapex
    },
    {
      item: "PDU/A-B路配电",
      quantity: `${result.sizing.rackCount.toLocaleString()}柜`,
      unit: formatMoney(scenario.infra.pduPriceRmbPerRack),
      formula: "机柜数 × 单柜PDU与安装分摊",
      amount: result.costs.pduCapex
    },
    {
      item: "柜内线缆与理线辅材",
      quantity: `${result.sizing.rackCount.toLocaleString()}柜`,
      unit: formatMoney(scenario.infra.rackCablingPriceRmbPerRack),
      formula: "机柜数 × 单柜线缆辅材",
      amount: result.costs.rackCablingCapex
    }
  ];

  const opexItems = [
    { name: "电费", value: result.costs.annualElectricityCost, note: `${result.sizing.facilityPowerKw.toFixed(0)}kW × 8760 × ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元/kWh` },
    { name: "冷却/补水", value: result.costs.annualWaterCost, note: `按电费的 ${(scenario.infra.waterCostRateOfElectricity * 100).toFixed(1)}%` },
    { name: "机柜租赁", value: result.costs.annualRackRent, note: `${result.sizing.rackCount.toLocaleString()}柜 × ${scenario.infra.rackMonthlyRentRmb.toLocaleString()}元/月 × 12` },
    { name: "运维人力/备件", value: result.costs.annualOmCost, note: `按总CAPEX的 ${(scenario.infra.omRateOfCapex * 100).toFixed(1)}%/年` },
    { name: "平台软件/监控", value: result.costs.annualSoftwareCost, note: `按总CAPEX的 ${(scenario.infra.softwareRateOfCapex * 100).toFixed(1)}%/年` },
    { name: "公网/安全/专线", value: result.costs.annualInternetSecurityCost, note: `${formatMoney(scenario.infra.internetAndSecurityMonthlyRmb)}/月 × 12` }
  ];

  const opexCalcRows = [
    {
      item: "电费",
      driver: `${result.sizing.facilityPowerKw.toFixed(0)}kW设施功率，年用电${result.sizing.annualEnergyKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })}kWh`,
      formula: `设施功率 × 8760 × ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元/kWh`,
      amount: result.costs.annualElectricityCost
    },
    {
      item: "冷却/补水/水处理",
      driver: `按电费的 ${(scenario.infra.waterCostRateOfElectricity * 100).toFixed(1)}%`,
      formula: "年电费 × 冷却补水系数",
      amount: result.costs.annualWaterCost
    },
    {
      item: "机柜租赁",
      driver: `${result.sizing.rackCount.toLocaleString()}柜，${formatMoney(scenario.infra.rackMonthlyRentRmb)}/柜/月`,
      formula: "机柜数 × 单柜月租 × 12",
      amount: result.costs.annualRackRent
    },
    {
      item: "运维人力/备件",
      driver: `总CAPEX的 ${(scenario.infra.omRateOfCapex * 100).toFixed(1)}%/年`,
      formula: "总CAPEX × 运维备件费率",
      amount: result.costs.annualOmCost
    },
    {
      item: "平台软件/监控",
      driver: `总CAPEX的 ${(scenario.infra.softwareRateOfCapex * 100).toFixed(1)}%/年`,
      formula: "总CAPEX × 软件监控费率",
      amount: result.costs.annualSoftwareCost
    },
    {
      item: "公网/安全/专线",
      driver: `${formatMoney(scenario.infra.internetAndSecurityMonthlyRmb)}/月`,
      formula: "月费 × 12",
      amount: result.costs.annualInternetSecurityCost
    },
    {
      item: "年度OPEX合计",
      driver: "首年口径，后续年度按OPEX通胀率滚动",
      formula: `Σ以上项目；Y2起 × (1 + ${(scenario.financial.opexInflationRate * 100).toFixed(1)}%)^(n-1)`,
      amount: result.costs.annualOpex
    }
  ];

  const sensitivityRows = useMemo(() => {
    const variants = [
      {
        name: "当前方案",
        scenario
      },
      {
        name: "电价+20%",
        scenario: {
          ...scenario,
          infra: {
            ...scenario.infra,
            electricityPriceRmbPerKwh: scenario.infra.electricityPriceRmbPerKwh * 1.2
          }
        }
      },
      {
        name: "成交系数-10%",
        scenario: {
          ...scenario,
          financial: {
            ...scenario.financial,
            tokenPriceRealizationRate: Math.max(0, tokenPriceRealizationRate - 0.1)
          }
        }
      },
      {
        name: "价格年降+10%",
        scenario: {
          ...scenario,
          financial: {
            ...scenario.financial,
            tokenPriceErosionRate: Math.min(1, scenario.financial.tokenPriceErosionRate + 0.1)
          }
        }
      },
      {
        name: "租卡价+30%",
        scenario: {
          ...scenario,
          financial: {
            ...scenario.financial,
            rentalPricePerCardHourRmb: scenario.financial.rentalPricePerCardHourRmb * 1.3
          }
        }
      }
    ];

    return variants.map((variant) => {
      const variantResult = calculateScenario(variant.scenario);
      const finalYear = variantResult.yearly[variantResult.yearly.length - 1];
      return {
        name: variant.name,
        tokenRoi: Number((finalYear.tokenRoi * 100).toFixed(1)),
        rentalRoi: Number((finalYear.rentalRoi * 100).toFixed(1)),
        annualOpex: variantResult.costs.annualOpex,
        tokenPayback: variantResult.tokenPaybackYear ? Number(variantResult.tokenPaybackYear.toFixed(1)) : scenario.years + 1
      };
    });
  }, [scenario, tokenPriceRealizationRate]);

  const paybackText = (value: number | null) => (value ? `${value.toFixed(1)}年` : `${scenario.years}年内未回本`);
  const firstYear = result.yearly[0];
  const lastYear = result.yearly[result.yearly.length - 1];
  const horizonTokenRevenue = result.yearly.reduce((sum, row) => sum + row.tokenRevenue, 0);
  const horizonRentalRevenue = result.yearly.reduce((sum, row) => sum + row.rentalRevenue, 0);
  const throughputRealization =
    result.totalAnnualEngineeringOutputTokens > 0
      ? result.totalAnnualOutputTokens / result.totalAnnualEngineeringOutputTokens
      : 0;
  const averageInputOutputRatio =
    result.totalAnnualOutputTokens > 0 ? result.totalAnnualInputTokens / result.totalAnnualOutputTokens : 0;
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const capexPerCard = result.costs.totalCapex / scenario.gpuCount;
  const facilityKwPerRack = result.sizing.facilityPowerKw / result.sizing.rackCount;
  const firstYearTokenMargin = firstYear.tokenRevenue > 0 ? (firstYear.tokenRevenue - firstYear.opex) / firstYear.tokenRevenue : 0;
  const logicChecks = [
    {
      label: "产能折损",
      value: `${(throughputRealization * 100).toFixed(1)}%`,
      status: throughputRealization <= 0.65 ? "稳健" : "偏乐观",
      note: "实际售卖产能/工程上限，越高越依赖调度、客户需求和稳定性。"
    },
    {
      label: "净价折扣",
      value: `${(netRevenueFactor * 100).toFixed(1)}%`,
      status: netRevenueFactor <= 0.75 ? "稳健" : "复核",
      note: "官方价成交系数与扣减后留存相乘后的实际成交口径。"
    },
    {
      label: "电力密度",
      value: `${facilityKwPerRack.toFixed(1)}kW/柜`,
      status: facilityKwPerRack <= scenario.infra.rackPowerKw * scenario.infra.pue ? "匹配" : "复核",
      note: "设施功率按PUE后分摊到机柜，需与机房合同功率口径对齐。"
    },
    {
      label: "首年现金毛利",
      value: `${(firstYearTokenMargin * 100).toFixed(1)}%`,
      status: firstYearTokenMargin > 0.35 ? "可观" : "承压",
      note: "Tokens净收入扣OPEX后的现金经营余量，未扣税费和融资成本。"
    },
    {
      label: "单卡全投资",
      value: `${compactMoney(capexPerCard)}元/卡`,
      status: "核价",
      note: "总CAPEX/卡数，包含GPU、整机、网络、存储、机柜、实施和预备费。"
    }
  ];
  const defaultAuditRows = [
    {
      item: "MLU590单卡采购价",
      value: formatMoney(scenario.accelerator.unitPriceRmb),
      verdict: "合理",
      note: "默认按公开6-7万元区间取中位数，大批量采购仍需按合同修正。"
    },
    {
      item: "服务器非GPU价格",
      value: formatMoney(scenario.infra.serverBasePriceRmb),
      verdict: "已上调",
      note: "2TB DDR5、NVMe、400G网卡受2026内存/NAND涨价影响，默认从32万元上调到38万元。"
    },
    {
      item: "高性能存储单价",
      value: `${formatMoney(scenario.infra.storagePriceRmbPerTb)}/TB`,
      verdict: "已上调",
      note: "企业级SSD和AI存储供应偏紧，默认从6500元/TB上调到7800元/TB。"
    },
    {
      item: "PUE与电价",
      value: `${scenario.infra.pue.toFixed(2)} / ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元`,
      verdict: "合理",
      note: "PUE 1.35按新建高密智算机房偏稳健口径；电价0.72元/kWh适合做全国平均敏感性基准。"
    },
    {
      item: "Tokens成交口径",
      value: `${(netRevenueFactor * 100).toFixed(1)}%`,
      verdict: "偏稳健",
      note: "成交系数0.72、扣减8%，用于覆盖大客户折扣、渠道、坏账、免费额度和服务补偿。"
    },
    {
      item: "推理产能折损",
      value: `${(throughputRealization * 100).toFixed(1)}%`,
      verdict: "合理",
      note: "实际可售产能约等于工程上限的一半，已扣利用率、可售卖率和可用性。"
    }
  ];
  const capexRows = [
    { item: "GPU卡", basis: `${scenario.gpuCount.toLocaleString()}张 × ${formatMoney(scenario.accelerator.unitPriceRmb)}/张`, amount: result.costs.gpuCapex },
    { item: "服务器", basis: `${result.sizing.serverCount.toLocaleString()}台 × ${formatMoney(scenario.infra.serverBasePriceRmb)}/台非GPU成本`, amount: result.costs.serverCapex },
    { item: "H3C网络", basis: `${result.sizing.leafSwitches}台Leaf + ${result.sizing.spineSwitches}台Spine + 光模块/光纤/管理网`, amount: result.costs.networkCapex },
    { item: "高性能存储", basis: `${formatPb(result.sizing.rawStorageTb)} 原始容量 × ${formatMoney(scenario.infra.storagePriceRmbPerTb)}/TB`, amount: result.costs.storageCapex },
    { item: "机柜配套", basis: `${result.sizing.rackCount.toLocaleString()}柜，含基础建设、PDU、柜内线缆辅材`, amount: result.costs.rackCapex },
    { item: "实施与预备", basis: `部署实施 + 预备费，按工程参数计提`, amount: result.costs.deploymentCapex + result.costs.contingencyCapex }
  ];
  const engineeringRows = [
    { item: "服务器台数", value: `${result.sizing.serverCount.toLocaleString()}台`, note: `${scenario.infra.cardsPerServer}张卡/台` },
    { item: "单台服务器", value: `${scenario.infra.cardsPerServer}x ${scenario.accelerator.name}`, note: `双CPU、2TB DDR5、8x NVMe、${scenario.infra.nicPortsPerServer}x400G NIC` },
    { item: "网络型号", value: `${scenario.infra.leafSwitchModel} / ${scenario.infra.spineSwitchModel}`, note: `${scenario.infra.leafSwitchPortSpec}；${scenario.infra.spineSwitchPortSpec}` },
    { item: "光模块", value: `${result.sizing.opticalEndpoints.toLocaleString()}个`, note: `${scenario.infra.opticalModuleModel}，服务器-Leaf与Leaf-Spine两端合计` },
    { item: "光纤链路", value: `${result.sizing.fiberCableLinks.toLocaleString()}条`, note: `服务器-Leaf ${result.sizing.serverLeafCableLinks.toLocaleString()}条，Leaf-Spine ${result.sizing.leafSpineLinks.toLocaleString()}条` },
    { item: "机柜数量", value: `${result.sizing.rackCount.toLocaleString()}柜`, note: `按${scenario.infra.rackPowerKw}kW/柜与${scenario.infra.serversPerRack}台/柜双约束` },
    { item: "存储容量", value: `${formatPb(result.sizing.usableStorageTb)}可用 / ${formatPb(result.sizing.rawStorageTb)}原始`, note: `按${scenario.infra.storageTbPerCard.toFixed(2)}TB/卡、冗余系数${scenario.infra.storageRedundancyFactor.toFixed(2)}` },
    { item: "设施功率", value: `${result.sizing.facilityPowerKw.toFixed(0)}kW`, note: `IT功率${result.sizing.itPowerKw.toFixed(0)}kW × PUE ${scenario.infra.pue.toFixed(2)}` }
  ];

  return (
    <div className="appShell" ref={reportRef}>
      <header className="topbar">
        <div>
          <p>国产AI计算卡 · 智算集群 · Tokens工厂</p>
          <h1>投资收益测算工作台</h1>
          <div className="heroMeta">
            <span>{scenario.gpuCount.toLocaleString()}张卡</span>
            <span>{result.sizing.serverCount.toLocaleString()}台服务器</span>
            <span>{formatPb(result.sizing.usableStorageTb)}可用存储</span>
            <span>设施功率 {result.sizing.facilityPowerKw.toFixed(0)}kW</span>
            {allocationScale < 1 ? <span>超配按 {(allocationScale * 100).toFixed(1)}% 缩放计算</span> : null}
          </div>
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
            <Metric code="CAP" label="总CAPEX" value={formatMoney(result.costs.totalCapex)} sub={`折旧 ${formatMoney(result.costs.annualDepreciation)}/年`} />
            <Metric code="OPX" label="年OPEX" value={formatMoney(result.costs.annualOpex)} sub={`水电 ${formatMoney(result.costs.annualElectricityCost + result.costs.annualWaterCost)}；电价 ${scenario.infra.electricityPriceRmbPerKwh.toFixed(2)}元/kWh`} />
            <Metric code="TOK" label="年输出Tokens" value={`${formatTokens(result.totalAnnualOutputTokens)}`} sub={`工程上限 ${formatTokens(result.totalAnnualEngineeringOutputTokens)}；输入 ${formatTokens(result.totalAnnualInputTokens)}`} />
            <Metric code="REV" label={`${scenario.years}年Tokens净收入`} value={formatMoney(horizonTokenRevenue)} sub={`首年 ${formatMoney(firstYear.tokenRevenue)}，末年 ${formatMoney(lastYear.tokenRevenue)}；回本 ${paybackText(result.tokenPaybackYear)}`} />
            <Metric code="REN" label={`${scenario.years}年租卡净收入`} value={formatMoney(horizonRentalRevenue)} sub={`首年 ${formatMoney(firstYear.rentalRevenue)}，末年 ${formatMoney(lastYear.rentalRevenue)}；回本 ${paybackText(result.rentalPaybackYear)}`} />
          </section>

          <section className="notice">
            <AlertTriangle size={18} />
            <span>{refreshNote}</span>
            <b>
              模型分配 {allocatedCards.toLocaleString()} 张，实际计算 {effectiveAllocatedCards.toLocaleString()} 张；
              {unallocatedCards >= 0 ? `空余 ${unallocatedCards.toLocaleString()} 张` : `超配 ${Math.abs(unallocatedCards).toLocaleString()} 张`}
            </b>
          </section>

          <section className="logicPanel">
            <div className="logicHeader">
              <div>
                <p>Logic Review</p>
                <h2>计算口径审计</h2>
              </div>
              <span>未计入税费、融资成本、销售费用和坏账超额损失，适合作为工程投资测算底稿。</span>
            </div>
            <div className="logicGrid">
              {logicChecks.map((item) => (
                <article key={item.label}>
                  <div>
                    <span>{item.label}</span>
                    <b>{item.status}</b>
                  </div>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel defaultAuditPanel">
            <div className="panelTitle">
              <ClipboardList size={18} />
              <h2>默认值合理性复核</h2>
            </div>
            <div className="auditGrid">
              {defaultAuditRows.map((row) => (
                <article key={row.item}>
                  <div>
                    <span>{row.item}</span>
                    <b>{row.verdict}</b>
                  </div>
                  <strong>{row.value}</strong>
                  <p>{row.note}</p>
                </article>
              ))}
            </div>
            <p className="chartNote">
              默认值适合作为“可研初筛”的保守基线，不代表正式询价结果。GPU、服务器、存储、网络设备、模型价格和租卡价格均保留手动覆盖入口。
            </p>
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
              <strong>{result.rentalPaybackYear ? `租卡回本 ${result.rentalPaybackYear.toFixed(1)}年` : "租卡当前不回本"}</strong>
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

          <section className="tableGrid">
            <div className="panel wide">
              <div className="panelTitle">
                <TrendingUp size={18} />
                <h2>{scenario.years}年收入、OPEX、折旧与利润表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable analysisTable">
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
                      <th>Tokens现金ROI</th>
                      <th>租卡现金ROI</th>
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
                        <td>{formatMoney(row.tokenAccountingProfit)}</td>
                        <td>{formatMoney(row.rentalAccountingProfit)}</td>
                        <td>{(row.tokenRoi * 100).toFixed(1)}%</td>
                        <td>{(row.rentalRoi * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">
                顶部周期净收入 = Σ各年净收入；Y1使用当前价格和需求，Y2起按需求增长与价格年降滚动。单年净收入 = 官方价收入 × 官方价成交系数 {tokenPriceRealizationRate.toFixed(2)} × 扣减后留存 {(1 - revenueDeductionRate).toFixed(2)}，当前约等于官方价的 {(netRevenueFactor * 100).toFixed(1)}%。
              </p>
            </div>

            <div className="panel wide">
              <div className="panelTitle">
                <Calculator size={18} />
                <h2>硬件CAPEX计算表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable calcTable">
                  <thead>
                    <tr>
                      <th>硬件/辅材项目</th>
                      <th>数量</th>
                      <th>单价</th>
                      <th>计算公式</th>
                      <th>金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hardwareCapexRows.map((row) => (
                      <tr key={row.item}>
                        <td>{row.item}</td>
                        <td>{row.quantity}</td>
                        <td>{row.unit}</td>
                        <td>{row.formula}</td>
                        <td>{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">
                网络设备默认采用H3C新华三口径：{scenario.infra.leafSwitchModel} Leaf、{scenario.infra.spineSwitchModel} Spine、{scenario.infra.opticalModuleModel}光模块；光模块按链路两端计算，光纤/跳线/标签/理线辅材按链路计入。
              </p>
            </div>

            <div className="panel">
              <div className="panelTitle">
                <Network size={18} />
                <h2>CAPEX汇总表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable calcTable">
                  <thead>
                    <tr>
                      <th>项目</th>
                      <th>测算依据</th>
                      <th>金额</th>
                      <th>占总CAPEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capexSummaryRows.map((row) => (
                      <tr key={row.item} className={row.item === "合计" ? "totalRow" : undefined}>
                        <td>{row.item}</td>
                        <td>{row.basis}</td>
                        <td>{formatMoney(row.amount)}</td>
                        <td>{row.item === "合计" ? "100.0%" : `${((row.amount / result.costs.totalCapex) * 100).toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">折旧 = 总CAPEX / {scenario.financial.depreciationYears}年；现金ROI = (-CAPEX + 累计净经营现金流) / CAPEX，折旧不重复作为现金支出。</p>
            </div>

            <div className="panel">
              <div className="panelTitle">
                <CircleDollarSign size={18} />
                <h2>OPEX计算表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable calcTable">
                  <thead>
                    <tr>
                      <th>OPEX项目</th>
                      <th>成本驱动</th>
                      <th>计算公式</th>
                      <th>年成本</th>
                      <th>占OPEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opexCalcRows.map((row) => (
                      <tr key={row.item} className={row.item.includes("合计") ? "totalRow" : undefined}>
                        <td>{row.item}</td>
                        <td>{row.driver}</td>
                        <td>{row.formula}</td>
                        <td>{formatMoney(row.amount)}</td>
                        <td>{row.item.includes("合计") ? "100.0%" : `${((row.amount / result.costs.annualOpex) * 100).toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">电费会随电价、PUE、GPU平均负载和存储容量变化；该表用于直接诊断“调电价后为什么成本变化”。</p>
            </div>

            <div className="panel wide">
              <div className="panelTitle">
                <Zap size={18} />
                <h2>模型吞吐、Tokens与收入表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable analysisTable">
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>分配卡数</th>
                      <th>单副本卡数</th>
                      <th>工程TPS/卡</th>
                      <th>实际TPS/卡</th>
                      <th>年输出Tokens</th>
                      <th>年输入Tokens</th>
                      <th>官方价收入</th>
                      <th>年净收入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.models.map((model) => (
                      <tr key={model.id}>
                        <td>{model.name}</td>
                        <td>{model.allocatedCards.toLocaleString()}张</td>
                        <td>{model.cardsPerReplica.toLocaleString()}张</td>
                        <td>{model.engineeringTpsPerCard.toFixed(1)}</td>
                        <td>{model.practicalTpsPerCard.toFixed(1)}</td>
                        <td>{formatTokens(model.annualOutputTokens)}</td>
                        <td>{formatTokens(model.annualInputTokens)}</td>
                        <td>{formatMoney(model.annualRevenue)}</td>
                        <td>{formatMoney(model.annualRevenue * netRevenueFactor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">实际TPS/卡 = 工程TPS/卡 × 集群利用率 × 可售卖率；年输出Tokens还会乘年度可用性，输入Tokens按各模型输入:输出比例折算。</p>
            </div>

            <div className="panel wide">
              <div className="panelTitle">
                <AlertTriangle size={18} />
                <h2>关键假设敏感性表</h2>
              </div>
              <div className="tableWrap">
                <table className="financialTable analysisTable">
                  <thead>
                    <tr>
                      <th>情景</th>
                      <th>Tokens末年现金ROI</th>
                      <th>租卡末年现金ROI</th>
                      <th>年OPEX</th>
                      <th>Tokens回本时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.tokenRoi.toFixed(1)}%</td>
                        <td>{row.rentalRoi.toFixed(1)}%</td>
                        <td>{formatMoney(row.annualOpex)}</td>
                        <td>{row.tokenPayback > scenario.years ? `${scenario.years}年内未回本` : `${row.tokenPayback.toFixed(1)}年`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="chartNote">
                敏感性不替代正式压力测试，但能快速暴露最脆弱的假设：Tokens业务通常对成交系数和价格年降更敏感，租卡业务通常对卡时租价和利用率更敏感。
              </p>
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
                    <th>年收入口径</th>
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
                          <small>
                            实算 {modelResult?.allocatedCards.toLocaleString() ?? "-"} 张
                            {modelResult?.warning ? `；${modelResult.warning}` : ""}
                          </small>
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
                        <td>
                          <strong>{modelResult ? formatMoney(modelResult.annualRevenue * netRevenueFactor) : "-"}</strong>
                          <small>官方价 {modelResult ? formatMoney(modelResult.annualRevenue) : "-"}</small>
                        </td>
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
                <div><dt>单台配置</dt><dd>{scenario.infra.cardsPerServer}x {scenario.accelerator.name}，双CPU，2TB DDR5，8x NVMe，{scenario.infra.nicPortsPerServer}x400G NIC</dd></div>
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

      <div className="pdfReportHost" ref={pdfReportRef} aria-hidden="true">
        <section className="pdfSection pdfCover">
          <p className="pdfEyebrow">AI Tokens Factory Investment Report</p>
          <h1>国产AI计算卡智算集群投资收益测算报告</h1>
          <div className="pdfMetaGrid">
            <span>生成时间：{generatedAt}</span>
            <span>测算规模：{scenario.gpuCount.toLocaleString()}张 {scenario.accelerator.name}</span>
            <span>测算周期：{scenario.years}年</span>
            <span>价格口径：市场价/手动价混合，可追溯来源</span>
          </div>
          <div className="pdfKpiGrid">
            <article>
              <span>总CAPEX</span>
              <strong>{formatMoney(result.costs.totalCapex)}</strong>
              <small>{scenario.financial.depreciationYears}年直线折旧：{formatMoney(result.costs.annualDepreciation)}/年</small>
            </article>
            <article>
              <span>年OPEX</span>
              <strong>{formatMoney(result.costs.annualOpex)}</strong>
              <small>含水电、机柜租赁、运维、软件、专线安全</small>
            </article>
            <article>
              <span>年输出Tokens</span>
              <strong>{formatTokens(result.totalAnnualOutputTokens)}</strong>
              <small>工程上限：{formatTokens(result.totalAnnualEngineeringOutputTokens)}</small>
            </article>
            <article>
              <span>{scenario.years}年Tokens净收入</span>
              <strong>{formatMoney(horizonTokenRevenue)}</strong>
              <small>回本：{paybackText(result.tokenPaybackYear)}</small>
            </article>
            <article>
              <span>{scenario.years}年租卡净收入</span>
              <strong>{formatMoney(horizonRentalRevenue)}</strong>
              <small>回本：{paybackText(result.rentalPaybackYear)}</small>
            </article>
            <article>
              <span>末年现金ROI</span>
              <strong>Tokens {(lastYear.tokenRoi * 100).toFixed(1)}%</strong>
              <small>租卡 {(lastYear.rentalRoi * 100).toFixed(1)}%</small>
            </article>
          </div>
          <div className="pdfCallout">
            <strong>核心说明</strong>
            <p>
              本报告按工程产能、实际利用率、可售卖率、成交折扣、收入扣减、年度OPEX和折旧分别测算。现金ROI先扣一次性CAPEX，再扣每年OPEX；折旧进入年度会计利润，不作为现金流重复扣减。
            </p>
          </div>
        </section>

        <section className="pdfSection">
          <h2>一、投资成本CAPEX测算</h2>
          <table className="pdfTable">
            <thead>
              <tr>
                <th>成本项</th>
                <th>计算依据</th>
                <th>金额</th>
              </tr>
            </thead>
            <tbody>
              {capexRows.map((row) => (
                <tr key={row.item}>
                  <td>{row.item}</td>
                  <td>{row.basis}</td>
                  <td>{formatMoney(row.amount)}</td>
                </tr>
              ))}
              <tr className="pdfTotalRow">
                <td>合计</td>
                <td>一次性建设投资总额</td>
                <td>{formatMoney(result.costs.totalCapex)}</td>
              </tr>
            </tbody>
          </table>
          <h2>二、年度运营成本OPEX测算</h2>
          <table className="pdfTable">
            <thead>
              <tr>
                <th>运营成本项</th>
                <th>计算公式/依据</th>
                <th>年度金额</th>
              </tr>
            </thead>
            <tbody>
              {opexItems.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.note}</td>
                  <td>{formatMoney(row.value)}</td>
                </tr>
              ))}
              <tr className="pdfTotalRow">
                <td>合计</td>
                <td>年度OPEX，不含折旧和一次性CAPEX</td>
                <td>{formatMoney(result.costs.annualOpex)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pdfSection">
          <h2>三、年度收入、成本、利润与现金流</h2>
          <table className="pdfTable pdfTableCompact">
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
                  <td>{formatMoney(row.tokenAccountingProfit)}</td>
                  <td>{formatMoney(row.rentalAccountingProfit)}</td>
                  <td>{formatMoney(row.tokenCumulativeCashFlow)}</td>
                  <td>{formatMoney(row.rentalCumulativeCashFlow)}</td>
                  <td>{(row.tokenRoi * 100).toFixed(1)}% / {(row.rentalRoi * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdfFormulaBox">
            <strong>年度滚动逻辑</strong>
            <p>
              Y1使用当前模型产能和价格；Y2起按Token需求增长 {toPercent(scenario.financial.tokenDemandGrowthRate)} 与Token价格年降 {toPercent(scenario.financial.tokenPriceErosionRate)}滚动。净收入 = 官方价收入 × 官方价成交系数 {tokenPriceRealizationRate.toFixed(2)} × 扣减后留存 {(1 - revenueDeductionRate).toFixed(2)}，当前约等于官方价的 {(netRevenueFactor * 100).toFixed(1)}%。
            </p>
          </div>
        </section>

        <section className="pdfSection">
          <h2>四、模型部署、Tokens产能与售卖单价</h2>
          <table className="pdfTable pdfTableCompact">
            <thead>
              <tr>
                <th>模型</th>
                <th>价格模式</th>
                <th>分配卡数</th>
                <th>参数/活跃</th>
                <th>输入价</th>
                <th>输出价</th>
                <th>输入:输出</th>
                <th>工程TPS/卡</th>
                <th>实际TPS/卡</th>
                <th>年输出</th>
                <th>年收入口径</th>
              </tr>
            </thead>
            <tbody>
              {scenario.models.map((model) => {
                const modelResult = result.models.find((item) => item.id === model.id);
                return (
                  <tr key={model.id}>
                    <td>{model.name}</td>
                    <td>{(model.priceMode ?? "market") === "manual" ? "手动价" : "市场价"}</td>
                    <td>
                      填写 {model.allocatedCards.toLocaleString()} / 实算 {modelResult?.allocatedCards.toLocaleString() ?? "-"}
                    </td>
                    <td>{model.totalParamsB}B / {model.activeParamsB}B</td>
                    <td>{model.inputPricePerMTok.toFixed(2)}元/百万</td>
                    <td>{model.outputPricePerMTok.toFixed(2)}元/百万</td>
                    <td>{model.inputToOutputRatio.toFixed(2)}</td>
                    <td>{modelResult?.engineeringTpsPerCard.toFixed(1) ?? "-"}</td>
                    <td>{modelResult?.practicalTpsPerCard.toFixed(1) ?? "-"}</td>
                    <td>{modelResult ? formatTokens(modelResult.annualOutputTokens) : "-"}</td>
                    <td>
                      净收入 {modelResult ? formatMoney(modelResult.annualRevenue * netRevenueFactor) : "-"}；官方价 {modelResult ? formatMoney(modelResult.annualRevenue) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="pdfFormulaBox">
            <strong>Tokens产能口径</strong>
            <p>
              当前组合工程上限为 {formatTokens(result.totalAnnualEngineeringOutputTokens)} 输出tokens/年；实际输出 = 工程上限 × 集群利用率 {toPercent(scenario.efficiency.servingUtilization)} × 可售卖率 {toPercent(scenario.efficiency.sellThroughRate)} × 可用性 {toPercent(scenario.efficiency.availability)} = {formatTokens(result.totalAnnualOutputTokens)}。输入tokens按各模型输出tokens乘以输入:输出比例汇总，当前输入 {formatTokens(result.totalAnnualInputTokens)}，加权比例约 {averageInputOutputRatio.toFixed(2)}。
            </p>
          </div>
        </section>

        <section className="pdfSection">
          <h2>五、服务器、H3C网络、存储、机柜与功耗配置</h2>
          <table className="pdfTable">
            <thead>
              <tr>
                <th>项目</th>
                <th>测算结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {engineeringRows.map((row) => (
                <tr key={row.item}>
                  <td>{row.item}</td>
                  <td>{row.value}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdfTwoCol">
            <div className="pdfFormulaBox">
              <strong>水电成本</strong>
              <p>
                年用电量 {result.sizing.annualEnergyKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh × 电价 {scenario.infra.electricityPriceRmbPerKwh.toFixed(2)} 元/kWh = 电费 {formatMoney(result.costs.annualElectricityCost)}；冷却/补水按电费的 {(scenario.infra.waterCostRateOfElectricity * 100).toFixed(1)}% = {formatMoney(result.costs.annualWaterCost)}。
              </p>
            </div>
            <div className="pdfFormulaBox">
              <strong>机柜与辅材</strong>
              <p>
                机柜基础建设默认不含PDU；PDU、机柜内线缆、电源线、理线、标签等分项计入机柜配套CAPEX。光模块数量按链路两端计算，光纤辅材按链路条数计算。
              </p>
            </div>
          </div>
        </section>

        <section className="pdfSection">
          <h2>六、公式诊断表</h2>
          <table className="pdfTable">
            <thead>
              <tr>
                <th>公式项</th>
                <th>计算公式</th>
                <th>当前值</th>
                <th>诊断说明</th>
              </tr>
            </thead>
            <tbody>
              {result.formulas.map((line) => (
                <tr key={line.title}>
                  <td>{line.title}</td>
                  <td>{line.formula}</td>
                  <td>{line.value}</td>
                  <td>{line.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="pdfSection">
          <h2>七、价格来源与测算边界</h2>
          <table className="pdfTable">
            <thead>
              <tr>
                <th>来源</th>
                <th>截至日期</th>
                <th>说明</th>
                <th>链接</th>
              </tr>
            </thead>
            <tbody>
              {defaults.sources.map((source) => (
                <tr key={source.url}>
                  <td>{source.label}</td>
                  <td>{source.asOf}</td>
                  <td>{source.note}</td>
                  <td>{source.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdfCallout">
            <strong>边界提示</strong>
            <p>
              本工具用于投资测算和方案比较，不等同于正式采购报价或承诺收益。最终项目应结合实际机房选址、集采合同、服务器BOM、网络拓扑、维保周期、售卖合同、税务处理与融资成本复核。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
