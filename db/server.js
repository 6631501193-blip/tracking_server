const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const con = require("./db"); 

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Login ---
app.post("/auth/login", (req, res) => {
  const { name, password } = req.body;

  con.query("SELECT * FROM users WHERE name = ?", [name], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ user_id: user.id, name: user.name });
  });
});

// --- List all expenses ---
app.get("/expenses", (req, res) => {
  const user_id = req.query.user_id;
  con.query(
    "SELECT id, title, amount, date FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC",
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// --- List today's expenses ---
app.get("/expenses/today", (req, res) => {
  const user_id = req.query.user_id;
  con.query(
    "SELECT id, title, amount, date FROM expenses WHERE user_id = ? AND date = CURDATE() ORDER BY id DESC",
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// --- Search ---
app.get("/expenses/search", (req, res) => {
  const user_id = req.query.user_id;
  const q = `%${(req.query.q || "").toLowerCase()}%`;
  con.query(
    "SELECT id, title, amount, date FROM expenses WHERE user_id = ? AND LOWER(title) LIKE ? ORDER BY date DESC, id DESC",
    [user_id, q],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// --- Add expense ---
app.post("/expenses", (req, res) => {
  const { user_id, title, amount, date } = req.body;
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().split("T")[0];

  con.query(
    "INSERT INTO expenses (user_id, title, amount, date) VALUES (?, ?, ?, ?)",
    [user_id, title, amount, d],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      con.query("SELECT id, title, amount, date FROM expenses WHERE id = ?", [result.insertId], (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json(rows[0]);
      });
    }
  );
});

// --- Delete expense ---
app.delete("/expenses/:id", (req, res) => {
  const user_id = req.query.user_id;
  const id = req.params.id;

  con.query("DELETE FROM expenses WHERE id = ? AND user_id = ?", [id, user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: id });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
