const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const J = { clamp: (x, a = 0, b = 1) => x < a ? a : x > b ? b : x };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', '09b_autoimg.js'), 'utf8'), { J });
J.autoimgStatus = () => {};

const plan = {
  duration: 9, W: 1280, H: 720,
  lines: Array.from({ length: 9 }, (_, i) => ({ index: i, start: i, end: i + 1, visEnd: i + 1, text: `line ${i}` })),
  cuts: Array.from({ length: 9 }, (_, i) => ({ line: i, start: i, end: i + 1, layout: 'center' })),
  autoimg: {
    on: true, seed: 7, look: 'cut', names: ['a.png', 'b.png', 'c.png'],
    shots: { 4: { base: 4, start: 4.2, dur: 0.8, image: 2, x: 0.3, y: 0.5, s: 1 } },
    fills: [
      { start: 1, dur: 1, image: 0, locked: false },
      { start: 8, dur: 1, image: 1, locked: true },
    ],
  },
};

const before = J.autoimgShots(plan).filter(s => !s.fill);
assert.equal(before.length, 9);
assert.equal(before[4].start, 4.2);
const signatures = [1, 2, 3, 4, 5].map(groupSeed => {
  const variant = Object.assign({}, plan, { autoimg: Object.assign({}, plan.autoimg, { groupSeed, shots: {}, fills: [] }) });
  return J.autoimgShots(variant).map(s => s.base).join(',');
});
assert.ok(new Set(signatures).size > 1);
assert.equal(J.autoimgRegroup(plan), true);
assert.deepEqual(Array.from(plan.autoimg.names), ['a.png', 'b.png', 'c.png']);
assert.equal(plan.autoimg.look, 'cut');
assert.equal(plan.autoimg.fills.length, 1);
assert.equal(plan.autoimg.fills[0].locked, true);
assert.ok(plan.autoimg.shots.t4000);
const after = J.autoimgShots(plan).filter(s => !s.fill);
assert.ok(after.length < before.length);
assert.equal(after.find(s => s.base === 4).start, 4.2);
assert.equal(after.find(s => s.base === 4).image, 2);
assert.ok(after.every((s, i) => i === 0 || s.base > after[i - 1].base));

const firstSeed = plan.autoimg.seed;
const firstGroupSeed = plan.autoimg.groupSeed;
assert.equal(J.autoimgRegroup(plan), true);
assert.equal(plan.autoimg.history.length, 2);
assert.equal(J.autoimgPrevious(plan), true);
assert.equal(plan.autoimg.seed, firstSeed);
assert.equal(plan.autoimg.groupSeed, firstGroupSeed);
assert.equal(J.autoimgPrevious(plan), true);
assert.equal(plan.autoimg.seed, 7);
assert.equal(plan.autoimg.groupSeed, 0);
assert.equal(plan.autoimg.fills.length, 2);
assert.equal(J.autoimgShots(plan).filter(s => !s.fill).length, 9);
assert.equal(J.autoimgPrevious(plan), false);
console.log('autoimg regroup tests passed');
