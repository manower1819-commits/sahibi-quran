import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

/* the service worker is a script, not a module: run it with stand-ins for its globals and take the pure function out */
const src = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8").replace("__CONFIG__", "null").replace(/__FBV__/g, "10.0.0");
const cacheable = vm.runInNewContext(src + "\n;cacheable", {
  self: {addEventListener() {}, location: {origin: "https://example.test"}, skipWaiting() {}, clients: {}},
  location: {origin: "https://example.test"}, caches: {}, clients: {}, importScripts() {}, URL, firebase: {},
});
const res = (o = {}) => Object.assign({ok: true, type: "basic", headers: {get: k => ({"content-type": o.ct, "content-length": o.len})[k.toLowerCase()] || null}}, o);
const req = path => ({url: "https://example.test" + path});

test("service worker: ordinary files are cached when the answer is ok, and not when it is an error", () => {
  assert.equal(cacheable(req("/app.js"), res()), true);
  assert.equal(cacheable(req("/app.js"), res({ok: false})), false);
  assert.equal(cacheable(req("/app.js"), null), false);
  assert.equal(cacheable(req("/font.woff2"), res({ok: false, type: "opaque"})), true, "an opaque answer (a font from another site) is kept as before");
});

test("service worker: the Quran text is cached only when it is the real file", () => {
  const q = req("/quran-uthmani.txt");
  assert.equal(cacheable(q, res({ct: "text/plain; charset=utf-8", len: "1396087"})), true);
  assert.equal(cacheable(q, res({ct: "text/plain"})), true, "no length given: the type decides");
  assert.equal(cacheable(q, res({ct: "text/html; charset=utf-8", len: "1396087"})), false, "a login or error page from a network in between");
  assert.equal(cacheable(q, res({ct: "text/plain", len: "512"})), false, "far too small to be the text");
  assert.equal(cacheable(q, res({ct: "text/plain", len: "420000"})), true, "the compressed size a host may report");
  assert.equal(cacheable(q, res({ct: undefined, len: "1396087"})), false, "no type");
  assert.equal(cacheable(q, res({ok: false, ct: "text/plain", len: "1396087"})), false);
  assert.equal(cacheable(req("/sub/quran-uthmani.txt"), res({ct: "text/html"})), false, "also under a path");
  assert.equal(cacheable(req("/quran-uthmani.txt.bak"), res({ct: "text/html"})), true, "only that file name is special");
});
