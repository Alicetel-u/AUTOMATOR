const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const J = { clamp: (x, a = 0, b = 1) => x < a ? a : x > b ? b : x };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', '09b_autoimg.js'), 'utf8'), { J });

function plan() {
  return {
    duration: 10, W: 1280, H: 720,
    lines: [
      { index: 0, start: 0, end: 5, visEnd: 5, text: 'first' },
      { index: 1, start: 5, end: 10, visEnd: 10, text: 'second' },
    ],
    cuts: [
      { line: 0, start: 0, end: 5, layout: 'center' },
      { line: 1, start: 5, end: 10, layout: 'center' },
    ],
    autoimg: { on: true, seed: 1, look: 'cut', names: ['one.png', 'two.png', 'three.png'], shots: {} },
  };
}

const p = plan();
const original = J.autoimgShots(p);
assert.equal(original.length, 2);
p.autoimg.shots[0] = { base: 0, start: 0, dur: 3, image: original[0].image, x: 0.5, y: 0.5, s: 1 };
assert.equal(J.autoimgFillGaps(p), 1);
assert.equal(p.autoimg.fills[0].start, 3);
assert.equal(p.autoimg.fills[0].dur, 2);
assert.equal(p.autoimg.fills[0].locked, false);
assert.equal(new Set(original.map(s => s.image)).has(p.autoimg.fills[0].image), false);
assert.equal(J.autoimgShots(p).filter(s => s.fill).length, 1);

assert.equal(J.autoimgFillGaps(p), 1);
assert.equal(p.autoimg.fills.length, 1);
p.autoimg.fills[0].dur = 1;
p.autoimg.fills[0].locked = true;
assert.equal(J.autoimgFillGaps(p), 1);
assert.equal(p.autoimg.fills[0].start, 3);
assert.equal(p.autoimg.fills[0].dur, 1);
assert.equal(p.autoimg.fills[0].locked, true);
assert.equal(p.autoimg.fills[1].start, 4);
assert.equal(p.autoimg.fills[1].dur, 1);

const short = plan();
short.autoimg.shots[0] = { base: 0, start: 0, dur: 4.5, image: 0 };
assert.equal(J.autoimgFillGaps(short), 0);
assert.equal(short.autoimg.fills.length, 0);

J.autoimgStatus = () => {};
J.autoimgReshuffle(p);
assert.equal(p.autoimg.fills, undefined);
console.log('autoimg gap fill tests passed');
