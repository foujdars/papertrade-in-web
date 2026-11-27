import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("an open shared-wallet client advances paper orders and retries a version conflict without double filling", async t => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const saved = new Map(), effects = [], writes = [];
  let record = { user_id: owner, version: 1, account: { orders: ["order"], positions: [] }, last_checked_at: 0 };
  const state = {
    effects,
    async request(_owner, body) {
      if (!body) return { record };
      writes.push(body);
      if (writes.length === 1) {
        record = { ...record, version: 2, account: { orders: [], positions: ["filled by another tab"] } };
        throw Object.assign(new Error("version conflict"), { status: 409 });
      }
      record = { ...record, version: record.version + 1, account: body.account };
      return { record };
    },
  };
  for (const [name, value] of Object.entries({
    __sharedWalletTest: state,
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    navigator: { locks: { request: (_key, task) => task() } },
    window: { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }

  const stubs = {
    react: `const {effects}=globalThis.__sharedWalletTest;
      export const useEffect=callback=>effects.push(callback);
      export const useCallback=callback=>callback;
      export const useMemo=callback=>callback();
      export const useRef=current=>({current});
      export const useState=initial=>[initial,()=>{}];`,
    "@/lib/global-order-engine": `export const readGlobalAccount=text=>text?JSON.parse(text):{orders:[],positions:[]};
      export const advanceGlobalAccount=account=>account;`,
    "@/lib/global-option-orders": "export const advanceOptions = account => account;",
    "@/lib/paper-bot-client": `export const signedInBotOwner=()=>true;
      export class BotCloudError extends Error { static [Symbol.hasInstance](error) { return error.status===409; } }
      export const requestBotCloud=(...args)=>globalThis.__sharedWalletTest.request(...args);`,
  };
  const output = await build({
    entryPoints: ["components/useGlobalTrading.ts"], bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "wallet-test", setup(api) {
      api.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "stub" } : null);
      api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path] }));
    } }],
  });
  const { useGlobalTrading } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const wallet = useGlobalTrading(owner, null);
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  const advance = account => account.orders.length ? { ...account, orders: [], positions: ["filled by this tab"] } : account;
  assert.equal(await wallet.transact(advance, true), false);
  assert.equal(writes.length, 1);
  assert.deepEqual(record.account.positions, ["filled by another tab"]);
  assert.equal(await wallet.transact(account => ({ ...account, optionOrders: [] }), true), true);
  assert.equal(writes[1].version, 2);
});
