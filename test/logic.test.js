import { test } from "node:test";
import assert from "node:assert/strict";

import qrcode from "../src/vendor/qrcode.mjs";
import { encode, SOFT_MAX_VERSION } from "../src/lib/qr.js";
import {
  classify,
  parseExtraTracking,
  stripTracking,
  textFragmentUrl,
  truncate,
  filenameFor,
  prepare,
} from "../src/lib/target.js";
import { CEILINGS } from "../src/lib/qr.js";

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
  // Error instance matters: the vendor throws raw strings, and the popup's
  // error path reads .message — encode must always translate.
  assert.throws(
    () => encode("a".repeat(20000), "M"),
    (e) => e instanceof Error && /Too long/.test(e.message)
  );
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

test("strips tracking parameters case-insensitively", () => {
  assert.equal(
    stripTracking("https://example.com/?UTM_SOURCE=x&FbClId=y&id=1"),
    "https://example.com/?id=1"
  );
});

test("keeps the fragment through stripping", () => {
  assert.equal(
    stripTracking("https://example.com/p?utm_source=x#section-2"),
    "https://example.com/p#section-2"
  );
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
  assert.equal(prepare("  \n\t  "), "");
});

test("classifies selections a phone can act on", () => {
  assert.deepEqual(classify("+1 918 555 0134"), { kind: "phone", text: "tel:+19185550134" });
  assert.deepEqual(classify("+44 (0)20 7946 0958"), { kind: "phone", text: "tel:+442079460958" });
  assert.deepEqual(classify("someone@example.com"), { kind: "email", text: "mailto:someone@example.com" });
  assert.deepEqual(classify("36.1540, -95.9928"), { kind: "geo", text: "geo:36.154,-95.9928" });
  assert.deepEqual(classify("example.com/page"), { kind: "link", text: "https://example.com/page" });
});

// The cases that must NOT classify matter more than the ones that must: a wrong
// guess sends the scanner into a dialer or a map for something that was neither.
test("leaves anything ambiguous unclassified", () => {
  for (const text of [
    "2024-1234",           // reference number, not a phone
    "$1,299.00",           // price
    "2026-08-04",          // date
    "v1.2.3",              // version
    "978-0-13-235088-4",   // ISBN
    "555 0134",            // local number, no country code
    "PN 12345678",         // part number
    "notes.2024.txt",      // filename, not a domain
    "1.5",                 // bare decimal
    "91.5, 200.3",         // out-of-range coordinates
    "a@b",                 // no TLD
    "read example.com",    // domain inside prose
    "The quick brown fox", // ordinary prose
  ]) {
    assert.equal(classify(text), null, `should not classify: ${text}`);
  }
});

test("trims the punctuation a double-click drags along", () => {
  assert.deepEqual(classify("  someone@example.com.  "), { kind: "email", text: "mailto:someone@example.com" });
  assert.deepEqual(classify("(+1 918 555 0134)"), { kind: "phone", text: "tel:+19185550134" });
  assert.equal(classify("   "), null);
  assert.equal(classify(undefined), null);
});

test("short selections become a whole text fragment", () => {
  assert.equal(
    textFragmentUrl("https://example.com/p", "the quick brown fox"),
    "https://example.com/p#:~:text=the%20quick%20brown%20fox"
  );
});

test("long selections use the start,end form", () => {
  const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo"];
  const out = textFragmentUrl("https://example.com/p", words.join(" "));
  assert.equal(out, "https://example.com/p#:~:text=alpha%20bravo%20charlie%20delta%20echo,golf%20hotel%20india%20juliet%20kilo");
  // The middle word is absent — that is the whole point of the compact form.
  assert.ok(!out.includes("foxtrot"));
});

test("text fragments collapse whitespace and replace any existing fragment", () => {
  assert.equal(
    textFragmentUrl("https://example.com/p#old", "  spread\n  over   lines\t"),
    "https://example.com/p#:~:text=spread%20over%20lines"
  );
});

test("text fragments are refused where they cannot work", () => {
  assert.equal(textFragmentUrl("https://example.com/p", "   "), null);
  assert.equal(textFragmentUrl("https://example.com/p", undefined), null);
  assert.equal(textFragmentUrl("not a url", "text"), null);
  assert.equal(textFragmentUrl("mailto:someone@example.com", "text"), null);
  assert.equal(textFragmentUrl(undefined, "text"), null);
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

test("user-supplied parameters strip alongside the built-in list", () => {
  const extra = parseExtraTracking("ref, cid  sessionid");
  assert.equal(stripTracking("https://ex.com/?ref=x&keep=1", extra), "https://ex.com/?keep=1");
  assert.equal(stripTracking("https://ex.com/?CID=x&keep=1", extra), "https://ex.com/?keep=1");
  // Without the extra list those same names survive.
  assert.equal(stripTracking("https://ex.com/?ref=x&keep=1"), "https://ex.com/?ref=x&keep=1");
});

test("the extra-parameter list tolerates messy input", () => {
  assert.deepEqual([...parseExtraTracking("  a, ,b   c,,")], ["a", "b", "c"]);
  assert.deepEqual([...parseExtraTracking("")], []);
  assert.deepEqual([...parseExtraTracking(undefined)], []);
});

test("fragment precision overrides the automatic choice", () => {
  const long = Array.from({ length: 14 }, (_, i) => `word${i}`).join(" ");
  const whole = textFragmentUrl("https://ex.com/p", long, "whole");
  const ends = textFragmentUrl("https://ex.com/p", long, "ends");
  assert.ok(whole.includes("word7"), "whole keeps the middle");
  assert.ok(!ends.includes("word7"), "ends drops the middle");
  assert.ok(ends.length < whole.length);
});

test("the density ceiling changes when error correction gives way", () => {
  const url = `https://example.com/${"a".repeat(140)}`;
  const scannable = encode(url, "H", CEILINGS.scannable);
  const correction = encode(url, "H", CEILINGS.correction);
  assert.ok(scannable.version <= correction.version, "a lower ceiling yields a sparser code");
  assert.ok(scannable.downgraded, "keeping it scannable sheds error correction");
  assert.equal(correction.ecLevel, "H", "keeping correction holds the requested level");
});

test("filenames follow the chosen style", () => {
  const url = "https://www.example.com/a/b";
  const at = new Date("2026-08-04T12:00:00Z");
  assert.equal(filenameFor(url, "png", { style: "host" }), "qr-example.com.png");
  assert.equal(filenameFor(url, "png", { style: "hostDate", now: at }), "qr-example.com-2026-08-04.png");
  assert.equal(filenameFor(url, "png", { style: "title", title: "Some Page Title" }), "qr-Some-Page-Title.png");
  // No title available falls back rather than producing "qr-.png".
  assert.equal(filenameFor(url, "png", { style: "title", title: null }), "qr-example.com.png");
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
