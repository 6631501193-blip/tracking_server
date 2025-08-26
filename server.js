const express = require("express");
const bcrypt = require("bcrypt");
const con = require("./db/db"); // your db.js connection
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Test database connection
console.log("Testing database connection...");
con.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    console.log("Please check:");
    console.log("1. MySQL server is running");
    console.log('2. Database "expenses" exists');
    console.log("3. MySQL credentials in db.js are correct");
    process.exit(1);
  } else {
    console.log("✅ Connected to MySQL database successfully");
  }
});

// Helper function: promisify queries
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    con.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// ---------------- INIT ----------------
app.get("/init", async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item VARCHAR(100) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Insert default users if not exist
    const users = await query("SELECT * FROM users WHERE name IN ('Lisa', 'Tom')");
    if (users.length === 0) {
      const saltRounds = 10;
      const lisaHash = await bcrypt.hash("1111", saltRounds);
      const tomHash = await bcrypt.hash("2222", saltRounds);

      await query(
        "INSERT INTO users (name, password_hash) VALUES (?, ?), (?, ?)",
        ["Lisa", lisaHash, "Tom", tomHash]
      );

      const userRows = await query("SELECT id, name FROM users WHERE name IN ('Lisa','Tom')");
      const lisaId = userRows.find((u) => u.name === "Lisa").id;
      const tomId = userRows.find((u) => u.name === "Tom").id;

      await query(
        "INSERT INTO expenses (user_id, item, amount, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
        [lisaId, "Coffee", 3.5, "2025-08-25 09:30:00", tomId, "Snacks", 5.0, "2025-08-25 14:00:00"]
      );
    }

    res.json({ message: "Database initialized successfully" });
  } catch (error) {
    console.error("Init error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- AUTH ----------------
app.post("/auth/login", async (req, res) => {
  const { name, password } = req.body;
  try {
    const rows = await query("SELECT * FROM users WHERE name = ?", [name]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ user_id: user.id, name: user.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- EXPENSES ----------------

// GET all expenses for a user
app.get("/expenses", async (req, res) => {
  const user_id = req.query.user_id;
  try {
    const rows = await query("SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC", [user_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET today’s expenses
app.get("/expenses/today", async (req, res) => {
  const user_id = req.query.user_id;
  try {
    const rows = await query(
      "SELECT * FROM expenses WHERE user_id = ? AND DATE(created_at) = CURDATE() ORDER BY created_at DESC",
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEARCH by keyword
app.get("/expenses/search", async (req, res) => {
  const user_id = req.query.user_id;
  const q = `%${(req.query.q || "").toLowerCase()}%`;
  try {
    const rows = await query(
      "SELECT * FROM expenses WHERE user_id = ? AND LOWER(item) LIKE ? ORDER BY created_at DESC",
      [user_id, q]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add new expense
app.post("/expenses", async (req, res) => {
  const { user_id, item, amount } = req.body;
  try {
    const result = await query("INSERT INTO expenses (user_id, item, amount) VALUES (?, ?, ?)", [
      user_id,
      item,
      amount,
    ]);
    const inserted = await query("SELECT * FROM expenses WHERE id = ?", [result.insertId]);
    res.status(201).json(inserted[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update expense
app.put("/expenses/:id", async (req, res) => {
  const id = req.params.id;
  const { item, amount } = req.body;
  try {
    await query("UPDATE expenses SET item = ?, amount = ? WHERE id = ?", [item, amount, id]);
    const updated = await query("SELECT * FROM expenses WHERE id = ?", [id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE expense
app.delete("/expenses/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await query("DELETE FROM expenses WHERE id = ?", [id]);
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- MIDDLEWARES ----------------
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`👉 Visit http://localhost:${PORT}/init to initialize the database`);
});
