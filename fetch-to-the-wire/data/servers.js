// Local lab: a DNS server, a recording TCP tap in front of a TLS+HTTP/1.1 API server, and a plain HTTP page server.
const dgram=require('dgram'),net=require('net'),tls=require('tls'),http=require('http'),fs=require('fs');
const LOG=[];const log=(kind,o)=>{o.kind=kind;o.t=Date.now();LOG.push(o);fs.writeFileSync('capture.json',JSON.stringify(LOG,null,1))};
// ---- DNS (RFC 1035) on 127.0.0.1:53 ----
function qname(b,o){const l=[];for(;;){const n=b[o++];if(!n)break;l.push(b.slice(o,o+n).toString());o+=n}return [l.join('.'),o]}
const dns=dgram.createSocket('udp4');
dns.on('message',(q,r)=>{const id=q.readUInt16BE(0);const [name,o]=qname(q,12);const type=q.readUInt16BE(o);const ours=/\.example\.test$/.test(name);
  const hdr=Buffer.alloc(12);hdr.writeUInt16BE(id,0);hdr.writeUInt16BE(0x8180|(ours?0:3),2);hdr.writeUInt16BE(1,4);
  const question=q.slice(12,o+4);let ans=Buffer.alloc(0);
  if(ours&&type===1){hdr.writeUInt16BE(1,6);ans=Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,60,0,4,127,0,0,1])}
  // EDNS OPT records in the query are echoed by real servers; we keep the answer minimal
  const resp=Buffer.concat([hdr,question,ans]);dns.send(resp,r.port,r.address);
  log('dns',{name,type,query:q.toString('hex'),response:resp.toString('hex'),from:r.port})});
dns.bind(53,'127.0.0.1');
// ---- TLS + minimal HTTP/1.1 API on 8443, with a recording tap on 443 ----
const API_ORIGIN_OK='http://app.example.test:8080';
function respond(sock,req){const lines=req.split('\r\n');const [method,path]=lines[0].split(' ');const h={};lines.slice(1).forEach(l=>{const i=l.indexOf(':');if(i>0)h[l.slice(0,i).toLowerCase()]=l.slice(i+1).trim()});
  let status='200 OK',body='',extra=[];const origin=h.origin;
  if(method==='OPTIONS'){status='204 No Content';extra=['Access-Control-Allow-Origin: '+API_ORIGIN_OK,'Access-Control-Allow-Methods: GET, POST','Access-Control-Allow-Headers: content-type','Access-Control-Max-Age: 600','Timing-Allow-Origin: *']}
  else{body=JSON.stringify(path.startsWith('/api/users')?[{id:1,name:'Ada'},{id:2,name:'Linus'}]:{ok:true});extra=['Content-Type: application/json','Access-Control-Allow-Origin: '+API_ORIGIN_OK,'Timing-Allow-Origin: *']}
  const res=['HTTP/1.1 '+status,...extra,'Content-Length: '+Buffer.byteLength(body),'Connection: keep-alive','',body].join('\r\n');
  log('http',{side:'api',request:req,response:res});sock.write(res)}
const tlsSrv=tls.createServer({key:fs.readFileSync('key.pem'),cert:fs.readFileSync('cert.pem'),ALPNProtocols:['http/1.1']},s=>{s.setNoDelay(true);let buf='';s.on('data',d=>{buf+=d.toString('latin1');let i;while((i=buf.indexOf('\r\n\r\n'))>=0){const head=buf.slice(0,i);const m=/content-length:\s*(\d+)/i.exec(head);const len=m?+m[1]:0;if(buf.length<i+4+len)break;const req=buf.slice(0,i+4+len);buf=buf.slice(i+4+len);respond(s,req)}})});
tlsSrv.listen(8443,'127.0.0.1');
let conn=0;net.createServer(c=>{const id=++conn;c.setNoDelay(true);const up=net.connect(8443,'127.0.0.1');up.setNoDelay(true);const cs=[],ss=[];
  c.on('data',d=>{cs.push(d.toString('hex'));up.write(d)});up.on('data',d=>{ss.push(d.toString('hex'));c.write(d)});
  const done=()=>{log('tcp',{conn:id,client:cs,server:ss})};c.on('close',()=>{up.destroy();done()});up.on('close',()=>c.destroy())}).listen(443,'127.0.0.1');
// ---- plain HTTP page server on 8080 ----
http.createServer((req,res)=>{log('page',{url:req.url,headers:req.rawHeaders});res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('page.html'))}).listen(8080,'127.0.0.1');
console.log('servers up');
