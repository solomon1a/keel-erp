import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/shell.tsx'
import { ToastProvider } from './components/toast.tsx'
import { ThemeProvider } from './brand/theme.tsx'
import { LocaleProvider } from './i18n/locale.tsx'
import { AccountingPage, InvoicePage, InvoicePrintPage, LedgerPage, ReportsPage } from './pages/accounting.tsx'
import { JournalPage, NumberSeriesPage, PaymentsPage, TrialBalancePage } from './pages/books-pages.tsx'
import { FxPage } from './pages/fx-page.tsx'
import { ImportPage } from './pages/import-page.tsx'
import { TaxPage } from './pages/tax-page.tsx'
import { AccessPage } from './pages/access-page.tsx'
import { AdminUsersPage } from './pages/admin-users-page.tsx'
import { AssetsPage } from './pages/assets-page.tsx'
import { InvitePage } from './pages/invite-page.tsx'
import { SubcontractPage } from './pages/subcontract-page.tsx'
import { ContactFormPage } from './pages/contact-form-page.tsx'
import { ContactsPage } from './pages/contacts-page.tsx'
import { ActivitiesPage, CrmAnalysisPage, CrmTagsPage, LostReasonsPage } from './pages/crm-desk.tsx'
import { TradeAnalysisPage } from './pages/trade-analysis.tsx'
import { CrmPage, LeadPage } from './pages/crm.tsx'
import { AppsPage } from './pages/apps-page.tsx'
import { DeskFormPage, DeskScreenPage } from './pages/desk-screen.tsx'
import { ModuleHubPage } from './pages/module-hub.tsx'
import { DeskPage } from './pages/desk-page.tsx'
import { WebsitePage } from './pages/website-page.tsx'
import { AttendancePage, LeavePage } from './pages/attendance-page.tsx'
import { HelpdeskPage, SlaPage, TicketPage } from './pages/helpdesk-page.tsx'
import { EmployeePage, HrPage } from './pages/hr.tsx'
import { ExpensesPage, PayrollPage, PayrollRunPage } from './pages/payroll.tsx'
import { BomDetailPage } from './pages/bom-detail-page.tsx'
import { BomFormPage } from './pages/bom-form-page.tsx'
import { BomPrintPage } from './pages/bom-print-page.tsx'
import { BomsPage } from './pages/boms-page.tsx'
import { InventoryPage } from './pages/inventory-page.tsx'
import { RoutesPage } from './pages/routes-page.tsx'
import { ProjectsPage } from './pages/projects-page.tsx'
import { QualityPage } from './pages/quality-page.tsx'
import { EmailPage } from './pages/email-page.tsx'
import { PublicSitePage } from './pages/public-site-page.tsx'
import { SiteBuilderPage } from './pages/site-builder-page.tsx'
import { ReconcilePage } from './pages/reconcile-page.tsx'
import { StatementsPage } from './pages/statements-page.tsx'
import { ValuationPage } from './pages/valuation-page.tsx'
import { MovesPage } from './pages/moves-page.tsx'
import { ReplenishPage } from './pages/replenish-page.tsx'
import { TransferDetailPage } from './pages/transfer-detail-page.tsx'
import { TransferFormPage } from './pages/transfer-form-page.tsx'
import { TransfersPage } from './pages/transfers-page.tsx'
import { WarehouseDetailPage } from './pages/warehouse-detail-page.tsx'
import { WarehouseFormPage } from './pages/warehouse-form-page.tsx'
import { WarehousesPage } from './pages/warehouses-page.tsx'
import { JobCardsPage } from './pages/job-cards-page.tsx'
import { BomToolsPage } from './pages/bom-tools-page.tsx'
import { MfgDowntimePage } from './pages/mfg-downtime-page.tsx'
import { MfgForecastPage } from './pages/mfg-forecast-page.tsx'
import { MfgLeadPage } from './pages/mfg-lead-page.tsx'
import { MfgReportsPage } from './pages/mfg-reports-page.tsx'
import { MfgUnbuildPage } from './pages/mfg-unbuild-page.tsx'
import { ManufacturingDetailPage } from './pages/manufacturing-detail-page.tsx'
import { ManufacturingFormPage } from './pages/manufacturing-form-page.tsx'
import { ManufacturingPage } from './pages/manufacturing-page.tsx'
import { ManufacturingPrintPage } from './pages/manufacturing-print-page.tsx'
import { RoutingsPage } from './pages/routings-page.tsx'
import { WorkstationsPage } from './pages/workstations-page.tsx'
import { ProductionPlanPage } from './pages/production-plan-page.tsx'
import { WastagePage } from './pages/wastage-page.tsx'
import { OrderDetailPage } from './pages/order-detail-page.tsx'
import { PaymentTermsPage } from './pages/payment-terms-page.tsx'
import { PricelistsPage } from './pages/pricelists-page.tsx'
import { PricingPage } from './pages/pricing-page.tsx'
import { OrderFormPage } from './pages/order-form-page.tsx'
import { OrdersPage } from './pages/orders-page.tsx'
import { PasswordPage } from './pages/password-page.tsx'
import { PosOrderPage } from './pages/pos-order-page.tsx'
import { PosOrdersPage } from './pages/pos-orders-page.tsx'
import { PosReceiptPage } from './pages/pos-receipt-page.tsx'
import { PosReportPage } from './pages/pos-report-page.tsx'
import { PosScreenPage } from './pages/pos-screen-page.tsx'
import { PosSessionsPage } from './pages/pos-sessions-page.tsx'
import { SettingsPage } from './pages/settings-page.tsx'
import { ShopAccountPage, ShopCartPage, ShopCatalogPage, ShopCheckoutPage, ShopProductPage, ShopThanksPage } from './pages/shop.tsx'
import { PrintPage } from './pages/print-page.tsx'
import { ProductFormPage } from './pages/product-form-page.tsx'
import { ProductsPage } from './pages/products-page.tsx'
import { PurchaseDetailPage } from './pages/purchase-detail-page.tsx'
import { PurchaseFormPage } from './pages/purchase-form-page.tsx'
import { PurchasePrintPage } from './pages/purchase-print-page.tsx'
import { PurchasesPage } from './pages/purchases-page.tsx'
import { SignInPage } from './pages/sign-in-page.tsx'
import { StartPage } from './pages/start-page.tsx'
import { VendorsPage } from './pages/vendors-page.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
      <ThemeProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/start" element={<StartPage />} />
          <Route path="/site/:slug/blog/:post" element={<PublicSitePage />} />
          <Route path="/site/:slug/:page" element={<PublicSitePage />} />
          <Route path="/site/:slug" element={<PublicSitePage />} />
          <Route path="/shop" element={<ShopCatalogPage />} />
          <Route path="/shop/p/:id" element={<ShopProductPage />} />
          <Route path="/shop/cart" element={<ShopCartPage />} />
          <Route path="/shop/checkout" element={<ShopCheckoutPage />} />
          <Route path="/shop/account" element={<ShopAccountPage />} />
          <Route path="/shop/thanks/:token" element={<ShopThanksPage />} />
          <Route path="/orders/:id/print" element={<PrintPage />} />
          <Route path="/purchases/:id/print" element={<PurchasePrintPage />} />
          <Route path="/manufacturing/:id/print" element={<ManufacturingPrintPage />} />
          <Route path="/boms/:id/print" element={<BomPrintPage />} />
          <Route path="/pos/orders/:id/print" element={<PosReceiptPage />} />
          <Route path="/accounting/:id/print" element={<InvoicePrintPage />} />
          <Route element={<Shell />}>
            <Route path="/" element={<AppsPage />} />
            <Route path="/apps" element={<Navigate to="/" replace />} />
            <Route path="/go/:moduleId/:segment?" element={<ModuleHubPage />} />
            <Route path="/desk" element={<DeskPage />} />
            <Route path="/app/:module/:screen/new" element={<DeskFormPage />} />
            <Route path="/app/:module/:screen/:id" element={<DeskFormPage />} />
            <Route path="/app/:module/:screen" element={<DeskScreenPage />} />
            <Route path="/website" element={<WebsitePage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/new" element={<ContactFormPage />} />
            <Route path="/contacts/:id" element={<ContactFormPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<ProductFormPage />} />
            <Route path="/accounting" element={<AccountingPage />} />
            <Route path="/accounting/import" element={<ImportPage />} />
            <Route path="/accounting/taxes" element={<TaxPage />} />
            <Route path="/accounting/ledger" element={<LedgerPage />} />
            <Route path="/accounting/reports" element={<ReportsPage />} />
            <Route path="/accounting/numbers" element={<NumberSeriesPage />} />
            <Route path="/accounting/payments" element={<PaymentsPage />} />
            <Route path="/accounting/journal" element={<JournalPage />} />
            <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
            <Route path="/accounting/fx" element={<FxPage />} />
            <Route path="/accounting/:id" element={<InvoicePage />} />
            <Route path="/crm/activities" element={<ActivitiesPage />} />
            <Route path="/crm/analysis" element={<CrmAnalysisPage />} />
            <Route path="/crm/tags" element={<CrmTagsPage />} />
            <Route path="/crm/lost-reasons" element={<LostReasonsPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/crm/:id" element={<LeadPage />} />
            <Route path="/helpdesk" element={<HelpdeskPage />} />
            <Route path="/helpdesk/sla" element={<SlaPage />} />
            <Route path="/helpdesk/:id" element={<TicketPage />} />
            <Route path="/hr" element={<HrPage />} />
            <Route path="/hr/attendance" element={<AttendancePage />} />
            <Route path="/hr/leave" element={<LeavePage />} />
            <Route path="/hr/payroll" element={<PayrollPage />} />
            <Route path="/hr/payroll/:id" element={<PayrollRunPage />} />
            <Route path="/hr/expenses" element={<ExpensesPage />} />
            <Route path="/hr/:id" element={<EmployeePage />} />
            <Route path="/sales/analysis" element={<TradeAnalysisPage side="sales" />} />
            <Route path="/sales/pricelists" element={<PricelistsPage />} />
            <Route path="/sales/payment-terms" element={<PaymentTermsPage />} />
            <Route path="/sales/pricing" element={<PricingPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/orders/:id/edit" element={<OrderFormPage />} />
            <Route path="/purchases/analysis" element={<TradeAnalysisPage side="purchase" />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/purchases/new" element={<PurchaseFormPage />} />
            <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
            <Route path="/purchases/:id/edit" element={<PurchaseFormPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/manufacturing" element={<ManufacturingPage />} />
            <Route path="/manufacturing/plan" element={<ProductionPlanPage />} />
            <Route path="/manufacturing/forecasts" element={<MfgForecastPage />} />
            <Route path="/manufacturing/downtime" element={<MfgDowntimePage />} />
            <Route path="/manufacturing/unbuild" element={<MfgUnbuildPage />} />
            <Route path="/manufacturing/reports" element={<MfgReportsPage />} />
            <Route path="/manufacturing/lead-times" element={<MfgLeadPage />} />
            <Route path="/manufacturing/wastage" element={<WastagePage />} />
            <Route path="/manufacturing/workstations" element={<WorkstationsPage />} />
            <Route path="/manufacturing/routings" element={<RoutingsPage />} />
            <Route path="/manufacturing/jobs" element={<JobCardsPage />} />
            <Route path="/manufacturing/new" element={<ManufacturingFormPage />} />
            <Route path="/manufacturing/:id" element={<ManufacturingDetailPage />} />
            <Route path="/manufacturing/:id/edit" element={<ManufacturingFormPage />} />
            <Route path="/boms" element={<BomsPage />} />
            <Route path="/boms/tools" element={<BomToolsPage />} />
            <Route path="/boms/new" element={<BomFormPage />} />
            <Route path="/boms/:id" element={<BomDetailPage />} />
            <Route path="/boms/:id/edit" element={<BomFormPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/pos" element={<PosSessionsPage />} />
            <Route path="/pos/sessions/:id" element={<PosScreenPage />} />
            <Route path="/pos/orders" element={<PosOrdersPage />} />
            <Route path="/pos/orders/:id" element={<PosOrderPage />} />
            <Route path="/pos/report" element={<PosReportPage />} />
            <Route path="/inventory/moves" element={<MovesPage />} />
            <Route path="/inventory/replenish" element={<ReplenishPage />} />
            <Route path="/inventory/transfers" element={<TransfersPage />} />
            <Route path="/inventory/transfers/new" element={<TransferFormPage />} />
            <Route path="/inventory/transfers/:id/edit" element={<TransferFormPage />} />
            <Route path="/inventory/transfers/:id" element={<TransferDetailPage />} />
            <Route path="/inventory/warehouses" element={<WarehousesPage />} />
            <Route path="/inventory/warehouses/new" element={<WarehouseFormPage />} />
            <Route path="/inventory/warehouses/:id/edit" element={<WarehouseFormPage />} />
            <Route path="/inventory/warehouses/:id" element={<WarehouseDetailPage />} />
            <Route path="/account/password" element={<PasswordPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/:id" element={<AssetsPage />} />
            <Route path="/subcontracting" element={<SubcontractPage />} />
            <Route path="/subcontracting/:id" element={<SubcontractPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/settings/access" element={<AccessPage />} />
            <Route path="/accounting/statements" element={<StatementsPage />} />
            <Route path="/accounting/statements/:id" element={<ReconcilePage />} />
            <Route path="/quality/alerts" element={<QualityPage />} />
            <Route path="/quality" element={<QualityPage />} />
            <Route path="/email/campaigns/:campaignId" element={<EmailPage />} />
            <Route path="/email/:section" element={<EmailPage />} />
            <Route path="/email" element={<EmailPage />} />
            <Route path="/sites/:section/:pageId" element={<SiteBuilderPage />} />
            <Route path="/sites/:section" element={<SiteBuilderPage />} />
            <Route path="/sites" element={<SiteBuilderPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectsPage />} />
            <Route path="/inventory/valuation" element={<ValuationPage />} />
            <Route path="/inventory/routes" element={<RoutesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
      </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>
  )
}
