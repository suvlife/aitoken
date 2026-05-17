import type {
  CalculationResult,
  CostBreakdown,
  FormulaLine,
  InfraSizing,
  ModelResult,
  Scenario,
  YearlyResult
} from "./types";

const HOURS_PER_YEAR = 8760;
const SECONDS_PER_YEAR = HOURS_PER_YEAR * 3600;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const money = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)}亿元`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)}万元`;
  return `${value.toFixed(0)}元`;
};

const tokenText = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  return `${value.toFixed(0)}`;
};

const findPayback = (yearly: YearlyResult[], key: "tokenCumulativeCashFlow" | "rentalCumulativeCashFlow") => {
  let previousYear = 0;
  let previousCash = yearly.length ? -Math.abs(yearly[0][key] - yearly[0][key]) : 0;

  for (const row of yearly) {
    const currentCash = row[key];
    if (currentCash >= 0) {
      const priorCash = previousYear === 0 ? row[key] - row[key === "tokenCumulativeCashFlow" ? "tokenCashFlow" : "rentalCashFlow"] : previousCash;
      const currentFlow = currentCash - priorCash;
      if (currentFlow <= 0) return row.year;
      return previousYear + Math.abs(priorCash) / currentFlow;
    }
    previousYear = row.year;
    previousCash = currentCash;
  }

  return null;
};

