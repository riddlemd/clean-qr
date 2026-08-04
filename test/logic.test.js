import { test } from "node:test";
import assert from "node:assert/strict";

import qrcode from "../src/vendor/qrcode.mjs";
import { encode, SOFT_MAX_VERSION } from "../src/lib/qr.js";
import { stripTracking, truncate, filenameFor, prepare } from "../src/lib/target.js";

test("encodes a short URL at the requested level", () => {
  const code = encode("https://example.com", "M");
  assert.equal(code.ecLevel, "M");
  assert.equal(code.downgraded, false);
  assert.equal(code.dense, false);
  assert.equal(code.count, code.version * 4 + 17);
  assert.equal(code.matrix.length, code.count);
  assert.equal(code.quietZone, 4);
});

test("matrix is square and holds only 0/1", () => {
  const { matrix, count } = encode("https://example.com/some/path?a=1", "M");
  for (const row of matrix) {
    assert.equal(row.length, count);
    for (const cell of row) assert.ok(cell === 0 || cell === 1);
  }
});

test("finder patterns land in all three corners", () => {
  const { matrix, count } = encode("https://example.com", "M");
  const corners = [[0, 0], [0, count - 7], [count - 7, 0]];
  for (const [top, left] of corners) {
    for (let i = 0; i < 7; i++) {
      assert.equal(matrix[top][left + i], 1, "finder top edge");
      assert.equal(matrix[top + 6][left + i], 1, "finder bottom edge");
    }
    assert.equal(matrix[top + 1][left + 1], 0, "finder inner ring gap");
    assert.equal(matrix[top + 3][left + 3], 1, "finder core");
  }
});

test("all four EC levels encode the same payload", () => {
  for (const ec of ["L", "M", "Q", "H"]) {
    const code = encode("https://example.com", ec);
    assert.equal(code.ecLevel, ec);
    assert.equal(code.downgraded, false);
  }
});

test("denser EC produces an equal or larger version", () => {
  const url = `https://example.com/${"a".repeat(120)}`;
  const l = encode(url, "L");
  const h = encode(url, "H");
  assert.ok(h.version >= l.version);
});

test("downgrades error correction rather than exceeding the version ceiling", () => {
  // Long enough that H would blow past SOFT_MAX_VERSION but L still fits under it.
  const url = `https://example.com/${"a".repeat(220)}`;
  const code = encode(url, "H");
  assert.equal(code.downgraded, true);
  assert.equal(code.requestedEc, "H");
  assert.notEqual(code.ecLevel, "H");
  assert.ok(code.version <= SOFT_MAX_VERSION);
});

test("flags dense when nothing fits under the ceiling", () => {
  const code = encode(`https://example.com/${"a".repeat(900)}`, "M");
  assert.equal(code.dense, true);
  assert.ok(code.version > SOFT_MAX_VERSION);
});

test("throws past the largest possible code", () => {
  assert.throws(() => encode("a".repeat(20000), "M"), /Too long/);
});

test("throws on empty input", () => {
  assert.throws(() => encode("", "M"), /Nothing to encode/);
});

test("throws on an unknown EC level", () => {
  assert.throws(() => encode("https://example.com", "Z"), /Unknown error correction/);
});

// Importing qr.js installs the UTF-8 converter on the vendor module; the vendor
// default truncates each UTF-16 code unit to one byte.
test("byte mode encodes text as UTF-8", () => {
  for (const text of ["café", "日本語", "😀"]) {
    assert.deepEqual(qrcode.stringToBytes(text), Array.from(new TextEncoder().encode(text)));
  }
  const code = encode("https://example.com/日本語のページ", "M");
  assert.equal(code.count, code.matrix.length);
});

test("strips exact and prefixed tracking parameters", () => {
  assert.equal(
    stripTracking("https://example.com/p?utm_source=x&utm_medium=y&id=7&fbclid=abc"),
    "https://example.com/p?id=7"
  );
});

test("drops the question mark when every parameter was tracking", () => {
  assert.equal(stripTracking("https://example.com/p?utm_source=x"), "https://example.com/p");
});

test("leaves clean URLs and non-URL text untouched", () => {
  assert.equal(stripTracking("https://example.com/p?id=7"), "https://example.com/p?id=7");
  assert.equal(stripTracking("just some selected text"), "just some selected text");
  assert.equal(stripTracking("mailto:someone@example.com"), "mailto:someone@example.com");
});

test("keeps parameters that merely resemble tracking names", () => {
  assert.equal(stripTracking("https://example.com/?utmost=1"), "https://example.com/?utmost=1");
  assert.equal(stripTracking("https://example.com/?ref=abc"), "https://example.com/?ref=abc");
});

test("preserves the encoding of surviving parameters", () => {
  // URLSearchParams would rewrite these to q=a+b%3Ac and flag=.
  assert.equal(
    stripTracking("https://example.com/s?q=a%20b%3Ac&utm_source=x"),
    "https://example.com/s?q=a%20b%3Ac"
  );
  assert.equal(stripTracking("https://example.com/s?flag&utm_source=x"), "https://example.com/s?flag");
});

test("prepare honours the strip setting", () => {
  const url = "https://example.com/?utm_source=x";
  assert.equal(prepare(` ${url} `, { stripTracking: true }), "https://example.com/");
  assert.equal(prepare(url, { stripTracking: false }), url);
  assert.equal(prepare(undefined), "");
});

test("truncate keeps both ends and respects the budget", () => {
  const short = "https://example.com";
  assert.equal(truncate(short), short);

  const long = `https://example.com/${"a".repeat(200)}/tail`;
  const out = truncate(long, 40);
  assert.equal(out.length, 40);
  assert.ok(out.includes("…"));
  assert.ok(out.startsWith("https://"));
  assert.ok(out.endsWith("tail"));
});

test("truncate never splits a surrogate pair", () => {
  const out = truncate("a".repeat(30) + "😀".repeat(20), 40);
  assert.ok([...out].every((c) => !/^[\uD800-\uDFFF]$/.test(c)), "lone surrogate in output");
  assert.equal([...out].length, 40);
});

test("filenames derive from the host and stay filesystem-safe", () => {
  assert.equal(filenameFor("https://www.example.com/a/b", "png"), "qr-example.com.png");
  assert.equal(filenameFor("some selected text", "svg"), "qr-code.svg");
  assert.ok(!/[^a-z0-9.\-]/i.test(filenameFor("https://ex ample.com/", "png")));
});

test("hostname-less URLs keep the generic filename", () => {
  assert.equal(filenameFor("mailto:someone@example.com", "png"), "qr-code.png");
  assert.equal(filenameFor("about:blank", "png"), "qr-code.png");
  assert.equal(filenameFor("data:text/plain,hi", "svg"), "qr-code.svg");
});
