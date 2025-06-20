const chalk = require("chalk");
const BookDownloader = require("./BookDownloader");

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
${chalk.bold("📚 Google Play Book Downloader CLI")}

${chalk.cyan("Usage:")}
  node index.js ${chalk.yellow("[book_id]")}

${chalk.cyan("Example:")}
  node index.js ${chalk.yellow("AbC123xyz456")}

${chalk.cyan("Options:")}
  -h, --help        Show this help message

${chalk.cyan("Tips:")}
  1. Make sure you have a valid ${chalk.bold("cookies.txt")} file from Google Play Books export.
  2. Put the file in the same directory as this script.
  3. Your downloaded PDF and TOC will be saved with the book's title.

${chalk.green("✨ Happy reading!")}
`);
  process.exit(0);
}

const bookId = args[0];

console.log(chalk.blue("Book ID:"), chalk.yellow(bookId));

const downloader = new BookDownloader(bookId);
downloader.run();
