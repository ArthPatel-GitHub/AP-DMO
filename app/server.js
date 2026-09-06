const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
console.log('Serving static files from:', path.join(__dirname, "public"));

// Catch-all: any request that doesn't match a real file (a typo'd
// path, a garbage/extremely long URL, a page that's been removed)
// gets redirected to the homepage with an error flag, rather than
// showing Express's default blank "Cannot GET" page. This only
// runs when express.static above couldn't find a matching file,
// since static middleware calls next() to fall through to here.
app.use((req, res) => {
  res.redirect('/index.html?error=notfound');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});