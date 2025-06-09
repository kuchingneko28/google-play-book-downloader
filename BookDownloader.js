const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const chalk = require("chalk");

class BookDownloader {
  constructor(bookId) {
    this.bookId = bookId;
    this.tempDir = path.join(__dirname, "/temp");
    this.bookTempDir = path.join(this.tempDir, this.bookId);
    if (!fs.existsSync(this.bookTempDir)) fs.mkdirSync(this.bookTempDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir);
  }

  getHeadersFromCookies() {
    const cookiePath = path.join(__dirname, "cookies.txt");
    const cookieData = fs.readFileSync(cookiePath, "utf-8");

    const cookies = cookieData
      .split("\n")
      .filter((line) => {
        return line.trim() && !line.startsWith("#") && line.split("\t").length >= 7;
      })
      .map((line) => {
        const parts = line.split("\t");
        const name = parts[5]?.trim();
        const value = parts[6]?.trim();

        if (!/^[\x20-\x7E]+$/.test(name) || !/^[\x20-\x7E]+$/.test(value)) return null;

        return `${name}=${value}`;
      })
      .filter(Boolean);

    return {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      referer: "https://play.google.com/books",
      cookie: cookies.join("; "),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    };
  }

  async getBookHtml() {
    const res = await axios.get(`https://play.google.com/books/reader?id=${this.bookId}&hl=en`, {
      headers: this.getHeadersFromCookies(),
    });

    return res.data;
  }

  extractKey(html) {
    const match = html.match(/<body[\s\S]*?<[^>]+src\s*=\s*["']data:.*?base64,([^"']+)["']/);
    const raw = Buffer.from(match[1], "base64").toString();
    return this.generateKey(raw);
  }

  generateKey(str) {
    const groups = str.match(/\D+\d/g) || [];
    let bits = groups.map((s) => (s[parseInt(s.slice(-1))] === s.slice(-2, -1) ? "1" : "0"));
    const shift = 64 % bits.length;
    bits = bits.slice(-shift).concat(bits.slice(0, -shift));

    const keyBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byteBits = bits
        .slice(i, i + 8)
        .reverse()
        .join("");
      keyBytes.push(parseInt(byteBits, 2));
    }

    return Buffer.from(keyBytes);
  }

  async getManifest() {
    const res = await axios.get(`https://play.google.com/books/volumes/${this.bookId}/manifest?hl=en&source=ge-web-app`, { headers: this.getHeadersFromCookies() });
    return res.data;
  }

  getToc(html) {
    const match = html.match(/"toc_entry":\s*(\[[\s\S]*?}\s*])/);
    return match ? JSON.parse(match[1]) : [];
  }

  async downloadAndDecryptPage(src, aesKey, pid, order, num_pages) {
    const url = new URL(src);
    const params = url.searchParams;

    params.set("w", "10000");
    params.set("h", "10000");
    params.set("zoom", "3");
    params.set("enc_all", "1");
    params.set("img", "1");
    url.search = params.toString();

    const files = fs.readdirSync(this.bookTempDir);
    const existingFile = files.find((file) => file.startsWith(pid));
    if (existingFile) {
      console.log(`Page ${order + 1} already exists (${existingFile})`);
      return path.join(this.bookTempDir, existingFile);
    }

    const res = await axios.get(url.toString(), {
      headers: this.getHeadersFromCookies(),
      responseType: "arraybuffer",
    });

    const buffer = res.data;
    const iv = buffer.slice(0, 16);
    const encrypted = buffer.slice(16);

    const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    const ext = this.getExtension(res.headers["content-type"]);
    const filename = `${pid}.${ext}`;
    const filepath = path.join(this.bookTempDir, filename);

    fs.writeFileSync(filepath, decrypted);
    console.log(`Downloaded page ${order + 1} of ${num_pages}`);

    return filepath;
  }

  getExtension(type) {
    const types = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/webp": "webp",
    };
    return types[type];
  }

  async createPdf(images, metadata) {
    const pdf = await PDFDocument.create();
    const { title, authors, publisher } = metadata;

    pdf.setTitle(title || "Untitled");
    pdf.setAuthor(Array.isArray(authors) ? authors.join(", ") : authors || "Unknown Author");
    pdf.setProducer(publisher || "Unknown Publisher");
    pdf.setSubject("Downloaded from Google Play Books");
    pdf.setKeywords(["Google Play", "eBook", title]);
    pdf.setCreationDate(new Date());

    for (const imagePath of images) {
      const bytes = fs.readFileSync(imagePath);
      const image = imagePath.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    const pdfBytes = await pdf.save();
    const filename = `${this.unescapeText(title || "Untitled")}.pdf`;
    fs.writeFileSync(filename, pdfBytes);
    console.log(chalk.green(`PDF saved as ${filename}`));
  }

  unescapeText(str) {
    return str.replace(/[<>:"\/\\|?*]+/g, "");
  }

  async run() {
    try {
      console.log(chalk.blue("Fetching book..."));
      const html = await this.getBookHtml();
      const aesKey = this.extractKey(html);
      const manifest = await this.getManifest();
      const metadata = manifest.metadata;
      const toc = this.getToc(html);

      const { title, authors, pub_date, num_pages, volume_id, publisher } = metadata;
      const pages = manifest.page;
      const imagePaths = [];

      console.log(chalk.green.bold("\nGoogle Play Book Downloader"));
      console.log(chalk.cyan("Title       :"), chalk.white(title));
      console.log(chalk.cyan("Authors     :"), chalk.white(authors));
      console.log(chalk.cyan("Published   :"), chalk.white(pub_date));
      console.log(chalk.cyan("Total Pages :"), chalk.white(num_pages));
      console.log(chalk.cyan("Publisher   :"), chalk.white(publisher));
      console.log(chalk.yellow("\nDownloading pages..."));

      for (const page of pages) {
        const { pid, src, order } = page;
        const path = await this.downloadAndDecryptPage(src, aesKey, pid, order, num_pages);
        imagePaths.push(path);
        await new Promise((r) => setTimeout(r, 300));
      }

      console.log(chalk.magenta("Creating PDF file..."));
      await this.createPdf(imagePaths, metadata);

      if (toc) {
        const formattedToc = toc
          .map((t) => {
            const indent = "  ".repeat(t.depth);
            const label = this.unescapeHtml(t.label);
            return `${indent}${label}`.padEnd(60, ".") + ` p.${t.page_index + 1}`;
          })
          .join("\n");

        fs.writeFileSync(`${this.unescapeText(metadata.title)}_Toc.txt`, formattedToc);
        console.log(chalk.blue("TOC saved."));
      }
    } catch (err) {
      console.error(chalk.red("Error:"), err.message);
    }
  }

  unescapeHtml(text) {
    return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  }
}

module.exports = BookDownloader;
