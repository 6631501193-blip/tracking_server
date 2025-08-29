const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const con = require("./db/db"); // MySQL connection

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Test DB connection
con.connect((err) => {
  if (err) {
    console.error(" Database connection failed:", err.message);
    process.exit(1);
  }
  console.log("Connected to MySQL database successfully");
});

// Helper: promisify query
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    con.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// ---------------- AUTH ----------------

// Login
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

// Get all expenses
app.get("/expenses", async (req, res) => {
  const user_id = req.query.user_id;
  try {
    const rows = await query(
      "SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC",
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get today's expenses
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

// Search expenses
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

// Add new expense
app.post("/expenses", async (req, res) => {
  const { user_id, item, amount } = req.body;
  try {
    const result = await query(
      "INSERT INTO expenses (user_id, item, amount) VALUES (?, ?, ?)",
      [user_id, item, amount]
    );
    const inserted = await query("SELECT * FROM expenses WHERE id = ?", [result.insertId]);
    res.status(201).json(inserted[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update expense
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

// Delete expense
app.delete("/expenses/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await query("DELETE FROM expenses WHERE id = ?", [id]);

    // Reset AUTO_INCREMENT to the max existing id + 1
    await query("SET @num := 0");
    await query("UPDATE expenses SET id = (@num := @num + 1) ORDER BY id");
    await query("ALTER TABLE expenses AUTO_INCREMENT = 1");

    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- HELPER ROUTES ----------------

// Hash generator (for testing)
app.get("/password/:raw", async (req, res) => {
  const raw = req.params.raw;
  try {
    const hash = await bcrypt.hash(raw, 10);
    res.json({ raw, hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
