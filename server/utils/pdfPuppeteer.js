import puppeteer from "puppeteer";

export async function createMultipleEnvelopes(recipients, template) {
  const { fields, font, mapping, format } = template;

  const pages = recipients
    .map((r) => {
      const out = fields
        .map((f) => {
          const map = mapping.find((m) => m.fieldId === f.id);
          const val = map ? r[map.columnName] || "" : "";

          return `<div style="
            position:absolute;
            left:${f.x}px;
            top:${f.y}px;
            font-size:${f.fontSize}px;
            font-family:'${font}';
          ">${val}</div>`;
        })
        .join("");

      const size =
        format === "C4"
          ? `width:324mm;height:229mm;`
          : `width:220mm;height:110mm;`;

      return `<div style="position:relative;${size}">${out}</div>`;
    })
    .join("");

  const html = `
  <html>
  <head>
  <style>
  @font-face {
    font-family:'LiebeHeide';
    src:url('file:///app/fonts/LiebeHeide-Color.otf');
  }
  @font-face {
    font-family:'BiroScript';
    src:url('file:///app/fonts/biro_script_plus.ttf');
  }
  body{margin:0;padding:0;}
  </style>
  </head>
  <body>${pages}</body></html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  const pdf = await page.pdf({ printBackground: true });

  await browser.close();
  return pdf;
}
