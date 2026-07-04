#!/usr/bin/env node
// DashFlo mock buyer server. Three endpoints with configurable behavior so
// routing works end to end with zero external dependencies:
//   POST /accept  always accepts, responds {status:"accepted", price}
//   POST /reject  always rejects with a reason
//   POST /bid     ping-post: ping gets a bid, post gets an acceptance
// Query overrides: ?price=120  ?latency=300  ?reason=duplicate  ?fail_rate=0.2
import http from "node:http";

const PORT = Number(process.env.MOCKBUYER_PORT || 4010);

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const raw = await readBody(req);
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    body = Object.fromEntries(new URLSearchParams(raw));
  }

  const price = Number(url.searchParams.get("price") || process.env.MOCKBUYER_PRICE || 95);
  const baseLatency = Number(url.searchParams.get("latency") || 120);
  const jitter = Math.floor(Math.random() * 180);
  await sleep(baseLatency + jitter);

  const failRate = Number(url.searchParams.get("fail_rate") || 0);
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") {
    return send(200, { ok: true, service: "dashflo-mockbuyer", endpoints: ["/accept", "/reject", "/bid"] });
  }

  if (Math.random() < failRate) {
    return send(500, { status: "error", message: "simulated upstream failure" });
  }

  console.log(`[mockbuyer] ${url.pathname} <- ${raw.slice(0, 160)}`);

  if (url.pathname === "/accept") {
    return send(200, {
      status: "accepted",
      price,
      buyer_ref: `MB-${Date.now().toString(36).toUpperCase()}`,
      received: body,
    });
  }

  if (url.pathname === "/reject") {
    const reason = url.searchParams.get("reason") || "outside coverage area";
    return send(200, { status: "rejected", reason });
  }

  if (url.pathname === "/bid") {
    // Ping payloads are partial (no phone), posts carry full contact data.
    const isPost = Boolean(body.phone || body.full || body.contact_phone);
    if (isPost) {
      return send(200, { status: "accepted", price, buyer_ref: `MB-${Date.now().toString(36).toUpperCase()}` });
    }
    const spread = Number(url.searchParams.get("spread") || 30);
    const bid = price - spread / 2 + Math.random() * spread;
    return send(200, { status: "accepted", price: Math.round(bid * 100) / 100 });
  }

  return send(404, { status: "error", message: "unknown endpoint" });
});

server.listen(PORT, () => {
  console.log(`[mockbuyer] listening on http://localhost:${PORT} (accept, reject, bid)`);
});
