const express = require("express")
const cors = require("cors")
const { query } = require("../lib/db")

const app = express()
app.use(cors())
app.use(express.json())

// Funciones de mapeo de campos de DB (español) a API (inglés)
const mapProductFromDB = (row) => ({
  id: row.id,
  name: row.nombre,
  sku: row.sku,
  description: row.descripcion,
  category_id: row.categoria_id,
  supplier_id: row.proveedor_id,
  price: Number(row.precio),               // ✅ number
  stock: Number(row.inventario),            // ✅ number
  min_stock: Number(row.inventario_minimo), // ✅ number
  image_url: row.url_imagen,
  created_at: row.creado_en,
  updated_at: row.actualizado_en,
  category_name: row.category_name,
  supplier_name: row.supplier_name,
})


const mapCategoryFromDB = (row) => ({
  id: row.id,
  name: row.nombre,
  description: row.descripcion,
  created_at: row.creado_en,
  updated_at: row.actualizado_en,
  product_count: row.product_count,
})

const mapSupplierFromDB = (row) => ({
  id: row.id,
  name: row.nombre,
  email: row.email,
  phone: row.telefono,
  address: row.direccion,
  created_at: row.creado_en,
  updated_at: row.actualizado_en,
  product_count: row.product_count,
})

const mapMovementFromDB = (row) => ({
  id: row.id,
  product_id: row.producto_id,
  quantity: row.cantidad,
  movement_type: row.tipo_movimiento === "ENTRADA" ? "IN" : row.tipo_movimiento === "SALIDA" ? "OUT" : "ADJUSTMENT",
  notes: row.notas,
  created_at: row.creado_en,
  product_name: row.product_name,
})

// ==========================
// PRODUCTOS
// ==========================
app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1")
    res.json({ status: "ok", database: "connected" })
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected" })
  }
})

app.get("/api/products", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.nombre as category_name, s.nombre as supplier_name
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       LEFT JOIN proveedores s ON p.proveedor_id = s.id
       ORDER BY p.creado_en DESC`
    )
    res.json(result.rows.map(mapProductFromDB))
  } catch (err) {
    console.error('[PRODUCTOS ERROR]', err)
    res.status(500).json({ error: "No se pudieron obtener los productos", details: err.message })
  }
})

app.post("/api/products", async (req, res) => {
  try {
    const { name, sku, description, category_id, supplier_id, price, stock, min_stock, image_url } = req.body
    const result = await query(
      `INSERT INTO productos (nombre, sku, descripcion, categoria_id, proveedor_id, precio, inventario, inventario_minimo, url_imagen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [name, sku, description, category_id, supplier_id, price, stock, min_stock, image_url]
    )

    await query(
      `INSERT INTO movimientos_stock (producto_id, cantidad, tipo_movimiento, notas) VALUES ($1,$2,$3,$4)`,
      [result.rows[0].id, stock, "ENTRADA", "Stock inicial"]
    )

    res.status(201).json(mapProductFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    if (err.code === "23505") return res.status(400).json({ error: "Producto con este SKU ya existe" })
    res.status(500).json({ error: "No se pudo crear el producto" })
  }
})

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT p.*, c.nombre as category_name, s.nombre as supplier_name
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       LEFT JOIN proveedores s ON p.proveedor_id = s.id
       WHERE p.id = $1`,
      [id]
    )
    if (!result.rows.length) return res.status(404).json({ error: "Producto no encontrado" })
    res.json(mapProductFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo obtener el producto" })
  }
})

app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { name, sku, description, category_id, supplier_id, price, stock, min_stock, image_url } = req.body

    const current = await query(`SELECT inventario FROM productos WHERE id = $1`, [id])
    if (!current.rows.length) return res.status(404).json({ error: "Producto no encontrado" })

    const diffStock = stock - current.rows[0].inventario

    const result = await query(
      `UPDATE productos
       SET nombre=$1, sku=$2, descripcion=$3, categoria_id=$4, proveedor_id=$5,
           precio=$6, inventario=$7, inventario_minimo=$8, url_imagen=$9
       WHERE id=$10
       RETURNING *`,
      [name, sku, description, category_id, supplier_id, price, stock, min_stock, image_url, id]
    )

    if (diffStock !== 0) {
      await query(
        `INSERT INTO movimientos_stock (producto_id, cantidad, tipo_movimiento, notas) VALUES ($1,$2,$3,$4)`,
        [id, diffStock, diffStock > 0 ? "ENTRADA" : "SALIDA", "Ajuste de inventario"]
      )
    }

    res.json(mapProductFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    if (err.code === "23505") return res.status(400).json({ error: "Producto con este SKU ya existe" })
    res.status(500).json({ error: "No se pudo actualizar el producto" })
  }
})

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM productos WHERE id=$1 RETURNING *`, [id])
    if (!result.rows.length) return res.status(404).json({ error: "Producto no encontrado" })
    res.json({ message: "Producto eliminado correctamente" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo eliminar el producto" })
  }
})

