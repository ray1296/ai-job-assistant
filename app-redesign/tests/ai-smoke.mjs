import assert from "node:assert/strict";
import { createAiGateway } from "../server/ai-gateway.mjs";
import fs from "node:fs/promises";
const dir = await fs.mkdtemp("/tmp/ai-gateway-");
const g = createAiGateway(dir);
const p = {
  document: {
    schemaVersion: 2,
    header: { name: "", headline: "", contact: "", summary: "" },
    sections: [],
    layout: { template: "classic", fontSize: 14, accent: "purple" },
  },
};
await assert.rejects(
  () => g.review("u", p),
  (e) => e.status === 503,
);
assert.deepEqual(g.status(), {
  configured: false,
  active: 0,
  queued: 0,
  maxActive: 1,
  maxQueue: 2,
});
console.log(
  "PASS AI gateway fails honestly without credentials and exposes bounded status",
);
await fs.rm(dir, { recursive: true, force: true });
