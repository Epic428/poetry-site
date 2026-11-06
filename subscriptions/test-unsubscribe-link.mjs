#!/usr/bin/env node
// Local-only helper: never deploy this script or expose the signing secret in a URL.
import { createHmac } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const [id, timestamp] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(id ?? "") || !/^\d+$/.test(timestamp ?? "") || Number(timestamp) <= 0) {
  console.error("Usage: node subscriptions/test-unsubscribe-link.mjs <subscriber-id> <confirmed-at-unix-seconds>");
  process.exit(1);
}
const prompt = createInterface({ input: stdin, output: stdout });
let key;
try {
  key = await prompt.question("UNSUBSCRIBE_SIGNING_KEY (input visible; run privately): ");
} finally {
  prompt.close();
}
if (!key || key.length < 32) {
  console.error("Provide the same long signing secret configured on the subscription Worker.");
  process.exit(1);
}
const signature = createHmac("sha256", key).update(`${id}:${timestamp}`).digest("base64url");
const url = new URL("https://subscribe.nocturnepoetry.com/api/unsubscribe");
url.searchParams.set("token", `${id}.${signature}`);
console.log("\nTest link (keep private):\n" + url.toString());
