import { requestUrl } from "obsidian";
import type { CreationStudioSettings } from "./types";

export const CREATION_IMAGE_SECRET_ID = "knowgrove-creation-image-api-key";

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function imageGenerationEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) return "https://api.openai.com/v1/images/generations";
  return normalized.endsWith("/images/generations") ? normalized : `${normalized}/images/generations`;
}

export async function generateCreationImage(
  settings: CreationStudioSettings,
  prompt: string,
  apiKey?: string,
): Promise<ArrayBuffer> {
  if (!settings.imageGenerationEnabled) throw new Error("请先在设置中启用真实配图生成");
  if (!apiKey) throw new Error("尚未保存配图 API Key");
  if (!settings.imageModel.trim()) throw new Error("请先填写配图模型名称");
  const response = await requestUrl({
    url: imageGenerationEndpoint(settings.imageEndpoint),
    method: "POST",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.imageModel.trim(),
      prompt,
      size: settings.imageSize.trim() || "1536x1024",
      n: 1,
      response_format: "b64_json",
    }),
  });
  const item = (response.json as {
    data?: Array<{ b64_json?: string; url?: string }>;
  }).data?.[0];
  if (item?.b64_json) return base64ToArrayBuffer(item.b64_json);
  if (item?.url) {
    const downloaded = await requestUrl({ url: item.url, method: "GET" });
    return downloaded.arrayBuffer;
  }
  throw new Error("配图接口没有返回图片数据");
}
