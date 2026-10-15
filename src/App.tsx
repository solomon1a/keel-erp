import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/shell.tsx'
import { LocaleProvider } from './i18n/locale.tsx'
import { AdminUsersPage } from './pages/admin-users-page.tsx'
import { ContactFormPage } from './pages/contact-form-page.tsx'
import { ContactsPage } from './pages/contacts-page.tsx'
import { DeskPage } from './pages/desk-page.tsx'
import { InventoryPage } from './pages/inventory-page.tsx'
import { OrderDetailPage } from './pages/order-detail-page.tsx'
import { OrderFormPage } from './pages/order-form-page.tsx'
import { OrdersPage } from './pages/orders-page.tsx'
import { PasswordPage } from './pages/password-page.tsx'
import { SettingsPage } from './pages/settings-page.tsx'
import { PrintPage } from './pages/print-page.tsx'
import { ProductFormPage } from './pages/product-form-page.tsx'
import { ProductsPage } from './pages/products-page.tsx'
import { SignInPage } from './pages/sign-in-page.tsx'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/orders/:id/print" element={<PrintPage />} />
          <Route element={<Shell />}>
            <Route path="/" element={<DeskPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/new" element={<ContactFormPage />} />
            <Route path="/contacts/:id" element={<ContactFormPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<ProductFormPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/orders/:id/edit" element={<OrderFormPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/account/password" element={<PasswordPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </LocaleProvider>
    </QueryClientProvider>
  )
}
