/* Root to End: how npm and npx read a command line. Our own model, written to follow npm 10's code:
   the shell splits the line into words, npx rewrites its words into `npm exec`, nopt sorts options from
   positional words, cmd-list.js turns the first word into a command, and npm-package-arg reads each
   package spec (scope, name, and version, range or tag). The tables (commands, aliases, option types,
   shorthands) are npm's own, copied into npm-tables.js; the logic below is ours.
   Checked against the real npm in verify/compare-commands.js. Runs in the browser and in Node. */
(function (g) {
  "use strict";
  var T = (typeof module !== "undefined" && module.exports) ? require("./npm-tables.js") : g.NPM_TABLES;

  /* ---------- 1. The shell: split a line into words ---------- */
  // Spaces separate words; '…' keeps everything literally; "…" keeps spaces (and \" or \\ inside);
  // a backslash outside quotes keeps the next character. Real shells do more ($VAR, globs, |, &&);
  // the lab stops with a message if it sees those.
  function tokenize(line) {
    var words = [], cur = "", has = false, i = 0, c, q = null;
    line = String(line).replace(/^\s*\$\s+/, "");
    for (; i < line.length; i++) {
      c = line[i];
      if (q === "'") { if (c === "'") q = null; else cur += c; continue; }
      if (q === '"') {
        if (c === '"') q = null;
        else if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\" || line[i + 1] === "$" || line[i + 1] === "`")) { cur += line[++i]; }
        else if (c === "$" || c === "`") throw new Error("this lab does not expand $ or ` (the real shell would)");
        else cur += c;
        continue;
      }
      if (c === "'" || c === '"') { q = c; has = true; continue; }
      if (c === "\\") { if (i + 1 < line.length) { cur += line[++i]; has = true; } continue; }
      if (/\s/.test(c)) { if (has) { words.push(cur); cur = ""; has = false; } continue; }
      if (c === ">" || c === "<") throw new Error("the shell treats " + c + " as a redirect, so npm would never see it: >=4 sends npm's output to a file named =4. Put the word in quotes, like 'react@>=4'");
      if (/[|&;()$`]/.test(c)) throw new Error("this lab reads one command; the shell would treat " + c + " specially");
      if (/[*?\[\]{}]/.test(c) || (!has && (c === "~" || c === "#"))) throw new Error("this lab does not expand " + c + " (the real shell might); put the word in quotes");
      cur += c; has = true;
    }
    if (q) throw new Error("a quote was opened and never closed");
    if (has) words.push(cur);
    return words;
  }

  /* ---------- 2. abbrev: every unambiguous prefix of a word list (same algorithm as the abbrev package) ---------- */
  var abbrevCache = {};
  function abbrev(list, key) {
    if (key && abbrevCache[key]) return abbrevCache[key];
    list = list.slice().sort(function (a, b) { return a === b ? 0 : a > b ? 1 : -1; });
    var out = Object.create(null), prev = "";
    for (var i = 0; i < list.length; i++) {
      var cur = list[i], next = list[i + 1] || "", nm = true, pm = true, j = 0, cl = cur.length;
      if (cur === next) continue;
      for (; j < cl; j++) {
        var ch = cur.charAt(j); nm = nm && ch === next.charAt(j); pm = pm && ch === prev.charAt(j);
        if (!nm && !pm) { j++; break; }
      }
      prev = cur;
      if (j === cl) { out[cur] = cur; continue; }
      for (var a = cur.slice(0, j); j <= cl; j++) { out[a] = cur; a += cur.charAt(j); }
    }
    if (key) abbrevCache[key] = out;
    return out;
  }
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------- 3. nopt: options versus positional words ---------- */
  function typeOf(k) { if (!has(T.options, k)) return undefined; var t = T.options[k]; return Array.isArray(t) ? { f: t[0], lits: t[1] } : { f: t, lits: [] }; }
  function resolveShort(arg) {
    var abbrevs = abbrev(Object.keys(T.options), "opts"), sh = T.shorthands;
    arg = arg.replace(/^-+/, "");
    if (abbrevs[arg] === arg) return null;
    if (has(sh, arg)) return sh[arg];
    var singles = arg.split("").filter(function (c) { return has(sh, c) && c.length === 1; });
    if (arg.length && singles.join("") === arg) return [].concat.apply([], singles.map(function (c) { return sh[c]; }));
    if (abbrevs[arg] && !has(sh, arg)) return null;
    var sa = abbrev(Object.keys(sh), "short");
    if (sa[arg]) arg = sa[arg];
    return has(sh, arg) ? sh[arg] : undefined;
  }
  // Returns {data, remain, notes}: data = options set, remain = positional words, notes explain each step.
  function noptParse(args) {
    args = args.slice();
    var data = {}, remain = [], notes = [], abbrevs = abbrev(Object.keys(T.options), "opts");
    for (var i = 0; i < args.length; i++) {
      var arg = args[i], original = arg;
      if (/^-{2,}$/.test(arg)) {
        remain.push.apply(remain, args.slice(i + 1));
        notes.push({ word: arg, role: "end", text: "\"" + arg + "\" ends npm's options: every word after it is passed on untouched" });
        break;
      }
      var hadEq = false;
      if (arg.charAt(0) === "-" && arg.length > 1) {
        var at = arg.indexOf("=");
        if (at > -1) { hadEq = true; var v0 = arg.slice(at + 1); arg = arg.slice(0, at); args.splice(i, 1, arg, v0); }
        var sh = resolveShort(arg);
        if (sh) {
          args.splice.apply(args, [i, 1].concat(sh));
          if (arg !== sh[0]) { notes.push({ word: arg, role: "short", text: arg + " is short for " + sh.join(" ") }); i--; continue; }
        }
        arg = arg.replace(/^-+/, "");
        var no = null;
        while (arg.toLowerCase().indexOf("no-") === 0) { no = !no; arg = arg.slice(3); }
        if (abbrevs[arg] && abbrevs[arg] !== arg) { notes.push({ word: "--" + arg, role: "abbrev", text: "--" + arg + " is an abbreviation npm accepts for --" + abbrevs[arg] }); arg = abbrevs[arg]; }
        var ty = typeOf(arg), f = ty ? ty.f : "", lits = ty ? ty.lits : [];
        var isArr = /A/.test(f);
        if (!ty && has(data, arg)) { if (!Array.isArray(data[arg])) data[arg] = [data[arg]]; isArr = true; }
        var la = args[i + 1], val;
        // nopt treats any type list that contains Boolean as a switch; an unknown option is a switch too
        var isBool = typeof no === "boolean" || /B/.test(f) || (!ty && !hadEq) || (la === "false" && /0/.test(f));
        var multi = ty && (f.length + lits.length > 1);
        if (isBool) {
          val = !no;
          if (la === "true" || la === "false") { val = JSON.parse(la); la = null; if (no) val = !val; i++; }
          if (multi && la) {
            if (lits.indexOf(la) >= 0) { val = la; i++; }
            else if (la === "null" && /0/.test(f)) { val = null; i++; }
            else if (!/^-{2,}[^-]/.test(la) && !isNaN(la) && /N/.test(f)) { val = +la; i++; }
            else if (!/^-[^-]/.test(la) && /S/.test(f)) { val = la; i++; }
          }
          if (isArr) (data[arg] = data[arg] || []).push(val); else data[arg] = val;
          notes.push({ word: original, role: "option", key: arg, known: !!ty, text: !ty ? "npm does not know --" + arg + ": it is stored as an npm setting (" + arg + " = " + JSON.stringify(val) + ") and is not passed on" : "sets npm's " + arg + " to " + JSON.stringify(val) });
          continue;
        }
        if (f === "S" && !lits.length) { // a plain String option does not swallow a following -flag
          if (la === undefined) la = "";
          else if (/^-{1,2}[^-]+/.test(la)) { la = ""; i--; }
        }
        if (la && /^-{2,}$/.test(la)) { la = undefined; i--; }
        val = la === undefined ? true : la;
        if (isArr) (data[arg] = data[arg] || []).push(val); else data[arg] = val;
        notes.push({ word: original, role: "option", key: arg, known: !!ty, value: val, text: (ty ? "sets npm's " + arg : "stores an npm setting " + arg) + " to " + JSON.stringify(val) + (hadEq ? "" : " (the next word is its value)") });
        i++;
        continue;
      }
      remain.push(arg);
    }
    return { data: data, remain: remain, notes: notes };
  }

  /* ---------- 4. cmd-list.js: the first word becomes a command ---------- */
  function deref(c) {
    if (!c) return undefined;
    if (/[A-Z]/.test(c)) c = c.replace(/([A-Z])/g, function (m) { return "-" + m.toLowerCase(); });
    if (T.commands.indexOf(c) >= 0) return c;
    if (has(T.aliases, c)) return T.aliases[c];
    var ab = abbrev(T.commands.concat(Object.keys(T.aliases)), "cmds"), a = ab[c];
    while (a !== undefined && has(T.aliases, a)) a = T.aliases[a];
    return a;
  }

  /* ---------- 5. npx-cli.js: npx X … is npm exec -- X … ---------- */
  var npxSwitchExtra = ["always-spawn", "ignore-existing", "shell-auto-fallback", "no-install", "quiet", "q", "version", "v", "help", "h"];
  var npxOpts = ["npm", "node-arg", "n", "package", "p", "cache", "userconfig", "call", "c", "shell"];
  var npxRemoved = ["always-spawn", "ignore-existing", "shell-auto-fallback", "npm", "node-arg", "n"];
  function isSwitch(k) { if (npxSwitchExtra.indexOf(k) >= 0) return true; var t = typeOf(k); return !!t && /B/.test(t.f); }
  function npxRewrite(args) {
    var a = ["exec"].concat(args), i, notes = [];
    for (i = 1; i < a.length; i++) {
      var arg = a[i];
      if (arg === "--") break;
      if (/^-/.test(arg)) {
        var parts = arg.replace(/^-+/, "").split("="), key = parts[0], v = parts.slice(1);
        if (key === "p") a[i] = ["--package"].concat(v).join("=");
        else if (key === "shell") a[i] = ["--script-shell"].concat(v).join("=");
        else if (key === "no-install") a[i] = "--yes=false";
        else if (has(T.shorthands, key) && npxRemoved.indexOf(key) < 0) { var s = T.shorthands[key].slice(); if (v.length) s.push(v.join("=")); a.splice.apply(a, [i, 1].concat(s)); i--; continue; }
        if (npxRemoved.indexOf(key) >= 0) { notes.push("npx: the --" + key + " argument has been removed"); a.splice(i, 1); i--; }
        if (v.length === 0 && !isSwitch(key) && (npxOpts.indexOf(key) >= 0 || !/^-/.test(a[i + 1]))) {
          if (npxRemoved.indexOf(key) >= 0) a.splice(i + 1, 1); else i++;
        }
      } else { a.splice(i, 0, "--"); break; }
    }
    return { argv: a, notes: notes };
  }

  /* ---------- 6. semver (loose mode): is a spec a version, a range, or neither? ---------- */
  var NUML = "\\d+", NONNUM = "\\d*[a-zA-Z-][a-zA-Z0-9-]*", PREIDL = "(?:" + NONNUM + "|" + NUML + ")";
  var PREL = "(?:-?(" + PREIDL + "(?:\\." + PREIDL + ")*))", BUILD = "(?:\\+([a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*))";
  var MAINL = "(" + NUML + ")\\.(" + NUML + ")\\.(" + NUML + ")";
  var LOOSEPLAIN = "[v=\\s]*" + MAINL + PREL + "?" + BUILD + "?";
  var XRL = NUML + "|x|X|\\*", XRPL = "[v=\\s]*(" + XRL + ")(?:\\.(" + XRL + ")(?:\\.(" + XRL + ")(?:" + PREL + ")?" + BUILD + "?)?)?";
  var GTLT = "((?:<|>)?=?)";
  var RE = {
    loose: new RegExp("^" + LOOSEPLAIN + "$"),
    xrange: new RegExp("^" + GTLT + "\\s*" + XRPL + "$"),
    tilde: new RegExp("^(?:~>?)" + XRPL + "$"),
    caret: new RegExp("^(?:\\^)" + XRPL + "$"),
    comparator: new RegExp("^" + GTLT + "\\s*(" + LOOSEPLAIN + ")$|^$"),
    compTrim: new RegExp("(\\s*)" + GTLT + "\\s*(" + LOOSEPLAIN + "|" + XRPL + ")", "g"),
    tildeTrim: /(\s*)(?:~>?)\s+/g, caretTrim: /(\s*)(?:\^)\s+/g,
    hyphen: new RegExp("^\\s*(" + XRPL + ")\\s+-\\s+(" + XRPL + ")\\s*$"),
    star: /(<|>)?=?\s*\*/
  };
  var MAXINT = 9007199254740991;
  function validVersion(s) {
    if (typeof s !== "string" || s.length > 256) return false;
    var m = s.trim().match(RE.loose);
    if (!m) return false;
    for (var k = 1; k <= 3; k++) if (+m[k] > MAXINT) return false;
    return true;
  }
  function tokenValid(tok) {
    if (RE.caret.test(tok) || RE.tilde.test(tok) || RE.xrange.test(tok)) return true;
    return RE.comparator.test(tok.trim().replace(RE.star, ""));
  }
  function validRange(s) {
    var raw = s.trim().replace(/\s+/g, " ");
    var sets = raw.split("||").map(function (r) {
      r = r.trim();
      if (RE.hyphen.test(r)) return 1;
      r = r.replace(RE.compTrim, "$1$2$3").replace(RE.tildeTrim, "$1~").replace(RE.caretTrim, "$1^");
      return r.split(" ").filter(tokenValid).length;
    });
    return sets.some(function (n) { return n > 0; });
  }

  /* ---------- 7. validate-npm-package-name ---------- */
  var BUILTINS = ["assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib"];
  function validateName(name) {
    var errors = [], warnings = [];
    if (!name.length) errors.push("name length must be greater than zero");
    if (name.charAt(0) === ".") errors.push("name cannot start with a period");
    if (/^_/.test(name)) errors.push("name cannot start with an underscore");
    if (name.trim() !== name) errors.push("name cannot contain leading or trailing spaces");
    ["node_modules", "favicon.ico"].forEach(function (b) { if (name.toLowerCase() === b) errors.push(b + " is a blacklisted name"); });
    if (BUILTINS.indexOf(name.toLowerCase()) >= 0) warnings.push(name + " is a core module name");
    if (name.length > 214) warnings.push("name can no longer contain more than 214 characters");
    if (name.toLowerCase() !== name) warnings.push("name can no longer contain capital letters");
    if (/[~'!()*]/.test(name.split("/").slice(-1)[0])) warnings.push("name can no longer contain special characters (\"~'!()*\")");
    if (encodeURIComponent(name) !== name) {
      var m = name.match(/^(?:@([^/]+?)[/])?([^/]+?)$/), ok = false;
      if (m) {
        if (m[2].charAt(0) === ".") errors.push("name cannot start with a period");
        if (m[1] !== undefined && encodeURIComponent(m[1]) === m[1] && encodeURIComponent(m[2]) === m[2]) ok = true;
      }
      if (!ok) errors.push("name can only contain URL-friendly characters");
    }
    return { oldOk: errors.length === 0, newOk: errors.length === 0 && warnings.length === 0, errors: errors, warnings: warnings };
  }

  /* ---------- 8. npm-package-arg: one package spec ---------- */
  var isURL = /^(?:git[+])?[a-z]+:/i, isGit = /^[^@]+@[^:.]+\.[^:]+:.+$/i, isFileType = /[.](?:tgz|tar.gz|tar)$/i;
  var HOSTS = /^(github|gitlab|bitbucket|gist|sourcehut):/i;
  function looksHosted(spec) {
    if (HOSTS.test(spec)) return true;
    if (/^git\+https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\//i.test(spec)) return true;
    if (/^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/#]+?(\.git)?(#.*)?$/i.test(spec)) return true;
    return /^[^:@%/\s.][^:@%/\s]*\/[^:@%/\s]+?(#.*)?$/.test(spec) && !isFileType.test(spec.split("#")[0]);
  }
  function npa(arg) {
    var name, spec, nameEndsAt = arg.indexOf("@", 1), namePart = nameEndsAt > 0 ? arg.slice(0, nameEndsAt) : arg;
    if (isURL.test(arg)) spec = arg;
    else if (isGit.test(arg)) spec = "git+ssh://" + arg;
    else if (namePart.charAt(0) !== "@" && (/[/]/.test(namePart) || isFileType.test(namePart))) spec = arg;
    else if (nameEndsAt > 0) { name = namePart; spec = arg.slice(nameEndsAt + 1) || "*"; }
    else if (validateName(arg).oldOk) { name = arg; spec = "*"; }
    else spec = arg;
    return resolveSpec(name, spec, arg);
  }
  function resolveSpec(name, spec, raw) {
    var r = { raw: raw, name: undefined, scope: undefined, rawSpec: spec || "", type: undefined };
    if (name !== undefined) {
      var v = validateName(name);
      if (!v.oldOk) return { raw: raw, error: "EINVALIDPACKAGENAME", message: "Invalid package name \"" + name + "\": " + v.errors.join("; ") };
      r.name = name; r.scope = name.charAt(0) === "@" ? name.slice(0, name.indexOf("/")) : undefined;
      r.warnings = v.warnings;
    }
    var s = r.rawSpec;
    if (/^file:/i.test(s) || /^(?:[.]|~[/]|[/]|[a-zA-Z]:)/.test(s)) { r.type = isFileType.test(s) ? "file" : "directory"; return r; }
    if (/^npm:/i.test(s)) {
      var sub = npa(s.slice(4));
      if (sub.error) return sub;
      if (sub.type === "alias") return { raw: raw, error: "ENESTEDALIAS", message: "nested aliases not supported" };
      if (!sub.registry) return { raw: raw, error: "EALIASREGISTRY", message: "aliases only work for registry deps" };
      if (!sub.name) return { raw: raw, error: "EALIASNAME", message: "aliases must have a name" };
      r.type = "alias"; r.registry = true; r.subSpec = sub; return r;
    }
    if (looksHosted(s)) { r.type = "git"; return r; }
    if (s && isURL.test(s)) { r.type = /^git[+:]/i.test(s) ? "git" : "remote"; return r; }
    if (s && (/[/]/.test(s) || isFileType.test(s))) { r.type = isFileType.test(s) ? "file" : "directory"; return r; }
    r.registry = true;
    var t = s.trim();
    if (validVersion(t)) r.type = "version";
    else if (validRange(t)) r.type = "range";
    else if (encodeURIComponent(t) !== t) return { raw: raw, error: "EINVALIDTAGNAME", message: "Invalid tag name \"" + t + "\": tags may not have any characters that encodeURIComponent encodes" };
    else r.type = "tag";
    r.fetchSpec = t;
    return r;
  }

  /* ---------- 9. Putting it together, with plain-words notes ---------- */
  var SPEC_COMMANDS = ["install", "uninstall", "update", "exec", "view", "ci", "install-test", "install-ci-test", "outdated", "ls", "explain", "docs", "repo", "bugs", "dedupe"];
  var WHAT = {
    install: "download packages into node_modules and record them in package.json",
    uninstall: "remove packages from node_modules and package.json",
    "run-script": "run a script from package.json's \"scripts\"",
    exec: "run a command from a package (installed here, or downloaded for this run)",
    init: "create a project: npm init <name> runs the package create-<name> with npm exec",
    ls: "list installed packages", view: "ask the registry about a package", test: "run the \"test\" script", start: "run the \"start\" script",
    update: "update packages within their ranges", ci: "a clean install exactly from package-lock.json", explain: "explain why a package is installed",
    help: "show npm's help", config: "read or change npm's settings", publish: "upload this package to the registry", version: "change this package's version"
  };
  function describeSpec(p) {
    if (p.error) return p.message;
    var who = p.scope ? "the package " + p.name + ", in the scope " + p.scope + " (only " + p.scope.slice(1) + " can publish under it)" : p.name ? "the package " + p.name : "";
    switch (p.type) {
      case "version": return who + ", exactly version " + p.fetchSpec;
      case "range": return who + ", the newest version matching the range " + JSON.stringify(p.fetchSpec) + (p.fetchSpec === "*" ? " (no version given: any version, so the latest)" : "");
      case "tag": return who + ", whatever version the tag \"" + p.fetchSpec + "\" points to in the registry";
      case "alias": return "installed under the name " + p.name + ", but really " + describeSpec(p.subSpec);
      case "git": return "a git repository (" + p.rawSpec + "), not the registry";
      case "remote": return "a tarball downloaded from a URL";
      case "file": return "a local tarball file";
      case "directory": return "a local folder";
    }
    return "";
  }
  function readNpm(words, viaNpx) {
    var res = { program: viaNpx ? "npx" : "npm", words: words, notes: [] };
    var argv = words.slice(1);
    if (viaNpx) { var rw = npxRewrite(argv); res.npxArgv = rw.argv; argv = rw.argv; res.notes = res.notes.concat(rw.notes); }
    var p = noptParse(argv);
    res.options = p.data; res.remain = p.remain; res.optionNotes = p.notes;
    res.typed = p.remain[0]; res.command = deref(p.remain[0]); res.args = p.remain.slice(1);
    if (res.typed === undefined) { res.summary = "no command: npm prints its usage"; return res; }
    if (res.command === undefined) { res.summary = "npm has no command \"" + res.typed + "\" (it would suggest the closest one)"; return res; }
    res.summary = WHAT[res.command] || "the npm command " + res.command;
    if (res.command === "init" && res.args[0] && !/^-/.test(res.args[0])) {
      var first = res.args[0], q = npa(first);
      if (!q.error && q.name !== undefined) res.initPackage = q.name.replace(/^(@[^/]+\/)?/, "$1create-") + "@" + q.rawSpec;
    }
    if (res.command === "run-script") { res.script = res.args[0]; res.scriptArgs = res.args.slice(1); }
    if (res.command === "exec") { res.execCommand = res.args[0]; res.execArgs = res.args.slice(1); }
    if (SPEC_COMMANDS.indexOf(res.command) >= 0) {
      var list = res.command === "exec" ? [] : res.args;
      if (res.command === "exec" && res.options["package"]) list = [].concat(res.options["package"]);
      res.specs = list.map(function (a) { var r = npa(a); r.text = describeSpec(r); return r; });
      if (res.command === "exec" && res.args[0]) { var e = npa(res.args[0]); e.text = describeSpec(e); res.execSpec = e; }
    }
    var save = res.options;
    if (res.command === "install") {
      res.saveTo = save.global ? "nowhere in this project: installed for the whole computer (-g)" : save["save-dev"] ? "devDependencies (needed only while developing)" : save["save-optional"] ? "optionalDependencies" : save["save-peer"] ? "peerDependencies" : save.save === false ? "not saved to package.json (--no-save)" : res.args.length ? "dependencies" : "nothing new: installs what package.json already lists";
      if (save["save-exact"]) res.saveTo += ", with the exact version (no ^)";
    }
    return res;
  }
  function readNode(words) {
    var res = { program: "node", words: words, options: [], checked: false };
    for (var i = 1; i < words.length; i++) {
      var w = words[i];
      if (w === "-e" || w === "--eval" || w === "-p" || w === "--print") { res.options.push(w); res.code = words[i + 1]; res.rest = words.slice(i + 2); res.summary = (w === "-p" || w === "--print" ? "evaluate and print" : "run") + " the JavaScript given as text"; return res; }
      if (/^-/.test(w)) { res.options.push(w); if (w === "--version" || w === "-v") res.summary = "print Node's version"; continue; }
      res.script = w; res.rest = words.slice(i + 1); res.summary = "run the file " + w + " with Node" + (res.rest.length ? "; the words after it reach the script as process.argv" : ""); return res;
    }
    if (!res.summary) res.summary = "start Node's interactive prompt (the REPL)";
    return res;
  }
  function readGit(words) {
    var res = { program: "git", words: words, checked: false, options: [] }, i = 1;
    for (; i < words.length && /^-/.test(words[i]); i++) res.options.push(words[i]);
    res.subcommand = words[i]; res.args = words.slice(i + 1);
    var S = { init: "start tracking this folder", add: "stage changes for the next commit", commit: "save the staged changes as a commit", push: "upload commits to a remote", pull: "download and merge commits", status: "show what changed", clone: "copy a repository", log: "show commit history", remote: "manage remotes", branch: "list or rename branches", checkout: "switch branches", switch: "switch branches" };
    res.summary = res.subcommand ? (S[res.subcommand] || "the git command " + res.subcommand) : "git with no command prints its help";
    return res;
  }
  function read(line) {
    var words = tokenize(line);
    if (!words.length) return { empty: true, words: [] };
    var prog = words[0];
    if (prog === "npm") return readNpm(words, false);
    if (prog === "npx") return readNpm(words, true);
    if (prog === "node") return readNode(words);
    if (prog === "git") return readGit(words);
    return { program: prog, words: words, unknown: true, summary: "this lab reads npm, npx, node and git commands" };
  }
  // Two command lines mean the same if npm would run the same command, with the same arguments and the
  // same settings. Used by the recall drill to accept `npm i -D x` for `npm install --save-dev x`.
  function same(a, b) {
    try { var A = read(a), B = read(b); } catch (e) { return false; }
    if (A.program === "npx") A.program = "npm"; if (B.program === "npx") B.program = "npm";
    if (A.program !== B.program) return false;
    if (A.program === "npm") return A.command === B.command && JSON.stringify(A.args) === JSON.stringify(B.args) && JSON.stringify(sortKeys(A.options)) === JSON.stringify(sortKeys(B.options));
    return JSON.stringify(A.words) === JSON.stringify(B.words);
  }
  function sortKeys(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  var API = { tokenize: tokenize, abbrev: abbrev, noptParse: noptParse, deref: deref, npxRewrite: npxRewrite, validVersion: validVersion, validRange: validRange, validateName: validateName, npa: npa, read: read, same: same, tables: T,
    PRESETS: [
      ["Create the project", "npm create vite@latest dev-stack -- --template react-ts"],
      ["…without the --", "npm create vite@latest dev-stack --template react-ts"],
      ["Install everything", "npm install"],
      ["Add Tailwind", "npm install tailwindcss @tailwindcss/vite daisyui"],
      ["The missing space", "npm install tailwindcss @tailwindcss/vite@latest/daisyui@latest"],
      ["Dev dependency", "npm i -D typescript"],
      ["Exact version", "npm install react-toastify@11.0.5 --save-exact"],
      ["Run a script", "npm run dev"],
      ["npx", "npx tsc --noEmit"],
      ["Short and glued", "npm i -gD some-tool"],
      ["An alias", "npm install my-react@npm:react@19"],
      ["Node runs a file", "node hello.js --name Aksan"],
      ["git", "git commit -m \"Style Navbar with Tailwind\""]
    ] };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else g.CommandModel = API;
})(this);
