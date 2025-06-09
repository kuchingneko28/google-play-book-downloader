const BookDownloader = require("./BookDownloader"); // your class file

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("❌ Please provide a book ID: node index.js [book_id]");
  process.exit(1);
}

const bookId = args[0];
const downloader = new BookDownloader(bookId);
downloader.run();
