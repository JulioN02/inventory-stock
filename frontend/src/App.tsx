import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { RoleGate } from './components/RoleGate.tsx'
import { Layout } from './components/Layout.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { ProductsPage } from './pages/ProductsPage.tsx'
import { WarehousesPage } from './pages/WarehousesPage.tsx'
import { MovementsPage } from './pages/MovementsPage.tsx'
import { AuditPage } from './pages/AuditPage.tsx'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/register"
        element={
          <ProtectedRoute>
            <RegisterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="products"
          element={
            <RoleGate permission="catalog:read" fallback={<Navigate to="/" replace />}>
              <ProductsPage />
            </RoleGate>
          }
        />
        <Route
          path="warehouses"
          element={
            <RoleGate permission="catalog:read" fallback={<Navigate to="/" replace />}>
              <WarehousesPage />
            </RoleGate>
          }
        />
        <Route
          path="movements"
          element={
            <RoleGate permission="movements:read" fallback={<Navigate to="/" replace />}>
              <MovementsPage />
            </RoleGate>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGate permission="audit:read" fallback={<Navigate to="/" replace />}>
              <AuditPage />
            </RoleGate>
          }
        />
      </Route>
    </Routes>
  )
}