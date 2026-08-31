import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePager, DEFAULT_LESS_OPTIONS } from "../src/core/pager.ts";

test("never pages when stdout isn't a real terminal, regardless of length", () => {
  assert.deepEqual(decidePager(500, false, 40, undefined), { page: false });
  assert.deepEqual(decidePager(500, false, undefined, undefined), { page: false });
});

test("never pages content that already fits the terminal", () => {
  assert.deepEqual(decidePager(10, true, 40, undefined), { page: false });
  assert.deepEqual(decidePager(40, true, 40, undefined), { page: false });
});

test("never pages when the terminal height is unknown", () => {
  assert.deepEqual(decidePager(500, true, undefined, undefined), { page: false });
  assert.deepEqual(decidePager(500, true, 0, undefined), { page: false });
});

test("pages content taller than the terminal, defaulting to less", () => {
  assert.deepEqual(decidePager(100, true, 40, undefined), { page: true, command: "less" });
});

test("honours $PAGER over the less default", () => {
  assert.deepEqual(decidePager(100, true, 40, "bat"), { page: true, command: "bat" });
  assert.deepEqual(decidePager(100, true, 40, "less -S"), { page: true, command: "less -S" });
});

test("an empty $PAGER falls back to less rather than trying to spawn an empty command", () => {
  assert.deepEqual(decidePager(100, true, 40, ""), { page: true, command: "less" });
});

// Regression guard: X ("--no-init") skips less's alternate-screen switch, so
// it never clears between redraws — verified in real use as duplicated
// content on every scroll. Must never come back, even by copying another
// tool's LESS convention (git deliberately sets X, for a reason that doesn't
// apply here).
test("the default LESS options never include X (would break clean redraws while scrolling)", () => {
  assert.ok(!DEFAULT_LESS_OPTIONS.includes("X"), `DEFAULT_LESS_OPTIONS is "${DEFAULT_LESS_OPTIONS}" — must not contain X`);
});
