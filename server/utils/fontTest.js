import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function testBiroFont() {
  const html = `
  <html>
    <head>
      <style>
        @font-face {
          font-family: 'BiroScript';
          src: url('file://${path.join(__dirname, "..", "fonts", "biro_script_plus.ttf")}') format('truetype');
        }
        body {
          font-family: 'BiroScript';
          font-size: 48px;
          margin: 40px;
        }
      </style>
    </head>
    <body>
      TEST BiroScript
    </body>
  </html>
  `;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true
  });

  await browser.close();
  return pdfBuffer;
}
