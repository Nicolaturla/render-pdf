import express from "express";
import puppeteer from "puppeteer";
import { z } from "zod";
import pino from "pino";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

app.use(express.json({ limit: "10mb" }));

const SECRET = process.env.RENDER_PDF_TOKEN || "";
if (!SECRET) {
  logger.warn("Missing RENDER_PDF_TOKEN env var");
}

const bodySchema = z.object({
  html: z.string().min(1),
  options: z
    .object({
      format: z.string().default("A4"),
      margin: z
        .object({
          top: z.string().default("14mm"),
          right: z.string().default("14mm"),
          bottom: z.string().default("14mm"),
          left: z.string().default("14mm")
        })
        .partial()
        .default({}),
      printBackground: z.boolean().default(true),
      preferCSSPageSize: z.boolean().default(true),
      displayHeaderFooter: z.boolean().default(false),
      headerTemplate: z.string().optional(),
      footerTemplate: z.string().optional(),
      scale: z.number().min(0.5).max(2).optional()
    })
    .partial()
    .default({})
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

app.post("/render", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ") || auth.split(" ")[1] !== SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Bad request", details: parsed.error.flatten() });
    }
    const { html, options } = parsed.data;

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: options.format ?? "A4",
      margin: {
        top: options.margin?.top ?? "14mm",
        right: options.margin?.right ?? "14mm",
        bottom: options.margin?.bottom ?? "14mm",
        left: options.margin?.left ?? "14mm"
      },
      printBackground: options.printBackground ?? true,
      preferCSSPageSize: options.preferCSSPageSize ?? true,
      displayHeaderFooter: options.displayHeaderFooter ?? false,
      headerTemplate: options.headerTemplate,
      footerTemplate: options.footerTemplate,
      scale: options.scale
    });

    await page.close();
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(pdfBuffer);
  } catch (err) {
    logger.error({ err }, "Render error");
    res.status(500).json({ error: "Render failed" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => logger.info({ port }, "render-pdf listening"));
