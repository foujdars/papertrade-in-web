import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/NativeViewportGuard.tsx', import.meta.url), 'utf8');
function mount(platform = 'android') {
  let effect, observer, theme = 'light', visibility = 'visible';
  const styles = [], events = new Map();
  const viewport = {content: 'original'};
  const document = {
    body: {}, get visibilityState() { return visibility; },
    querySelector: selector => selector === '.terminal-shell' ? {getAttribute: () => theme} : viewport,
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name),
  };
  let shown = 0, disconnected = false;
  const context = {
    exports: {}, document,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() { disconnected = true; } },
    require: name => name === 'react' ? {useEffect: callback => {effect = callback;}} : {
      Capacitor: {getPlatform: () => platform},
      SystemBarsStyle: {Dark: 'DARK', Light: 'LIGHT'},
      SystemBars: {setStyle: async ({style}) => {styles.push(style);}, show: async () => {shown++;}},
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, context);
  context.exports.NativeViewportGuard();
  const cleanup = effect();
  return {styles, events, viewport, cleanup, change: value => {theme = value; observer();}, resume: () => events.get('visibilitychange')(), get shown() {return shown;}, get disconnected() {return disconnected;}};
}

test('Android system icons follow app theme, stay visible and resync after resume', () => {
  const app = mount();
  assert.deepEqual(app.styles, ['LIGHT']);
  app.change('neon');
  assert.deepEqual(app.styles, ['LIGHT', 'DARK']);
  app.change('neon');
  assert.equal(app.styles.length, 2);
  app.resume();
  assert.deepEqual(app.styles, ['LIGHT', 'DARK', 'DARK']);
  app.change('light');
  assert.equal(app.styles.at(-1), 'LIGHT');
  assert.equal(app.shown, 4);
  app.cleanup();
  assert.equal(app.disconnected, true);
  assert.equal(app.events.size, 0);
  assert.equal(app.viewport.content, 'original');
});

test('ordinary browser does not change native status bars or viewport', () => {
  const app = mount('web');
  assert.deepEqual(app.styles, []);
  assert.equal(app.shown, 0);
  assert.equal(app.events.size, 0);
  assert.equal(app.viewport.content, 'original');
});
