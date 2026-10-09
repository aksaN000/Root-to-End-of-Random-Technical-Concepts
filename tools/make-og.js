// Draws the 1200x630 preview image (assets/og/<slug>.png) for every page listed in tools/og-pages.json,
// which tools/seo.py writes.   node tools/make-og.js
let pw;try{pw=require('playwright')}catch(e){pw=require('/opt/npm-tools/node_modules/playwright')}const {chromium}=pw;const fs=require('fs'),path=require('path');
const pages=JSON.parse(fs.readFileSync(path.join(__dirname,'og-pages.json'),'utf8'));const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const tpl=p=>`<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:x}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#0e1116;color:#e5e9ef;font-family:"IBM Plex Sans","DejaVu Sans",system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;position:relative;overflow:hidden}
body:before{content:"";position:absolute;inset:0;background:radial-gradient(900px 500px at 105% -10%,rgba(142,165,255,.28),transparent 60%),radial-gradient(700px 400px at -10% 120%,rgba(242,182,89,.18),transparent 60%)}
.top,.h,.sub,.chain,.foot{position:relative}
.top{font-family:"DejaVu Sans Mono",monospace;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#f2b659}
.h{font-weight:800;font-size:${p.h.length>30?68:80}px;line-height:1.04;letter-spacing:-.02em;max-width:1000px}
.sub{font-size:32px;color:#97a2b1;margin-top:18px;max-width:1000px}
.chain{display:flex;gap:12px;align-items:center;font-family:"DejaVu Sans Mono",monospace;font-size:24px;flex-wrap:wrap}
.chain span{border:2px solid #28303b;border-radius:10px;padding:6px 14px;background:#151a21}
.chain span:last-child{border-color:#8ea5ff;color:#8ea5ff}
.chain i{font-style:normal;color:#97a2b1}
.foot{display:flex;justify-content:space-between;font-family:"DejaVu Sans Mono",monospace;font-size:22px;color:#97a2b1}
</style></head><body><div><div class="top">Root to End · traced from the source</div><div style="margin-top:28px" class="h">${esc(p.h)}</div><div class="sub">${esc(p.sub)}</div></div>
<div class="chain">${p.chain.map(esc).map(c=>'<span>'+c+'</span>').join('<i>→</i>')}</div>
<div class="foot"><span>real code · verified simulators · quizzes · exam practice</span><span>aksan000.github.io</span></div></body></html>`;
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1200,height:630}});
for(const p of pages){await pg.setContent(tpl(p));await pg.waitForTimeout(100);await pg.screenshot({path:path.join(__dirname,'..','assets','og',p.slug+'.png')});console.log(p.slug)}
await b.close()})();
