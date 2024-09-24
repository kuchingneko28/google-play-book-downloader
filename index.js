const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const { headers, book_id } = require("./config.json");

const getBooks = async () => {
  const response = await axios.get(`https://play.google.com/books/reader?id=${book_id}&hl=en`, {
    headers,
    withCredentials: true,
  });
  return response.data;
};

const extractKey = (html) => {
  const keySearch = html.match(/<body[\s\S]*?<[^>]+src\s*=\s*["']data:.*?base64,([^"']+)["']/);
  const keyData = Buffer.from(keySearch[1], "base64").toString();

  return genereateKey(keyData);
};

// Entah lah
const genereateKey = (str) => {
  const groups = str.match(/\D+\d/g) || [];

  let bitfield = groups.map((s) => (s[parseInt(s.slice(-1))] === s.slice(-2, -1) ? "1" : "0"));

  const shift = 64 % bitfield.length;
  if (shift !== 0) {
    bitfield = bitfield.slice(-shift).concat(bitfield.slice(0, -shift));
  }

  const key = [];
  for (let pos = 0; pos < bitfield.length; pos += 8) {
    const binStr = bitfield
      .slice(pos, pos + 8)
      .reverse()
      .join("");
    key.push(parseInt(binStr, 2));
  }

  return Buffer.from(key);
};

const getManifest = async () => {
  const response = await axios.get(`https://play.google.com/books/volumes/${book_id}/manifest?hl=en&source=ge-web-app`, {
    headers,
    withCredentials: true,
  });
  return response.data;
};

const downloadPage = async (src) => {
  const url = new URL(src);
  const params = new URLSearchParams(url.search);

  params.set("w", "10000");
  params.set("h", "10000");
  params.set("zoom", "3");
  params.set("enc_all", "1");
  params.set("img", "1");

  url.search = params.toString();

  const response = await axios.get(url.toString(), { headers, responseType: "arraybuffer", withCredentials: true });
  return { mimeType: response.headers["content-type"], buffer: response.data };
};

const decryptPage = (buffer, aesKey) => {
  const iv = buffer.slice(0, 16);
  const data = buffer.slice(16);

  const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

const extractToc = (html) => {
  const tocDataMatch = html.match(/"toc_entry":\s*(\[[\s\S]*?}\s*])/);

  return JSON.parse(tocDataMatch[1]);
};

const mimeToExt = (mime) => {
  return (
    {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/webp": "webp",
      "image/apng": "apng",
      "image/jp2": "jp2",
      "image/jpx": "jpx",
      "image/jpm": "jpm",
      "image/bmp": "bmp",
      "image/svg+xml": "svg",
    }[mime] || null
  );
};

const createPDF = async (images, metadata) => {
  const pdfDoc = await PDFDocument.create();
  const { title, authors, pub_date, num_pages, volume_id, publisher } = metadata;

  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(authors);
  pdfDoc.setKeywords(["pdf"]);
  pdfDoc.setProducer(publisher);

  for (const img of images) {
    const imgBytes = fs.readFileSync(img);
    let embeddedImage = img.endsWith(".png") ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });
  }

  const pdfBytes = await pdfDoc.save();

  fs.writeFileSync(`${sanitizedText(title)}.pdf`, pdfBytes);
  console.log(`PDF created successfully as ${title}.pdf`);
};

const hashContent = (buffer) => {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
};

const unescapeHtml = (text) => text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

const sanitizedText = (text) => text.replace(/[<>:"\/\\|?*]+/g, "");

const main = async () => {
  try {
    const html = await getBooks();
    const aesKey = extractKey(html);
    const manifest = await getManifest();
    const pageFiles = [];
    const toc = extractToc(html);
    const { title, authors, pub_date, num_pages, volume_id, publisher } = manifest.metadata;

    if (toc) {
      const readableToc = toc
        .map((t) => {
          return `${"    ".repeat(t.depth)}${unescapeHtml(t.label)} ........`.padEnd(80, ".") + ` p.${t.page_index + 1}`;
        })
        .join("\n");

      fs.writeFileSync(`${sanitizedText(title)}_Toc.txt`, readableToc);
    }

    console.log("Play book downloader");
    console.log("Title :", title);
    console.log("Authors :", authors);
    console.log("Pub dates :", pub_date);
    console.log("Num pages :", num_pages);
    console.log("Vol id :", volume_id);
    console.log("Publisher  :", publisher);

    for (const page of manifest.page) {
      const { pid, src, order } = page;
      const { buffer, mimeType } = await downloadPage(src);
      const ext = mimeToExt(mimeType);

      const decryptedBuffer = decryptPage(buffer, aesKey);
      const fileHash = hashContent(decryptedBuffer);
      const hashFilename = `${pid}_${fileHash}.${ext}`;
      const temp = path.join(__dirname, "/temp");

      if (!fs.existsSync(temp)) {
        fs.mkdirSync(temp);
      }

      if (fs.existsSync(`${temp}/${hashFilename}`, hashFilename)) {
        console.log(`File ${hashFilename} already exists, skipping download.`);
        pageFiles.push(`${temp}/${hashFilename}`);
        continue;
      }

      console.log(`Downloading file ${hashFilename}, pages ${order + 1}.`);
      pageFiles.push(`${temp}/${hashFilename}`);
      fs.writeFileSync(`${temp}/${hashFilename}`, decryptedBuffer);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await createPDF(pageFiles, manifest.metadata);
  } catch (err) {
    console.log(`Something is not right, try refresh your cookies!, Error : ${err.message}`);
  }
};

main();
