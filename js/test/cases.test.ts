// Общие примеры из testdata/cases.json — те же проходит Go-пакет.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, detect, fact, type Kind } from "../src/index.ts";

interface Vectors {
  cases: { kind: Kind; input: string; bik?: string; valid: boolean; code?: string; fact?: [string, string] }[];
  detect: { input: string; kinds: Kind[] }[];
}

const vectors: Vectors = JSON.parse(
  readFileSync(new URL("../../testdata/cases.json", import.meta.url), "utf8"),
);

test("общие примеры", () => {
  for (const c of vectors.cases) {
    const r = check(c.kind, c.input, c.bik ?? "");
    const name = `${c.kind} ${c.input}`;
    assert.equal(r.valid, c.valid, `${name}: ${r.message}`);
    if (!c.valid) {
      assert.equal(r.code, c.code, name);
      assert.ok(r.message, `${name}: нет объяснения`);
    }
    if (c.fact) assert.equal(fact(r, c.fact[0]), c.fact[1], name);
  }
});

test("определение вида", () => {
  for (const c of vectors.detect) {
    assert.deepEqual(
      detect(c.input).map((r) => r.kind),
      c.kinds,
      c.input,
    );
  }
});

test("случайный ввод не ломает detect и всегда объясняет ошибку", () => {
  const alphabet = "0123456789 -.AZaz04";
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 20000; i++) {
    const len = Math.floor(rnd() * 24);
    let s = "";
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    for (const r of detect(s)) {
      if (!r.valid) assert.ok(r.message, s);
    }
  }
});
