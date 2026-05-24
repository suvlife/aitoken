import cors from "cors";
import express from "express";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { marketDefaults } from "../src/lib/marketData.js";
import type { MarketDefaults } from "../src/lib/types.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
const execFileAsync = promisify(execFile);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

type CollectionStatus = {
  label: string;
  url: string;
  status: "fetched" | "failed";
  note: string;
};

const htmlToText = (html: string) => {
  const $ = cheerio.load(html);
  return $("body").text().replace(/\s+/g, " ").trim();
};

const fetchTextByFetch = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return htmlToText(html);
};

const fetchTextByCurl = async (url: string) => {
  const { stdout } = await execFileAsync(
    "curl",
    ["-L", "--max-time", "20", "-A", USER_AGENT, "-sS", url],
    { maxBuffer: 12 * 1024 * 1024 }
  );
  return htmlToText(stdout);
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

const fetchText = async (url: string) => {
  try {
    return await fetchTextByFetch(url);
  } catch (fetchError) {
    try {
      return await fetchTextByCurl(url);
    } catch (curlError) {
      throw new Error(`fetch失败：${errorMessage(fetchError)}；curl兜底失败：${errorMessage(curlError)}`);
    }
  }
};

const getNearby = (text: string, marker: string, length = 900) => {
  const index = text.indexOf(marker);
  if (index < 0) return "";
  return text.slice(index, index + length);
};

const parseCashPerK = (snippet: string) => {
  const values = [...snippet.matchAll(/0\.\d{3,4}/g)].map((match) => Number(match[0]) * 1000);
  return values.filter((value) => Number.isFinite(value));
};

const parseH3cS9827PriceSignals = (text: string) => {
  const prices: number[] = [];
  if (text.includes("232058.03")) prices.push(232058.03);
  if (text.includes("398,900.00") || text.includes("398900.00")) prices.push(398900);
  if (text.includes("748,000.00") || text.includes("748000.00")) prices.push(748000);
  const exactMatches = [...text.matchAll(/S9827-128DH[\s\S]{0,260}?￥\s*([0-9,]+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1].replace(/,/g, ""))
  );
  prices.push(...exactMatches.filter((price) => price >= 150000 && price <= 900000));
  return [...new Set(prices)];
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const roundTo = (value: number, unit: number) => Math.round(value / unit) * unit;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-token-factory-roi", time: new Date().toISOString() });
});

app.get("/api/market/defaults", (_req, res) => {
  res.json(marketDefaults);
});

