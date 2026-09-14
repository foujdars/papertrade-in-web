import test from "node:test";
import assert from "node:assert/strict";
import { mergeJournalCopies } from "../lib/cloud-journal.ts";
import { JOURNAL_STORAGE_KEY, CLOUD_CHANGE_EVENT } from "../lib/cloud-journal.ts";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("journal sync preserves offline notes, cloud-only notes and the newest review", () => {
  const local = { a: { review: "Edited offline", updatedAt: 200 }, b: { review: "Old copy", updatedAt: 50 }, c: { review: "Only on device", updatedAt: 60 } };
  const cloud = { a: { review: "Old cloud copy", updatedAt: 100 }, b: { review: "New cloud review", updatedAt: 150 }, d: { review: "Another device", updatedAt: 80 } };
  const merged = JSON.parse(mergeJournalCopies(JSON.stringify(local), JSON.stringify(cloud)));
  assert.deepEqual(merged, { a: local.a, b: cloud.b, c: local.c, d: cloud.d });
  assert.deepEqual(JSON.parse(mergeJournalCopies(null, JSON.stringify(merged))), merged);
  assert.deepEqual(JSON.parse(mergeJournalCopies(JSON.stringify(local), null)), local);
  assert.deepEqual(JSON.parse(mergeJournalCopies("bad json", JSON.stringify(cloud))), cloud);
});

test("account sync uploads an edited journal, restores it on a second device and retries failed saves", async () => {
  const code = await readFile(new URL("../components/AuthProvider.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("auth.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects = [];
  const walk = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") effects.push(node.getText(ast));
    ts.forEachChild(node, walk);
  };
  walk(ast);
  const helpers = ast.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && ["readCloudTradingState", "restoreCloudTradingState"].includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === "CLOUD_STORAGE_KEYS"))
  ).map(node => node.getText(ast)).join("\n");
  const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let remote = { "papertrade-orders": "[]" }, fail = false;
  const client = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: structuredClone(remote) }, error: null }) }) }),
    upsert: async row => { assert.equal(row.user_id, "user-a"); if (fail) return { error: new Error("offline") }; remote = structuredClone(row.state); return { error: null }; },
  }) };
  const device = () => {
    const values = new Map(), events = new Map(), timers = [];
    const scope = { configured: true, session: { user: { id: "user-a" } }, cloudReady: true,
      getSupabaseBrowserClient: () => client, JOURNAL_STORAGE_KEY, CLOUD_CHANGE_EVENT, mergeJournalCopies,
      lastUploadedState: { current: "" }, useEffect: fn => fn(), setSyncStatus: status => { scope.status = status; },
      setCloudReady() {}, setAuthError() {},
      window: { localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) },
        setInterval: fn => { scope.poll = fn; return 1; }, clearInterval() {},
        setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {},
      }, document: { addEventListener() {}, removeEventListener() {} },
    };
    Object.assign(scope, new Function("scope", `with(scope){${compile(helpers)};return {readCloudTradingState,restoreCloudTradingState};}`)(scope));
    scope.run = text => new Function("scope", `with(scope){${compile(text)}}`)(scope);
    scope.values = values; scope.events = events; scope.timers = timers;
    return scope;
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const restore = effects.find(text => text.includes(".maybeSingle()"));
  const save = effects.find(text => text.includes("const save = async"));
  const first = device();
  first.values.set(JOURNAL_STORAGE_KEY, JSON.stringify({ old: { review: "Existing device note", updatedAt: 1 } }));
  first.run(restore); await settle();
  assert.equal(JSON.parse(remote[JOURNAL_STORAGE_KEY]).old.review, "Existing device note");
  first.run(save);
  const edit = JSON.stringify({ trade: { review: "Wait for confirmation", updatedAt: 2 } });
  first.values.set(JOURNAL_STORAGE_KEY, edit);
  first.events.get(CLOUD_CHANGE_EVENT)();
  assert.equal(first.status, "saving");
  first.timers.at(-1)(); await settle();
  assert.equal(remote[JOURNAL_STORAGE_KEY], edit);
  assert.equal(first.status, "synced");
  const second = device(); second.run(restore); await settle();
  assert.equal(second.values.get(JOURNAL_STORAGE_KEY), edit);
  fail = true;
  const offlineEdit = JSON.stringify({ trade: { review: "An offline edit", updatedAt: 3 } });
  first.values.set(JOURNAL_STORAGE_KEY, offlineEdit);
  first.poll(); await settle();
  assert.equal(first.status, "error");
  assert.equal(first.values.get(JOURNAL_STORAGE_KEY), offlineEdit);
  fail = false; first.poll(); await settle();
  assert.equal(remote[JOURNAL_STORAGE_KEY], offlineEdit);
  assert.equal(first.status, "synced");
});
