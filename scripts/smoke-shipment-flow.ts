import { finalizePaidOrder } from "../supabase/functions/_shared/finalizeOrder.ts";
import {
  recoverStaleShipmentCreateLock,
  processShipmentWebhook,
  syncActiveShipments,
  SHIPMENT_LOCK_STALE_MINUTES,
  syncShipmentStatusForOrder,
} from "../supabase/functions/_shared/cdekShipment.ts";
import { expirePendingOrders } from "../supabase/functions/_shared/orderExpiration.ts";
import { rejectOrderPaymentForOrder } from "../supabase/functions/_shared/paymentReview.ts";
import { buildAdminAnalyticsSnapshot } from "../supabase/functions/_shared/adminAnalytics.ts";
import { readFile } from "node:fs/promises";

type OrderRow = Record<string, unknown>;
type PostRow = Record<string, unknown>;
type FetchCall = { url: string; method: string; body: unknown | null };

type ScenarioResult = {
  name: string;
  status: "PASS" | "FAIL" | "SIMULATED" | "NOT EXECUTED";
  executionMode: "mocked" | "real" | "injected" | "static-analysis-only";
  touched: string[];
  evidence: unknown;
  reason?: string;
};

class MockSupabase {
  order: OrderRow;
  post: PostRow;
  paymentSequence: Array<unknown>;
  updates: Array<Record<string, unknown>> = [];
  shipmentStatusHistory: Array<Record<string, unknown>> = [];
  orderEvents: Array<Record<string, unknown>> = [];
  rpcCalls = 0;

  constructor(params: { order: OrderRow; post: PostRow; paymentSequence: Array<unknown> }) {
    this.order = { ...params.order };
    this.post = { ...params.post };
    this.paymentSequence = [...params.paymentSequence];
  }

  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "tg_admin_confirm_paid_and_record_sale") {
      this.rpcCalls += 1;
      const next = this.paymentSequence.shift();
      if ((next as any)?.__error) {
        return { data: null, error: { message: (next as any).__error } };
      }
      return { data: next, error: null };
    }

    if (name === "tg_try_start_shipment_create") {
      const orderId = String(args?.p_order_id ?? "");
      if (String(this.order.id) !== orderId) {
        return { data: { status: "not_found" }, error: null };
      }

      if (this.order.cdek_uuid) {
        return { data: { status: "existing", order: { ...this.order } }, error: null };
      }

      if (this.order.shipment_create_in_progress) {
        return { data: { status: "in_progress", order: { ...this.order } }, error: null };
      }

      this.order.shipment_create_in_progress = true;
      this.order.shipment_create_started_at = new Date().toISOString();
      return { data: { status: "acquired", order: { ...this.order } }, error: null };
    }

    if (name === "tg_recover_stale_shipment_create") {
      const orderId = String(args?.p_order_id ?? "");
      if (String(this.order.id) !== orderId) {
        return { data: { status: "not_found" }, error: null };
      }

      if (this.order.cdek_uuid) {
        return { data: { status: "already_created", order: { ...this.order } }, error: null };
      }

      if (!this.order.shipment_create_in_progress) {
        return { data: { status: "not_locked", order: { ...this.order } }, error: null };
      }

      const startedAt = typeof this.order.shipment_create_started_at === "string"
        ? Date.parse(this.order.shipment_create_started_at)
        : NaN;
      const staleBefore = Date.now() - SHIPMENT_LOCK_STALE_MINUTES * 60_000;
      if (!Number.isFinite(startedAt) || startedAt > staleBefore) {
        return { data: { status: "not_stale", order: { ...this.order } }, error: null };
      }

      this.order.shipment_create_in_progress = false;
      this.order.shipment_create_started_at = null;
      return { data: { status: "recovered", order: { ...this.order } }, error: null };
    }

    return { data: null, error: { message: `Unexpected rpc ${name}` } };
  }

  from(table: string) {
    return new MockQueryBuilder(this, table);
  }
}

class MockQueryBuilder {
  supabase: MockSupabase;
  table: string;
  filters: Array<{ op: string; column: string; value: unknown }> = [];
  updatePayload: Record<string, unknown> | null = null;
  insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  constructor(supabase: MockSupabase, table: string) {
    this.supabase = supabase;
    this.table = table;
  }

  select(_columns: string) {
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.insertPayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ op: "in", column, value: values });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  async maybeSingle() {
    if (this.table === "tg_orders" && this.updatePayload) {
      if (!this.matches(this.supabase.order)) return { data: null, error: null };
      Object.assign(this.supabase.order, this.updatePayload);
      this.supabase.updates.push({ ...this.updatePayload });
      return { data: { ...this.supabase.order }, error: null };
    }

    if (this.table === "tg_orders") {
      if (!this.matches(this.supabase.order)) return { data: null, error: null };
      return { data: { ...this.supabase.order }, error: null };
    }
    if (this.table === "tg_posts") {
      if (this.updatePayload) {
        if (!this.matches(this.supabase.post)) return { data: null, error: null };
        Object.assign(this.supabase.post, this.updatePayload);
        this.supabase.updates.push({ ...this.updatePayload });
        return { data: { ...this.supabase.post }, error: null };
      }
      if (!this.matches(this.supabase.post)) return { data: null, error: null };
      return { data: { ...this.supabase.post }, error: null };
    }
    return { data: null, error: { message: `Unexpected table ${this.table}` } };
  }

  async then(resolve: (value: { error: null | { message: string } }) => unknown) {
    if (this.table === "tg_orders" && this.updatePayload) {
      if (!this.matches(this.supabase.order)) {
        return Promise.resolve(resolve({ error: null }));
      }
      Object.assign(this.supabase.order, this.updatePayload);
      this.supabase.updates.push({ ...this.updatePayload });
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_posts" && this.updatePayload) {
      if (!this.matches(this.supabase.post)) {
        return Promise.resolve(resolve({ error: null }));
      }
      Object.assign(this.supabase.post, this.updatePayload);
      this.supabase.updates.push({ ...this.updatePayload });
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_shipment_status_history" && this.insertPayload) {
      const rows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      for (const row of rows) {
        this.supabase.shipmentStatusHistory.push({
          id: `history-${this.supabase.shipmentStatusHistory.length + 1}`,
          created_at: new Date().toISOString(),
          ...row,
        });
      }
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_order_events" && this.insertPayload) {
      const rows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      for (const row of rows) {
        this.supabase.orderEvents.push({
          id: this.supabase.orderEvents.length + 1,
          created_at: new Date().toISOString(),
          ...row,
        });
      }
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_orders" && !this.updatePayload) {
      const rows = this.matches(this.supabase.order) ? [{ ...this.supabase.order }] : [];
      return Promise.resolve(resolve({ data: rows, error: null } as any));
    }

    return Promise.resolve(resolve({ error: { message: `Unsupported operation on ${this.table}` } }));
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "is") return row[filter.column] === filter.value;
      if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      if (filter.op === "lte") {
        const left = row[filter.column];
        if (typeof left === "string" && typeof filter.value === "string") {
          return left <= filter.value;
        }
        if (typeof left === "number" && typeof filter.value === "number") {
          return left <= filter.value;
        }
        return false;
      }
      return false;
    });
  }
}

