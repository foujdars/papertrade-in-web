import { evaluateScreenerCsv } from "./fundamental-screener";
self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  try {
    const file = event.data.file;
    const payload = evaluateScreenerCsv(await file.text(), file.name);
    self.postMessage({ payload });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not read the CSV file." });
  }
};
