// Picks the input path out of trace.json (written by capture.js) and writes flow.json for the page.
//   node flow.js
// Every row is a real trace event (trace_id values are not copied: they exceed JavaScript's exact integer range); FunctionCall events (our listeners) are counted inside their EventDispatch.
const fs = require("fs");
const t = JSON.parse(fs.readFileSync(__dirname + "/trace.json"));
const ev = t.traceEvents || t, th = {}, pr = {};
ev.filter(e => e.ph === "M").forEach(e => { if (e.name === "thread_name") th[e.pid + ":" + e.tid] = e.args.name; if (e.name === "process_name") pr[e.pid] = e.args.name; });
const KEEP = new Set(["InputLatency::MouseDown", "InputLatency::MouseUp", "RenderWidgetHostImpl::ForwardMouseEvent", "InputRouterImpl::FilterAndSendWebInputEvent", "InputEventSentBlocking", "InputRouterImpl::MouseEventHandled",
  "WidgetInputHandlerImpl::DispatchEvent", "MainThreadEventQueue::HandleEvent", "WidgetInputHandlerManager::DidHandleInputEventSentToCompositor",
  "WidgetBaseInputHandler::OnHandleInputEvent", "WebFrameWidgetImpl::HandleInputEvent", "EventHandler::handleMousePressEvent", "EventHandler::handleMouseReleaseEvent", "HitTest", "EventDispatch", "WidgetInputHandlerManager::DidHandleInputEventSentToMain", "LatencyInfo.Flow"]);
const calls = ev.filter(e => e.name === "FunctionCall" && e.ph === "X");
// HitTest events outside input handling (Chrome also hit-tests for hover after a frame) are left out.
const handling = ev.filter(e => e.name === "WidgetBaseInputHandler::OnHandleInputEvent" && e.ph === "X");
const inHandling = e => handling.some(h => h.pid === e.pid && h.tid === e.tid && e.ts >= h.ts && e.ts <= h.ts + h.dur);
const rows = ev.filter(e => KEEP.has(e.name) && (e.ph === "X" || e.ph === "I" || e.ph === "i" || e.ph === "b") && (e.name !== "HitTest" || inHandling(e))).sort((a, b) => a.ts - b.ts);
const t0 = rows[0].ts;
const out = rows.map(e => {
  const a = e.args || {}, li = a.chrome_latency_info, d = a.data || a.endData || {};
  let detail = "";
  if (li) detail = (li.step ? li.step.replace(/^STEP_/, "") : "begins this input event's latency record") + (li.input_type ? " · " + li.input_type : "");
  else if (e.name === "EventDispatch") { const n = calls.filter(c => c.pid === e.pid && c.tid === e.tid && c.ts >= e.ts && c.ts + c.dur <= e.ts + e.dur).length; detail = "type: " + d.type + (n ? " · " + n + " listener call" + (n > 1 ? "s" : "") + " (FunctionCall)" : " · no listeners"); }
  else if (e.name === "HitTest") detail = "at (" + d.x + ", " + d.y + ") → " + d.nodeName + (d.move ? " · hover update" : "");
  else if (a.type) detail = "type: " + a.type;
  else if (a.x !== undefined) detail = "x: " + a.x + ", y: " + a.y;
  return { t: +((e.ts - t0) / 1000).toFixed(3), process: pr[e.pid] || String(e.pid), thread: th[e.pid + ":" + e.tid] || String(e.tid), name: e.name, dur: e.dur ? +(e.dur / 1000).toFixed(3) : 0, detail };
});
fs.writeFileSync(__dirname + "/flow.json", JSON.stringify({ chrome: "141.0.7390.37", note: "events from trace.json; t and dur in ms", events: out }, null, 1) + "\n");
console.log(out.length + " rows"); out.forEach(r => console.log(r.t.toFixed(2).padStart(7), (r.process + "/" + r.thread).padEnd(26), r.name.padEnd(46), r.dur, r.detail));
