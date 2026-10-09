// Shared by the verify scripts: writes validation/results/<id>.json (the latest run) and,
// when anything failed, validation/failures/<id>.json with the failing inputs so they can be
// replayed. tools/make-validation.js turns the results into VALIDATION.md.
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(__dirname, "..");
function report(id, r) {
  if (process.env.RK_NO_REPORT) return; // quick runs (npm run test:quick) do not overwrite the full results
  const dir = path.join(ROOT, "validation", "results");
  fs.mkdirSync(dir, { recursive: true });
  const out = Object.assign({ id: id, date: new Date().toISOString(), platform: os.platform() + " " + os.release() + " " + os.arch(), node: process.versions.node, v8: process.versions.v8 }, r);
  const failures = out.failures || []; delete out.failures;
  out.failureCount = failures.length;
  fs.writeFileSync(path.join(dir, id + ".json"), JSON.stringify(out, null, 1) + "\n");
  const fdir = path.join(ROOT, "validation", "failures"), ff = path.join(fdir, id + ".json");
  if (failures.length) { fs.mkdirSync(fdir, { recursive: true }); fs.writeFileSync(ff, JSON.stringify({ id: id, date: out.date, failures: failures }, null, 1) + "\n"); }
  else if (fs.existsSync(ff)) fs.unlinkSync(ff);
}
module.exports = report;