export function calculateScenario(scenario: Scenario): CalculationResult {
  const { accelerator, gpuCount, infra, efficiency, financial } = scenario;
  const years = Math.max(1, Math.round(scenario.years));
  const normalizedGpuCount = Math.max(1, Math.round(gpuCount));
  const tokenPriceRealizationRate = financial.tokenPriceRealizationRate ?? 1;
  const revenueDeductionRate = financial.revenueDeductionRate ?? 0;
  const serverCount = Math.ceil(normalizedGpuCount / infra.cardsPerServer);

  const serversPerLeaf = Math.max(1, Math.floor(infra.leafDownlinkPorts / infra.nicPortsPerServer));
  const leafSwitches = Math.ceil(serverCount / serversPerLeaf);
  const serverNetworkPorts = serverCount * infra.nicPortsPerServer;
  const serverLeafCableLinks = serverNetworkPorts;
  const leafSpineLinks = leafSwitches * infra.leafUplinkPorts;
  const spineSwitches = Math.max(1, Math.ceil(leafSpineLinks / infra.spinePorts));
  const managementSwitches = Math.max(1, Math.ceil(serverCount / 48));
  const serverLeafOpticalModules = serverLeafCableLinks * 2;
  const leafSpineOpticalModules = leafSpineLinks * 2;
  const opticalEndpoints = serverLeafOpticalModules + leafSpineOpticalModules;
  const fiberCableLinks = serverLeafCableLinks + leafSpineLinks;

  const usableStorageTb = Math.max(infra.minSharedStorageTb, normalizedGpuCount * infra.storageTbPerCard);
  const rawStorageTb = usableStorageTb * infra.storageRedundancyFactor;
  const storageTb = rawStorageTb;

  const gpuPowerKw = (normalizedGpuCount * accelerator.tdpWatts * efficiency.gpuPowerLoadFactor) / 1000;
  const serverPowerKw = (serverCount * infra.serverBasePowerWatts) / 1000;
  const networkPowerKw =
    (leafSwitches * infra.leafSwitchPowerWatts +
      spineSwitches * infra.spineSwitchPowerWatts +
      managementSwitches * infra.managementSwitchPowerWatts) /
    1000;
  const storagePowerKw = (storageTb * infra.storagePowerWattsPerTb) / 1000;
  const itPowerKw = gpuPowerKw + serverPowerKw + networkPowerKw + storagePowerKw;
  const facilityPowerKw = itPowerKw * infra.pue;
  const annualEnergyKwh = facilityPowerKw * HOURS_PER_YEAR;
  const rackCount = Math.max(Math.ceil(serverCount / infra.serversPerRack), Math.ceil(itPowerKw / infra.rackPowerKw));

  const gpuCapex = normalizedGpuCount * accelerator.unitPriceRmb;
  const serverCapex = serverCount * infra.serverBasePriceRmb;
  const networkCapex =
      leafSwitches * infra.leafSwitchPriceRmb +
      spineSwitches * infra.spineSwitchPriceRmb +
      managementSwitches * infra.managementSwitchPriceRmb +
      opticalEndpoints * infra.opticalEndpointPriceRmb +
      fiberCableLinks * infra.fiberCablingPriceRmbPerLink;
  const fiberCablingCapex = fiberCableLinks * infra.fiberCablingPriceRmbPerLink;
  const storageCapex = storageTb * infra.storagePriceRmbPerTb;
  const rackBaseCapex = rackCount * infra.rackSetupPriceRmb;
  const pduCapex = rackCount * infra.pduPriceRmbPerRack;
  const rackCablingCapex = rackCount * infra.rackCablingPriceRmbPerRack;
  const rackCapex = rackBaseCapex + pduCapex + rackCablingCapex;
  const subtotalCapex = gpuCapex + serverCapex + networkCapex + storageCapex + rackCapex;
  const deploymentCapex = subtotalCapex * infra.deploymentRateOfCapex;
  const contingencyCapex = (subtotalCapex + deploymentCapex) * infra.contingencyRate;
  const totalCapex = subtotalCapex + deploymentCapex + contingencyCapex;

  const annualElectricityCost = annualEnergyKwh * infra.electricityPriceRmbPerKwh;
  const annualWaterCost = annualElectricityCost * infra.waterCostRateOfElectricity;
  const annualRackRent = rackCount * infra.rackMonthlyRentRmb * 12;
  const annualOmCost = totalCapex * infra.omRateOfCapex;
  const annualSoftwareCost = totalCapex * infra.softwareRateOfCapex;
  const annualInternetSecurityCost = infra.internetAndSecurityMonthlyRmb * 12;
  const annualOpex =
    annualElectricityCost +
    annualWaterCost +
    annualRackRent +
    annualOmCost +
    annualSoftwareCost +
    annualInternetSecurityCost;
  const annualDepreciation = totalCapex / financial.depreciationYears;

  const sizing: InfraSizing = {
    serverCount,
    rackCount,
    leafSwitches,
    spineSwitches,
    managementSwitches,
    serverNetworkPorts,
    serverLeafCableLinks,
    leafSpineLinks,
    opticalEndpoints,
    serverLeafOpticalModules,
    leafSpineOpticalModules,
    fiberCableLinks,
    storageTb,
    usableStorageTb,
    rawStorageTb,
    gpuPowerKw,
    serverPowerKw,
    networkPowerKw,
    storagePowerKw,
    itPowerKw,
    facilityPowerKw,
    annualEnergyKwh
  };

  const costs: CostBreakdown = {
    gpuCapex,
    serverCapex,
    networkCapex,
    storageCapex,
    rackBaseCapex,
    pduCapex,
    rackCablingCapex,
    rackCapex,
    fiberCablingCapex,
    deploymentCapex,
    contingencyCapex,
    totalCapex,
    annualElectricityCost,
    annualWaterCost,
    annualRackRent,
    annualOmCost,
    annualSoftwareCost,
    annualInternetSecurityCost,
    annualOpex,
    annualDepreciation
  };

  const operatingSeconds = SECONDS_PER_YEAR * efficiency.availability;
  const requestedModelCards = scenario.models.reduce((sum, model) => sum + Math.max(0, model.allocatedCards), 0);
  const allocationScale = requestedModelCards > normalizedGpuCount ? normalizedGpuCount / requestedModelCards : 1;
  const modelResults: ModelResult[] = scenario.models.map((model) => {
    const allocatedCards = Math.max(0, Math.round(model.allocatedCards * allocationScale));
    const activeWeightGb = model.activeParamsB * (model.quantBits / 8) * efficiency.modelMemoryOverhead;
    const storedWeightGb = model.totalParamsB * (model.quantBits / 8) * efficiency.modelMemoryOverhead;
    const usableMemoryPerCard = accelerator.memoryGb * efficiency.gpuMemoryUsableFraction;
    const cardsPerReplica = Math.max(1, Math.ceil(storedWeightGb / usableMemoryPerCard));
    const usableReplicaCards =
      allocatedCards >= cardsPerReplica ? Math.floor(allocatedCards / cardsPerReplica) * cardsPerReplica : 0;
    const fitFraction = allocatedCards > 0 ? usableReplicaCards / allocatedCards : 0;
    const singleStreamTpsPerCard =
      activeWeightGb > 0 ? (accelerator.memoryBandwidthGbps * efficiency.memoryBandwidthEfficiency) / activeWeightGb : 0;
    const computeCapTpsPerCard =
      model.activeParamsB > 0 ? (accelerator.fp16Tflops * 500 * efficiency.computeEfficiency) / model.activeParamsB : 0;
    const batchedTpsPerCard = Math.min(singleStreamTpsPerCard * efficiency.continuousBatchGain, computeCapTpsPerCard);
    const engineeringTpsPerCard = batchedTpsPerCard * fitFraction * model.runtimeEfficiency;
    const practicalTpsPerCard =
      engineeringTpsPerCard *
      efficiency.servingUtilization *
      efficiency.sellThroughRate;
    const annualEngineeringOutputTokens = engineeringTpsPerCard * allocatedCards * SECONDS_PER_YEAR;
    const annualOutputTokens = practicalTpsPerCard * allocatedCards * operatingSeconds;
    const annualInputTokens = annualOutputTokens * model.inputToOutputRatio;
    const annualRevenue =
      (annualInputTokens / 1000000) * model.inputPricePerMTok +
      (annualOutputTokens / 1000000) * model.outputPricePerMTok;

    return {
      id: model.id,
      name: model.name,
      allocatedCards,
      cardsPerReplica,
      activeWeightGb,
      storedWeightGb,
      singleStreamTpsPerCard,
      computeCapTpsPerCard,
      engineeringTpsPerCard,
      practicalTpsPerCard,
      annualEngineeringOutputTokens,
      annualOutputTokens,
      annualInputTokens,
      annualRevenue,
      warning:
        allocatedCards > 0 && allocatedCards < cardsPerReplica
          ? `分配卡数不足以放下一个${model.name}副本，至少需要${cardsPerReplica}张卡。`
          : allocationScale < 1
            ? "模型分配总卡数超过集群规模，已按比例缩放。"
          : undefined
    };
  });

  const totalAnnualEngineeringOutputTokens = modelResults.reduce((sum, item) => sum + item.annualEngineeringOutputTokens, 0);
  const totalAnnualOutputTokens = modelResults.reduce((sum, item) => sum + item.annualOutputTokens, 0);
  const totalAnnualInputTokens = modelResults.reduce((sum, item) => sum + item.annualInputTokens, 0);
  const revenueCollectionRate = Math.max(0, 1 - revenueDeductionRate);
  const baseAnnualTokenListRevenue = modelResults.reduce((sum, item) => sum + item.annualRevenue, 0);
  const baseAnnualTokenRevenue =
    baseAnnualTokenListRevenue * tokenPriceRealizationRate * revenueCollectionRate;
  const baseAnnualRentalGrossRevenue =
    normalizedGpuCount *
    financial.rentalPricePerCardHourRmb *
    HOURS_PER_YEAR *
    financial.rentalUtilization *
    efficiency.availability;
  const baseAnnualRentalRevenue = baseAnnualRentalGrossRevenue * revenueCollectionRate;

  const horizonFactors = Array.from({ length: years }, (_, index) => ({
    token: (1 + financial.tokenDemandGrowthRate) ** index * (1 - financial.tokenPriceErosionRate) ** index,
    rental: (1 - financial.rentalPriceErosionRate) ** index,
    opex: (1 + financial.opexInflationRate) ** index
  }));
  const tokenFactorSum = horizonFactors.reduce((sum, item) => sum + item.token, 0);
  const rentalFactorSum = horizonFactors.reduce((sum, item) => sum + item.rental, 0);
  const opexHorizonTotal = horizonFactors.reduce((sum, item) => sum + annualOpex * item.opex, 0);
  const tokenBreakEvenRealizationRate =
    baseAnnualTokenListRevenue > 0 && revenueCollectionRate > 0 && tokenFactorSum > 0
      ? (totalCapex + opexHorizonTotal) / (baseAnnualTokenListRevenue * revenueCollectionRate * tokenFactorSum)
      : Number.POSITIVE_INFINITY;
  const rentalBreakEvenPricePerCardHour =
    normalizedGpuCount > 0 && financial.rentalUtilization > 0 && revenueCollectionRate > 0 && rentalFactorSum > 0
      ? (totalCapex + opexHorizonTotal) /
        (normalizedGpuCount * HOURS_PER_YEAR * financial.rentalUtilization * efficiency.availability * revenueCollectionRate * rentalFactorSum)
      : Number.POSITIVE_INFINITY;

  let tokenCumulativeCashFlow = -totalCapex;
  let rentalCumulativeCashFlow = -totalCapex;
  let tokenCumulativeAccountingProfit = 0;
  let rentalCumulativeAccountingProfit = 0;
  const yearly: YearlyResult[] = Array.from({ length: years }, (_, index) => {
    const year = index + 1;
    const tokenListRevenue = baseAnnualTokenListRevenue * horizonFactors[index].token;
    const tokenRevenue = tokenListRevenue * tokenPriceRealizationRate * revenueCollectionRate;
    const tokenRevenueDeduction = tokenListRevenue - tokenRevenue;
    const rentalGrossRevenue = baseAnnualRentalGrossRevenue * horizonFactors[index].rental;
    const rentalRevenue = rentalGrossRevenue * revenueCollectionRate;
    const rentalRevenueDeduction = rentalGrossRevenue - rentalRevenue;
    const opex = annualOpex * horizonFactors[index].opex;
    const depreciation = year <= financial.depreciationYears ? annualDepreciation : 0;
    const tokenAccountingProfit = tokenRevenue - opex - depreciation;
    const rentalAccountingProfit = rentalRevenue - opex - depreciation;
    const tokenCashFlow = tokenRevenue - opex;
    const rentalCashFlow = rentalRevenue - opex;
    tokenCumulativeCashFlow += tokenCashFlow;
    rentalCumulativeCashFlow += rentalCashFlow;
    tokenCumulativeAccountingProfit += tokenAccountingProfit;
    rentalCumulativeAccountingProfit += rentalAccountingProfit;

    return {
      year,
      tokenListRevenue,
      tokenRevenue,
      tokenRevenueDeduction,
      rentalGrossRevenue,
      rentalRevenue,
      rentalRevenueDeduction,
      opex,
      depreciation,
      tokenAccountingProfit,
      rentalAccountingProfit,
      tokenCashFlow,
      rentalCashFlow,
      tokenCumulativeCashFlow,
      rentalCumulativeCashFlow,
      tokenCumulativeAccountingProfit,
      rentalCumulativeAccountingProfit,
      tokenRoi: tokenCumulativeCashFlow / totalCapex,
      rentalRoi: rentalCumulativeCashFlow / totalCapex,
      tokenAccountingRoi: tokenCumulativeAccountingProfit / totalCapex,
      rentalAccountingRoi: rentalCumulativeAccountingProfit / totalCapex
    };
  });

  const formulas: FormulaLine[] = [
    {
      title: "服务器台数",
      formula: "服务器台数 = ceil(GPU卡数 / 每台服务器卡数)",
      value: `${serverCount.toLocaleString()}台 = ceil(${normalizedGpuCount.toLocaleString()} / ${infra.cardsPerServer})`,
      note: "默认按8卡AI服务器测算，最后一台未满卡也按整机计入。"
    },
    {
      title: "服务器CAPEX",
      formula: "服务器CAPEX = 服务器台数 * 服务器非GPU单价",
      value: `${money(serverCapex)} = ${serverCount.toLocaleString()} * ${money(infra.serverBasePriceRmb)}`,
      note: "非GPU单价包含双CPU、2TB DDR5、NVMe系统盘/数据盘、400G网卡、机箱电源和质保，不含AI加速卡。2026年内存和SSD涨价会显著抬高该项。"
    },
    {
      title: "网络规模",
      formula: "Leaf = ceil(服务器台数 / floor(Leaf下联端口 / 每服务器网卡端口)); Spine = ceil(Leaf * Leaf上联端口 / Spine端口)",
      value: `${leafSwitches}台${infra.leafSwitchModel} Leaf、${spineSwitches}台${infra.spineSwitchModel} Spine、${opticalEndpoints.toLocaleString()}个400G光模块`,
      note: "默认采用新华三H3C S9827-128DH作为400G Leaf/Spine，64下联+64上联形成1:1无收敛叶脊结构；真实项目可按收敛比和POD边界复核。"
    },
    {
      title: "网络CAPEX",
      formula: "网络CAPEX = Leaf*Leaf单价 + Spine*Spine单价 + 管理交换机*单价 + 光模块端点*端点单价 + 光纤链路*链路辅材单价",
      value: `${money(networkCapex)} = ${leafSwitches}*${money(infra.leafSwitchPriceRmb)} + ${spineSwitches}*${money(infra.spineSwitchPriceRmb)} + ${managementSwitches}*${money(infra.managementSwitchPriceRmb)} + ${opticalEndpoints.toLocaleString()}*${money(infra.opticalEndpointPriceRmb)} + ${fiberCableLinks.toLocaleString()}*${money(infra.fiberCablingPriceRmbPerLink)}`,
      note: `${infra.networkPriceNote} 光模块数量 = 服务器-Leaf链路*2 + Leaf-Spine链路*2；光纤链路数 = 服务器-Leaf链路 + Leaf-Spine链路。`
    },
    {
      title: "高性能存储",
      formula: "采购原始容量 = max(最低可用容量, GPU卡数 * TB/卡) * 冗余系数；存储CAPEX = 采购原始容量 * 元/TB",
      value: `${money(storageCapex)} = ${(usableStorageTb / 1000).toFixed(2)}PB可用 * ${infra.storageRedundancyFactor.toFixed(2)} * ${money(infra.storagePriceRmbPerTb)}/TB`,
      note: "可用容量用于业务规划，采购原始容量用于成本和功耗；冗余系数覆盖EC/RAID、副本、热备、元数据和文件系统预留。"
    },
    {
      title: "机柜/PDU/辅材",
      formula: "机柜配套CAPEX = 机柜数 * (机柜基础建设 + PDU + 机柜内线缆辅材)",
      value: `${money(rackCapex)} = ${rackCount.toLocaleString()} * (${money(infra.rackSetupPriceRmb)} + ${money(infra.pduPriceRmbPerRack)} + ${money(infra.rackCablingPriceRmbPerRack)})`,
      note: "默认机柜基础建设不再假设包含PDU；PDU按A/B路计量PDU与安装分摊单列，机柜内线缆、扎线、标签、理线架等作为辅材单列。"
    },
    {
      title: "机房电力",
      formula: "设施功率 = (GPU功率 + 服务器非GPU功率 + 网络功率 + 存储功率) * PUE",
      value: `${facilityPowerKw.toFixed(0)}kW = ${itPowerKw.toFixed(0)}kW * ${infra.pue}`,
      note: "GPU功率使用TDP乘平均负载系数，PUE把制冷、UPS损耗、照明等非IT能耗纳入。"
    },
    {
      title: "年水电费",
      formula: "年水电费 = 设施功率 * 8760小时 * 电价 * (1 + 水费系数)",
      value: `${money(annualElectricityCost + annualWaterCost)} = ${facilityPowerKw.toFixed(0)}kW * 8760 * ${infra.electricityPriceRmbPerKwh} * ${(1 + infra.waterCostRateOfElectricity).toFixed(2)}`,
      note: "水费系数用于蒸发冷却/补水/水处理等保守附加项，可改为液冷合同实际值。"
    },
    {
      title: "年度OPEX",
      formula: "年度OPEX = 年电费 + 年水费 + 机柜租赁 + 运维费 + 软件平台费 + 互联网安全费用",
      value: `${money(annualOpex)} = 水电${money(annualElectricityCost + annualWaterCost)} + 机柜${money(annualRackRent)} + 运维${money(annualOmCost)} + 软件${money(annualSoftwareCost)} + 网络安全${money(annualInternetSecurityCost)}`,
      note: "电价变化不会改变CAPEX，但会立刻改变年度OPEX、年度利润、现金流和回本周期。"
    },
    {
      title: "单卡输出吞吐",
      formula: "工程上限TPS/卡 = min(显存带宽*带宽效率/活跃权重GB*连续批处理增益, FP16算力*500*算力效率/活跃参数B) * 副本适配率 * 模型运行系数；实际TPS/卡 = 工程上限TPS/卡 * 利用率 * 可售卖率",
      value: modelResults
        .slice(0, 3)
        .map((item) => `${item.name}: 上限${item.engineeringTpsPerCard.toFixed(1)}，实际${item.practicalTpsPerCard.toFixed(1)} tok/s/卡`)
        .join("；"),
      note: `该公式把单流解码、连续批处理、算力上限和工程折损分开。年输出tokens再乘8760小时和可用性${efficiency.availability.toFixed(3)}，不使用峰值理论吞吐直接卖钱。`
    },
    {
      title: "Tokens收入",
      formula: "Token净收入 = (输入tokens/1e6*输入官方价 + 输出tokens/1e6*输出官方价) * 官方价成交系数 * (1 - 收入扣减率)",
      value: `${money(baseAnnualTokenRevenue)} = ${money(baseAnnualTokenListRevenue)} * ${tokenPriceRealizationRate.toFixed(2)} * ${revenueCollectionRate.toFixed(2)}`,
      note: `不同模型分别计算后汇总。当前输出${tokenText(totalAnnualOutputTokens)}tokens/年、输入${tokenText(totalAnnualInputTokens)}tokens/年；若按官方价100%成交，可把成交系数调到1。`
    },
    {
      title: "租卡收入",
      formula: "年租卡净收入 = GPU卡数 * 元/卡时 * 8760 * 出租利用率 * 可用性 * (1 - 收入扣减率)",
      value: `${money(baseAnnualRentalRevenue)} = ${normalizedGpuCount.toLocaleString()} * ${financial.rentalPricePerCardHourRmb} * 8760 * ${financial.rentalUtilization} * ${efficiency.availability} * ${revenueCollectionRate.toFixed(2)}`,
      note: `当前${years}年现金回本所需首年租价约${Number.isFinite(rentalBreakEvenPricePerCardHour) ? rentalBreakEvenPricePerCardHour.toFixed(2) : "-"}元/卡时，真实合同受卡型、时长、整机独占和运维责任影响很大。`
    },
    {
      title: "ROI和回本",
      formula: "累计现金ROI = (-CAPEX + Σ(净收入 - OPEX)) / CAPEX；年度会计利润 = 净收入 - OPEX - 折旧",
      value: `第${years}年Token ROI ${(yearly[years - 1].tokenRoi * 100).toFixed(1)}%，租卡ROI ${(yearly[years - 1].rentalRoi * 100).toFixed(1)}%`,
      note: "ROI曲线是现金回本口径，先扣一次性CAPEX，再逐年扣运营现金成本；折旧不重复作为现金流出，但会在年度损益表中扣除。"
    }
  ];

  return {
    sizing,
    costs,
    models: modelResults,
    yearly,
    totalAnnualEngineeringOutputTokens,
    totalAnnualOutputTokens,
    totalAnnualInputTokens,
    baseAnnualTokenListRevenue,
    baseAnnualTokenRevenue,
    baseAnnualRentalGrossRevenue,
    baseAnnualRentalRevenue,
    tokenPaybackYear: findPayback(yearly, "tokenCumulativeCashFlow"),
    rentalPaybackYear: findPayback(yearly, "rentalCumulativeCashFlow"),
    tokenBreakEvenRealizationRate,
    rentalBreakEvenPricePerCardHour,
    formulas
  };
}

export const formatMoney = money;
export const formatTokens = tokenText;
export const clampNumber = clamp;