class BatchMockSupabase {
  orders: OrderRow[];
  post: PostRow;
  updates: Array<Record<string, unknown>> = [];
  shipmentStatusHistory: Array<Record<string, unknown>> = [];

  constructor(params: { orders: OrderRow[]; post?: PostRow }) {
    this.orders = params.orders.map((row) => ({ ...row }));
    this.post = { ...(params.post ?? createBasePost()) };
  }

  async rpc(name: string, _args: Record<string, unknown>) {
    return { data: null, error: { message: `Unexpected rpc ${name}` } };
  }

  from(table: string) {
    return new BatchMockQueryBuilder(this, table);
  }
}

class BatchMockQueryBuilder {
  supabase: BatchMockSupabase;
  table: string;
  filters: Array<{ op: string; column: string; value: unknown }> = [];
  updatePayload: Record<string, unknown> | null = null;
  insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  orderBy: { column: string; ascending: boolean } | null = null;
  rowLimit: number | null = null;
  orFilter: string | null = null;

  constructor(supabase: BatchMockSupabase, table: string) {
    this.supabase = supabase;
    this.table = table;
  }

  select(_columns: string) {
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.insertPayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ op: `not:${operator}`, column, value });
    return this;
  }

  or(expression: string) {
    this.orFilter = expression;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle() {
    if (this.table === "tg_orders") {
      const rows = this.filteredOrders();
      return { data: rows.length ? { ...rows[0] } : null, error: null };
    }
    if (this.table === "tg_posts") {
      if (!this.matches(this.supabase.post)) return { data: null, error: null };
      return { data: { ...this.supabase.post }, error: null };
    }
    return { data: null, error: { message: `Unexpected table ${this.table}` } };
  }

  async then(resolve: (value: { data?: unknown; error: null | { message: string } }) => unknown) {
    if (this.table === "tg_orders" && this.updatePayload) {
      const rows = this.filteredOrders();
      for (const row of rows) {
        Object.assign(row, this.updatePayload);
        this.supabase.updates.push({ id: row.id, ...this.updatePayload });
      }
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_shipment_status_history" && this.insertPayload) {
      const rows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      for (const row of rows) {
        this.supabase.shipmentStatusHistory.push({
          id: `history-${this.supabase.shipmentStatusHistory.length + 1}`,
          created_at: new Date().toISOString(),
          ...row,
        });
      }
      return Promise.resolve(resolve({ error: null }));
    }

    if (this.table === "tg_orders" && !this.updatePayload) {
      const rows = this.filteredOrders().map((row) => ({ ...row }));
      return Promise.resolve(resolve({ data: rows, error: null }));
    }

    return Promise.resolve(resolve({ error: { message: `Unsupported operation on ${this.table}` } }));
  }

  private filteredOrders() {
    let rows = this.supabase.orders.filter((row) => this.matches(row));

    if (this.orFilter === "cdek_status.is.null,cdek_status.not.in.(DELIVERED,CANCELLED)") {
      rows = rows.filter((row) => row.cdek_status == null || !["DELIVERED", "CANCELLED"].includes(String(row.cdek_status)));
    }

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    if (this.rowLimit != null) {
      rows = rows.slice(0, this.rowLimit);
    }

    return rows;
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "is") return row[filter.column] === filter.value;
      if (filter.op === "not:is") return row[filter.column] !== filter.value;
      return false;
    });
  }
}

function createBaseOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    tg_user_id: 1,
    post_id: "post-1",
    status: "paid",
    updated_at: "2026-03-14T10:00:00.000Z",
    delivery_type: "pickup",
    price_rub: 15000,
    fio: "Ivan Ivanov",
    phone: "+79990000000",
    city: "Moscow",
    cdek_pvz_code: "ODN345",
    cdek_pvz_address: "Moscow, PVZ 1",
    packaging_type: "standard",
    packaging_preset: "A3",
    origin_profile: "ODN",
    receiver_city_code: "44",
    delivery_point: "ODN345",
    package_weight: 400,
    package_length: 15,
    package_width: 10,
    package_height: 4,
    cdek_uuid: null,
    cdek_track_number: null,
    cdek_status: null,
    cdek_tariff_code: null,
    shipment_create_in_progress: false,
    shipment_create_started_at: null,
    ...overrides,
  };
}

function createBasePost(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: "post-1",
    post_type: "warehouse",
    ...overrides,
  };
}

function createPaymentResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    existing: false,
    payment_already_confirmed: false,
    recorded_to_prodazhi: true,
    prodazhi_id: 101,
    previous_status: "payment_proof_submitted",
    current_status: "paid",
    post_id: "post-1",
    nalichie_id: 10,
    stock_deduction_status: "applied",
    previous_post_sale_status: "reserved",
    current_post_sale_status: "sold",
    previous_nalichie_status: "available",
    current_nalichie_status: "sold",
    ...overrides,
  };
}

function parseBody(body: RequestInit["body"]) {
  if (typeof body === "string" && body.trim()) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "UNKNOWN_ERROR");
  }
  return String(error);
}

