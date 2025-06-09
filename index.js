const chalk = require("chalk");
const BookDownloader = require("./BookDownloader");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(chalk.red("Please provide a book ID:\nUsage: node index.js [book_id]"));
  process.exit(1);
}

const bookId = args[0];

console.log(chalk.blue("Book ID:"), chalk.yellow(bookId));

const downloader = new BookDownloader(bookId);
downloader.run();
