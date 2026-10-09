let chromium;try{chromium=require('playwright').chromium}catch(e){chromium=require('/opt/npm-tools/node_modules/playwright').chromium}
(async()=>{const b=await chromium.launch({env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/proxy/i.test(k))),args:['--log-net-log='+__dirname+'/netlog.json','--net-log-capture-mode=Everything','--ignore-certificate-errors','--no-proxy-server']});
const p=await b.newPage();const msgs=[];p.on('console',m=>msgs.push(m.text()));
await p.goto('http://app.example.test:8080/');const r=await p.evaluate(()=>window.result);
console.log(JSON.stringify({status:[r.status1,r.status2],users:r.users,n:r.entries.length},null,0));require('fs').writeFileSync(__dirname+'/timing.json',JSON.stringify(r.entries,null,1));
console.log(msgs.join('\n'));await b.close()})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
