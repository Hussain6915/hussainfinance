import { kv } from "@vercel/kv";

const KEY = "hussain_finance_state_v2";

export default async function handler(req, res) {
  try {
    // CORS (safe for your own front-end; you can lock this down later)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method === "GET") {
      const data = (await kv.get(KEY)) || null;
      return res.status(200).json(data || {});
    }

    if (req.method === "POST") {
      const body = req.body || {};

      // IMPORTANT: don't store big base64 files in KV
      // We'll sync docs via Vercel Blob in Phase 2
      if (body.docs) body.docs = [];

      await kv.set(KEY, body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
}