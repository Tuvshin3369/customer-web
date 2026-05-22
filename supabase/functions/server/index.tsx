import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check
app.get("/make-server-f6232fa4/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Branches endpoint ────────────────────────────────────────────────────────
// Only fetches location data from `branches` — pricing is in `stores`.
// Required columns: id, address_lat, address_lng
app.get("/make-server-f6232fa4/branches", async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("branches")
      .select("id, address_lat, address_lng");

    if (error) {
      console.log("branches fetch error:", error);
      return c.json(
        { error: `branches хүснэгтэс уншиж чадсангүй: ${error.message}` },
        500,
      );
    }

    return c.json({ data });
  } catch (err: any) {
    console.log("Unexpected error in /branches:", err);
    return c.json({ error: `Серверийн алдаа: ${err.message}` }, 500);
  }
});

// ─── Store config endpoint ────────────────────────────────────────────────────
// Fetches store-level pricing for a specific store by id.
// Required columns: base_price_per_km, min_delivery_fee, free_delivery_threshold, has_delivery
// Query param: ?id=<store_id>
app.get("/make-server-f6232fa4/store", async (c) => {
  try {
    const storeId = c.req.query("id");
    if (!storeId) {
      return c.json({ error: "store id query param шаардлагатай (?id=<store_id>)" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("stores")
      .select("base_price_per_km, min_delivery_fee, free_delivery_threshold, has_delivery")
      .eq("id", storeId)
      .single();

    if (error) {
      console.log("store fetch error:", error);
      return c.json(
        { error: `stores хүснэгтэс уншиж чадсангүй (id=${storeId}): ${error.message}` },
        500,
      );
    }

    return c.json({ data });
  } catch (err: any) {
    console.log("Unexpected error in /store:", err);
    return c.json({ error: `Серверийн алдаа: ${err.message}` }, 500);
  }
});

Deno.serve(app.fetch);