async function runScenario(
  name: string,
  params: {
    order: OrderRow;
    post: PostRow;
    paymentSequence: Array<unknown>;
    fetchImpl: typeof fetch;
    verify: (ctx: { result: unknown; supabase: MockSupabase; fetchCalls: FetchCall[] }) => void;
  },
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order: params.order,
    post: params.post,
    paymentSequence: params.paymentSequence,
  });
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: parseBody(init?.body),
    });
    return params.fetchImpl(input, init);
  }) as typeof fetch;

  try {
    const result = await finalizePaidOrder(supabase as any, "http://mock-proxy", String(params.order.id));
    params.verify({ result, supabase, fetchCalls });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { result, orderAfter: supabase.order, fetchCalls, rpcCalls: supabase.rpcCalls },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { error: getErrorMessage(error), fetchCalls, rpcCalls: supabase.rpcCalls },
      reason: getErrorMessage(error),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runExpectedFinalizeErrorScenario(
  name: string,
  params: {
    order: OrderRow;
    post: PostRow;
    paymentSequence: Array<unknown>;
    expectedError: string;
  },
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order: params.order,
    post: params.post,
    paymentSequence: params.paymentSequence,
  });
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: parseBody(init?.body),
    });
    throw new Error(`Unexpected fetch ${String(input)}`);
  }) as typeof fetch;

  try {
    await finalizePaidOrder(supabase as any, "http://mock-proxy", String(params.order.id));
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
      ],
      evidence: { error: "Expected finalizePaidOrder to throw", fetchCalls, rpcCalls: supabase.rpcCalls },
      reason: "Expected finalizePaidOrder to throw",
    };
  } catch (error) {
    const message = getErrorMessage(error);
    if (message !== params.expectedError) {
      return {
        name,
        status: "FAIL",
        executionMode: "mocked",
        touched: [
          "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
        ],
        evidence: { error: message, expectedError: params.expectedError, fetchCalls, rpcCalls: supabase.rpcCalls },
        reason: `Unexpected error ${message}`,
      };
    }

    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
      ],
      evidence: { error: message, fetchCalls, rpcCalls: supabase.rpcCalls, orderAfter: supabase.order },
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runRecoveryScenario(
  name: string,
  order: OrderRow,
  expectedStatus: "recovered" | "not_stale" | "already_created" | "not_locked",
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order,
    post: createBasePost(),
    paymentSequence: [],
  });

  try {
    const result = await recoverStaleShipmentCreateLock(supabase as any, String(order.id));
    if (result.status !== expectedStatus) {
      throw new Error(`Expected recovery status ${expectedStatus}, got ${result.status}`);
    }

    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: {
        result,
        orderAfter: supabase.order,
      },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: {
        error: error instanceof Error ? error.message : String(error),
        orderAfter: supabase.order,
      },
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runStatusSyncScenario(
  name: string,
  params: {
    order: OrderRow;
    post?: PostRow;
    fetchImpl: typeof fetch;
    verify: (ctx: { result: unknown; supabase: MockSupabase; fetchCalls: FetchCall[] }) => void;
  },
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order: params.order,
    post: params.post ?? createBasePost(),
    paymentSequence: [],
  });
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: parseBody(init?.body),
    });
    return params.fetchImpl(input, init);
  }) as typeof fetch;

  try {
    const result = await syncShipmentStatusForOrder(supabase as any, "http://mock-proxy", String(params.order.id));
    params.verify({ result, supabase, fetchCalls });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { result, orderAfter: supabase.order, fetchCalls },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { error: error instanceof Error ? error.message : String(error), fetchCalls, orderAfter: supabase.order },
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runWebhookScenario(
  name: string,
  params: {
    order: OrderRow;
    payload: unknown;
    verify: (ctx: { result: unknown; supabase: MockSupabase }) => void;
  },
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order: params.order,
    post: createBasePost(),
    paymentSequence: [],
  });

  try {
    const result = await processShipmentWebhook(supabase as any, params.payload);
    params.verify({ result, supabase });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { result, orderAfter: supabase.order, updates: supabase.updates },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { error: error instanceof Error ? error.message : String(error), orderAfter: supabase.order },
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runBatchSyncScenario(
  name: string,
  params: {
    orders: OrderRow[];
    limit: number;
    fetchImpl: typeof fetch;
    verify: (ctx: { result: unknown; supabase: BatchMockSupabase; fetchCalls: FetchCall[] }) => void;
  },
): Promise<ScenarioResult> {
  const supabase = new BatchMockSupabase({
    orders: params.orders,
  });
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: parseBody(init?.body),
    });
    return params.fetchImpl(input, init);
  }) as typeof fetch;

  try {
    const result = await syncActiveShipments(supabase as any, "http://mock-proxy", params.limit);
    params.verify({ result, supabase, fetchCalls });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: {
        result,
        ordersAfter: supabase.orders,
        fetchCalls,
        history: supabase.shipmentStatusHistory,
      },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: {
        error: error instanceof Error ? error.message : String(error),
        ordersAfter: supabase.orders,
        fetchCalls,
        history: supabase.shipmentStatusHistory,
      },
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runExpirationScenario(
  name: string,
  order: OrderRow,
  post: PostRow,
  verify: (ctx: { result: unknown; supabase: MockSupabase }) => void,
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order,
    post,
    paymentSequence: [],
  });

  try {
    const result = await expirePendingOrders(supabase as any, "2026-03-14T13:07:01.000Z");
    verify({ result, supabase });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/orderExpiration.ts",
      ],
      evidence: { result, orderAfter: supabase.order, postAfter: supabase.post, orderEvents: supabase.orderEvents },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/orderExpiration.ts",
      ],
      evidence: { error: error instanceof Error ? error.message : String(error), orderAfter: supabase.order, postAfter: supabase.post },
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runRejectScenario(
  name: string,
  order: OrderRow,
  post: PostRow,
  reason: string,
  verify: (ctx: { result: unknown; supabase: MockSupabase }) => void,
): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order,
    post,
    paymentSequence: [],
  });

  try {
    const result = await rejectOrderPaymentForOrder(supabase as any, String(order.id), reason, "2026-03-14T13:08:00.000Z");
    verify({ result, supabase });
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/paymentReview.ts",
      ],
      evidence: { result, orderAfter: supabase.order, postAfter: supabase.post, orderEvents: supabase.orderEvents },
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/paymentReview.ts",
      ],
      evidence: { error: error instanceof Error ? error.message : String(error), orderAfter: supabase.order, postAfter: supabase.post },
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAdminAnalyticsScenario(
  name: string,
  params: {
    orders: OrderRow[];
    sales: Array<Record<string, unknown>>;
    range: "today" | "7d" | "30d" | "all";
    verify: (result: ReturnType<typeof buildAdminAnalyticsSnapshot>) => void;
  },
): Promise<ScenarioResult> {
  try {
    const result = buildAdminAnalyticsSnapshot(
      params.orders as any,
      params.sales as any,
      params.range,
      "2026-03-14T15:00:00.000Z",
    );
    params.verify(result);
    return {
      name,
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/adminAnalytics.ts",
      ],
      evidence: result,
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/adminAnalytics.ts",
      ],
      evidence: error instanceof Error ? error.message : String(error),
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runStaticContractScenario(
  name: string,
  params: {
    files: string[];
    checks: Array<{ file: string; includes: string; reason: string }>;
  },
): Promise<ScenarioResult> {
  try {
    const sources = new Map<string, string>();
    for (const file of params.files) {
      sources.set(file, await readFile(new URL(file, import.meta.url), "utf-8"));
    }

    const evidence: Array<{ file: string; includes: string; ok: boolean; reason: string }> = [];
    for (const check of params.checks) {
      const source = sources.get(check.file);
      if (!source) {
        throw new Error(`Missing source for check: ${check.file}`);
      }
      const ok = source.includes(check.includes);
      evidence.push({ file: check.file, includes: check.includes, ok, reason: check.reason });
      if (!ok) {
        throw new Error(`Static contract failed: ${check.reason}`);
      }
    }

    return {
      name,
      status: "PASS",
      executionMode: "static-analysis-only",
      touched: params.files.map((file) => file.replace("../", "tg-miniapp-shop/")),
      evidence,
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      executionMode: "static-analysis-only",
      touched: params.files.map((file) => file.replace("../", "tg-miniapp-shop/")),
      evidence: error instanceof Error ? error.message : String(error),
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runParallelLockScenario(): Promise<ScenarioResult> {
  const supabase = new MockSupabase({
    order: createBaseOrder(),
    post: createBasePost({ post_type: "warehouse" }),
    paymentSequence: [
      createPaymentResult({ prodazhi_id: 201 }),
      createPaymentResult({
        existing: true,
        payment_already_confirmed: true,
        prodazhi_id: 201,
        previous_status: "paid",
        current_status: "paid",
        stock_deduction_status: "existing",
        previous_post_sale_status: "sold",
        current_post_sale_status: "sold",
        previous_nalichie_status: "sold",
        current_nalichie_status: "sold",
      }),
    ],
  });
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  let releaseCreate: (() => void) | null = null;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, method: String(init?.method ?? "GET"), body: parseBody(init?.body) });

    if (url.includes("/api/shipping/create")) {
      await createGate;
      return jsonResponse({
        ok: true,
        originProfile: "ODN",
        shipmentPoint: "ODN8",
        selectedTariffCode: 234,
        uuid: "ship-parallel",
        cdekNumber: "TRACK-PARALLEL",
        trackingStatus: "CREATED",
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const firstPromise = finalizePaidOrder(supabase as any, "http://mock-proxy", "order-1");
    await Promise.resolve();
    const secondPromise = finalizePaidOrder(supabase as any, "http://mock-proxy", "order-1");
    await Promise.resolve();
    releaseCreate?.();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const createCalls = fetchCalls.filter((call) => call.url.includes("/api/shipping/create"));

    if ((first as any).ok !== true) throw new Error("First result must succeed");
    if ((second as any).ok !== true) throw new Error("Second result must succeed");
    if ((first as any).shipment.status !== "created") throw new Error("First call must create shipment");
    if ((second as any).shipment.status !== "in_progress") throw new Error("Second call must see in_progress lock");
    if (createCalls.length !== 1) throw new Error("Parallel calls must hit upstream create exactly once");
    if (supabase.order.cdek_uuid !== "ship-parallel") throw new Error("Created shipment must persist on order");
    if (supabase.order.shipment_create_in_progress !== false) throw new Error("Lock must be released after success");

    return {
      name: "Scenario F: parallel create uses lock and upstream only once",
      status: "PASS",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: {
        first,
        second,
        orderAfter: supabase.order,
        fetchCalls,
        rpcCalls: supabase.rpcCalls,
      },
    };
  } catch (error) {
    return {
      name: "Scenario F: parallel create uses lock and upstream only once",
      status: "FAIL",
      executionMode: "mocked",
      touched: [
        "tg-miniapp-shop/supabase/functions/_shared/finalizeOrder.ts",
        "tg-miniapp-shop/supabase/functions/_shared/cdekShipment.ts",
      ],
      evidence: { error: error instanceof Error ? error.message : String(error), fetchCalls, rpcCalls: supabase.rpcCalls },
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const results: ScenarioResult[] = [];

  results.push(
    await runStaticContractScenario("Scenario S1: checkout snapshot contract is strict and complete", {
      files: [
        "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
      ],
      checks: [
        {
          file: "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
          includes: "CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED",
          reason: "Order create must fail when post origin profile is missing",
        },
        {
          file: "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
          includes: "CHECKOUT_POST_PACKAGING_PRESET_REQUIRED",
          reason: "Order create must fail when post packaging preset is missing",
        },
        {
          file: "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
          includes: "CHECKOUT_DELIVERY_POINT_REQUIRED",
          reason: "Order create must require pickup delivery point",
        },
        {
          file: "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
          includes: "receiver_city_code",
          reason: "Order create must persist receiver_city_code into tg_orders snapshot",
        },
        {
          file: "../supabase/migrations/20260317_090000_tg_checkout_snapshot_hardening.sql",
          includes: "delivery_point",
          reason: "Order create must persist delivery_point into tg_orders snapshot",
        },
      ],
    }),
  );

  results.push(
    await runScenario("Scenario A: happy path pickup", {
      order: createBaseOrder(),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({ prodazhi_id: 101 })],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/create")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            shipmentPoint: "ODN8",
            selectedTariffCode: 234,
            uuid: "ship-123",
            cdekNumber: null,
            trackingStatus: null,
          });
        }
        if (url.includes("/api/shipping/status/ship-123")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            uuid: "ship-123",
            status: {
              entity: {
                cdek_number: "TRACK-123",
                status: "CREATED",
              },
            },
          });
        }
        return jsonResponse({ ok: false }, 500);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (!typed.payment?.ok) throw new Error("Expected payment.ok=true");
        if (typed.payment.stock_deduction_status !== "applied") throw new Error("Expected stock deduction to be applied once");
        if (!typed.shipment?.ok) throw new Error("Expected shipment.ok=true");
        if (!["created", "existing"].includes(typed.shipment.status)) throw new Error("Unexpected shipment.status");
        if (supabase.order.cdek_uuid !== "ship-123") throw new Error("Shipment uuid was not persisted");
        if (supabase.order.cdek_track_number !== "TRACK-123") throw new Error("Track number was not persisted");
        if (supabase.order.shipment_create_in_progress !== false) throw new Error("Lock must be released after success");
        if (fetchCalls.length !== 2) throw new Error("Expected create + status lookup");
      },
    }),
  );
  results.push(
    await runScenario("Scenario A2: create follow-up lookup reconciles final order status", {
      order: createBaseOrder(),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({ prodazhi_id: 101 })],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/create")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            shipmentPoint: "ODN8",
            selectedTariffCode: 234,
            uuid: "ship-follow-up",
            cdekNumber: null,
            trackingStatus: null,
          });
        }
        if (url.includes("/api/shipping/status/ship-follow-up")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            uuid: "ship-follow-up",
            status: {
              entity: {
                cdek_number: "TRACK-FOLLOW-UP",
                statuses: [{ code: "READY_FOR_PICKUP", name: "Ready for pickup" }],
              },
            },
          });
        }
        return jsonResponse({ ok: false }, 500);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.shipment.status !== "created") throw new Error("Expected created shipment");
        if (supabase.order.cdek_status !== "READY_FOR_PICKUP") throw new Error("Follow-up status must be persisted");
        if (supabase.order.status !== "ready_for_pickup") {
          throw new Error("Create follow-up lookup must reconcile order status");
        }
        if (fetchCalls.length !== 2) throw new Error("Expected create + follow-up status lookup");
      },
    }),
  );

  results.push(
    await runScenario("Scenario B: repeat confirm same order", {
      order: createBaseOrder({
        cdek_uuid: "ship-123",
        cdek_track_number: "TRACK-123",
        cdek_status: "CREATED",
        cdek_tariff_code: 234,
        origin_profile: "ODN",
      }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({
        existing: true,
        payment_already_confirmed: true,
        prodazhi_id: 101,
        previous_status: "paid",
        current_status: "paid",
        stock_deduction_status: "existing",
        previous_post_sale_status: "sold",
        current_post_sale_status: "sold",
        previous_nalichie_status: "sold",
        current_nalichie_status: "sold",
      })],
      fetchImpl: async () => {
        throw new Error("Fetch should not be called for existing shipment");
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.payment.payment_already_confirmed !== true) throw new Error("Expected idempotent payment confirmation");
        if (typed.payment.stock_deduction_status !== "existing") throw new Error("Expected stock deduction to stay idempotent");
        if (typed.shipment.status !== "existing") throw new Error("Expected shipment.status=existing");
        if (fetchCalls.length !== 0) throw new Error("Expected no upstream calls");
      },
    }),
  );

  results.push(
    await runScenario("Scenario B2: completed order stays completed on repeated finalize", {
      order: createBaseOrder({
        status: "completed",
        cdek_uuid: "ship-complete",
        cdek_track_number: "TRACK-COMPLETE",
        cdek_status: "DELIVERED",
        cdek_tariff_code: 234,
        origin_profile: "ODN",
      }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({
        existing: true,
        payment_already_confirmed: true,
        prodazhi_id: 111,
        previous_status: "completed",
        current_status: "completed",
        stock_deduction_status: "existing",
        previous_post_sale_status: "sold",
        current_post_sale_status: "sold",
        previous_nalichie_status: "sold",
        current_nalichie_status: "sold",
      })],
      fetchImpl: async () => {
        throw new Error("Fetch should not be called for completed order with existing shipment");
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.payment.current_status !== "completed") throw new Error("Completed order must stay completed");
        if (typed.payment.stock_deduction_status !== "existing") throw new Error("Completed order must not deduct stock twice");
        if (typed.shipment.status !== "existing") throw new Error("Expected shipment.status=existing");
        if (fetchCalls.length !== 0) throw new Error("Expected no upstream calls");
      },
    }),
  );

  results.push(
    await runExpectedFinalizeErrorScenario("Scenario B3: invalid payment confirm transition is rejected", {
      order: createBaseOrder({ status: "cancelled" }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [{ __error: "ORDER_STATUS_NOT_CONFIRMABLE:cancelled" }],
      expectedError: "ORDER_STATUS_NOT_CONFIRMABLE:cancelled",
    }),
  );

  results.push(
    await runExpectedFinalizeErrorScenario("Scenario B4: stock conflict blocks confirmation safely", {
      order: createBaseOrder({ status: "payment_proof_submitted" }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [{ __error: "STOCK_CONFLICT:POST_ALREADY_SOLD" }],
      expectedError: "STOCK_CONFLICT:POST_ALREADY_SOLD",
    }),
  );

  results.push(
    await runExpirationScenario(
      "Scenario B5: reserved order expires after payment window without proof",
      createBaseOrder({
        status: "awaiting_payment_proof",
        reserved_until: "2026-03-14T13:07:00.000Z",
      }),
      createBasePost({
        sale_status: "reserved",
        reserved_until: "2026-03-14T13:07:00.000Z",
        reserved_order_id: "order-1",
      }),
      ({ result, supabase }) => {
        const typed = result as any;
        if (typed.expiredCount !== 1) throw new Error("Expected one expired order");
        if (supabase.order.status !== "expired") throw new Error("Order must become expired");
        if (supabase.order.reserved_until !== null) throw new Error("Order reservation must be cleared");
        if (supabase.post.sale_status !== "available") throw new Error("Post must return to available");
        if (supabase.post.reserved_order_id !== null) throw new Error("Post reservation link must be cleared");
      },
    ),
  );

  results.push(
    await runExpirationScenario(
      "Scenario B6: payment proof submitted order does not expire",
      createBaseOrder({
        status: "payment_proof_submitted",
        reserved_until: null,
      }),
      createBasePost({
        sale_status: "reserved",
        reserved_until: null,
        reserved_order_id: "order-1",
      }),
      ({ result, supabase }) => {
        const typed = result as any;
        if (typed.expiredCount !== 0) throw new Error("Submitted proof order must not expire");
        if (supabase.order.status !== "payment_proof_submitted") throw new Error("Order status must stay under admin review");
        if (supabase.post.sale_status !== "reserved") throw new Error("Reserved post must stay blocked for review");
      },
    ),
  );

  results.push(
    await runExpectedFinalizeErrorScenario("Scenario B7: expired order cannot be confirmed", {
      order: createBaseOrder({ status: "expired", reserved_until: null }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [{ __error: "ORDER_STATUS_NOT_CONFIRMABLE:expired" }],
      expectedError: "ORDER_STATUS_NOT_CONFIRMABLE:expired",
    }),
  );

  results.push(
    await runRejectScenario(
      "Scenario B8: admin reject returns item to catalog",
      createBaseOrder({
        status: "payment_proof_submitted",
        reserved_until: null,
      }),
      createBasePost({
        sale_status: "reserved",
        reserved_until: null,
        reserved_order_id: "order-1",
      }),
      "proof_invalid",
      ({ result, supabase }) => {
        const typed = result as any;
        if (typed.status !== "rejected") throw new Error("Expected rejected result");
        if (supabase.order.status !== "rejected") throw new Error("Order must become rejected");
        if (supabase.post.sale_status !== "available") throw new Error("Rejected order must release item");
        if (supabase.post.reserved_order_id !== null) throw new Error("Rejected order must clear reservation link");
      },
    ),
  );

  results.push(
    await runAdminAnalyticsScenario("Scenario B9: analytics summary counts only valid sales", {
      range: "7d",
      orders: [
        createBaseOrder({
          id: "paid-1",
          status: "paid",
          created_at: "2026-03-13T10:00:00.000Z",
          payment_confirmed_at: "2026-03-13T11:00:00.000Z",
        }),
        createBaseOrder({
          id: "ready-1",
          status: "ready_for_pickup",
          created_at: "2026-03-13T10:30:00.000Z",
          payment_confirmed_at: "2026-03-13T12:00:00.000Z",
          cdek_uuid: "ship-ready",
          cdek_status: "READY_FOR_PICKUP",
        }),
        createBaseOrder({
          id: "completed-1",
          status: "completed",
          created_at: "2026-03-12T10:30:00.000Z",
          updated_at: "2026-03-14T09:00:00.000Z",
          payment_confirmed_at: "2026-03-12T12:00:00.000Z",
          cdek_uuid: "ship-completed",
          cdek_status: "DELIVERED",
        }),
        createBaseOrder({
          id: "review-1",
          status: "payment_proof_submitted",
          created_at: "2026-03-14T08:00:00.000Z",
          payment_confirmed_at: null,
          cdek_uuid: null,
        }),
        createBaseOrder({
          id: "expired-1",
          status: "expired",
          created_at: "2026-03-14T07:00:00.000Z",
          payment_confirmed_at: null,
        }),
        createBaseOrder({
          id: "rejected-1",
          status: "rejected",
          created_at: "2026-03-14T06:00:00.000Z",
          payment_confirmed_at: null,
        }),
      ],
      sales: [
        { order_id: "paid-1", sale_price_rub: 15000, created_at: "2026-03-13T11:00:00.000Z" },
        { order_id: "ready-1", sale_price_rub: 17000, created_at: "2026-03-13T12:00:00.000Z" },
        { order_id: "completed-1", sale_price_rub: 19000, created_at: "2026-03-12T12:00:00.000Z" },
      ],
      verify: (result) => {
        if (result.summary.total_revenue_rub !== 51000) throw new Error("Revenue must sum confirmed sales only");
        if (result.summary.paid_orders_count !== 3) throw new Error("Paid count must include paid, ready and completed");
        if (result.summary.completed_orders_count !== 1) throw new Error("Completed count mismatch");
        if (result.summary.ready_for_pickup_count !== 1) throw new Error("Ready-for-pickup count mismatch");
        if (result.summary.awaiting_payment_review_count !== 1) throw new Error("Awaiting review count mismatch");
        if (result.summary.rejected_or_expired_count !== 2) throw new Error("Rejected/expired count mismatch");
        if (result.lists.latest_paid_orders.length !== 3) throw new Error("Latest paid orders list mismatch");
      },
    }),
  );

  results.push(
    await runAdminAnalyticsScenario("Scenario B10: analytics period filter changes revenue and counts", {
      range: "today",
      orders: [
        createBaseOrder({
          id: "today-review",
          status: "payment_proof_submitted",
          created_at: "2026-03-14T08:00:00.000Z",
          payment_confirmed_at: null,
        }),
        createBaseOrder({
          id: "old-paid",
          status: "paid",
          created_at: "2026-03-10T08:00:00.000Z",
          payment_confirmed_at: "2026-03-10T09:00:00.000Z",
        }),
      ],
      sales: [
        { order_id: "old-paid", sale_price_rub: 22000, created_at: "2026-03-10T09:00:00.000Z" },
      ],
      verify: (result) => {
        if (result.summary.total_revenue_rub !== 0) throw new Error("Today revenue must exclude old sales");
        if (result.summary.paid_orders_count !== 0) throw new Error("Today paid count must exclude old confirmations");
        if (result.summary.awaiting_payment_review_count !== 1) throw new Error("Today review count must include current review order");
      },
    }),
  );

  results.push(
    await runScenario("Scenario C: non-pickup order", {
      order: createBaseOrder({ delivery_type: "door" }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({ prodazhi_id: 102 })],
      fetchImpl: async () => {
        throw new Error("Fetch should not be called for non-pickup order");
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.shipment.status !== "skipped") throw new Error("Expected shipment.status=skipped");
        if (typed.shipment.reason !== "delivery_type_not_supported") throw new Error("Expected skipped reason");
        if (fetchCalls.length !== 0) throw new Error("Expected no upstream calls");
      },
    }),
  );

  results.push(
    await runScenario("Scenario D: shipment failure after payment confirm", {
      order: createBaseOrder(),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({ prodazhi_id: 103 })],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/create")) {
          return jsonResponse({ ok: false, error: "UPSTREAM_BROKE" }, 502);
        }
        return jsonResponse({ ok: false }, 500);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== false) throw new Error("Expected partial failure result");
        if (!typed.payment?.ok) throw new Error("Expected payment to stay successful");
        if (typed.payment.current_status !== "paid") throw new Error("Payment status should still be paid after partial failure");
        if (typed.payment.stock_deduction_status !== "applied") throw new Error("Stock deduction should already be applied before shipment failure");
        if (typed.shipment?.status !== "failed") throw new Error("Expected shipment.status=failed");
        if (supabase.order.cdek_uuid != null) throw new Error("Shipment uuid should not be persisted");
        if (supabase.order.shipment_create_in_progress !== false) throw new Error("Lock must be released after failure");
        if (supabase.order.shipment_create_started_at != null) throw new Error("Lock timestamp must be cleared after failure");
        if (fetchCalls.length !== 1) throw new Error("Expected single failed create call");
      },
    }),
  );

  results.push(
    await runScenario("Scenario E: canonical order fields drive shipment create", {
      order: createBaseOrder({
        packaging_preset: "A2",
        origin_profile: "YAN",
        receiver_city_code: "137",
        delivery_point: "SPB777",
        package_weight: 900,
        package_length: 31,
        package_width: 22,
        package_height: 11,
        cdek_tariff_code: 136,
      }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({
        prodazhi_id: 104,
        previous_status: "payment_confirmed",
        current_status: "paid",
      })],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/create")) {
          return jsonResponse({
            ok: true,
            originProfile: "YAN",
            shipmentPoint: "YANN10",
            selectedTariffCode: 136,
            uuid: "ship-yan-136",
            cdekNumber: "TRACK-136",
            trackingStatus: "CREATED",
          });
        }
        return jsonResponse({ ok: false }, 500);
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        const createCall = fetchCalls.find((call) => call.url.includes("/api/shipping/create"));
        if (!createCall) throw new Error("Expected create call");
        const body = createCall.body as any;
        if (body.originProfile !== "YAN") throw new Error("Stored origin_profile must win over derived post_type");
        if (body.packagingPreset !== "A2") throw new Error("Stored packaging_preset must be used");
        if (body.tariffCode !== 136) throw new Error("Stored cdek_tariff_code must be forwarded");
        if (body.deliveryPoint !== "SPB777") throw new Error("Stored delivery_point must be used");
        if (body.receiverCityCode !== "137") throw new Error("Stored receiver_city_code must be used");
        if (body.package.weight !== 900 || body.package.length !== 31 || body.package.width !== 22 || body.package.height !== 11) {
          throw new Error("Stored package dimensions must be used");
        }
      },
    }),
  );

  results.push(await runParallelLockScenario());
  results.push(
    await runRecoveryScenario(
      "Scenario G: stale lock can be recovered",
      createBaseOrder({
        shipment_create_in_progress: true,
        shipment_create_started_at: new Date(Date.now() - (SHIPMENT_LOCK_STALE_MINUTES + 1) * 60_000).toISOString(),
      }),
      "recovered",
    ),
  );
  results.push(
    await runRecoveryScenario(
      "Scenario H: non-stale lock cannot be recovered",
      createBaseOrder({
        shipment_create_in_progress: true,
        shipment_create_started_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      }),
      "not_stale",
    ),
  );
  results.push(
    await runRecoveryScenario(
      "Scenario I: order with cdek_uuid cannot be recovered",
      createBaseOrder({
        shipment_create_in_progress: true,
        shipment_create_started_at: new Date(Date.now() - (SHIPMENT_LOCK_STALE_MINUTES + 1) * 60_000).toISOString(),
        cdek_uuid: "ship-existing",
      }),
      "already_created",
    ),
  );
  results.push(
    await runScenario("Scenario J: ordinary create flow does not auto-reclaim stale lock", {
      order: createBaseOrder({
        shipment_create_in_progress: true,
        shipment_create_started_at: new Date(Date.now() - (SHIPMENT_LOCK_STALE_MINUTES + 5) * 60_000).toISOString(),
      }),
      post: createBasePost({ post_type: "warehouse" }),
      paymentSequence: [createPaymentResult({
        existing: true,
        payment_already_confirmed: true,
        prodazhi_id: 301,
        previous_status: "paid",
        current_status: "paid",
      })],
      fetchImpl: async () => {
        throw new Error("Fetch should not be called while stale lock still exists");
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.shipment.status !== "in_progress") throw new Error("Expected shipment.status=in_progress");
        if (fetchCalls.length !== 0) throw new Error("Ordinary flow must not auto-reclaim stale lock");
      },
    }),
  );
  results.push(
    await runStatusSyncScenario("Scenario K: shipment status sync updates tg_orders", {
      order: createBaseOrder({
        cdek_uuid: "ship-sync",
        cdek_status: "CREATED",
        cdek_track_number: null,
        origin_profile: "ODN",
      }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/status/ship-sync")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            uuid: "ship-sync",
            status: {
              entity: {
                cdek_number: "TRACK-SYNC",
                statuses: [{ code: "READY_FOR_PICKUP", name: "Ready for pickup" }],
              },
            },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.status !== "updated") throw new Error("Expected updated status");
        if (supabase.order.cdek_status !== "READY_FOR_PICKUP") throw new Error("Status must be saved to tg_orders");
        if (supabase.order.cdek_track_number !== "TRACK-SYNC") throw new Error("Track number must be saved to tg_orders");
        if (supabase.order.status !== "ready_for_pickup") throw new Error("READY_FOR_PICKUP must reconcile order status");
        if (supabase.shipmentStatusHistory.length !== 1) throw new Error("Manual sync must add one history entry");
        if (supabase.shipmentStatusHistory[0].event_source !== "manual_sync") throw new Error("History source must be manual_sync");
        if (fetchCalls.length !== 1) throw new Error("Expected one upstream status call");
      },
    }),
  );
  results.push(
    await runStatusSyncScenario("Scenario K2: manual sync with DELIVERED completes paid order", {
      order: createBaseOrder({
        cdek_uuid: "ship-manual-delivered",
        cdek_status: "IN_TRANSIT",
        cdek_track_number: "TRACK-MANUAL",
        origin_profile: "ODN",
      }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/status/ship-manual-delivered")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            uuid: "ship-manual-delivered",
            status: {
              entity: {
                cdek_number: "TRACK-MANUAL",
                statuses: [{ code: "DELIVERED", name: "Delivered" }],
              },
            },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.cdek_status !== "DELIVERED") throw new Error("Expected DELIVERED sync result");
        if (supabase.order.status !== "completed") throw new Error("Manual DELIVERED sync must complete order");
      },
    }),
  );
  results.push(
    await runStatusSyncScenario("Scenario K3: manual sync with IN_TRANSIT does not finalize order", {
      order: createBaseOrder({
        cdek_uuid: "ship-manual-transit",
        cdek_status: "ACCEPTED",
        cdek_track_number: "TRACK-TRANSIT",
        origin_profile: "ODN",
      }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/status/ship-manual-transit")) {
          return jsonResponse({
            ok: true,
            originProfile: "ODN",
            uuid: "ship-manual-transit",
            status: {
              entity: {
                cdek_number: "TRACK-TRANSIT",
                statuses: [{ code: "IN_TRANSIT", name: "In transit" }],
              },
            },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.cdek_status !== "IN_TRANSIT") throw new Error("Expected IN_TRANSIT sync result");
        if (supabase.order.status !== "paid") throw new Error("IN_TRANSIT must not finalize paid order");
      },
    }),
  );
  results.push(
    await runStatusSyncScenario("Scenario L: shipment status sync skips orders without shipment", {
      order: createBaseOrder({
        cdek_uuid: null,
      }),
      fetchImpl: async () => {
        throw new Error("Fetch should not be called without shipment uuid");
      },
      verify: ({ result, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.status !== "skipped") throw new Error("Expected skipped result");
        if (typed.reason !== "shipment_not_created") throw new Error("Expected shipment_not_created reason");
        if (fetchCalls.length !== 0) throw new Error("No upstream call expected");
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario M: webhook updates existing shipment status", {
      order: createBaseOrder({
        cdek_uuid: "ship-webhook",
        cdek_status: "CREATED",
        cdek_track_number: null,
      }),
      payload: {
        entity: {
          uuid: "ship-webhook",
          cdek_number: "TRACK-WEBHOOK",
          statuses: [{ code: "IN_TRANSIT", name: "In transit" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.status !== "updated") throw new Error("Expected updated result");
        if (supabase.order.cdek_status !== "IN_TRANSIT") throw new Error("Webhook status must be saved");
        if (supabase.order.cdek_track_number !== "TRACK-WEBHOOK") throw new Error("Webhook track must be saved");
        if (supabase.shipmentStatusHistory.length !== 1) throw new Error("Webhook must add one history entry");
        if (supabase.shipmentStatusHistory[0].event_source !== "webhook") throw new Error("History source must be webhook");
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario M2: webhook with READY_FOR_PICKUP reconciles order status", {
      order: createBaseOrder({
        cdek_uuid: "ship-webhook-ready",
        cdek_status: "ACCEPTED",
        cdek_track_number: "TRACK-READY",
      }),
      payload: {
        entity: {
          uuid: "ship-webhook-ready",
          cdek_number: "TRACK-READY",
          statuses: [{ code: "READY_FOR_PICKUP", name: "Ready for pickup" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (supabase.order.status !== "ready_for_pickup") {
          throw new Error("Webhook READY_FOR_PICKUP must reconcile order status");
        }
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario N: webhook with unknown shipment is handled safely", {
      order: createBaseOrder({
        cdek_uuid: "ship-known",
      }),
      payload: {
        entity: {
          uuid: "ship-unknown",
          cdek_number: "TRACK-UNKNOWN",
          statuses: [{ code: "ACCEPTED", name: "Accepted" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.status !== "ignored") throw new Error("Expected ignored result");
        if (typed.reason !== "shipment_not_matched") throw new Error("Expected shipment_not_matched reason");
        if (supabase.order.cdek_uuid !== "ship-known") throw new Error("Known order must remain untouched");
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario O: duplicate webhook is idempotent", {
      order: createBaseOrder({
        status: "ready_for_pickup",
        cdek_uuid: "ship-dup",
        cdek_status: "READY_FOR_PICKUP",
        cdek_track_number: "TRACK-DUP",
      }),
      payload: {
        entity: {
          uuid: "ship-dup",
          cdek_number: "TRACK-DUP",
          statuses: [{ code: "READY_FOR_PICKUP", name: "Ready for pickup" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.status !== "unchanged") throw new Error("Expected unchanged result");
        if (supabase.updates.length !== 0) throw new Error("Duplicate webhook must not write duplicate update");
        if (supabase.shipmentStatusHistory.length !== 0) throw new Error("Duplicate webhook must not create history");
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario P: webhook normalization matches existing status sync logic", {
      order: createBaseOrder({
        cdek_uuid: "ship-normalized",
        cdek_status: "CREATED",
        cdek_track_number: null,
      }),
      payload: {
        entity: {
          uuid: "ship-normalized",
          cdek_number: "TRACK-NORM",
          statuses: [{ code: "DELIVERED", name: "Delivered" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.cdek_status !== "DELIVERED") throw new Error("Expected normalized status from statuses[]");
        if (supabase.order.cdek_status !== "DELIVERED") throw new Error("Normalized status must match sync logic");
        if (supabase.order.status !== "completed") throw new Error("DELIVERED must reconcile order status");
      },
    }),
  );
  results.push(
    await runWebhookScenario("Scenario S: unpaid order is not completed by shipment status alone", {
      order: createBaseOrder({
        status: "awaiting_payment_proof",
        cdek_uuid: "ship-unpaid",
        cdek_status: "CREATED",
      }),
      payload: {
        entity: {
          uuid: "ship-unpaid",
          cdek_number: "TRACK-UNPAID",
          statuses: [{ code: "DELIVERED", name: "Delivered" }],
        },
      },
      verify: ({ result, supabase }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (supabase.order.cdek_status !== "DELIVERED") throw new Error("Shipment status must still be updated");
        if (supabase.order.status !== "awaiting_payment_proof") {
          throw new Error("Unpaid order must not be auto-completed");
        }
      },
    }),
  );
  results.push(
    await runBatchSyncScenario("Scenario Q: scheduled sync processes active shipments only", {
      limit: 3,
      orders: [
        createBaseOrder({
          id: "order-final",
          cdek_uuid: "ship-final",
          cdek_status: "DELIVERED",
          updated_at: "2026-03-10T10:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-no-shipment",
          cdek_uuid: null,
          cdek_status: null,
          updated_at: "2026-03-10T11:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-updated",
          cdek_uuid: "ship-updated",
          cdek_status: "CREATED",
          cdek_track_number: null,
          updated_at: "2026-03-10T12:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-unchanged",
          cdek_uuid: "ship-unchanged",
          cdek_status: "IN_TRANSIT",
          cdek_track_number: "TRACK-UNCHANGED",
          updated_at: "2026-03-10T13:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-failed",
          cdek_uuid: "ship-failed",
          cdek_status: "ACCEPTED",
          cdek_track_number: null,
          updated_at: "2026-03-10T14:00:00.000Z",
          origin_profile: "ODN",
        }),
      ],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/status/ship-updated")) {
          return jsonResponse({
            ok: true,
            status: {
              entity: {
                cdek_number: "TRACK-UPDATED",
                statuses: [{ code: "READY_FOR_PICKUP" }],
              },
            },
          });
        }
        if (url.includes("/api/shipping/status/ship-unchanged")) {
          return jsonResponse({
            ok: true,
            status: {
              entity: {
                cdek_number: "TRACK-UNCHANGED",
                statuses: [{ code: "IN_TRANSIT" }],
              },
            },
          });
        }
        if (url.includes("/api/shipping/status/ship-failed")) {
          return jsonResponse({ ok: false, error: "UPSTREAM_FAIL" }, 502);
        }
        throw new Error(`Unexpected fetch ${url}`);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.processed !== 3) throw new Error("Expected 3 active shipments in batch");
        if (typed.updated !== 1) throw new Error("Expected updated=1");
        if (typed.unchanged !== 1) throw new Error("Expected unchanged=1");
        if (typed.failed !== 1) throw new Error("Expected failed=1");
        if (typed.skipped !== 0) throw new Error("Expected skipped=0");
        if (fetchCalls.length !== 3) throw new Error("Expected three upstream sync calls");
        if (supabase.shipmentStatusHistory.length !== 1) throw new Error("Expected one history entry for changed shipment");
        if (supabase.shipmentStatusHistory[0].event_source !== "scheduled_sync") {
          throw new Error("Expected scheduled_sync history source");
        }
        const finalOrder = supabase.orders.find((row) => row.id === "order-final");
        if (finalOrder?.cdek_status !== "DELIVERED") throw new Error("Final shipment must not be touched");
        const updatedOrder = supabase.orders.find((row) => row.id === "order-updated");
        if (updatedOrder?.cdek_status !== "READY_FOR_PICKUP") throw new Error("Changed shipment must be updated");
        if (updatedOrder?.status !== "ready_for_pickup") throw new Error("Scheduled sync must reconcile order status");
      },
    }),
  );
  results.push(
    await runBatchSyncScenario("Scenario Q2: scheduled sync does not downgrade completed orders", {
      limit: 1,
      orders: [
        createBaseOrder({
          id: "order-completed-keep",
          status: "completed",
          cdek_uuid: "ship-completed-keep",
          cdek_status: "DELIVERED",
          cdek_track_number: "TRACK-COMPLETE",
          updated_at: "2026-03-10T10:00:00.000Z",
          origin_profile: "ODN",
        }),
      ],
      fetchImpl: async () => {
        throw new Error("Final shipments must be skipped before fetch");
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.ok !== true) throw new Error("Expected ok=true");
        if (typed.processed !== 0) throw new Error("Final shipment must be excluded from batch selection");
        if (supabase.orders[0]?.status !== "completed") throw new Error("Completed order must not be downgraded");
        if (fetchCalls.length !== 0) throw new Error("Final shipment must not trigger upstream sync");
      },
    }),
  );
  results.push(
    await runBatchSyncScenario("Scenario R: scheduled sync respects batch limit", {
      limit: 2,
      orders: [
        createBaseOrder({
          id: "order-a",
          cdek_uuid: "ship-a",
          cdek_status: "CREATED",
          updated_at: "2026-03-10T10:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-b",
          cdek_uuid: "ship-b",
          cdek_status: "CREATED",
          updated_at: "2026-03-10T11:00:00.000Z",
          origin_profile: "ODN",
        }),
        createBaseOrder({
          id: "order-c",
          cdek_uuid: "ship-c",
          cdek_status: "CREATED",
          updated_at: "2026-03-10T12:00:00.000Z",
          origin_profile: "ODN",
        }),
      ],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/shipping/status/ship-a")) {
          return jsonResponse({
            ok: true,
            status: { entity: { cdek_number: "TRACK-A", statuses: [{ code: "ACCEPTED" }] } },
          });
        }
        if (url.includes("/api/shipping/status/ship-b")) {
          return jsonResponse({
            ok: true,
            status: { entity: { cdek_number: "TRACK-B", statuses: [{ code: "ACCEPTED" }] } },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      },
      verify: ({ result, supabase, fetchCalls }) => {
        const typed = result as any;
        if (typed.processed !== 2) throw new Error("Expected processed=2");
        if (fetchCalls.length !== 2) throw new Error("Expected exactly two upstream calls");
        const untouched = supabase.orders.find((row) => row.id === "order-c");
        if (untouched?.cdek_status !== "CREATED") throw new Error("Orders beyond batch limit must remain untouched");
      },
    }),
  );

  const summary = {
    canRunFully: false,
    mode: "partial-mocked",
    blockers: [
      "No local Supabase stack or seeded test DB was available in this workspace.",
      "Deno CLI is not installed, so Edge Functions cannot be executed locally end-to-end.",
      "Using live Supabase/CDEK credentials for destructive shipment creation was not safe for automated smoke execution.",
    ],
    scenarios: results,
  };

  console.log(JSON.stringify(summary, null, 2));

  const failed = results.some((scenario) => scenario.status === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        canRunFully: false,
        mode: "partial-mocked",
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

