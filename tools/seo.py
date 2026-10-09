# Writes the search and social metadata block (between <!-- seo:start --> and <!-- seo:end -->) into
# every page's <head>, plus sitemap.xml, robots.txt and tools/og-pages.json for tools/make-og.js.
#   python3 tools/seo.py      (then: node tools/make-og.js to redraw the 1200x630 preview images)
# To add a page, add one entry to PAGES.
import re,json,html,datetime,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+"/"
BASE="https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/"
PAGES=[
 ("index.html","","home","Root to End: CS Concepts Traced to the Real Source Code",
  "Interactive simulations that trace computer science concepts from the kernel, compiler or engine up to the code we write, using real source code, verified simulators, quizzes and exam practice.",
  "Root to End","CS concepts traced from the kernel up to our code",["event loop","V8","LR parsing","threads"],None),
 ("js-event-loop/index.html","js-event-loop/","js-event-loop","JavaScript Event Loop from Chrome's Source: Tasks, Microtasks, Promises | Root to End",
  "How fetch().then() really runs in Chrome: the renderer thread, the line that starts the event loop, the kernel wait and V8's microtask queue, plus a playground that steps through our own async code and checks it against real V8.",
  "From the power button to .then()","The JavaScript event loop, traced through Chromium and V8",["RendererMain","MessagePumpDefault","microtasks","our callback"],["JavaScript event loop","microtasks","promises","async await","Chromium","V8"]),
 ("threads-vs-event-loop/index.html","threads-vs-event-loop/","threads-vs-event-loop","Threads vs Event Loop, Traced Through the Linux Kernel and glibc | Root to End",
  "Multi-threading versus event-driven concurrency from schedule(), clone flags, context_switch, futex mutexes and epoll, with a race-condition stepper, a one-core timeline simulator and exam practice.",
  "One core, two ways to wait","Threads vs the event loop, traced through Linux and glibc",["schedule()","clone","futex","epoll_wait"],["threads","event loop","epoll","futex","context switch","operating systems"]),
 ("v8-pipeline/index.html","v8-pipeline/","v8-pipeline","How V8 Compiles JavaScript: Parser, Ignition Bytecode, Inline Caches, TurboFan | Root to End",
  "Follow one JavaScript expression through V8's scanner, parser, Ignition bytecode and interpreter, then hidden classes, inline caches, tiering and deoptimization. The bytecode model matches Node's V8 exactly.",
  "How V8 turns a + b into machine code","V8's pipeline, from scanner to TurboFan and back",["scanner","Ignition","feedback","TurboFan"],["V8","JavaScript engine","bytecode","Ignition","TurboFan","JIT compiler"]),
 ("fetch-to-the-wire/index.html","fetch-to-the-wire/","fetch-to-the-wire","What fetch() Really Sends: DNS, TCP, TLS 1.3, HTTP and CORS in Chrome | Root to End",
  "One fetch('/api/users') traced through real Chromium: Blink, the network service, DNS, TCP, a post-quantum TLS 1.3 handshake, HTTP/1.1 and CORS, with real captured bytes, a NetLog replay and a CORS lab checked against Chrome.",
  "What fetch() really sends","DNS, TCP, TLS 1.3, HTTP and CORS, captured from real Chrome",["DNS","TCP","TLS 1.3","HTTP","CORS"],["fetch API","HTTP","CORS","TLS 1.3","DNS","TCP","Chrome network stack","web APIs"]),
 ("html-to-pixels/index.html","html-to-pixels/","html-to-pixels","From HTML Bytes to Pixels: Chrome's Parser, DOM, Style, Layout and Paint | Root to End",
  "How Chrome turns HTML bytes into a DOM and then pixels: a step-through HTML parser that matches Chrome on 8,929 distinct inputs, and real traces showing what a color, width or transform change costs.",
  "From HTML bytes to pixels","The HTML parser, the DOM, and the rendering lifecycle in Chrome",["tokenizer","tree builder","style","layout","paint"],["HTML parser","DOM","rendering pipeline","layout thrashing","reflow","repaint","compositing","Blink"]),
 ("lr-parser/index.html","lr-parser/","lr-parser","LR Parsing Step by Step: SLR Table Builder, Parse Trace and Bison | Root to End",
  "Type any grammar and watch an SLR parser get built: FIRST and FOLLOW, LR(0) item sets, the parsing table and a step-by-step parse with a growing tree, checked against the Dragon Book and real GNU Bison.",
  "Shift, reduce, accept","LR parsing from grammar to parse tree, with real Bison",["FIRST/FOLLOW","LR(0) items","SLR table","yyparse()"],["LR parsing","SLR parser","LALR","Bison","compiler design","parsing table"]),
 ("click-to-listener/index.html","click-to-listener/","click-to-listener","From a Click to Our Listener: Input, Hit Testing and Event Dispatch in Chrome | Root to End",
  "One mouse click traced from the USB report and the kernel through Chrome's browser process, compositor and main thread, hit testing and DOM event dispatch to our listener, with models checked against Chrome.",
  "From a click to our listener","Input, hit testing and event dispatch, traced through Linux and Chrome",["kernel","browser","hit test","dispatch","our listener"],["DOM events","event bubbling","event capturing","hit testing","z-index","stacking context","microtasks","input pipeline","Chrome"]),
 ("autograd/index.html","autograd/","autograd","From the Chain Rule to loss.backward(): How PyTorch Autograd Works | Root to End",
  "How loss.backward() works in PyTorch: the graph of Nodes recorded during the forward pass, the engine's dependency counts and ready queue, and AccumulateGrad, with a lab that matches real PyTorch node for node.",
  "From the chain rule to loss.backward()","PyTorch's autograd engine, from the chain rule to .grad",["chain rule","grad_fn graph","engine","AccumulateGrad",".grad"],["autograd","backpropagation","PyTorch","automatic differentiation","reverse mode","computational graph","gradient"]),
]
def head(path,url,slug,title,desc,kw):
    u=BASE+url; img=BASE+"assets/og/"+slug+".png"
    ld={"@context":"https://schema.org","@type":"WebSite" if not url else "LearningResource","name":title.split(" | ")[0],"description":desc,"url":u,"inLanguage":"en",
        "author":{"@type":"Person","name":"aksaN000","url":"https://github.com/aksaN000"}}
    if url:
        ld.update({"learningResourceType":["interactive simulation","explanation","practice questions"],"educationalLevel":"undergraduate","keywords":", ".join(kw),"isPartOf":{"@type":"WebSite","name":"Root to End","url":BASE},"isAccessibleForFree":True})
    E=html.escape
    return f'''<!-- seo:start -->
<link rel="canonical" href="{u}">
<meta property="og:type" content="{'website' if not url else 'article'}">
<meta property="og:site_name" content="Root to End">
<meta property="og:title" content="{E(title.split(' | ')[0])}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{u}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{E(title.split(' | ')[0])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{E(title.split(' | ')[0])}">
<meta name="twitter:description" content="{E(desc)}">
<meta name="twitter:image" content="{img}">
<meta name="theme-color" content="#2445d0">
<script type="application/ld+json">{json.dumps(ld,ensure_ascii=False)}</script>
<!-- seo:end -->
'''
for path,url,slug,title,desc,h,sub,chain,kw in PAGES:
    p=ROOT+path; s=open(p).read()
    s=re.sub(r"<!-- seo:start -->.*?<!-- seo:end -->\n","",s,flags=re.S)
    hs=s.index("</head>"); headpart=s[:hs]
    headpart=re.sub(r"<title>[^<]*</title>","<title>"+html.escape(title)+"</title>",headpart,count=1)
    if '<meta name="description"' in headpart:
        headpart=re.sub(r'<meta name="description" content="[^"]*">','<meta name="description" content="'+html.escape(desc)+'">',headpart,count=1)
    else:
        headpart=headpart.replace("</title>","</title>\n<meta name=\"description\" content=\""+html.escape(desc)+"\">",1)
    s=headpart+head(path,url,slug,title,desc,kw or [])+s[hs:]
    open(p,"w").write(s); print("seo",path)
today=datetime.date.today().isoformat()
open(ROOT+"sitemap.xml","w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+"".join(f"  <url><loc>{BASE+u}</loc><lastmod>{today}</lastmod></url>\n" for _,u,*r in PAGES)+"</urlset>\n")
open(ROOT+"robots.txt","w").write("User-agent: *\nAllow: /\n\nSitemap: "+BASE+"sitemap.xml\n")
json.dump([dict(slug=sl,h=h,sub=sub,chain=ch) for _,_,sl,_,_,h,sub,ch,_ in PAGES],open(ROOT+"tools/og-pages.json","w"),indent=1)