// ==========================
// CATEGORIAS
// ==========================
app.get("/api/categories", async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categorias c
       LEFT JOIN productos p ON c.id = p.categoria_id
       GROUP BY c.id
       ORDER BY c.nombre ASC`
    )
    res.json(result.rows.map(mapCategoryFromDB))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudieron obtener las categorías" })
  }
})

app.post("/api/categories", async (req, res) => {
  try {
    const { name, description } = req.body
    const result = await query(`INSERT INTO categorias (nombre, descripcion) VALUES ($1,$2) RETURNING *`, [name, description])
    res.status(201).json(mapCategoryFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    if (err.code === "23505") return res.status(400).json({ error: "Categoría con este nombre ya existe" })
    res.status(500).json({ error: "No se pudo crear la categoría" })
  }
})

app.put("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { name, description } = req.body
    const result = await query(`UPDATE categorias SET nombre=$1, descripcion=$2 WHERE id=$3 RETURNING *`, [name, description, id])
    if (!result.rows.length) return res.status(404).json({ error: "Categoría no encontrada" })
    res.json(mapCategoryFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    if (err.code === "23505") return res.status(400).json({ error: "Categoría con este nombre ya existe" })
    res.status(500).json({ error: "No se pudo actualizar la categoría" })
  }
})

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM categorias WHERE id=$1 RETURNING *`, [id])
    if (!result.rows.length) return res.status(404).json({ error: "Categoría no encontrada" })
    res.json({ message: "Categoría eliminada correctamente" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo eliminar la categoría" })
  }
})

// ==========================
// PROVEEDORES
// ==========================
app.get("/api/suppliers", async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, COUNT(p.id) as product_count
       FROM proveedores s
       LEFT JOIN productos p ON s.id = p.proveedor_id
       GROUP BY s.id
       ORDER BY s.nombre ASC`
    )
    res.json(result.rows.map(mapSupplierFromDB))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudieron obtener los proveedores" })
  }
})

app.post("/api/suppliers", async (req, res) => {
  try {
    const { name, email, phone, address } = req.body
    const result = await query(`INSERT INTO proveedores (nombre,email,telefono,direccion) VALUES ($1,$2,$3,$4) RETURNING *`, [name,email,phone,address])
    res.status(201).json(mapSupplierFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo crear el proveedor" })
  }
})

app.put("/api/suppliers/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, address } = req.body
    const result = await query(`UPDATE proveedores SET nombre=$1,email=$2,telefono=$3,direccion=$4 WHERE id=$5 RETURNING *`, [name,email,phone,address,id])
    if (!result.rows.length) return res.status(404).json({ error: "Proveedor no encontrado" })
    res.json(mapSupplierFromDB(result.rows[0]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo actualizar el proveedor" })
  }
})

app.delete("/api/suppliers/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM proveedores WHERE id=$1 RETURNING *`, [id])
    if (!result.rows.length) return res.status(404).json({ error: "Proveedor no encontrado" })
    res.json({ message: "Proveedor eliminado correctamente" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "No se pudo eliminar el proveedor" })
  }
})

// ==========================
// ESTADÍSTICAS
// ==========================
app.get("/api/stats", async (req, res) => {
  try {
    const totalProductosRes = await query("SELECT COUNT(*) as count FROM productos")
    const totalCategoriasRes = await query("SELECT COUNT(*) as count FROM categorias")
    const totalProveedoresRes = await query("SELECT COUNT(*) as count FROM proveedores")
    const stockBajoRes = await query("SELECT COUNT(*) as count FROM productos WHERE inventario < inventario_minimo")
    const valorStockRes = await query("SELECT SUM(precio * inventario) as total FROM productos")

    const recientesRes = await query(
      `SELECT sm.*, p.nombre as product_name
       FROM movimientos_stock sm
       LEFT JOIN productos p ON sm.producto_id = p.id
       ORDER BY sm.creado_en DESC
       LIMIT 10`
    )

    const distribucionCategoriasRes = await query(
      `SELECT c.nombre as name, COUNT(p.id) as value
       FROM categorias c
       LEFT JOIN productos p ON c.id = p.categoria_id
       GROUP BY c.id, c.nombre
       ORDER BY value DESC`
    )

    const tendenciasStockRes = await query(
      `SELECT DATE(creado_en) as fecha,
              SUM(CASE WHEN tipo_movimiento='ENTRADA' THEN cantidad ELSE 0 END) as entradas,
              SUM(CASE WHEN tipo_movimiento='SALIDA' THEN ABS(cantidad) ELSE 0 END) as salidas
       FROM movimientos_stock
       WHERE creado_en >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(creado_en)
       ORDER BY fecha ASC`
    )

    const tendenciasStock = tendenciasStockRes.rows.map(r => ({
    date: new Date(r.fecha).toLocaleDateString("es-ES", { month: "short", day: "numeric" }),
    in: Number(r.entradas || 0),
    out: Number(r.salidas || 0),
  }))

    res.json({
      totalProducts: parseInt(totalProductosRes.rows[0].count),
      totalCategories: parseInt(totalCategoriasRes.rows[0].count),
      totalSuppliers: parseInt(totalProveedoresRes.rows[0].count),
      lowStockProducts: parseInt(stockBajoRes.rows[0].count),
      totalStockValue: parseFloat(valorStockRes.rows[0].total || "0"),
      recentMovements: recientesRes.rows.map(mapMovementFromDB),
      categoryDistribution: distribucionCategoriasRes.rows.map(r => ({
    name: r.name,
    value: Number(r.value),
      })),

      stockTrends: tendenciasStock
    })
  } catch (err) {
  console.error(err)
  res.status(500).json({ error: "No se pudieron obtener las estadísticas" })
  }

})

// ==========================
// INICIO SERVIDOR
// ==========================
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Backend escuchando en http://localhost:${PORT}`))

// Verificar conexión a BD
;(async () => {
  try {
    const test = await query("SELECT 1 as ok")
    console.log("[v0] Verificación de BD al inicio OK:", test.rows[0])
  } catch (err) {
    console.error("[v0] Verificación de BD al inicio falló:", err.message || err)
  }
})()
