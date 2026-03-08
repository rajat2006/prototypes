const express = require("express");
const router = express.Router();
const { pool } = require("./db");
const cache = require("./cache");

// GET /products — list all products (cache-aside)
router.get("/", async (req, res) => {
  const cacheKey = "products:all";

  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.setHeader("X-Cache", "HIT").json(cached);
  }

  const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
  await cache.set(cacheKey, rows);
  res.setHeader("X-Cache", "MISS").json(rows);
});

// GET /products/:id — get one product (cache-aside)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const cacheKey = `products:${id}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.setHeader("X-Cache", "HIT").json(cached);
  }

  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [
    id,
  ]);
  if (!rows.length) return res.status(404).json({ error: "Not found" });

  await cache.set(cacheKey, rows[0]);
  res.setHeader("X-Cache", "MISS").json(rows[0]);
});

// POST /products — create a new product
router.post("/", async (req, res) => {
  const { name, price } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *",
    [name, price],
  );
  res.status(201).json(rows[0]);
});

// PUT /products/:id — update a product
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  const { rows } = await pool.query(
    "UPDATE products SET name = $1, price = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
    [name, price, id],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /products/:id — delete a product
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "DELETE FROM products WHERE id = $1 RETURNING *",
    [id],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

module.exports = router;
