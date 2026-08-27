// Domain types — mirror the server DTOs manually (no codegen in v1).
// Numerics travel as strings (decision D13).

export interface User {
  id: string
  username: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  unit: string
  price: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Warehouse {
  id: string
  name: string
  code: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** I2: derived stock row (GET /api/stock) — stock is a string numeric, scale 1. */
export interface StockItem {
  product_id: string
  sku: string
  name: string
  warehouse_id: string
  warehouse_code: string
  stock: string
}

/** I2: low-stock row (GET /api/stock/low) — strictly below threshold. */
export interface LowStockItem {
  product_id: string
  sku: string
  name: string
  stock: string
}

export interface LoginResponse {
  user: User
  accessToken: string
}

export interface RegisterResponse {
  user: User
}