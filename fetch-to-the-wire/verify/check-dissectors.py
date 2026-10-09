#!/usr/bin/env python3
"""Cross-check wire-model.js against scapy, an independent packet parser, on the real captured bytes.
Usage: pip install scapy; python3 verify/check-dissectors.py"""
import json, os, subprocess, sys
from scapy.layers.dns import DNS
from scapy.layers.tls.record import TLS
from scapy.layers.tls.handshake import TLSClientHello, TLSServerHello
from scapy.layers.tls.extensions import TLS_Ext_ServerName, TLS_Ext_SupportedGroups, TLS_Ext_SignatureAlgorithms, TLS_Ext_ALPN, TLS_Ext_SupportedVersion_CH, TLS_Ext_SupportedVersion_SH
from scapy.layers.tls.keyexchange_tls13 import TLS_Ext_KeyShare_CH, TLS_Ext_KeyShare_SH
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cap = json.load(open(os.path.join(HERE, "data", "captured.json")))
ours = json.loads(subprocess.check_output(["node", "-e", r"""
const W=require(process.argv[1]+'/wire-model.js'),C=require(process.argv[1]+'/data/captured.json');
const pick=(fields,re)=>fields.filter(f=>re.test(f.label)).map(f=>String(f.value));
const q=W.dns(C.dns.query),r=W.dns(C.dns.response),ch=W.tls(C.clientHello),sh=W.tls(C.serverFlight);
const ext=(t,n)=>{const f=t.fields.find(f=>f.label==='Extension: '+n);return f?String(f.value):null};
console.log(JSON.stringify({
 dns:{id:pick(q.fields,/^Transaction ID$/)[0],name:pick(q.fields,/^Question name$/)[0],qtype:pick(q.fields,/^Question type$/)[0],rid:pick(r.fields,/^Transaction ID$/)[0],ttl:pick(r.fields,/^TTL$/)[0],addr:pick(r.fields,/^Address$/)[0]},
 ch:{suites:ch.fields.find(f=>f.label==='Cipher suites').note,sni:ext(ch,'server_name (SNI)'),groups:ext(ch,'supported_groups'),sigs:ext(ch,'signature_algorithms'),alpn:ext(ch,'application_layer_protocol_negotiation (ALPN)'),versions:ext(ch,'supported_versions'),
     shares:ch.fields.filter(f=>f.label==='Key share').map(f=>f.value+'|'+f.note.split(' ')[0])},
 sh:{suite:pick(sh.fields,/^Chosen cipher suite$/)[0],version:ext(sh,'supported_versions'),share:ext(sh,'key_share'),records:sh.records.map(r=>r.type+':'+r.len)}
}))""", HERE]).decode())
fails = 0
RESULTS = []
def check(what, a, b):
    global fails
    ok = a == b
    RESULTS.append({"what": what, "ok": ok, "ours": a if not ok else None, "scapy": b if not ok else None})
    fails += not ok
    print(("ok   " if ok else "FAIL ") + what + ("" if ok else f"\n     ours:  {a}\n     scapy: {b}"))
