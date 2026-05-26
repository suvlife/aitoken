import type { MarketDefaults } from "./types.js";

export const marketDefaults: MarketDefaults = {
  reviewedAt: "2026-05-26",
  accelerators: [
    {
      id: "mlu590",
      name: "寒武纪 MLU590",
      memoryGb: 96,
      memoryBandwidthGbps: 2000,
      fp16Tflops: 315,
      tdpWatts: 550,
      unitPriceRmb: 65000,
      priceNote: "公开市场/研报口径显示思元590约6-7万元/张，默认取中位数；实际采购需按批量合同覆盖。",
      sourceLabel: "西部证券PDF/公开信息检索"
    }
  ],
  models: [
    {
      id: "doubao-seed-pro",
      name: "Doubao-Seed-2.0-Pro",
      vendor: "火山/豆包",
      totalParamsB: 120,
      activeParamsB: 60,
      quantBits: 8,
      contextK: 32,
      allocatedCards: 4000,
      inputToOutputRatio: 3,
      inputPricePerMTok: 3.2,
      outputPricePerMTok: 16,
      runtimeEfficiency: 0.92,
      priceMode: "market",
      priceSource: "火山引擎/扣子模型费用：doubao-seed-2.0-pro 0-32k 输入3.2、输出16元/百万tokens"
    },
    {
      id: "deepseek-r1",
      name: "DeepSeek-R1-250528",
      vendor: "DeepSeek",
      totalParamsB: 671,
      activeParamsB: 37,
      quantBits: 8,
      contextK: 128,
      allocatedCards: 2500,
      inputToOutputRatio: 2.2,
      inputPricePerMTok: 4,
      outputPricePerMTok: 16,
      runtimeEfficiency: 0.82,
      priceMode: "market",
      priceSource: "火山引擎/扣子模型费用：输入4、输出16元/百万tokens"
    },
    {
      id: "glm-47",
      name: "GLM-4.7",
      vendor: "智谱",
      totalParamsB: 355,
      activeParamsB: 32,
      quantBits: 8,
      contextK: 32,
      allocatedCards: 1500,
      inputToOutputRatio: 2.5,
      inputPricePerMTok: 3,
      outputPricePerMTok: 14,
      runtimeEfficiency: 0.88,
      priceMode: "market",
      priceSource: "火山引擎/扣子模型费用：0-32k长输出输入3、输出14元/百万tokens"
    },
    {
      id: "qwen3-max",
      name: "Qwen3-Max",
      vendor: "阿里云百炼",
      totalParamsB: 1000,
      activeParamsB: 90,
      quantBits: 8,
      contextK: 32,
      allocatedCards: 1200,
      inputToOutputRatio: 3,
      inputPricePerMTok: 2.5,
      outputPricePerMTok: 10,
      runtimeEfficiency: 0.76,
      priceMode: "market",
      priceSource: "阿里云百炼官方：qwen3-max 0-32k 输入2.5、输出10元/百万tokens"
    },
    {
      id: "kimi-k26",
      name: "Kimi K2.6",
      vendor: "Moonshot/Kimi",
      totalParamsB: 1000,
      activeParamsB: 32,
      quantBits: 8,
      contextK: 256,
      allocatedCards: 800,
      inputToOutputRatio: 3.2,
      inputPricePerMTok: 6.5,
      outputPricePerMTok: 27,
      runtimeEfficiency: 0.8,
      priceMode: "market",
      priceSource: "阿里云百炼/Moonshot官方价参考：kimi-k2.6 输入6.5、输出27元/百万tokens"
    }
  ],
  infra: {
    cardsPerServer: 8,
    serverBasePriceRmb: 380000,
    serverBasePowerWatts: 1200,
    serversPerRack: 6,
    rackPowerKw: 40,
    rackSetupPriceRmb: 60000,
    pduPriceRmbPerRack: 28000,
    rackCablingPriceRmbPerRack: 12000,
    rackMonthlyRentRmb: 3200,
    pue: 1.35,
    electricityPriceRmbPerKwh: 0.72,
    waterCostRateOfElectricity: 0.03,
    omRateOfCapex: 0.025,
    softwareRateOfCapex: 0.012,
    deploymentRateOfCapex: 0.03,
    contingencyRate: 0.05,
    storageTbPerCard: 1,
    minSharedStorageTb: 6000,
    storageRedundancyFactor: 1.35,
    storagePriceRmbPerTb: 7800,
    storagePowerWattsPerTb: 6,
    nicPortsPerServer: 2,
    leafSwitchModel: "H3C S9827-128DH",
    leafSwitchPortSpec: "128*400GE QSFP112，102.4Tbps，RoCEv2/AI ECN/PFC/ECN",
    leafDownlinkPorts: 64,
    leafUplinkPorts: 64,
    spineSwitchModel: "H3C S9827-128DH",
    spineSwitchPortSpec: "128*400GE QSFP112，Leaf-Spine 400G无收敛上联",
    spinePorts: 128,
    managementSwitchModel: "H3C S5130S-52S-HI",
    managementSwitchPortSpec: "48*10/100/1000BASE-T + 4*1G/10G SFP+，IRF，带外/BMC管理网",
    opticalModuleModel: "H3C QSFP112-400G-VR4-MM850",
    opticalModuleSpec: "400G QSFP112 VR4，MPO12/APC，OM4 50m/OM3 30m",
    fiberCableModel: "MPO12/APC OM4多模主干光纤/跳线",
    networkPriceNote: "H3C S9827-128DH最新公开零售页多为价格面议；默认按2025-2026公开招采单价样本约23.2-74.8万元取中位约49万元，并用400G QSFP112兼容模块公开价校准光模块下沿。",
    leafSwitchPriceRmb: 490000,
    spineSwitchPriceRmb: 490000,
    managementSwitchPriceRmb: 18000,
    opticalEndpointPriceRmb: 5000,
    fiberCablingPriceRmbPerLink: 1500,
    leafSwitchPowerWatts: 850,
    spineSwitchPowerWatts: 850,
    managementSwitchPowerWatts: 120,
    internetAndSecurityMonthlyRmb: 200000
  },
  efficiency: {
    gpuPowerLoadFactor: 0.72,
    memoryBandwidthEfficiency: 0.42,
    computeEfficiency: 0.18,
    continuousBatchGain: 14,
    servingUtilization: 0.65,
    sellThroughRate: 0.82,
    availability: 0.985,
    gpuMemoryUsableFraction: 0.78,
    modelMemoryOverhead: 1.12
  },
  financial: {
    depreciationYears: 5,
    tokenPriceRealizationRate: 0.72,
    revenueDeductionRate: 0.08,
    tokenDemandGrowthRate: 0.12,
    tokenPriceErosionRate: 0.1,
    rentalPriceErosionRate: 0.06,
    opexInflationRate: 0.03,
    rentalPricePerCardHourRmb: 3.2,
    rentalUtilization: 0.75
  },
  sources: [
    {
      label: "火山引擎/扣子模型费用",
      url: "https://www.volcengine.com/docs/84458/1585097",
      note: "官方页面给出模型费用公式以及豆包、DeepSeek、GLM等模型现金结算单价。",
      asOf: "2026-04-15"
    },
    {
      label: "火山方舟模型价格",
      url: "https://www.volcengine.com/docs/82379/1544106",
      note: "方舟模型价格入口，页面会随模型更新变化。",
      asOf: "2026-04-24"
    },
    {
      label: "阿里云百炼模型规格与计费",
      url: "https://help.aliyun.com/zh/model-studio/basic-concepts",
      note: "Qwen3-Max按输入长度阶梯计费，默认采用0-32k阶梯。",
      asOf: "2026-04-26"
    },
    {
      label: "Moonshot/Kimi API价格",
      url: "https://platform.kimi.com/docs/pricing/chat-k2",
      note: "Kimi K2/K2.5/K2.6官方API价格；默认人民币价参考百炼中国内地服务，Moonshot美元价可手动覆盖。",
      asOf: "2026-04-26"
    },
    {
      label: "MLU590公开价格口径",
      url: "https://cniis.aastocks.com/CNSESH_STOCK/2026/2026-3/2026-03-13/11992927.pdf",
      note: "研报/问询回复公开信息提到寒武纪思元590价格从8.5万元降至6-7万元。",
      asOf: "2026-03-13"
    },
    {
      label: "TrendForce 2026内存/NAND涨价",
      url: "https://www.trendforce.com/presscenter/news/20260331-12995.html",
      note: "AI服务器需求推动DRAM合约价继续上涨，NAND价格也受AI和数据中心需求推动扩散上涨。",
      asOf: "2026-03-31"
    },
    {
      label: "新华三H3C S9827交换机规格",
      url: "https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/Switches/Products/Data_Center_Switch/Aggregation_Switch/S9800/S9827/",
      note: "S9827-128DH支持128个400GE QSFP112端口、102.4Tbps交换容量、典型功耗850W，并支持RoCE/PFC/ECN/AI ECN等AIGC智算网络能力。",
      asOf: "2026-04-30"
    },
    {
      label: "新华三H3C 400G光模块规格",
      url: "https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/Switches/Products/ZHBX/GMK/GMK/400G/",
      note: "QSFP112-400G-VR4-MM850为400Gbps、MPO12/APC、850nm多模，OM3约30m、OM4约50m，单模块典型功耗8.5W。",
      asOf: "2026-04-30"
    },
    {
      label: "新华三H3C S5130S-HI管理交换机规格",
      url: "https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/Switches/Products/Park_Switches/Access_Switch/S5130/S5130S-HI/",
      note: "S5130S-52S-HI提供48个10/100/1000BASE-T端口与4个1G/10G SFP+端口，适合BMC/带外管理网络按48台服务器一台测算。",
      asOf: "2026-04-30"
    },
    {
      label: "H3C S9827-128DH公开报价页",
      url: "https://detail.zol.com.cn/2000/1999363/price.shtml?via=touch-bottom",
      note: "ZOL最新报价页显示S9827-128DH多为价格面议，工具因此优先用公开招采样本和手动输入修正采购价。",
      asOf: "2026-04-30"
    },
    {
      label: "H3C S9827-128DH公开招采样本",
      url: "https://www.yinshuazhaobiao.com/news-95177ba02f833072f62976ab9683222b/",
      note: "公开中标公告包含H3C S9827-128DH设备单价样本，用于校准默认49万元/台的公开样本中位估算。",
      asOf: "2026-04-30"
    },
    {
      label: "400G QSFP112 VR4公开模块价",
      url: "https://www.lsolink.com/product/201201/",
      note: "第三方400G-Q112-VR4模块公开页面给出359美元/只口径，工具默认H3C原厂/兼容混合口径按5000元/端点保守估算。",
      asOf: "2026-04-30"
    },
    {
      label: "NVIDIA企业AI存储选型",
      url: "https://developer.nvidia.com/zh-cn/blog/choosing-the-right-storage-for-enterprise-ai-workloads/",
      note: "AI工作负载增长时，存储容量和性能也必须同步扩展；工具将高性能存储按可用容量和原始采购容量分开测算。",
      asOf: "2026-04-30"
    },
    {
      label: "400G光模块市场价参考",
      url: "https://whgearlink.com/news-4/802.html",
      note: "400G SR/DR短距模块市场价随封装、距离、品牌差异明显，默认按DR4/短距混合下沿估算。",
      asOf: "2026-04-30"
    },
    {
      label: "数据中心PDU市场",
      url: "https://www.globalgrowthinsights.com/zh/market-reports/data-center-rack-power-distribution-unit-pdu-market-115266",
      note: "PDU是机柜级电力分配和负载监测的核心部件，工具将PDU从机柜基础建设中拆出单列。",
      asOf: "2026-04-30"
    },
    {
      label: "PUE定义",
      url: "https://www.techtarget.com/searchdatacenter/definition/power-usage-effectiveness-PUE",
      note: "PUE = 数据中心总能耗 / IT设备能耗。",
      asOf: "2026-04-26"
    },
    {
      label: "LLM推理指标",
      url: "https://developer.nvidia.com/blog/llm-benchmarking-fundamental-concepts/",
      note: "TTFT、ITL、TPS、RPS等是推理服务关键指标，吞吐随并发上升至饱和。",
      asOf: "2026-04-26"
    },
    {
      label: "LLM解码带宽瓶颈",
      url: "https://gpudojo.com/articles/speed-estimation",
      note: "解码阶段通常受显存带宽和模型权重读取约束，工具采用带宽上限和算力上限双约束。",
      asOf: "2026-04-26"
    },
    {
      label: "GPU租赁市场参考",
      url: "https://spader-ai.com/marketplace",
      note: "公开GPU租赁平台价格波动很大，默认国产卡租赁价需按合同修正。",
      asOf: "2026-04-26"
    }
  ]
};
