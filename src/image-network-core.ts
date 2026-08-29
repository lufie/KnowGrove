import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateImageAddress } from "./image-provider-core";

export type ImageDnsResolver = (hostname: string) => Promise<LookupAddress[]>;

export function normalizedImageHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export async function resolvePublicImageAddresses(
  url: URL,
  resolver: ImageDnsResolver = async (hostname) => lookup(hostname, { all: true, verbatim: true }),
): Promise<LookupAddress[]> {
  const hostname = normalizedImageHostname(url);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some((entry) => isPrivateImageAddress(entry.address))) {
    throw new Error("远程图片地址解析到本机、保留或局域网地址，已拒绝读取");
  }
  return addresses.map((entry) => ({ address: entry.address, family: entry.family }));
}

export function createPinnedImageLookup(
  expectedHostname: string,
  addresses: LookupAddress[],
): LookupFunction {
  const normalizedExpected = expectedHostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (hostname, options, callback) => {
    const normalizedRequested = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (normalizedRequested !== normalizedExpected) {
      const error = new Error("远程图片请求主机与已验证主机不一致") as NodeJS.ErrnoException;
      error.code = "EHOSTUNREACH";
      callback(error, "", 0);
      return;
    }
    const requestedFamily = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const eligible = requestedFamily === 4 || requestedFamily === 6
      ? addresses.filter((entry) => entry.family === requestedFamily)
      : addresses;
    if (!eligible.length) {
      const error = new Error("已验证地址不支持请求的网络类型") as NodeJS.ErrnoException;
      error.code = "EHOSTUNREACH";
      callback(error, "", 0);
      return;
    }
    if (options.all) {
      callback(null, eligible.map((entry) => ({ ...entry })));
      return;
    }
    const selected = eligible[0]!;
    callback(null, selected.address, selected.family);
  };
}
