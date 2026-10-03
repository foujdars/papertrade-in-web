import type {
  Decision,
  ScreeningResult,
  ScreeningRunPayload,
} from "./fundamental-screener";

const DATABASE_NAME = "papertrade-fundamentals-v1";
const DATABASE_VERSION = 1;
const LATEST_RUN_KEY = "latest";

type RunRecord = {
  key: typeof LATEST_RUN_KEY;
  id: string;
  fileName: string;
  importedAt: string;
  sourceVersion?: string;
  dataAsOf?: string;
  missingColumns: string[];
  resultCount: number;
  fileSize: number;
};

type ResultRecord = {
  key: string;
  runId: string;
  stockId: string;
  ordinal: number;
  result: ScreeningResult;
};

type FileRecord = {
  runId: string;
  file: File;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}

function openDatabase(ownerId: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`${DATABASE_NAME}:${ownerId}`, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("runs", { keyPath: "key" });

      const results = database.createObjectStore("results", { keyPath: "key" });
      results.createIndex("runId", "runId");
      results.createIndex("runStock", ["runId", "stockId"]);

      database.createObjectStore("files", { keyPath: "runId" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open saved fundamental research"));
  });
}

export async function requestPersistentLocalStorage() {
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }
}

export async function saveLocalRun(ownerId: string, payload: ScreeningRunPayload, file: File) {
  const database = await openDatabase(ownerId);
  const runId = crypto.randomUUID();
  const transaction = database.transaction(
    ["runs", "results", "files"],
    "readwrite",
  );
  const runs = transaction.objectStore("runs");
  const results = transaction.objectStore("results");
  const files = transaction.objectStore("files");

  runs.clear();
  results.clear();
  files.clear();

  runs.put({
    key: LATEST_RUN_KEY,
    id: runId,
    fileName: payload.fileName,
    importedAt: payload.importedAt,
    sourceVersion: payload.sourceVersion,
    dataAsOf: payload.dataAsOf,
    missingColumns: payload.missingColumns,
    resultCount: payload.results.length,
    fileSize: file.size,
  } satisfies RunRecord);

  files.put({ runId, file } satisfies FileRecord);
  payload.results.forEach((result, ordinal) => {
    results.put({
      key: `${runId}:${ordinal}`,
      runId,
      stockId: result.id,
      ordinal,
      result,
    } satisfies ResultRecord);
  });

  await transactionDone(transaction);
  database.close();
  return { ...payload, id: runId };
}

export async function loadLatestLocalRun(ownerId: string): Promise<ScreeningRunPayload | null> {
  const database = await openDatabase(ownerId);
  const runTransaction = database.transaction("runs", "readonly");
  const run = await requestResult(
    runTransaction.objectStore("runs").get(LATEST_RUN_KEY),
  ) as RunRecord | undefined;
  await transactionDone(runTransaction);

  if (!run) {
    database.close();
    return null;
  }

  const resultsTransaction = database.transaction("results", "readonly");
  const records = await requestResult(
    resultsTransaction.objectStore("results").index("runId").getAll(run.id),
  ) as ResultRecord[];
  await transactionDone(resultsTransaction);
  database.close();

  return {
    id: run.id,
    fileName: run.fileName,
    importedAt: run.importedAt,
    sourceVersion: run.sourceVersion,
    dataAsOf: run.dataAsOf,
    missingColumns: run.missingColumns,
    results: records
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((record) => record.result),
  };
}

export async function updateLocalDecision(
  ownerId: string,
  runId: string,
  stockId: string,
  decision: Decision,
  notes: string,
) {
  const database = await openDatabase(ownerId);
  const readTransaction = database.transaction("results", "readonly");
  const record = await requestResult(
    readTransaction.objectStore("results").index("runStock").get([runId, stockId]),
  ) as ResultRecord | undefined;
  await transactionDone(readTransaction);

  if (!record) {
    database.close();
    throw new Error("The locally saved company could not be found");
  }

  const writeTransaction = database.transaction("results", "readwrite");
  writeTransaction.objectStore("results").put({
    ...record,
    result: { ...record.result, decision, notes },
  } satisfies ResultRecord);
  await transactionDone(writeTransaction);
  database.close();
}
