/* ShopWorks bulk order import: a line-for-line port of GUI_V2's app.py. */
const OrderCore = (() => {
  const TRANSLATION_TABLE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRs-VR8_PxTNo9kQpny0K9zjhJz347zUggBa6cDqQ6BYVFDNzoOyQZq2M3E15GMlDU0UeHts_Sr6NnJ/pub?output=csv";
  const CUSTOM_PACKAGE_ID = "23804";

  /* RFC 4180 CSV parser, matching Python's csv module for normal input. */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = []; let row = [], f = "", i = 0, q = false;
    while (i < text.length) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
        f += ch; i++; continue;
      }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === ",") { row.push(f); f = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        row.push(f); f = ""; rows.push(row); row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
        i++; continue;
      }
      f += ch; i++;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  /* Like csv.DictReader: first row is the header, blank lines skipped. */
  function dictRows(text) {
    const rows = parseCSV(text).filter(r => !(r.length === 1 && r[0] === "") && r.length);
    if (!rows.length) return { fields: [], data: [] };
    const fields = rows[0];
    const data = rows.slice(1).map(r => { const o = {}; fields.forEach((k, j) => { o[k] = r[j] ?? ""; }); return o; });
    return { fields, data };
  }
  const g = (row, k) => (row[k] ?? "");

  function parseTranslationTable(text) {
    const { fields, data } = dictRows(text);
    const req = ["Webstore Size", "sku_modifier", "size"];
    if (!req.every(c => fields.includes(c)))
      throw new Error(`Missing required columns in translation table CSV. Expected: ${req.join(", ")}. Found: ${fields.join(", ")}`);
    const table = {};
    for (const row of data) {
      const key = g(row, "Webstore Size").replaceAll("'", "").trim().toLowerCase();
      table[key] = { sku_modifier: g(row, "sku_modifier"), size_req_name: g(row, "size") };
    }
    return table;
  }

  function parseDesign(s) {
    if (!s || s.trim() === "") return null;
    const t = s.trim(), k = t.indexOf("-");
    const id = (k < 0 ? t : t.slice(0, k)).trim();
    const color = k < 0 ? null : t.slice(k + 1).trim();
    return id ? { id, color } : null;
  }
  function parseLocation(s) { const t = s.trim(); return t ? { id: "", name: t } : null; }
  function getPrice(p) {
    if (!p) return "0.00";
    const c = p.replaceAll("$", "").replaceAll("€", "").replaceAll("£", "").replaceAll("Â£", "").replaceAll(",", "").trim();
    if (c === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(c)) return "0.00";
    const x = Number(c);
    if (!isFinite(x)) return "0.00";
    /* Python rounds exact halves to even (0.125 -> 0.12); toFixed rounds them up. */
    const t3 = x.toFixed(3);
    if (/5$/.test(t3) && x.toFixed(20) === t3 + "0".repeat(17)) {
      const cents = Math.trunc(Math.abs(x) * 100);
      const r = (cents % 2 === 0 ? cents : cents + 1) / 100;
      return (x < 0 ? -r : r).toFixed(2);
    }
    return x.toFixed(2);
  }
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const sizeKey = j => `Size${pad(j)}_Req`;

  function groupOrders(data, table, customerPO, now, randInt) {
    const orders = new Map(), warnings = [];
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds() * 1000, 6)}`;
    const dateExt = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${pad(now.getFullYear() % 100)}`;
    data.forEach((row, idx) => {
      const line = idx + 2;
      const item = g(row, "Style").trim();
      const qtyRaw = g(row, "Quantity").trim();
      const orderType = g(row, "OrderType").trim();
      const priceRaw = g(row, "UnitPrice");
      if (!item) return;
      if (qtyRaw && /^\d+$/.test(qtyRaw) && parseInt(qtyRaw, 10) <= 0) return;
      if (!orderType) { warnings.push(`Row ${line}: skipped, no OrderType.`); return; }
      if (!/^\d+$/.test(qtyRaw)) { warnings.push(`Row ${line}: skipped, Quantity "${qtyRaw}" is not a whole number.`); return; }

      const keyParts = [orderType];
      for (let j = 1; j < 4; j++) {
        const d = parseDesign(g(row, "Design" + j)), l = parseLocation(g(row, "Location" + j));
        keyParts.push(d ? d.id : "", l ? l.name : "");
      }
      const key = JSON.stringify(keyParts);
      if (!orders.has(key)) orders.set(key, {
        ext_order_id: `${stamp}${randInt(1000, 9999)}`, date_external: dateExt, id_order_type: orderType,
        customer_purchase_order: customerPO.trim(), designs: [], products: new Map(), first_row: row
      });
      const o = orders.get(key);

      ["Design1", "Design2", "Design3"].forEach((df, fi) => {
        const d = parseDesign(g(row, df).trim());
        if (!d) return;
        const loc = g(row, "Location" + (fi + 1)).trim() || "N/A";
        const comp = { id: d.id, color: d.color || null, location_name: loc, design_index: fi };
        if (!o.designs.some(x => x.id === comp.id && x.location_name === comp.location_name)) o.designs.push(comp);
      });
      if (!o.designs.some(x => x.id === CUSTOM_PACKAGE_ID))
        o.designs.push({ id: CUSTOM_PACKAGE_ID, color: "ALL", location_name: "custom package", design_index: 99 });

      const partColor = g(row, "Color").trim() || "N/A";
      const price = getPrice(priceRaw);
      let part = item, sizeReq = null;
      const qty = parseInt(qtyRaw, 10);
      const sizeRaw = g(row, "Size").trim();
      if (sizeRaw) {
        const t = table[sizeRaw.replaceAll("'", "").toLowerCase()];
        if (t) {
          sizeReq = t.size_req_name;
          if (t.sku_modifier && t.sku_modifier.trim() !== "") part = `${part}${t.sku_modifier.trim()}`;
        } else {
          sizeReq = "Size01_Req";
          warnings.push(`Row ${line}: size "${sizeRaw}" isn't in the translation table, so it went to Size01_Req.`);
        }
      } else sizeReq = "Size01_Req";

      const pk = JSON.stringify([part, partColor, price]);
      if (!o.products.has(pk)) {
        const sizes = {}; for (let j = 1; j < 7; j++) sizes[sizeKey(j)] = 0;
        o.products.set(pk, { part_number: part, part_color: partColor, unit_price_user_entered: price, sizes });
      }
      if (!sizeReq) return;
      if (qty > 0) {
        const p = o.products.get(pk);
        if (!(sizeReq in p.sizes)) warnings.push(`Row ${line}: size slot "${sizeReq}" is outside Size01–Size06 and was left out.`);
        p.sizes[sizeReq] = (p.sizes[sizeReq] || 0) + qty;
      }
    });
    return { orders: [...orders.values()], warnings };
  }

  const ORDER = "---- Start Order ----\n\nExtOrderID: {ext_order_id} \nExtSource: {ext_source}\n\ndate_External: {date_external}\nid_OrderType: {id_order_type}\n\nCustomerPurchaseOrder: {customer_purchase_order}\nsts_CommishAllow: 1 \n\ndate_External: {date_external}\n\nNotesToArt: {notes_to_art}\nNotestoShipping:\n\n---- End Order ----\n";
  const CUSTOMER = "---- Start Customer ----\n\nid_Customer: {id_customer}\n\n---- End Customer ----\n";
  const DESIGN = "---- Start Design ----\n\nid_Design: {id_design}\n\n---- Start Location ----\n\nLocation: {location_name}\n\n{color_line}\n\n---- End Location ----\n\n---- End Design ----\n";
  const PRODUCT = "\n---- Start Product ----\n\nPartNumber: {part_number}\nPartColor: {part_color}\ncur_UnitPriceUserEntered: {unit_price_user_entered}\n\n{size_req_lines}\n\n---- End Product ----\n";
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));

  /* Returns { text (LF line endings), filename, orders, products, warnings }. */
  function convert(csvText, table, customerId, customerPO, extSource, now = new Date(),
                   randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1))) {
    const { data } = dictRows(csvText);
    const { orders, warnings } = groupOrders(data, table, customerPO, now, randInt);
    const out = []; let productCount = 0;
    orders.forEach((o, i) => {
      if (i > 0) out.push('\n"\n"\n\n\n');
      const notes = [];
      [["Design1", "Location1"], ["Design2", "Location2"], ["Design3", "Location3"]].forEach(([df, lf]) => {
        const d = g(o.first_row, df).trim(), l = g(o.first_row, lf).trim();
        if (d && l) notes.push(`${l}: ${d}`);
      });
      out.push(fill(ORDER, { ext_order_id: o.ext_order_id, ext_source: extSource, date_external: o.date_external,
        id_order_type: o.id_order_type, customer_purchase_order: customerPO, notes_to_art: notes.join(", ") }));
      out.push(fill(CUSTOMER, { id_customer: customerId }));
      const designs = o.designs.map((d, k) => [d, k]).sort((a, b) => {
        const ka = a[0].id !== CUSTOM_PACKAGE_ID ? (a[0].design_index ?? 99) : 99;
        const kb = b[0].id !== CUSTOM_PACKAGE_ID ? (b[0].design_index ?? 99) : 99;
        return ka - kb || a[1] - b[1];
      }).map(x => x[0]);
      for (const d of designs)
        out.push(fill(DESIGN, { id_design: d.id, location_name: d.location_name || "N/A", color_line: d.color ? `Color: ${d.color}` : "" }));
      const prods = [...o.products.values()].map((p, k) => [p, k])
        .sort((a, b) => (a[0].part_number < b[0].part_number ? -1 : a[0].part_number > b[0].part_number ? 1 : a[1] - b[1]))
        .map(x => x[0]);
      for (const p of prods) {
        const lines = [];
        for (let j = 1; j < 7; j++) { const q = p.sizes[sizeKey(j)] || 0; lines.push(q > 0 ? `${sizeKey(j)}: ${q}` : `${sizeKey(j)}: `); }
        out.push(fill(PRODUCT, { part_number: p.part_number, part_color: p.part_color, unit_price_user_entered: p.unit_price_user_entered, size_req_lines: lines.join("\n") }));
        productCount++;
      }
    });
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return { text: '"\n' + out.join("") + '"', filename: `${customerId}-${ts}.txt`, orders: orders.length, products: productCount, warnings, rows: data.length };
  }

  return { TRANSLATION_TABLE_URL, parseTranslationTable, convert, dictRows };
})();
if (typeof module !== "undefined") module.exports = OrderCore;