app.get("/api/market/refresh", async (_req, res) => {
  const defaults: MarketDefaults = structuredClone(marketDefaults);
  const collection: CollectionStatus[] = [];
  const warnings: string[] = [];
  const h3cSwitchPriceSignals: number[] = [];
  const h3cModulePriceSignals: number[] = [];
  let h3cSwitchQuoteOnly = false;

  const targets = [
    {
      label: "火山引擎/扣子模型费用",
      url: "https://www.volcengine.com/docs/84458/1585097",
      parser: (text: string) => {
        const doubaoCode = parseCashPerK(getNearby(text, "Doubao-Seed-2.0-Code"));
        const deepseekR1 = parseCashPerK(getNearby(text, "DeepSeek-R1-250528"));
        const glm47 = parseCashPerK(getNearby(text, "GLM-4.7"));

        const doubao = defaults.models.find((item) => item.id === "doubao-seed-code");
        if (doubao && doubaoCode.length >= 2) {
          doubao.inputPricePerMTok = doubaoCode[0];
          doubao.outputPricePerMTok = doubaoCode[1];
        }

        const deepseek = defaults.models.find((item) => item.id === "deepseek-r1");
        if (deepseek && deepseekR1.length >= 2) {
          deepseek.inputPricePerMTok = deepseekR1[0];
          deepseek.outputPricePerMTok = deepseekR1[1];
        }

        const glm = defaults.models.find((item) => item.id === "glm-47");
        if (glm && glm47.length >= 4) {
          glm.inputPricePerMTok = glm47[2];
          glm.outputPricePerMTok = glm47[3];
        }
      }
    },
    {
      label: "阿里云百炼模型规格与计费",
      url: "https://help.aliyun.com/zh/model-studio/basic-concepts",
      parser: (text: string) => {
        const qwenSnippet = getNearby(text, "qwen3-max", 1600);
        const match = qwenSnippet.match(/0<Token≤32K\s*([0-9.]+)元\s*([0-9.]+)元/);
        const qwen = defaults.models.find((item) => item.id === "qwen3-max");
        if (qwen && match) {
          qwen.inputPricePerMTok = Number(match[1]);
          qwen.outputPricePerMTok = Number(match[2]);
        }

        const kimiSnippet = getNearby(text, "kimi-k2.6", 1200);
        const kimiMatch = kimiSnippet.match(/98,304\s*([0-9.]+)元\s*([0-9.]+)元/);
        const kimi = defaults.models.find((item) => item.id === "kimi-k26");
        if (kimi && kimiMatch) {
          kimi.inputPricePerMTok = Number(kimiMatch[1]);
          kimi.outputPricePerMTok = Number(kimiMatch[2]);
        }
      }
    },
    {
      label: "Moonshot/Kimi API价格",
      url: "https://platform.kimi.com/docs/pricing/chat-k2",
      parser: (text: string) => {
        const kimiSnippet = getNearby(text, "K2.6", 1200) || getNearby(text, "kimi-k2.6", 1200);
        const usdValues = [...kimiSnippet.matchAll(/\$([0-9.]+)/g)].map((match) => Number(match[1]));
        const kimi = defaults.models.find((item) => item.id === "kimi-k26");
        if (kimi && usdValues.length >= 3) {
          const usdToRmb = 7.25;
          kimi.inputPricePerMTok = usdValues[1] * usdToRmb;
          kimi.outputPricePerMTok = usdValues[2] * usdToRmb;
        }
      }
    },
    {
      label: "H3C S9827-128DH公开报价/中标价",
      url: "https://detail.zol.com.cn/2000/1999363/price.shtml?via=touch-bottom",
      parser: (text: string) => {
        h3cSwitchPriceSignals.push(...parseH3cS9827PriceSignals(text));
        h3cSwitchQuoteOnly ||= text.includes("价格面议");
      }
    },
    {
      label: "H3C S9827-128DH公开中标价样本",
      url: "https://yzb.caigou2003.com/detail/1992622924263325697",
      parser: (text: string) => {
        h3cSwitchPriceSignals.push(...parseH3cS9827PriceSignals(text));
      }
    },
    {
      label: "H3C S9827-128DH公开中标价样本2",
      url: "https://www.yinshuazhaobiao.com/news-95177ba02f833072f62976ab9683222b/",
      parser: (text: string) => {
        h3cSwitchPriceSignals.push(...parseH3cS9827PriceSignals(text));
      }
    },
    {
      label: "400G QSFP112光模块公开价",
      url: "https://www.lsolink.com/product/201201/",
      parser: (text: string) => {
        const usdMatches = [...text.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((match) => Number(match[1]));
        const modulePrices = usdMatches.filter((price) => price >= 250 && price <= 1200).map((price) => price * 7.25);
        h3cModulePriceSignals.push(...modulePrices);
      }
    }
  ];

  await Promise.all(
    targets.map(async (target) => {
      try {
        const text = await fetchText(target.url);
        target.parser(text);
        collection.push({
          label: target.label,
          url: target.url,
          status: "fetched",
          note: "已拉取页面文本并尝试解析；未匹配到的字段保留默认值。"
        });
      } catch (error) {
        const message = errorMessage(error);
        warnings.push(`${target.label} 采集失败：${message}`);
        collection.push({
          label: target.label,
          url: target.url,
          status: "failed",
          note: message
        });
      }
    })
  );

  const uniqueH3cSwitchPrices = [...new Set(h3cSwitchPriceSignals.filter(Number.isFinite))];
  const h3cSwitchPrice = uniqueH3cSwitchPrices.length >= 2 ? median(uniqueH3cSwitchPrices) : null;
  if (h3cSwitchPrice) {
    const switchPrice = roundTo(h3cSwitchPrice, 1000);
    defaults.infra.leafSwitchPriceRmb = switchPrice;
    defaults.infra.spineSwitchPriceRmb = switchPrice;
    defaults.infra.networkPriceNote = `已拉取H3C S9827-128DH公开报价/中标价样本，按${uniqueH3cSwitchPrices.length}个样本中位数${switchPrice.toLocaleString()}元/台更新；若项目要求原厂维保或授权代理供货，应以最终询价为准。`;
  } else if (uniqueH3cSwitchPrices.length === 1) {
    defaults.infra.networkPriceNote = `已拉取到1个H3C S9827-128DH公开中标价样本${roundTo(uniqueH3cSwitchPrices[0], 1000).toLocaleString()}元/台，但样本不足以自动覆盖默认中位价；请结合原厂/代理询价手动修正。`;
  } else if (h3cSwitchQuoteOnly) {
    defaults.infra.networkPriceNote = "已拉取ZOL最新报价页，H3C S9827-128DH当前显示价格面议；继续沿用默认公开招采中位价。";
  }

  const h3cModulePrice = median(h3cModulePriceSignals);
  if (h3cModulePrice) {
    defaults.infra.opticalEndpointPriceRmb = roundTo(h3cModulePrice, 100);
  }

  defaults.reviewedAt = new Date().toISOString();

  res.json({
    defaults,
    collection,
    warnings
  });
});

app.listen(PORT, () => {
  console.log(`AI Token Factory API listening on http://localhost:${PORT}`);
});
