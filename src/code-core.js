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

  function fill(n, capacity, make) {
    const warnings = [];
    if (n > MAX) { warnings.push(`Capped at ${MAX.toLocaleString()} codes per batch.`); n = MAX; }
    if (n > capacity) { warnings.push(`Requested ${n.toLocaleString()} codes, but only ${capacity.toLocaleString()} unique codes are possible with these settings. Generating the maximum.`); n = capacity; }
    const set = new Set(), limit = Math.max(n * 5, n + 1000);
    let tries = 0;
    while (set.size < n && tries < limit) { set.add(make()); tries++; }
    if (set.size < n) warnings.push(`Only ${set.size.toLocaleString()} unique codes could be made in a reasonable number of attempts. Try a longer code or more character types.`);
    return { codes: [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), warnings };
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
    const cap = Math.pow(cs.length, len);
    return fill(n, cap, () => { let s = ""; for (let i = 0; i < len; i++) s += pick(cs); return s; });
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
    const cap = parts.reduce((a, x) => a * (x.set ? x.set.length : 1), 1);
    return fill(n, cap, () => parts.map(x => x.lit ?? pick(x.set)).join(""));
  }

  /* Matches the desktop export: header "Code", each code wrapped as ="CODE" so Excel keeps it as text. */
  function toCSV(codes) {
    const q = v => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    return ["Code", ...codes.map(c => q(`="${c}"`))].join("\r\n") + "\r\n";
  }
  return { random, pattern, toCSV, GUIDE, MAX };
})();
if (typeof module !== "undefined") module.exports = CodeCore;
