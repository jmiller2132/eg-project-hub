/* Random Code Generator: a port of randomcodegenerator.py. */
const CodeCore = (() => {
  const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LO = "abcdefghijklmnopqrstuvwxyz", DIG = "0123456789";
  const SPECIAL = "!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~";
  const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"; /* Python string.punctuation */
  const BRACKETS = "[](){}<>";
  const CLASSES = {
    X: UP, x: LO, "9": DIG, A: UP + DIG, a: LO + DIG, "#": SPECIAL, "!": PUNCT, "[": BRACKETS,
    v: "aeiou", V: "AEIOU", c: "bcdfghjklmnpqrstvwxyz", C: "BCDFGHJKLMNPQRSTVWXYZ",
    "?": UP + LO + DIG + SPECIAL + "[](){}<> "
  };
  const GUIDE = [["X","Uppercase"],["x","Lowercase"],["9","Digits"],["A","Uppercase + digits"],["a","Lowercase + digits"],["#","Special characters"],["!","Punctuation"],["[","Brackets"],["v","Vowels"],["V","Uppercase vowels"],["c","Consonants"],["C","Uppercase consonants"],["?","Any character"],["/","Escape: /X gives a literal X"]];
  const MAX = 100000;

  const uniq = s => [...new Set(s)].join("");
  const without = (s, ex) => [...s].filter(c => !ex.includes(c)).join("");

  /* Unbiased random index using the browser's crypto RNG. */
  function rnd(n) {
    const c = globalThis.crypto;
    if (!c) return Math.floor(Math.random() * n);
    const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
    do c.getRandomValues(b); while (b[0] >= lim);
    return b[0] % n;
  }
  const pick = s => s[rnd(s.length)];

  function parseCount(v, label) {
    if (!/^\s*\+?\d+\s*$/.test(String(v))) throw new Error(`${label} must be a positive whole number.`);
    const n = parseInt(v, 10);
    if (n <= 0) throw new Error(`${label} must be greater than zero.`);
    return n;
  }

  function fill(n, capacity, make, avoid) {
    const warnings = []; let replaced = 0;
    if (n > MAX) { warnings.push(`Capped at ${MAX.toLocaleString()} codes per batch.`); n = MAX; }
    if (n > capacity) { warnings.push(`Requested ${n.toLocaleString()} codes, but only ${capacity.toLocaleString()} unique codes are possible with these settings. Generating the maximum.`); n = capacity; }
    const set = new Set(), limit = Math.max(n * 5, n + 1000);
    let tries = 0;
    while (set.size < n && tries < limit) {
      const c = make(); tries++;
      if (avoid && avoid.has(c)) { replaced++; continue; }
      set.add(c);
    }
    if (set.size < n) warnings.push(`Only ${set.size.toLocaleString()} unique codes could be made in a reasonable number of attempts. Try a longer code or more character types.`);
    return { codes: [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), warnings, replaced };
  }

  /* opts: {count, length, upper, lower, digits, special, punctuation, brackets, space, exclude} */
  function random(opts) {
    const n = parseCount(opts.count, "Number of codes"), len = parseCount(opts.length, "Code length");
    let cs = "";
    if (opts.upper) cs += UP; if (opts.lower) cs += LO; if (opts.digits) cs += DIG;
    if (opts.special) cs += SPECIAL; if (opts.punctuation) cs += PUNCT;
    if (opts.brackets) cs += BRACKETS; if (opts.space) cs += " ";
    cs = without(uniq(cs), opts.exclude || "");
    if (!cs) throw new Error("The selected character types minus the excluded characters leave nothing to build codes from. Adjust your selections.");
    const avoid = opts.avoid && opts.avoid.size ? opts.avoid : null;
    let cap = Math.pow(cs.length, len);
    if (avoid) for (const c of avoid) if (c.length === len && [...c].every(ch => cs.includes(ch))) cap--;
    return fill(n, cap, () => { let s = ""; for (let i = 0; i < len; i++) s += pick(cs); return s; }, avoid);
  }

  /* opts: {count, pattern, exclude} */
  function pattern(opts) {
    const n = parseCount(opts.count, "Number of codes"), p = opts.pattern || "";
    if (!p) throw new Error("Enter a pattern, e.g. X9x.");
    if (p.startsWith("=")) throw new Error("The pattern can't start with = (Excel would read it as a formula).");
    const parts = [];
    for (let i = 0; i < p.length; i++) {
      if (p[i] === "/") { parts.push({ lit: i + 1 < p.length ? p[++i] : "/" }); continue; }
      const cls = CLASSES[p[i]];
      if (cls === undefined) { parts.push({ lit: p[i] }); continue; }
      const set = without(cls, opts.exclude || "");
      if (!set) throw new Error(`Pattern character "${p[i]}" has nothing left after exclusions.`);
      parts.push({ set });
    }
    const avoid = opts.avoid && opts.avoid.size ? opts.avoid : null;
    let cap = parts.reduce((a, x) => a * (x.set ? x.set.length : 1), 1);
    if (avoid) for (const c of avoid)
      if (c.length === parts.length && parts.every((x, i) => x.lit !== undefined ? c[i] === x.lit : x.set.includes(c[i]))) cap--;
    return fill(n, cap, () => parts.map(x => x.lit ?? pick(x.set)).join(""), avoid);
  }

  /* Reads codes from an earlier export or list. TXT: one code per line. CSV: if a column
     is headed "Code", only that column is read; otherwise every cell. Our ="CODE" wrapper is removed. */
  function parsePrevious(text, filename) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    let rows = [];
    if (/\.txt$/i.test(filename || "")) rows = text.split(/\r?\n/).map(l => [l]);
    else {
      let row = [], f = "", q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
        if (ch === '"') q = true;
        else if (ch === ",") { row.push(f); f = ""; }
        else if (ch === "\n" || ch === "\r") { row.push(f); f = ""; rows.push(row); row = []; if (ch === "\r" && text[i + 1] === "\n") i++; }
        else f += ch;
      }
      if (f !== "" || row.length) { row.push(f); rows.push(row); }
    }
    const clean = c => { c = (c || "").trim(); const m = c.match(/^="(.*)"$/); return m ? m[1] : c; };
    const head = (rows[0] || []).map(c => clean(c).toLowerCase());
    const col = head.indexOf("code");
    const cells = col >= 0 ? rows.slice(1).map(r => r[col]) : rows.flat();
    return cells.map(clean).filter(c => c && c.toLowerCase() !== "code");
  }

  /* Matches the desktop export: header "Code", each code wrapped as ="CODE" so Excel keeps it as text. */
  function toCSV(codes) {
    const q = v => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    return ["Code", ...codes.map(c => q(`="${c}"`))].join("\r\n") + "\r\n";
  }
  return { random, pattern, toCSV, parsePrevious, GUIDE, MAX };
})();
if (typeof module !== "undefined") module.exports = CodeCore;
