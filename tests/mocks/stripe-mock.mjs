// Minimal stand-in for the Stripe API used only by local E2E tests.
// Checkout redirects to /pay on this server; "paying" there fires signed webhooks at the worker.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const PORT = Number(process.env.STRIPE_MOCK_PORT ?? 12111);
const WORKER = process.env.WORKER_ORIGIN ?? "http://localhost:8787";
const sessions = new Map();
// The worker creates its own Price and webhook endpoint (src/worker/stripe-setup.ts); the mock keeps them here.
const prices = new Map();
const endpoints = new Map();
let deletedEndpoints = 0;

function sign(payload) {
  const t = Math.floor(Date.now() / 1000);
  const endpoint = [...endpoints.values()].at(-1);
  const secret = endpoint?.secret ?? "whsec_unconfigured";
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function sendEvent(type, object) {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } });
  const res = await fetch(`${WORKER}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
    body: payload,
  });
  return res.status;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(new URLSearchParams(data)));
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const rand = () => Math.random().toString(36).slice(2);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/v1/") && !req.headers.authorization?.startsWith("Bearer sk_test_")) {
    json(res, 401, { error: { message: "invalid key" } });
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/prices") {
    const keys = url.searchParams.getAll("lookup_keys[]");
    json(res, 200, { data: [...prices.values()].filter((p) => keys.includes(p.lookup_key)) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/prices") {
    const body = Object.fromEntries(await readBody(req));
    if (body.currency !== "jpy" || !Number(body.unit_amount) || body["recurring[interval]"] !== "month" || !body.lookup_key) {
      json(res, 400, { error: { message: "invalid price" } });
      return;
    }
    const price = { id: `price_${rand()}`, lookup_key: body.lookup_key, unit_amount: Number(body.unit_amount) };
    prices.set(price.id, price);
    json(res, 200, price);
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/webhook_endpoints") {
    json(res, 200, { data: [...endpoints.values()].map(({ id, url }) => ({ id, url })) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/webhook_endpoints") {
    const body = await readBody(req);
    const ep = { id: `we_${rand()}`, url: body.get("url"), secret: `whsec_${rand()}`, events: [...body.entries()].filter(([k]) => k.startsWith("enabled_events")).map(([, v]) => v) };
    endpoints.set(ep.id, ep);
    json(res, 200, ep);
    return;
  }
  const ep = url.pathname.match(/^\/v1\/webhook_endpoints\/(we_\w+)$/);
  if (req.method === "DELETE" && ep) {
    endpoints.delete(ep[1]);
    deletedEndpoints++;
    json(res, 200, { id: ep[1], deleted: true });
    return;
  }
  // Test-only view of what the worker set up.
  if (req.method === "GET" && url.pathname === "/state") {
    json(res, 200, { prices: [...prices.values()], endpoints: [...endpoints.values()].map(({ url, events }) => ({ url, events })), deletedEndpoints });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    if (!req.headers.authorization?.startsWith("Bearer sk_test_")) {
      res.writeHead(401).end("{}");
      return;
    }
    const body = await readBody(req);
    if (!prices.has(body.get("line_items[0][price]"))) {
      json(res, 400, { error: { message: "No such price" } });
      return;
    }
    const id = `cs_test_${Math.random().toString(36).slice(2)}`;
    sessions.set(id, Object.fromEntries(body));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id, url: `http://localhost:${PORT}/pay/${id}` }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ url: `http://localhost:${PORT}/portal` }));
    return;
  }
  const pay = url.pathname.match(/^\/pay\/(cs_test_\w+)$/);
  if (req.method === "GET" && pay) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Mock Checkout</title><link rel="icon" href="data:,"><form method="post"><p>Mock Checkout</p><button id="pay">支払う</button></form>`);
    return;
  }
  if (req.method === "POST" && pay) {
    const s = sessions.get(pay[1]);
    if (!s) {
      res.writeHead(404).end();
      return;
    }
    const customer = `cus_${Math.random().toString(36).slice(2)}`;
    await sendEvent("checkout.session.completed", { id: pay[1], client_reference_id: s.client_reference_id, customer });
    await sendEvent("customer.subscription.created", {
      id: `sub_${customer}`,
      customer,
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      metadata: { user_id: s.client_reference_id },
    });
    res.writeHead(303, { location: s.success_url }).end();
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`stripe mock on ${PORT}`));
