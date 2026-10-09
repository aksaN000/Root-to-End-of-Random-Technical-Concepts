const {chromium}=require('/opt/npm-tools/node_modules/playwright');const fs=require('fs'),http=require('http');
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(__dirname+'/page.html'))}).listen(8099);
const CATS=['devtools.timeline','disabled-by-default-devtools.timeline','blink','loading','v8.execute','disabled-by-default-devtools.timeline.frame'];
(async()=>{const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/proxy/i.test(k)));
const b=await chromium.launch({env,args:['--no-proxy-server']});const p=await b.newPage({viewport:{width:800,height:600}});
async function rec(name,fn){await b.startTracing(p,{path:__dirname+'/trace-'+name+'.json',categories:CATS});await fn();await p.waitForTimeout(400);await b.stopTracing();console.log('traced',name)}
await rec('load',async()=>{await p.goto('http://127.0.0.1:8099/');});
const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
await frame();
await rec('color',async()=>{await p.evaluate(()=>{document.getElementById('card').style.color='crimson'});await frame()});
await rec('width',async()=>{await p.evaluate(()=>{document.getElementById('card').style.width='300px'});await frame()});
await rec('transform',async()=>{await p.evaluate(()=>{document.getElementById('mover').style.transform='translateX(80px)'});await frame()});
await rec('thrash',async()=>{await p.evaluate(()=>{const c=document.getElementById('card');let h=0;for(let i=0;i<20;i++){c.style.width=(200+i)+'px';h+=c.offsetHeight}window.h=h});await frame()});
await rec('batched',async()=>{await p.evaluate(()=>{const c=document.getElementById('card');for(let i=0;i<20;i++){c.style.width=(220+i)+'px'}window.h=c.offsetHeight});await frame()});
await rec('append',async()=>{await p.evaluate(()=>{const li=document.createElement('li');li.textContent='three';document.querySelector('ul').appendChild(li)});await frame()});
await b.close();srv.close()})();
