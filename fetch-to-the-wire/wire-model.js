// Byte dissectors for the real captures on this page (DNS, TLS ClientHello/ServerHello, HTTP/1.1)
// and a model of the Fetch standard's CORS rules as Chromium implements them.
// verify/check-dissectors.py cross-checks the dissectors with scapy; verify/cors-matrix.js checks
// the CORS model against real Chromium on 2,880 requests.
var Wire = (function () {
  "use strict";
  function hexToBytes(h) { var a = []; for (var i = 0; i < h.length; i += 2) a.push(parseInt(h.substr(i, 2), 16)); return a; }
  function u8(b, o) { return b[o]; }
  function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function u24(b, o) { return (b[o] << 16) | (b[o + 1] << 8) | b[o + 2]; }
  function u32(b, o) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
  function hx(n, w) { var s = n.toString(16); while (s.length < w) s = "0" + s; return "0x" + s; }
  function ascii(b, o, n) { var s = ""; for (var i = 0; i < n; i++) s += String.fromCharCode(b[o + i]); return s; }
  function isGrease(v) { return (v & 0x0f0f) === 0x0a0a && (v >> 8) === (v & 0xff); }

  // ---------------- DNS (RFC 1035) ----------------
  var QTYPE = { 1: "A (IPv4 address)", 28: "AAAA (IPv6 address)", 65: "HTTPS", 5: "CNAME" };
  function dns(hex, isResponse) {
    var b = hexToBytes(hex), F = [];
    function f(s, e, label, value, note, depth) { F.push({ s: s, e: e, label: label, value: value, note: note || "", depth: depth || 0 }); }
    f(0, 2, "Transaction ID", hx(u16(b, 0), 4), "Random; the reply must carry the same ID, which is how the resolver matches answers to questions.");
    var fl = u16(b, 2), qr = fl >> 15, rd = (fl >> 8) & 1, ra = (fl >> 7) & 1, rcode = fl & 15;
    f(2, 4, "Flags", hx(fl, 4), (qr ? "QR=1 response" : "QR=0 query") + ", RD=" + rd + " (recursion desired)" + (qr ? ", RA=" + ra + ", RCODE=" + rcode + (rcode === 0 ? " (no error)" : rcode === 3 ? " (no such name)" : "") : ""));
    f(4, 6, "Questions", String(u16(b, 4)));
    f(6, 8, "Answers", String(u16(b, 6)));
    f(8, 10, "Authority records", String(u16(b, 8)));
    f(10, 12, "Additional records", String(u16(b, 10)));
    var o = 12, labels = [], st = o;
    while (b[o]) { f(o, o + 1, "Label length", String(b[o]), "", 1); f(o + 1, o + 1 + b[o], "Label", ascii(b, o + 1, b[o]), "", 1); labels.push(ascii(b, o + 1, b[o])); o += 1 + b[o]; }
    f(o, o + 1, "End of name", "0", "A zero-length label ends the name.", 1); o++;
    F.push({ s: st, e: o, label: "Question name", value: labels.join("."), note: "Each label is a length byte followed by that many characters; no dots are sent.", depth: 0, group: true });
    f(o, o + 2, "Question type", String(u16(b, o)) + " · " + (QTYPE[u16(b, o)] || "?")); o += 2;
    f(o, o + 2, "Question class", String(u16(b, o)) + " · IN (internet)"); o += 2;
    var an = u16(b, 6);
    for (var i = 0; i < an; i++) {
      var as = o;
      if ((b[o] & 0xc0) === 0xc0) { f(o, o + 2, "Name (pointer)", hx(u16(b, o) & 0x3fff, 4), "Compression: the top two bits 11 mean \"the name is at offset " + (u16(b, o) & 0x3fff) + "\", reusing the question's name.", 1); o += 2; }
      f(o, o + 2, "Type", String(u16(b, o)) + " · " + (QTYPE[u16(b, o)] || "?"), "", 1); var ty = u16(b, o); o += 2;
      f(o, o + 2, "Class", "IN", "", 1); o += 2;
      f(o, o + 4, "TTL", u32(b, o) + " s", "How long resolvers may cache the answer.", 1); o += 4;
      var rl = u16(b, o); f(o, o + 2, "Data length", String(rl), "", 1); o += 2;
      f(o, o + rl, "Address", ty === 1 ? b.slice(o, o + rl).join(".") : "", "", 1); o += rl;
      F.push({ s: as, e: o, label: "Answer " + (i + 1), value: "", note: "", depth: 0, group: true });
    }
    return { bytes: b, fields: F.sort(function (x, y) { return x.s - y.s || (y.e - y.s) - (x.e - x.s); }) };
  }

  // ---------------- TLS ----------------
  var SUITES = { 0x1301: "TLS_AES_128_GCM_SHA256", 0x1302: "TLS_AES_256_GCM_SHA384", 0x1303: "TLS_CHACHA20_POLY1305_SHA256", 0xc02b: "ECDHE_ECDSA_AES_128_GCM_SHA256", 0xc02f: "ECDHE_RSA_AES_128_GCM_SHA256", 0xc02c: "ECDHE_ECDSA_AES_256_GCM_SHA384", 0xc030: "ECDHE_RSA_AES_256_GCM_SHA384", 0xcca9: "ECDHE_ECDSA_CHACHA20_POLY1305", 0xcca8: "ECDHE_RSA_CHACHA20_POLY1305", 0xc013: "ECDHE_RSA_AES_128_CBC_SHA", 0xc014: "ECDHE_RSA_AES_256_CBC_SHA", 0x009c: "RSA_AES_128_GCM_SHA256", 0x009d: "RSA_AES_256_GCM_SHA384", 0x002f: "RSA_AES_128_CBC_SHA", 0x0035: "RSA_AES_256_CBC_SHA" };
  var GROUPS = { 0x11ec: "X25519MLKEM768 (post-quantum hybrid)", 0x001d: "x25519", 0x0017: "secp256r1", 0x0018: "secp384r1", 0x6399: "X25519Kyber768Draft00" };
  var SIGS = { 0x0403: "ecdsa_secp256r1_sha256", 0x0804: "rsa_pss_rsae_sha256", 0x0401: "rsa_pkcs1_sha256", 0x0503: "ecdsa_secp384r1_sha384", 0x0805: "rsa_pss_rsae_sha384", 0x0501: "rsa_pkcs1_sha384", 0x0806: "rsa_pss_rsae_sha512", 0x0601: "rsa_pkcs1_sha512" };
  var VERS = { 0x0304: "TLS 1.3", 0x0303: "TLS 1.2", 0x0302: "TLS 1.1", 0x0301: "TLS 1.0" };
  var EXT = { 0: "server_name (SNI)", 5: "status_request (OCSP stapling)", 10: "supported_groups", 11: "ec_point_formats", 13: "signature_algorithms", 16: "application_layer_protocol_negotiation (ALPN)", 18: "signed_certificate_timestamp", 21: "padding", 23: "extended_master_secret", 27: "compress_certificate", 35: "session_ticket", 41: "pre_shared_key", 43: "supported_versions", 45: "psk_key_exchange_modes", 51: "key_share", 0x44cd: "application_settings (ALPS)", 0xfe0d: "encrypted_client_hello", 0xff01: "renegotiation_info" };
  var EXTNOTE = {
    0: "The hostname, in plaintext. This is how one IP address can serve many HTTPS sites, and why an on-path observer can still see which site we visit.",
    10: "The key-exchange groups we support, in preference order. X25519MLKEM768 comes first.",
    13: "Which signature algorithms we accept for the server's certificate and handshake signature.",
    16: "The application protocols we can speak over this connection; the server picks one.",
    43: "The real version negotiation. The legacy field above still says TLS 1.2 so old middleboxes do not choke.",
    51: "Public keys sent up front, so the handshake can finish in one round trip.",
    0xfe0d: "Encrypted Client Hello. With no ECH config for this site, Chrome sends a GREASE (fake) ECH extension so real ECH traffic does not stand out.",
    21: "Pads the ClientHello to a size that avoids a known middlebox bug.",
    45: "psk_dhe_ke: resumption must still do a fresh key exchange."
  };
  function nameOf(t, v) { return isGrease(v) ? "GREASE " + hx(v, 4) : (t[v] || hx(v, 4)); }

  function tls(hex) {
    var b = hexToBytes(hex), F = [];
    function f(s, e, label, value, note, depth, group) { F.push({ s: s, e: e, label: label, value: value, note: note || "", depth: depth || 0, group: !!group }); }
    var o = 0, recs = [];
    while (o + 5 <= b.length) {
      var ct = b[o], rl = u16(b, o + 3), rs = o;
      var CT = { 20: "ChangeCipherSpec", 21: "Alert", 22: "Handshake", 23: "ApplicationData (encrypted)" };
      f(o, o + 5 + rl, "TLS record: " + (CT[ct] || ct), rl + " bytes", ct === 23 ? "Everything after the ServerHello is encrypted with handshake keys; on the wire it is labelled application data." : ct === 20 ? "A dummy message kept for middlebox compatibility; TLS 1.3 ignores it." : "", 0, true);
      f(o, o + 1, "Content type", String(ct), "", 1);
      f(o + 1, o + 3, "Legacy record version", hx(u16(b, o + 1), 4), "Frozen value; ignored by TLS 1.3.", 1);
      f(o + 3, o + 5, "Record length", String(rl), "", 1);
      if (ct === 22) hello(b, o + 5, o + 5 + rl, f);
      recs.push({ type: CT[ct] || ct, len: rl, start: rs });
      o += 5 + rl;
    }
    return { bytes: b, fields: F.sort(function (x, y) { return x.s - y.s || (y.e - y.s) - (x.e - x.s); }), records: recs };
  }
  function hello(b, o, end, f) {
    var t = b[o], len = u24(b, o + 1), client = t === 1;
    f(o, o + 4 + len, client ? "ClientHello" : t === 2 ? "ServerHello" : "Handshake message " + t, len + " bytes", "", 1, true);
    f(o, o + 1, "Handshake type", t + (client ? " (client_hello)" : t === 2 ? " (server_hello)" : ""), "", 2);
    f(o + 1, o + 4, "Length", String(len), "", 2);
    var p = o + 4;
    f(p, p + 2, "Legacy version", hx(u16(b, p), 4) + " (TLS 1.2)", "TLS 1.3 keeps this at 1.2 and negotiates the real version in supported_versions.", 2); p += 2;
    f(p, p + 32, client ? "Client random" : "Server random", "32 random bytes", "Fresh randomness mixed into the key schedule.", 2); p += 32;
    var sl = b[p]; f(p, p + 1 + sl, "Legacy session ID", sl + " bytes", "Random filler in TLS 1.3 (middlebox compatibility mode); the server echoes it.", 2); p += 1 + sl;
    if (client) {
      var cl = u16(b, p), list = [];
      for (var i = 0; i < cl; i += 2) list.push(nameOf(SUITES, u16(b, p + 2 + i)));
      f(p, p + 2 + cl, "Cipher suites", (cl / 2) + " offered", list.join(", "), 2); p += 2 + cl;
      f(p, p + 1 + b[p], "Compression methods", "null only", "", 2); p += 1 + b[p];
    } else {
      f(p, p + 2, "Chosen cipher suite", nameOf(SUITES, u16(b, p)), "", 2); p += 2;
      f(p, p + 1, "Compression", "null", "", 2); p += 1;
    }
    var el = u16(b, p); f(p, p + 2, "Extensions length", String(el), "", 2); p += 2;
    var ee = p + el;
    while (p < ee) {
      var et = u16(b, p), l = u16(b, p + 2), d = p + 4, val = "";
      if (isGrease(et)) val = "fake value to keep servers tolerant of unknown extensions";
      else if (et === 0) val = ascii(b, d + 5, u16(b, d + 3));
      else if (et === 10) { var g = []; for (var k = 2; k < 2 + u16(b, d); k += 2) g.push(nameOf(GROUPS, u16(b, d + k))); val = g.join(", "); }
      else if (et === 13) { var s = []; for (k = 2; k < 2 + u16(b, d); k += 2) s.push(nameOf(SIGS, u16(b, d + k))); val = s.join(", "); }
      else if (et === 16) { var a = [], q = d + 2; while (q < d + l) { a.push(ascii(b, q + 1, b[q])); q += 1 + b[q]; } val = a.join(", "); }
      else if (et === 43) { if (client) { var v = []; for (k = 1; k < 1 + b[d]; k += 2) v.push(nameOf(VERS, u16(b, d + k))); val = v.join(", "); } else val = nameOf(VERS, u16(b, d)); }
      else if (et === 51) {
        if (client) { var ks = [], q2 = d + 2; while (q2 < d + l) { var gid = u16(b, q2), kl = u16(b, q2 + 2); ks.push(nameOf(GROUPS, gid) + ": " + kl + "-byte key"); f(q2, q2 + 4 + kl, "Key share", nameOf(GROUPS, gid), kl + " bytes of public key" + (gid === 0x11ec ? " (1184-byte ML-KEM-768 encapsulation key + 32-byte X25519 key)" : ""), 4); q2 += 4 + kl; } val = ks.join("; "); }
        else { var sg = u16(b, d), sk = u16(b, d + 2); val = nameOf(GROUPS, sg) + ": " + sk + "-byte share"; f(d, d + 4 + sk, "Server key share", nameOf(GROUPS, sg), sk + " bytes" + (sg === 0x11ec ? " (1088-byte ML-KEM ciphertext + 32-byte X25519 key)" : ""), 4); }
      }
      else if (et === 45) val = b[d + 1] === 1 ? "psk_dhe_ke" : String(b[d + 1]);
      else if (et === 21) val = l + " zero bytes";
      else if (et === 0x44cd) { var a2 = [], q3 = d + 2; while (q3 < d + l) { a2.push(ascii(b, q3 + 1, b[q3])); q3 += 1 + b[q3]; } val = a2.join(", "); }
      f(p, p + 4 + l, "Extension: " + nameOf(EXT, et), val || (l + " bytes"), EXTNOTE[et] || "", 3, true);
      p += 4 + l;
    }
  }

  // ---------------- HTTP/1.1 ----------------
  function http(text) {
    var head = text.split("\r\n\r\n")[0], body = text.slice(head.length + 4), lines = head.split("\r\n");
    var start = lines[0], parts = start.split(" ");
    var isResp = /^HTTP\//.test(start);
    var hdrs = lines.slice(1).map(function (l) { var i = l.indexOf(":"); return { name: l.slice(0, i), value: l.slice(i + 1).trim() }; });
    return { start: start, isResponse: isResp, method: isResp ? null : parts[0], target: isResp ? null : parts[1], status: isResp ? +parts[1] : null, headers: hdrs, body: body, bytes: text.length };
  }

  // ---------------- CORS (Fetch standard, Chromium's implementation) ----------------
  var SAFE_HEADERS = { "accept": 1, "accept-language": 1, "content-language": 1, "content-type": 1, "range": 1 };
  var SAFE_CT = { "application/x-www-form-urlencoded": 1, "multipart/form-data": 1, "text/plain": 1 };
  function safeMethod(m) { return m === "GET" || m === "HEAD" || m === "POST"; }
  function unsafeHeaders(h) {
    var out = [];
    Object.keys(h).forEach(function (k) {
      var n = k.toLowerCase(), v = String(h[k]);
      if (!SAFE_HEADERS[n] || v.length > 128 || (n === "content-type" && !SAFE_CT[v.split(";")[0].trim().toLowerCase()])) out.push(n);
    });
    return out.sort();
  }
  function listHas(val, item) { return val != null && val.split(",").map(function (x) { return x.trim().toLowerCase(); }).indexOf(item.toLowerCase()) >= 0; }
  // req: {method, headers:{name:value}, credentials:'same-origin'|'include', origin}
  // srv: {acao: null|'origin'|'*', acam: null|string, acah: null|string, acac: bool}
  // opts.strict: apply the spec rule that * never covers Authorization. Chrome 141 does not yet
  // (feature kCorsNonWildcardRequestHeadersSupport is disabled by default), so the default follows Chrome.
  function cors(req, srv, opts) {
    opts = opts || {};
    var steps = [], include = req.credentials === "include", m = req.method.toUpperCase();
    var unsafe = unsafeHeaders(req.headers);
    var needs = !safeMethod(m) ? "disallowed_method" : unsafe.length ? "disallowed_header" : null;
    function originCheck(where) {
      if (!srv.acao) return "No Access-Control-Allow-Origin header on the " + where + ".";
      if (srv.acao === "*" && include) return "Access-Control-Allow-Origin is * but the request includes credentials; it must name our origin.";
      if (include && !srv.acac) return "Credentials are included but the " + where + " lacks Access-Control-Allow-Credentials: true.";
      return null;
    }
    var result = { preflight: !!needs, reason: needs, requestHeaders: unsafe, steps: steps, ok: true, error: null };
    if (needs) {
      steps.push({ k: "send", t: "Preflight needed (" + (needs === "disallowed_method" ? m + " is not GET, HEAD or POST" : "header" + (unsafe.length > 1 ? "s " : " ") + unsafe.join(", ") + " not safelisted") + "). Chrome sends OPTIONS with Access-Control-Request-Method: " + m + (unsafe.length ? " and Access-Control-Request-Headers: " + unsafe.join(",") : "") + "." });
      var e = originCheck("preflight response");
      if (!e && !safeMethod(m) && !listHas(srv.acam, m) && !(srv.acam && srv.acam.trim() === "*" && !include)) e = "Method " + m + " is not in Access-Control-Allow-Methods" + (srv.acam && srv.acam.trim() === "*" && include ? " (* does not count when credentials are included)" : "") + ".";
      if (!e) for (var i = 0; i < unsafe.length; i++) {
        var n = unsafe[i], star = srv.acah && srv.acah.trim() === "*";
        if (listHas(srv.acah, n)) continue;
        if (star && !include && n !== "authorization") continue;
        if (star && !include && n === "authorization" && !opts.strict) { steps.push({ k: "warn", t: "Access-Control-Allow-Headers: * is letting Authorization through. The Fetch standard says it should not, but Chrome 141 still allows it (the check sits behind the disabled feature kCorsNonWildcardRequestHeadersSupport) and records a deprecation warning." }); continue; }
        e = "Header " + n + " is not in Access-Control-Allow-Headers" + (star && n === "authorization" ? " (* never covers Authorization)" : star && include ? " (* does not count when credentials are included)" : "") + ".";
        break;
      }
      if (e) { steps.push({ k: "fail", t: "Preflight fails: " + e + " The real request is never sent." }); result.ok = false; result.error = e; return result; }
      steps.push({ k: "ok", t: "Preflight passes. Chrome may cache this answer, then sends the real request." });
    } else steps.push({ k: "send", t: "No preflight: " + m + " is safelisted and every header is safelisted. Chrome sends the request directly, with an Origin header." });
    var e2 = originCheck("response");
    if (e2) { steps.push({ k: "fail", t: "The request reached the server and it answered, but the response fails the CORS check: " + e2 + " Our code gets TypeError: Failed to fetch, and cannot read the response." }); result.ok = false; result.error = e2; return result; }
    steps.push({ k: "ok", t: "The response passes the CORS check. The promise from fetch() resolves with the response." });
    return result;
  }

  return { hexToBytes: hexToBytes, dns: dns, tls: tls, http: http, cors: cors, unsafeHeaders: unsafeHeaders, isGrease: isGrease };
})();
if (typeof module !== "undefined") module.exports = Wire;
