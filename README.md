# 📚 Google Play Books Downloader (Node.js)

This tool downloads and decrypts books from [Google Play Books](https://play.google.com/books), using a `cookies.txt` file for session authentication. It reconstructs and saves the book as a PDF.


---

## 📂 Setup

### 1. Clone or download this repo

```bash
git clone https://github.com/yourusername/play-books-downloader.git
cd play-books-downloader
```

### 2. Install dependencies

```bash
npm install
```

### 3. Export `cookies.txt` from your browser

* Use a browser extension like [Get cookies.txt](https://chrome.google.com/webstore/detail/get-cookiestxt/iejblfompndnhinmlbaohbfpkkdnjhib)
* Visit: `https://play.google.com/books`
* Export cookies and save them as `cookies.txt` in the project root

### 4. Run the script

```bash
node index.js [BOOK_ID]
```

Example:

```bash
node index.js CkUJEAAAQBAJ
```

---

## 📄 Output

* ✅ High-quality PDF saved in the current folder
* 📄 A `[BookTitle]_Toc.txt` file (Table of Contents)
* 🗂️ Temporary decrypted images stored in `/temp`

---

## 🛠 Notes

* If you get a cookie error, try re-exporting cookies or refreshing login
* Waits between page downloads to avoid rate-limiting
* Uses AES-128-CBC to decrypt encrypted page data

---

## ❓ FAQ

**Q: Where do I get the book ID?**
A: From the book URL:
`https://play.google.com/books/reader?id=BOOK_ID`

**Q: What if the script fails?**
A: Common causes:

* ❌ Expired or invalid cookies
* ❌ Book not fully purchased
* 🔄 Google changed internal behavior (script may need updates)

