export type SourceLink = {
  label: string;
  url: string;
  note: string;
  asOf: string;
};

export type ModelPriceMode = "market" | "manual";

export type AcceleratorSpec = {
  id: string;
  name: string;
  memoryGb: number;
  memoryBandwidthGbps: number;
  fp16Tflops: number;
  tdpWatts: number;
  unitPriceRmb: number;
  priceNote: string;
  sourceLabel: string;
};

export type ModelProfile = {
  id: string;
  name: string;
  vendor: string;
  totalParamsB: number;
  activeParamsB: number;
  quantBits: number;
  contextK: number;
  allocatedCards: number;
  inputToOutputRatio: number;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  runtimeEfficiency: number;
  priceMode: ModelPriceMode;
  priceSource: string;
};

export type InfraDefaults = {
  cardsPerServer: number;
  serverBasePriceRmb: number;
  serverBasePowerWatts: number;
  serversPerRack: number;
  rackPowerKw: number;
  rackSetupPriceRmb: number;
  pduPriceRmbPerRack: number;
  rackCablingPriceRmbPerRack: number;
  rackMonthlyRentRmb: number;
  pue: number;
  electricityPriceRmbPerKwh: number;
  waterCostRateOfElectricity: number;
  omRateOfCapex: number;
  softwareRateOfCapex: number;
  deploymentRateOfCapex: number;
  contingencyRate: number;
  storageTbPerCard: number;
  minSharedStorageTb: number;
  storageRedundancyFactor: number;
  storagePriceRmbPerTb: number;
  storagePowerWattsPerTb: number;
  nicPortsPerServer: number;
  leafSwitchModel: string;
  leafSwitchPortSpec: string;
  leafDownlinkPorts: number;
  leafUplinkPorts: number;
  spineSwitchModel: string;
  spineSwitchPortSpec: string;
  spinePorts: number;
  managementSwitchModel: string;
  managementSwitchPortSpec: string;
  opticalModuleModel: string;
  opticalModuleSpec: string;
  fiberCableModel: string;
  networkPriceNote: string;
  leafSwitchPriceRmb: number;
  spineSwitchPriceRmb: number;
  managementSwitchPriceRmb: number;
  opticalEndpointPriceRmb: number;
  fiberCablingPriceRmbPerLink: number;
  leafSwitchPowerWatts: number;
  spineSwitchPowerWatts: number;
  managementSwitchPowerWatts: number;
  internetAndSecurityMonthlyRmb: number;
};

export type EfficiencyDefaults = {
  gpuPowerLoadFactor: number;
  memoryBandwidthEfficiency: number;
  computeEfficiency: number;
  continuousBatchGain: number;
  servingUtilization: number;
  sellThroughRate: number;
  availability: number;
  gpuMemoryUsableFraction: number;
  modelMemoryOverhead: number;
};

export type FinancialDefaults = {
  depreciationYears: number;
  tokenPriceRealizationRate: number;
  revenueDeductionRate: number;
  tokenDemandGrowthRate: number;
  tokenPriceErosionRate: number;
  rentalPriceErosionRate: number;
  opexInflationRate: number;
  rentalPricePerCardHourRmb: number;
  rentalUtilization: number;
};

export type Scenario = {
  years: number;
  gpuCount: number;
  accelerator: AcceleratorSpec;
  models: ModelProfile[];
  infra: InfraDefaults;
  efficiency: EfficiencyDefaults;
  financial: FinancialDefaults;
};

export type MarketDefaults = {
  accelerators: AcceleratorSpec[];
  models: ModelProfile[];
  infra: InfraDefaults;
  efficiency: EfficiencyDefaults;
  financial: FinancialDefaults;
  sources: SourceLink[];
  reviewedAt: string;
};

export type CostBreakdown = {
  gpuCapex: number;
  serverCapex: number;
  networkCapex: number;
  storageCapex: number;
  rackBaseCapex: number;
  pduCapex: number;
  rackCablingCapex: number;
  rackCapex: number;
  fiberCablingCapex: number;
  deploymentCapex: number;
  contingencyCapex: number;
  totalCapex: number;
  annualElectricityCost: number;
  annualWaterCost: number;
  annualRackRent: number;
  annualOmCost: number;
  annualSoftwareCost: number;
  annualInternetSecurityCost: number;
  annualOpex: number;
  annualDepreciation: number;
};

export type InfraSizing = {
  serverCount: number;
  rackCount: number;
  leafSwitches: number;
  spineSwitches: number;
  managementSwitches: number;
  serverNetworkPorts: number;
  serverLeafCableLinks: number;
  leafSpineLinks: number;
  opticalEndpoints: number;
  serverLeafOpticalModules: number;
  leafSpineOpticalModules: number;
  fiberCableLinks: number;
  storageTb: number;
  usableStorageTb: number;
  rawStorageTb: number;
  gpuPowerKw: number;
  serverPowerKw: number;
  networkPowerKw: number;
  storagePowerKw: number;
  itPowerKw: number;
  facilityPowerKw: number;
  annualEnergyKwh: number;
};

export type ModelResult = {
  id: string;
  name: string;
  allocatedCards: number;
  cardsPerReplica: number;
  activeWeightGb: number;
  storedWeightGb: number;
  singleStreamTpsPerCard: number;
  computeCapTpsPerCard: number;
  engineeringTpsPerCard: number;
  practicalTpsPerCard: number;
  annualEngineeringOutputTokens: number;
  annualOutputTokens: number;
  annualInputTokens: number;
  annualRevenue: number;
  warning?: string;
};

export type YearlyResult = {
  year: number;
  tokenListRevenue: number;
  tokenRevenue: number;
  tokenRevenueDeduction: number;
  rentalGrossRevenue: number;
  rentalRevenue: number;
  rentalRevenueDeduction: number;
  opex: number;
  depreciation: number;
  tokenAccountingProfit: number;
  rentalAccountingProfit: number;
  tokenCashFlow: number;
  rentalCashFlow: number;
  tokenCumulativeCashFlow: number;
  rentalCumulativeCashFlow: number;
  tokenCumulativeAccountingProfit: number;
  rentalCumulativeAccountingProfit: number;
  tokenRoi: number;
  rentalRoi: number;
  tokenAccountingRoi: number;
  rentalAccountingRoi: number;
};

export type FormulaLine = {
  title: string;
  formula: string;
  value: string;
  note: string;
};

export type CalculationResult = {
  sizing: InfraSizing;
  costs: CostBreakdown;
  models: ModelResult[];
  yearly: YearlyResult[];
  totalAnnualEngineeringOutputTokens: number;
  totalAnnualOutputTokens: number;
  totalAnnualInputTokens: number;
  baseAnnualTokenListRevenue: number;
  baseAnnualTokenRevenue: number;
  baseAnnualRentalGrossRevenue: number;
  baseAnnualRentalRevenue: number;
  tokenPaybackYear: number | null;
  rentalPaybackYear: number | null;
  tokenBreakEvenRealizationRate: number;
  rentalBreakEvenPricePerCardHour: number;
  formulas: FormulaLine[];
};
