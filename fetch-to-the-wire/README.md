# What `fetch()` really sends

Browser track, page 1 of 3. One `fetch('https://api.example.test/api/users')` traced through real Chromium 141 and back into a resolved promise.

## What it covers

1. **The 60-second version** and a **replay** of Chrome's own NetLog for this request (24 real events, with timestamps).
2. **Blink**: `FetchLoaderBase::PerformHTTPFetch` builds a `ResourceRequest` and hands it to the network service over Mojo.
3. **The network service**: `URLLoader::ScheduleStart` and the CORS preflight decision (`NeedsPreflight`).
4. **DNS**: `SystemHostResolverCall` → `getaddrinfo()`, with the real 34-byte query and 50-byte answer in a clickable byte dissector.
5. **TCP**: `SocketPosix::DoConnect` → `connect()` → the kernel's `tcp_connect()` sending the SYN.
6. **TLS 1.3**: SNI, ALPN, `SSL_do_handshake`, Chrome's post-quantum group list, and the real 1,822-byte ClientHello and the server's first flight, dissected field by field.
7. **HTTP/1.1**: `GenerateRequestLine`, `HttpStreamParser::SendRequest`, and the real request and response text, including keep-alive reuse.
8. **CORS**: preflights, a CORS lab, and the one place Chrome 141 is more lenient than the spec (`Access-Control-Allow-Headers: *` still covers `Authorization`).
9. **Back to our code**: `OnReceiveResponse`, `Response` resolution, `res.json()`, and real Resource Timing values.
10. Quizzes, tools and exercises, exam-style questions, and a reading list.

## Verification

- `python3 verify/check-dissectors.py` cross-checks the DNS and TLS dissectors in `wire-model.js` against scapy (18 checks).
- `node verify/cors-matrix.js` runs 2,880 combinations of request and server CORS policy through real Chromium and compares with the model: 2,880/2,880 match.

## The capture

`data/` holds everything needed to reproduce it: `servers.js` (a DNS server on 127.0.0.1:53, a recording TCP tap in front of a TLS 1.3 HTTP/1.1 API server, and the page server), `page.html`, `run.js` (Playwright, NetLog capture), the raw `netlog.json` (open it in the [NetLog viewer](https://netlog-viewer.appspot.com/)), `capture.json` (raw bytes seen by the servers) and `captured.json` (the curated data the page uses). To rerun: start `node servers.js` as root, point `/etc/resolv.conf` at `127.0.0.1`, run `node run.js`, then restore `/etc/resolv.conf`.

## Sources

Chromium and BoringSSL (BSD-style licenses) and Linux (GPL-2.0) source, fetched October 2026, quoted for study.
