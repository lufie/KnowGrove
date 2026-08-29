import assert from "node:assert/strict";
import test from "node:test";
import {
  createPinnedImageLookup,
  normalizedImageHostname,
  resolvePublicImageAddresses,
} from "../src/image-network-core";

test("public IPv6 literals are normalized without a second DNS lookup", async () => {
  const url = new URL("http://[2001:4860:4860::8888]/image.png");
  let resolverCalls = 0;
  const addresses = await resolvePublicImageAddresses(url, async () => {
    resolverCalls += 1;
    return [];
  });
  assert.equal(normalizedImageHostname(url), "2001:4860:4860::8888");
  assert.deepEqual(addresses, [{ address: "2001:4860:4860::8888", family: 6 }]);
  assert.equal(resolverCalls, 0);
});

test("remote image requests stay pinned to the public address that was validated", async () => {
  const url = new URL("https://images.example.test/photo.png");
  const addresses = await resolvePublicImageAddresses(url, async (hostname) => {
    assert.equal(hostname, "images.example.test");
    return [{ address: "93.184.216.34", family: 4 }];
  });
  const pinnedLookup = createPinnedImageLookup(normalizedImageHostname(url), addresses);
  const selected = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    pinnedLookup("images.example.test", { family: 0 }, (error, address, family) => {
      if (error) reject(error);
      else if (typeof address !== "string") reject(new Error("Expected one pinned address"));
      else resolve({ address, family: family ?? 0 });
    });
  });
  assert.deepEqual(selected, { address: "93.184.216.34", family: 4 });
});

test("unspecified IPv6 and mixed public-private DNS answers are rejected", async () => {
  await assert.rejects(
    resolvePublicImageAddresses(new URL("http://[::]/image.png")),
    /已拒绝读取/,
  );
  await assert.rejects(
    resolvePublicImageAddresses(new URL("https://mixed.example.test/image.png"), async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /已拒绝读取/,
  );
});
