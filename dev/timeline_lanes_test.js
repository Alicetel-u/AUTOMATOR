const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'editor.js'), 'utf8');
const start = source.indexOf('function lanesOf(list) {');
const end = source.indexOf('\nfunction posStyle(', start);
assert.ok(start >= 0 && end > start);
const lanesOf = vm.runInNewContext(source.slice(start, end) + '\nlanesOf');

const shots = [
  { index: 0, start: 0, end: 4 },
  { index: 1, start: 3, end: 6 },
  { index: 2, start: 4, end: 7 },
  { index: 3, start: 7, end: 9 },
];
const layout = lanesOf(shots.map(s => Object.assign({}, s, { dur: s.end - s.start })));
assert.equal(layout.n, 2);
assert.deepEqual(Array.from(layout.items, it => it.lane), [0, 1, 0, 0]);
assert.equal(lanesOf([{ start: 0, dur: 4 }, { start: 0.5, dur: 4 }, { start: 1, dur: 4 }]).n, 3);
assert.equal(lanesOf([{ start: 0, dur: 4 }, { start: 4, dur: 2 }]).n, 1);
console.log('timeline lane tests passed');
