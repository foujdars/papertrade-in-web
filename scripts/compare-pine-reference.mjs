import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readPineReference, comparePineReference } from '../lib/pine-reference.ts';
import { runAdvancedPineScript } from '../lib/pine-runtime.ts';

const help = `Compare native Pine output against exported chart CSV.
Usage: node --experimental-strip-types scripts/compare-pine-reference.mjs --script file.pine --reference chart.csv --timeframe 5 [--symbol NSE:RELIANCE] [--context context.json] [--inputs inputs.json] [--columns mapping.json] [--skip-bars 0] [--absolute-tolerance 1e-8] [--relative-tolerance 1e-8] [--report report.json]
CSV must include time, open, high, low, close, volume and uniquely named numeric plots.
Use UNIX timestamps or ISO timestamps with explicit timezone. Columns mapping is {"CSV title":"Pine plot title"}.
Use exactly the same inputs, symbol, timeframe, sessions, history and adjustments in both engines.
Imported references are user-supplied evidence, not independently certified TradingView exports.
Run only trusted local scripts with this developer CLI; the app editor uses an isolated browser worker.`;
try {
  const args = process.argv.slice(2), flags = {};
  const allowed = new Set(['script','reference','timeframe','symbol','context','inputs','columns','skip-bars','absolute-tolerance','relative-tolerance','report']);
  if (args.includes('--help')) { console.log(help); }
  else {
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i].replace(/^--/, '');
      if (!args[i].startsWith('--') || !allowed.has(flag) || args[i + 1] === undefined || Object.hasOwn(flags, flag)) throw new Error(`Invalid or duplicate option ${args[i]}.\n${help}`);
      flags[flag] = args[i + 1];
    }
    if (!flags.script || !flags.reference || !flags.timeframe) throw new Error(help);
    const [source, csv] = await Promise.all([readFile(flags.script, 'utf8'), readFile(flags.reference, 'utf8')]);
    const json = async key => flags[key] ? JSON.parse(await readFile(flags[key], 'utf8')) : {};
    const reference = readPineReference(csv), context = await json('context'), inputs = await json('inputs');
    const effectiveContext = { ...context, symbol: flags.symbol ?? context.symbol ?? 'REFERENCE', timeframe: flags.timeframe, now: context.now ?? Date.now() };
    const run = await runAdvancedPineScript(source, reference.candles, inputs, effectiveContext);
    if (run.error) throw new Error(`Pine execution failed: ${run.error}`);
    const report = {
      referenceKind: 'user-supplied CSV', runtime: run.runtime,
      sourceSha256: createHash('sha256').update(source).digest('hex'), csvSha256: createHash('sha256').update(csv).digest('hex'),
      inputsSha256: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),
      contextSha256: createHash('sha256').update(JSON.stringify(effectiveContext)).digest('hex'), executionNow: effectiveContext.now,
      symbol: flags.symbol ?? context.symbol ?? 'REFERENCE', timeframe: flags.timeframe,
      candles: reference.candles.length, firstTime: reference.candles[0].time, lastTime: reference.candles.at(-1).time,
      ...comparePineReference(reference, run.plots, {
        columns: flags.columns ? await json('columns') : undefined,
        skipBars: Number(flags['skip-bars'] ?? 0), absoluteTolerance: Number(flags['absolute-tolerance'] ?? 1e-8), relativeTolerance: Number(flags['relative-tolerance'] ?? 1e-8),
      }), warnings: run.warnings,
      scope: 'Loaded-history numeric plots only. Does not certify plot display/offset appearance, live ticks, cloud alerts or strategy fills.',
    };
    if (flags.report) await writeFile(flags.report, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