GN = {0x11ec: "X25519MLKEM768 (post-quantum hybrid)", 0x1d: "x25519", 0x17: "secp256r1", 0x18: "secp384r1"}
def grease(v): return (v & 0x0f0f) == 0x0a0a and (v >> 8) == (v & 0xff)
def gname(v): return f"GREASE 0x{v:04x}" if grease(v) else GN.get(v, f"0x{v:04x}")
# DNS
q = DNS(bytes.fromhex(cap["dns"]["query"])); r = DNS(bytes.fromhex(cap["dns"]["response"]))
check("DNS transaction ID", ours["dns"]["id"], f"0x{q.id:04x}")
check("DNS question name", ours["dns"]["name"], q.qd[0].qname.decode().rstrip("."))
check("DNS question type", ours["dns"]["qtype"].split(" ")[0], str(q.qd[0].qtype))
check("DNS reply carries same ID", ours["dns"]["rid"], f"0x{r.id:04x}")
check("DNS answer TTL", ours["dns"]["ttl"], f"{r.an[0].ttl} s")
check("DNS answer address", ours["dns"]["addr"], r.an[0].rdata)
# ClientHello
t = TLS(bytes.fromhex(cap["clientHello"])); chm = t.msg[0]
assert isinstance(chm, TLSClientHello)
ex = {type(e): e for e in chm.ext}
check("ClientHello cipher suite count", len(ours["ch"]["suites"].split(", ")), len(chm.ciphers))
check("ClientHello SNI", ours["ch"]["sni"], ex[TLS_Ext_ServerName].servernames[0].servername.decode())
check("ClientHello supported_groups", ours["ch"]["groups"], ", ".join(gname(g) for g in ex[TLS_Ext_SupportedGroups].groups))
check("ClientHello signature algorithm count", len(ours["ch"]["sigs"].split(", ")), len(ex[TLS_Ext_SignatureAlgorithms].sig_algs))
check("ClientHello ALPN", ours["ch"]["alpn"], ", ".join(p.protocol.decode() for p in ex[TLS_Ext_ALPN].protocols))
check("ClientHello supported_versions", ours["ch"]["versions"].replace("TLS 1.3", "0x0304").replace("TLS 1.2", "0x0303"), ", ".join(f"GREASE 0x{v:04x}" if grease(v) else f"0x{v:04x}" for v in ex[TLS_Ext_SupportedVersion_CH].versions))
check("ClientHello key shares (group|bytes)", ours["ch"]["shares"], [f"{gname(k.group)}|{k.kxlen}" for k in ex[TLS_Ext_KeyShare_CH].client_shares])
# ServerHello
s = TLS(bytes.fromhex(cap["serverFlight"]))
shm = s.msg[0]; assert isinstance(shm, TLSServerHello)
sx = {type(e): e for e in shm.ext}
check("ServerHello cipher suite", ours["sh"]["suite"], "TLS_AES_256_GCM_SHA384" if shm.cipher == 0x1302 else hex(shm.cipher))
check("ServerHello negotiated version", ours["sh"]["version"], "TLS 1.3" if sx[TLS_Ext_SupportedVersion_SH].version == 0x0304 else "?")
ks = sx[TLS_Ext_KeyShare_SH].server_share
check("ServerHello key share", ours["sh"]["share"], f"{gname(ks.group)}: {ks.kxlen}-byte share")
check("NetLog says the same group", cap["ssl"]["key_exchange_group"], 0x11ec)
check("NetLog says the same cipher", cap["ssl"]["cipher_suite"], shm.cipher)
import scapy, datetime, platform
_report = not os.environ.get("RK_NO_REPORT")  # quick runs do not overwrite the full results
_root = os.path.dirname(HERE)
if _report: os.makedirs(os.path.join(_root, "validation", "results"), exist_ok=True)
_out = {"id": "packet-dissectors", "date": datetime.datetime.now(datetime.timezone.utc).isoformat(), "platform": platform.platform(),
        "passed": not fails, "cases": len(RESULTS), "matched": len(RESULTS) - fails, "reference": "scapy " + scapy.__version__ + " (Python " + platform.python_version() + ")",
        "checks": [("ok   " if r["ok"] else "FAIL ") + r["what"] for r in RESULTS], "failureCount": fails}
if _report: json.dump(_out, open(os.path.join(_root, "validation", "results", "packet-dissectors.json"), "w"), indent=1)
_ff = os.path.join(_root, "validation", "failures", "packet-dissectors.json")
if _report and fails:
    os.makedirs(os.path.dirname(_ff), exist_ok=True); json.dump({"id": "packet-dissectors", "failures": [r for r in RESULTS if not r["ok"]]}, open(_ff, "w"), indent=1, default=str)
elif _report and os.path.exists(_ff): os.remove(_ff)
print(("all checks passed" if not fails else f"{fails} check(s) failed"))
sys.exit(1 if fails else 0)
