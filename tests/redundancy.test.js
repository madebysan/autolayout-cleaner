// Run with: node --test tests/redundancy.test.js
// Loads code.js against a minimal fake `figma` global and checks which wrappers
// count as redundant. Every "false" case would change how the design looks if flattened.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const figma = {
    mixed: Symbol('mixed'),
    showUI() {},
    ui: { postMessage() {}, onmessage: null },
    currentPage: { selection: [], children: [] },
    getNodeByIdAsync: async () => null,
  };
  const ctx = vm.createContext({ figma, __html__: '', console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8'), ctx);
  return ctx;
}

const ctx = load();

let nextId = 1;
function node(type, props = {}, children = []) {
  const n = {
    id: String(nextId++), type, name: type + nextId, visible: true, opacity: 1, blendMode: 'PASS_THROUGH',
    fills: [], strokes: [], effects: [], cornerRadius: 0, clipsContent: false,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    layoutMode: 'NONE', itemSpacing: 0, layoutWrap: 'NO_WRAP', counterAxisSpacing: 0,
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN',
    layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', layoutPositioning: 'AUTO',
    width: 100, height: 40, reactions: [], exportSettings: [], children,
    ...props,
  };
  children.forEach((c) => { c.parent = n; });
  return n;
}

const row = (props = {}, kids = []) => node('FRAME', { layoutMode: 'HORIZONTAL', ...props }, kids);
const text = (props = {}) => node('TEXT', props);

function wrapperIn(parentProps, wrapperProps, kids) {
  const w = row(wrapperProps, kids);
  const p = row(parentProps, [w]);
  return { w, p };
}

test('plain hugging single-child wrapper is redundant', () => {
  const { w, p } = wrapperIn({}, {}, [text()]);
  assert.strictEqual(ctx.isRedundant(w, p), true);
});

test('hidden wrapper is kept (removing it would reveal children)', () => {
  const { w, p } = wrapperIn({}, { visible: false }, [text()]);
  assert.strictEqual(ctx.isRedundant(w, p), false);
});

test('absolutely positioned wrapper or child is kept', () => {
  let r = wrapperIn({}, { layoutPositioning: 'ABSOLUTE' }, [text()]);
  assert.strictEqual(ctx.isRedundant(r.w, r.p), false);
  r = wrapperIn({}, {}, [text({ layoutPositioning: 'ABSOLUTE' })]);
  assert.strictEqual(ctx.isRedundant(r.w, r.p), false);
});

test('prototype links and export settings keep the wrapper', () => {
  let r = wrapperIn({}, { reactions: [{}] }, [text()]);
  assert.strictEqual(ctx.isRedundant(r.w, r.p), false);
  r = wrapperIn({}, { exportSettings: [{}] }, [text()]);
  assert.strictEqual(ctx.isRedundant(r.w, r.p), false);
});

test('fixed-size single-child wrapper larger than its child is kept', () => {
  const { w, p } = wrapperIn({}, { layoutSizingHorizontal: 'FIXED', width: 200 }, [text({ width: 100 })]);
  assert.strictEqual(ctx.isRedundant(w, p), false);
});

test('fixed-size single-child wrapper matching its child is redundant', () => {
  const { w, p } = wrapperIn({}, { layoutSizingHorizontal: 'FIXED', width: 100 }, [text({ width: 100 })]);
  assert.strictEqual(ctx.isRedundant(w, p), true);
});

test('multi-child wrapper that fills the main axis is kept (siblings would shift)', () => {
  const { w, p } = wrapperIn({}, { layoutSizingHorizontal: 'FILL' }, [text(), text()]);
  assert.strictEqual(ctx.isRedundant(w, p), false);
});

test('multi-child hugging wrapper with matching layout is redundant', () => {
  const { w, p } = wrapperIn({ itemSpacing: 8 }, { itemSpacing: 8 }, [text(), text()]);
  assert.strictEqual(ctx.isRedundant(w, p), true);
});

test('multi-child wrapper with a fixed cross-axis size is kept', () => {
  const { w, p } = wrapperIn({}, { layoutSizingVertical: 'FIXED' }, [text(), text()]);
  assert.strictEqual(ctx.isRedundant(w, p), false);
});

test('wrapped layouts with different row gaps are kept', () => {
  const { w, p } = wrapperIn(
    { layoutWrap: 'WRAP', counterAxisSpacing: 8 },
    { layoutWrap: 'WRAP', counterAxisSpacing: 16 },
    [text(), text()]
  );
  assert.strictEqual(ctx.isRedundant(w, p), false);
});

test('instances are only followed into main components when opted in', async () => {
  const mainComp = node('COMPONENT', { layoutMode: 'HORIZONTAL', name: 'Button' }, []);
  const inner = row({}, [text()]);
  inner.parent = mainComp;
  mainComp.children = [inner];
  const instance = node('INSTANCE', { getMainComponentAsync: async () => mainComp });
  const selection = row({}, [instance]);

  const off = [];
  await ctx.scanTree(selection, off, {}, { includeComponents: false }, null);
  assert.strictEqual(off.length, 0);

  const on = [];
  await ctx.scanTree(selection, on, {}, { includeComponents: true }, null);
  assert.strictEqual(on.length, 1);
  assert.strictEqual(on[0].viaComponent, 'Button');
});
