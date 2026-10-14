# Odoo Community Edition - Core Business Modules

**Analyzed Version**: Odoo 17.0  
**Analysis Date**: October 14, 2026

This document maps the core business applications in Odoo CE, showing how they connect and what models they provide.

---

## Table of Contents

1. [Module Dependency Map](#module-dependency-map)
2. [Base Module](#base-module)
3. [Contacts (Base)](#contacts-base)
4. [CRM](#crm)
5. [Sales](#sales)
6. [Purchase](#purchase)
7. [Inventory (Stock)](#inventory-stock)
8. [Accounting](#accounting)
9. [Human Resources](#human-resources)
10. [Project](#project)
11. [Website](#website)
12. [Mail & Activity](#mail--activity)

---

## Module Dependency Map

```
base (foundation)
├── web (web client)
├── mail (messaging)
│   └── calendar
├── contacts (partner management)
├── crm (leads & opportunities)
│   ├── depends: mail, calendar
│   └── extends: res.partner
├── sale (sales orders)
│   ├── depends: crm
│   └── uses: product, account
├── purchase (purchase orders)
│   ├── depends: base
│   └── uses: product, account
├── stock (inventory)
│   ├── depends: product
│   └── uses: sale, purchase
├── account (accounting)
│   ├── depends: base
│   └── used by: sale, purchase, stock
├── hr (human resources)
│   ├── depends: base, mail
│   └── extends: res.users
├── project (project management)
│   ├── depends: mail, web
│   └── optionally uses: sale, hr
└── website (public website)
    ├── depends: web, http_routing
    └── extends: ir.ui.view
```

---

## Base Module

**Location**: `odoo/addons/base/`  
**Dependencies**: None (foundation module)

### Purpose
The kernel of Odoo - provides fundamental infrastructure for all other modules.

### Key Models

#### res.partner (Contact/Company)
```python
# Location: odoo/addons/base/models/res_partner.py
class Partner(models.Model):
    _name = 'res.partner'
    _description = 'Contact'
    
    # Key fields
    name = fields.Char(required=True, index=True)
    email = fields.Char()
    phone = fields.Char()
    mobile = fields.Char()
    website = fields.Char()
    
    # Type
    company_type = fields.Selection([
        ('person', 'Individual'),
        ('company', 'Company'),
    ])
    is_company = fields.Boolean()
    
    # Address
    street = fields.Char()
    street2 = fields.Char()
    city = fields.Char()
    state_id = fields.Many2one('res.country.state')
    country_id = fields.Many2one('res.country')
    zip = fields.Char()
    
    # Relations
    parent_id = fields.Many2one('res.partner')  # Parent company
    child_ids = fields.One2many('res.partner', 'parent_id')  # Contacts
    user_ids = fields.One2many('res.users', 'partner_id')  # Users
    
    # Business flags
    customer_rank = fields.Integer()  # Customer activity count
    supplier_rank = fields.Integer()  # Supplier activity count
```

**Central entity** - Extended by almost every module:
- CRM adds: `opportunity_ids`, `team_id`
- Sales adds: `sale_order_ids`, `sale_order_count`
- Purchase adds: `purchase_order_ids`
- Accounting adds: `property_account_receivable_id`, `property_account_payable_id`

#### res.users (System User)
```python
class Users(models.Model):
    _name = 'res.users'
    _inherits = {'res.partner': 'partner_id'}  # User IS a partner
    
    partner_id = fields.Many2one('res.partner', required=True)
    login = fields.Char(required=True)
    password = fields.Char()
    
    # Groups & Access
    groups_id = fields.Many2many('res.groups')
    
    # UI Preferences
    lang = fields.Selection()  # Language
    tz = fields.Selection()    # Timezone
    
    # Session
    action_id = fields.Many2one('ir.actions.actions')  # Home action
```

#### res.company (Company)
```python
class Company(models.Model):
    _name = 'res.company'
    _inherits = {'res.partner': 'partner_id'}
    
    partner_id = fields.Many2one('res.partner', required=True)
    name = fields.Char(related='partner_id.name')
    
    # Multi-company
    parent_id = fields.Many2one('res.company')
    child_ids = fields.One2many('res.company', 'parent_id')
    
    # Accounting
    currency_id = fields.Many2one('res.currency', required=True)
    
    # Branding
    logo = fields.Binary()
    primary_color = fields.Char()
    secondary_color = fields.Char()
```

#### res.currency
```python
class Currency(models.Model):
    _name = 'res.currency'
    
    name = fields.Char(required=True)  # USD, EUR
    symbol = fields.Char(required=True)  # $, €
    rate = fields.Float(compute='_compute_current_rate')
    rate_ids = fields.One2many('res.currency.rate', 'currency_id')
```

### Key Infrastructure Models

- **ir.model** - Model registry (metadata)
- **ir.model.fields** - Field definitions
- **ir.ui.view** - View definitions (XML)
- **ir.ui.menu** - Menu structure
- **ir.actions.act_window** - Window actions
- **ir.actions.server** - Automated actions
- **ir.actions.report** - Report definitions
- **ir.cron** - Scheduled jobs
- **ir.sequence** - Number sequences
- **ir.attachment** - File attachments
- **ir.rule** - Record rules (security)
- **ir.model.access** - Access rights
- **res.groups** - User groups

---

## Contacts (Base)

Contacts are part of the base module but form a complete application.

### Core Concept
**res.partner** is the universal entity for:
- Customers
- Suppliers (vendors)
- Employees (via res.users)
- Company contacts
- Addresses (via parent_id hierarchy)

### Relationships

```
res.partner (Company)
├── child_ids (Contacts)
│   ├── Contact 1
│   ├── Contact 2 (Invoice Address)
│   └── Contact 3 (Delivery Address)
└── user_ids (System Users)
```

---

## CRM

**Location**: `addons/crm/`  
**Dependencies**: `base`, `mail`, `calendar`, `utm` (marketing tracking)

### Purpose
Manage sales pipeline - leads, opportunities, activities.

### Key Models

#### crm.lead (Lead/Opportunity)
```python
class Lead(models.Model):
    _name = 'crm.lead'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    
    # Type
    type = fields.Selection([
        ('lead', 'Lead'),
        ('opportunity', 'Opportunity'),
    ])
    
    # Basic info
    name = fields.Char(string='Opportunity', required=True)
    partner_id = fields.Many2one('res.partner', string='Customer')
    email_from = fields.Char()
    phone = fields.Char()
    mobile = fields.Char()
    
    # Pipeline
    stage_id = fields.Many2one('crm.stage', group_expand='_read_group_stage_ids')
    team_id = fields.Many2one('crm.team', string='Sales Team')
    user_id = fields.Many2one('res.users', string='Salesperson')
    
    # Revenue
    expected_revenue = fields.Monetary()
    probability = fields.Float(string='Probability (%)')
    
    # Dates
    date_open = fields.Datetime(string='Assigning Date')
    date_closed = fields.Datetime(string='Closed Date')
    date_deadline = fields.Date(string='Expected Closing')
    
    # UTM Tracking
    campaign_id = fields.Many2one('utm.campaign')
    source_id = fields.Many2one('utm.source')
    medium_id = fields.Many2one('utm.medium')
    
    # Actions
    def action_set_won(self):
        """Mark opportunity as won"""
        
    def action_set_lost(self):
        """Mark opportunity as lost"""
```

#### crm.stage (Pipeline Stage)
```python
class Stage(models.Model):
    _name = 'crm.stage'
    _order = 'sequence, id'
    
    name = fields.Char(required=True)
    sequence = fields.Integer(default=1)
    is_won = fields.Boolean(string='Is Won Stage')
    fold = fields.Boolean(string='Folded in Kanban')
    
    # Requirements
    requirements = fields.Text()
```

#### crm.team (Sales Team)
```python
class Team(models.Model):
    _name = 'crm.team'
    
    name = fields.Char(required=True)
    user_id = fields.Many2one('res.users', string='Team Leader')
    member_ids = fields.Many2many('res.users', string='Team Members')
    
    # Assignments
    assignment_enabled = fields.Boolean()
    assignment_domain = fields.Char()
```

### CRM Flow

```
Lead (unqualified)
  └─> Convert to Opportunity
      ├─> Stage 1: Qualification
      ├─> Stage 2: Proposal
      ├─> Stage 3: Negotiation
      └─> Won/Lost
           └─> Create Sale Order (if won)
```

### Extends res.partner

```python
# In crm/models/res_partner.py
class Partner(models.Model):
    _inherit = 'res.partner'
    
    opportunity_ids = fields.One2many('crm.lead', 'partner_id')
    opportunity_count = fields.Integer(compute='_compute_opportunity_count')
    team_id = fields.Many2one('crm.team', string='Sales Team')
```

---

## Sales

**Location**: `addons/sale/`  
**Dependencies**: `base`, `product`, `account`, `portal`

### Purpose
Manage sales process - quotations, orders, delivery, invoicing.

### Key Models

#### sale.order (Sales Order/Quotation)
```python
class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'portal.mixin']
    
    name = fields.Char(string='Order Reference', required=True, default='New')
    
    # Customer
    partner_id = fields.Many2one('res.partner', required=True)
    partner_invoice_id = fields.Many2one('res.partner', string='Invoice Address')
    partner_shipping_id = fields.Many2one('res.partner', string='Delivery Address')
    
    # State
    state = fields.Selection([
        ('draft', 'Quotation'),
        ('sent', 'Quotation Sent'),
        ('sale', 'Sales Order'),
        ('done', 'Locked'),
        ('cancel', 'Cancelled'),
    ], default='draft', tracking=True)
    
    # Lines
    order_line = fields.One2many('sale.order.line', 'order_id')
    
    # Amounts
    amount_untaxed = fields.Monetary(compute='_amount_all', store=True)
    amount_tax = fields.Monetary(compute='_amount_all', store=True)
    amount_total = fields.Monetary(compute='__amount_all', store=True)
    
    # Dates
    date_order = fields.Datetime(required=True, default=fields.Datetime.now)
    validity_date = fields.Date()
    commitment_date = fields.Datetime()
    
    # Delivery & Invoicing
    picking_ids = fields.One2many('stock.picking', 'sale_id')
    delivery_count = fields.Integer(compute='_compute_picking_ids')
    invoice_ids = fields.Many2many('account.move')
    invoice_count = fields.Integer(compute='_get_invoiced')
    invoice_status = fields.Selection([
        ('upselling', 'Upselling Opportunity'),
        ('invoiced', 'Fully Invoiced'),
        ('to invoice', 'To Invoice'),
        ('no', 'Nothing to Invoice')
    ], compute='_get_invoice_status', store=True)
    
    # Actions
    def action_confirm(self):
        """Confirm quotation → sales order"""
        
    def action_cancel(self):
        """Cancel the order"""
        
    def _create_invoices(self):
        """Generate invoice(s) from order"""
```

#### sale.order.line (Order Line)
```python
class SaleOrderLine(models.Model):
    _name = 'sale.order.line'
    
    order_id = fields.Many2one('sale.order', required=True)
    
    # Product
    product_id = fields.Many2one('product.product', required=True)
    product_uom_qty = fields.Float(string='Quantity', required=True, default=1.0)
    product_uom = fields.Many2one('uom.uom', string='Unit of Measure')
    
    # Pricing
    price_unit = fields.Float(string='Unit Price', required=True)
    discount = fields.Float(string='Discount (%)')
    price_subtotal = fields.Monetary(compute='_compute_amount', store=True)
    price_total = fields.Monetary(compute='_compute_amount', store=True)
    
    # Tax
    tax_id = fields.Many2many('account.tax')
    
    # Delivery
    qty_delivered = fields.Float(string='Delivered Quantity')
    qty_to_deliver = fields.Float(compute='_compute_qty_to_deliver')
    
    # Invoicing
    qty_invoiced = fields.Float(string='Invoiced Quantity')
    qty_to_invoice = fields.Float(compute='_compute_qty_to_invoice')
```

### Sales Flow

```
Quotation (draft)
  ├─> Send by Email (sent)
  └─> Confirm (sale)
       ├─> Create Delivery Order (stock.picking)
       │    └─> Validate Delivery
       └─> Create Invoice (account.move)
            └─> Register Payment
                 └─> Done
```

---

## Purchase

**Location**: `addons/purchase/`  
**Dependencies**: `base`, `product`, `account`

### Purpose
Manage procurement - purchase orders, vendor management, receiving.

### Key Models

#### purchase.order (Purchase Order)
```python
class PurchaseOrder(models.Model):
    _name = 'purchase.order'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'portal.mixin']
    
    name = fields.Char(required=True, default='New')
    
    # Vendor
    partner_id = fields.Many2one('res.partner', required=True)
    
    # State
    state = fields.Selection([
        ('draft', 'RFQ'),
        ('sent', 'RFQ Sent'),
        ('to approve', 'To Approve'),
        ('purchase', 'Purchase Order'),
        ('done', 'Locked'),
        ('cancel', 'Cancelled')
    ], default='draft', tracking=True)
    
    # Lines
    order_line = fields.One2many('purchase.order.line', 'order_id')
    
    # Amounts
    amount_untaxed = fields.Monetary(compute='_amount_all', store=True)
    amount_total = fields.Monetary(compute='_amount_all', store=True)
    
    # Dates
    date_order = fields.Datetime(default=fields.Datetime.now)
    date_approve = fields.Datetime()
    date_planned = fields.Datetime(string='Expected Arrival')
    
    # Receipt & Invoicing
    picking_ids = fields.One2many('stock.picking', 'purchase_id')
    invoice_ids = fields.Many2many('account.move')
    invoice_status = fields.Selection([
        ('no', 'Nothing to Bill'),
        ('to invoice', 'Waiting Bills'),
        ('invoiced', 'Fully Billed'),
    ])
    
    def button_confirm(self):
        """Confirm purchase order"""
        
    def button_approve(self):
        """Approve purchase order"""
```

#### purchase.order.line
```python
class PurchaseOrderLine(models.Model):
    _name = 'purchase.order.line'
    
    order_id = fields.Many2one('purchase.order', required=True)
    
    product_id = fields.Many2one('product.product', required=True)
    product_qty = fields.Float(string='Quantity', required=True)
    product_uom = fields.Many2one('uom.uom')
    
    price_unit = fields.Float(required=True)
    price_subtotal = fields.Monetary(compute='_compute_amount', store=True)
    
    taxes_id = fields.Many2many('account.tax')
    
    # Receipt
    qty_received = fields.Float()
    qty_invoiced = fields.Float()
```

### Purchase Flow

```
RFQ (draft)
  ├─> Send to Vendor (sent)
  └─> Confirm (purchase)
       ├─> Create Receipt (stock.picking)
       │    └─> Validate Receipt
       └─> Create Vendor Bill (account.move)
            └─> Pay Bill
                 └─> Done
```

---

## Inventory (Stock)

**Location**: `addons/stock/`  
**Dependencies**: `product`, `base`  
**Integrates with**: `sale`, `purchase`, `mrp` (manufacturing)

### Purpose
Manage inventory, warehouse operations, logistics.

### Key Models

#### stock.picking (Transfer/Delivery Order)
```python
class Picking(models.Model):
    _name = 'stock.picking'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    
    name = fields.Char(default='/')
    
    # Type
    picking_type_id = fields.Many2one('stock.picking.type', required=True)
    
    # State
    state = fields.Selection([
        ('draft', 'Draft'),
        ('waiting', 'Waiting'),
        ('confirmed', 'Confirmed'),
        ('assigned', 'Ready'),
        ('done', 'Done'),
        ('cancel', 'Cancelled'),
    ], default='draft')
    
    # Partner
    partner_id = fields.Many2one('res.partner')
    
    # Locations
    location_id = fields.Many2one('stock.location', required=True)
    location_dest_id = fields.Many2one('stock.location', required=True)
    
    # Lines
    move_ids = fields.One2many('stock.move', 'picking_id')
    move_ids_without_package = fields.One2many('stock.move', 'picking_id')
    
    # Dates
    scheduled_date = fields.Datetime()
    date_done = fields.Datetime()
    
    # Origin
    origin = fields.Char(string='Source Document')  # e.g., "SO001"
    
    def button_validate(self):
        """Process the transfer"""
        
    def action_cancel(self):
        """Cancel the transfer"""
```

#### stock.move (Stock Move)
```python
class StockMove(models.Model):
    _name = 'stock.move'
    
    name = fields.Char(required=True)
    picking_id = fields.Many2one('stock.picking')
    
    # Product
    product_id = fields.Many2one('product.product', required=True)
    product_uom_qty = fields.Float(required=True)
    product_uom = fields.Many2one('uom.uom', required=True)
    
    # Locations
    location_id = fields.Many2one('stock.location', required=True)
    location_dest_id = fields.Many2one('stock.location', required=True)
    
    # State
    state = fields.Selection([
        ('draft', 'New'),
        ('confirmed', 'Waiting'),
        ('assigned', 'Available'),
        ('done', 'Done'),
        ('cancel', 'Cancelled'),
    ], default='draft')
    
    # Quantity done
    quantity = fields.Float(compute='_compute_quantity')
```

#### stock.quant (Stock Quantity)
```python
class StockQuant(models.Model):
    _name = 'stock.quant'
    
    product_id = fields.Many2one('product.product', required=True)
    location_id = fields.Many2one('stock.location', required=True)
    
    quantity = fields.Float()
    reserved_quantity = fields.Float()
    available_quantity = fields.Float(compute='_compute_available_quantity')
    
    lot_id = fields.Many2one('stock.lot')  # Serial/Lot number
    package_id = fields.Many2one('stock.quant.package')
```

#### stock.location (Location)
```python
class Location(models.Model):
    _name = 'stock.location'
    _parent_name = "location_id"
    _parent_store = True
    
    name = fields.Char(required=True)
    
    # Hierarchy
    location_id = fields.Many2one('stock.location', string='Parent Location')
    child_ids = fields.One2many('stock.location', 'location_id')
    
    # Type
    usage = fields.Selection([
        ('supplier', 'Vendor Location'),
        ('view', 'View'),
        ('internal', 'Internal Location'),
        ('customer', 'Customer Location'),
        ('inventory', 'Inventory Loss'),
        ('production', 'Production'),
        ('transit', 'Transit Location'),
    ], required=True)
    
    # Warehouse
    warehouse_id = fields.Many2one('stock.warehouse')
```

### Stock Architecture

```
Warehouse
├── Stock Location (internal)
│   ├── Shelf A
│   └── Shelf B
├── Input Location (internal)
├── QC Location (internal)
├── Packing Zone (internal)
└── Output Location (internal)

External Locations:
├── Vendors (supplier)
├── Customers (customer)
└── Transit (transit)
```

### Stock Operations

```
Delivery Order (Outgoing)
  stock.picking [Internal → Customer]
    └── stock.move: Product A, Qty 10

Receipt (Incoming)
  stock.picking [Vendor → Internal]
    └── stock.move: Product B, Qty 20

Internal Transfer
  stock.picking [Location A → Location B]
    └── stock.move: Product C, Qty 5
```

---

## Accounting

**Location**: `addons/account/`  
**Dependencies**: `base`, `product`  
**Used by**: `sale`, `purchase`, `stock`, `hr_expense`

### Purpose
Financial management - invoicing, payments, reports, taxes.

### Key Models

#### account.move (Journal Entry/Invoice/Bill)
```python
class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'portal.mixin']
    
    name = fields.Char(string='Number', default='/')
    
    # Type
    move_type = fields.Selection([
        ('entry', 'Journal Entry'),
        ('out_invoice', 'Customer Invoice'),
        ('out_refund', 'Customer Credit Note'),
        ('in_invoice', 'Vendor Bill'),
        ('in_refund', 'Vendor Credit Note'),
        ('out_receipt', 'Sales Receipt'),
        ('in_receipt', 'Purchase Receipt'),
    ], required=True, default='entry')
    
    # State
    state = fields.Selection([
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('cancel', 'Cancelled'),
    ], default='draft')
    
    # Partner
    partner_id = fields.Many2one('res.partner')
    
    # Lines
    line_ids = fields.One2many('account.move.line', 'move_id')
    invoice_line_ids = fields.One2many('account.move.line', 'move_id',
                                       domain=[('display_type', 'not in', ('line_section', 'line_note'))])
    
    # Amounts
    amount_untaxed = fields.Monetary(compute='_compute_amount')
    amount_tax = fields.Monetary(compute='_compute_amount')
    amount_total = fields.Monetary(compute='_compute_amount')
    amount_residual = fields.Monetary(compute='_compute_amount')  # Amount due
    
    # Payment
    payment_state = fields.Selection([
        ('not_paid', 'Not Paid'),
        ('in_payment', 'In Payment'),
        ('paid', 'Paid'),
        ('partial', 'Partially Paid'),
        ('reversed', 'Reversed'),
        ('invoicing_legacy', 'Invoicing App Legacy'),
    ], compute='_compute_payment_state')
    
    # Dates
    date = fields.Date(required=True, default=fields.Date.context_today)
    invoice_date = fields.Date()
    invoice_date_due = fields.Date()
    
    # Journal
    journal_id = fields.Many2one('account.journal', required=True)
    
    # Source document
    invoice_origin = fields.Char(string='Source Document')  # e.g., "SO001"
    
    def action_post(self):
        """Post the journal entry/invoice"""
        
    def button_cancel(self):
        """Cancel the invoice"""
        
    def action_register_payment(self):
        """Register payment wizard"""
```

#### account.move.line (Journal Item)
```python
class AccountMoveLine(models.Model):
    _name = 'account.move.line'
    
    move_id = fields.Many2one('account.move', required=True)
    
    # Account
    account_id = fields.Many2one('account.account', required=True)
    
    # Product (for invoice lines)
    product_id = fields.Many2one('product.product')
    quantity = fields.Float()
    price_unit = fields.Float()
    discount = fields.Float()
    
    # Amounts
    debit = fields.Monetary(default=0.0)
    credit = fields.Monetary(default=0.0)
    balance = fields.Monetary(compute='_compute_balance', store=True)
    amount_currency = fields.Monetary()
    
    # Tax
    tax_ids = fields.Many2many('account.tax')
    tax_line_id = fields.Many2one('account.tax')  # If line is tax
    
    # Partner
    partner_id = fields.Many2one('res.partner')
    
    # Reconciliation
    full_reconcile_id = fields.Many2one('account.full.reconcile')
    matched_debit_ids = fields.One2many('account.partial.reconcile', 'credit_move_id')
    matched_credit_ids = fields.One2many('account.partial.reconcile', 'debit_move_id')
```

#### account.account (Chart of Accounts)
```python
class AccountAccount(models.Model):
    _name = 'account.account'
    
    name = fields.Char(required=True, index=True)
    code = fields.Char(size=64, required=True, index=True)
    
    # Type
    account_type = fields.Selection([
        ('asset_receivable', 'Receivable'),
        ('asset_cash', 'Bank and Cash'),
        ('asset_current', 'Current Assets'),
        ('asset_non_current', 'Non-current Assets'),
        ('asset_prepayments', 'Prepayments'),
        ('asset_fixed', 'Fixed Assets'),
        ('liability_payable', 'Payable'),
        ('liability_credit_card', 'Credit Card'),
        ('liability_current', 'Current Liabilities'),
        ('liability_non_current', 'Non-current Liabilities'),
        ('equity', 'Equity'),
        ('equity_unaffected', 'Current Year Earnings'),
        ('income', 'Income'),
        ('income_other', 'Other Income'),
        ('expense', 'Expenses'),
        ('expense_depreciation', 'Depreciation'),
        ('expense_direct_cost', 'Cost of Revenue'),
        ('off_balance', 'Off-Balance Sheet'),
    ], required=True)
    
    # Reconciliation
    reconcile = fields.Boolean(string='Allow Reconciliation')
    
    # Currency
    currency_id = fields.Many2one('res.currency')
```

#### account.payment (Payment)
```python
class AccountPayment(models.Model):
    _name = 'account.payment'
    
    # Type
    payment_type = fields.Selection([
        ('outbound', 'Send Money'),
        ('inbound', 'Receive Money'),
    ], required=True)
    
    partner_type = fields.Selection([
        ('customer', 'Customer'),
        ('supplier', 'Vendor'),
    ])
    
    partner_id = fields.Many2one('res.partner', required=True)
    amount = fields.Monetary(required=True)
    
    # Payment method
    journal_id = fields.Many2one('account.journal', required=True)
    payment_method_line_id = fields.Many2one('account.payment.method.line')
    
    # State
    state = fields.Selection([
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('sent', 'Sent'),
        ('reconciled', 'Reconciled'),
        ('cancel', 'Cancelled'),
    ], default='draft')
    
    # Reconciliation
    reconciled_invoice_ids = fields.Many2many('account.move')
```

### Accounting Flow

```
Customer Invoice (out_invoice)
  ├─> Post
  │    └─> Creates journal entry
  │         ├─> Debit: Accounts Receivable
  │         └─> Credit: Revenue
  └─> Register Payment
       ├─> Creates payment record
       └─> Reconciles with invoice
            └─> Invoice marked as Paid
```

---

## Human Resources

**Location**: `addons/hr/`  
**Dependencies**: `base`, `mail`, `resource`

### Purpose
Employee management, organization structure.

### Key Models

#### hr.employee (Employee)
```python
class Employee(models.Model):
    _name = 'hr.employee'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'resource.mixin', 'avatar.mixin']
    
    # Personal Info
    name = fields.Char(required=True)
    user_id = fields.Many2one('res.users')
    address_home_id = fields.Many2one('res.partner', string='Private Address')
    
    # Work Info
    work_email = fields.Char()
    work_phone = fields.Char()
    mobile_phone = fields.Char()
    work_location_id = fields.Many2one('hr.work.location')
    
    # Job
    job_id = fields.Many2one('hr.job', string='Job Position')
    job_title = fields.Char()
    department_id = fields.Many2one('hr.department')
    
    # Organization
    parent_id = fields.Many2one('hr.employee', string='Manager')
    child_ids = fields.One2many('hr.employee', 'parent_id', string='Subordinates')
    coach_id = fields.Many2one('hr.employee', string='Coach')
    
    # Contract
    company_id = fields.Many2one('res.company', required=True)
    employee_type = fields.Selection([
        ('employee', 'Employee'),
        ('student', 'Student'),
        ('trainee', 'Trainee'),
        ('contractor', 'Contractor'),
        ('freelance', 'Freelancer'),
    ], default='employee')
    
    # Status
    active = fields.Boolean(default=True)
    
    # Dates
    create_date = fields.Datetime()
    departure_date = fields.Date()
```

#### hr.department (Department)
```python
class Department(models.Model):
    _name = 'hr.department'
    
    name = fields.Char(required=True)
    
    # Hierarchy
    parent_id = fields.Many2one('hr.department', string='Parent Department')
    child_ids = fields.One2many('hr.department', 'parent_id')
    
    # Management
    manager_id = fields.Many2one('hr.employee', string='Manager')
    member_ids = fields.One2many('hr.employee', 'department_id')
    
    company_id = fields.Many2one('res.company')
```

#### hr.job (Job Position)
```python
class Job(models.Model):
    _name = 'hr.job'
    
    name = fields.Char(required=True)
    department_id = fields.Many2one('hr.department')
    
    # Recruitment
    no_of_recruitment = fields.Integer(string='Expected New Employees')
    no_of_employee = fields.Integer(compute='_compute_employees')
    no_of_hired_employee = fields.Integer()
    
    # Description
    description = fields.Html()
    requirements = fields.Text()
```

---

## Project

**Location**: `addons/project/`  
**Dependencies**: `base`, `mail`, `web`, `portal`, `rating`

### Purpose
Project and task management.

### Key Models

#### project.project (Project)
```python
class Project(models.Model):
    _name = 'project.project'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'portal.mixin', 'rating.parent.mixin']
    
    name = fields.Char(required=True)
    description = fields.Html()
    
    # Team
    user_id = fields.Many2one('res.users', string='Project Manager')
    partner_id = fields.Many2one('res.partner', string='Customer')
    
    # Tasks
    task_ids = fields.One2many('project.task', 'project_id')
    task_count = fields.Integer(compute='_compute_task_count')
    
    # Settings
    privacy_visibility = fields.Selection([
        ('followers', 'Invited internal users'),
        ('employees', 'All internal users'),
        ('portal', 'Invited portal users and all internal users'),
    ], default='employees')
    
    # Stages
    type_ids = fields.Many2many('project.task.type', string='Task Stages')
    
    # Dates
    date_start = fields.Date()
    date = fields.Date(string='Expiration Date')
    
    # Status
    active = fields.Boolean(default=True)
```

#### project.task (Task)
```python
class Task(models.Model):
    _name = 'project.task'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'portal.mixin', 'rating.mixin']
    
    name = fields.Char(required=True)
    description = fields.Html()
    
    # Project
    project_id = fields.Many2one('project.project', required=True)
    
    # Assignment
    user_ids = fields.Many2many('res.users', string='Assignees')
    partner_id = fields.Many2one('res.partner', string='Customer')
    
    # Stage
    stage_id = fields.Many2one('project.task.type', group_expand='_read_group_stage_ids')
    
    # Priority
    priority = fields.Selection([
        ('0', 'Normal'),
        ('1', 'Important'),
    ], default='0')
    
    # State
    kanban_state = fields.Selection([
        ('normal', 'In Progress'),
        ('done', 'Ready'),
        ('blocked', 'Blocked'),
    ], default='normal')
    
    # Dates
    date_deadline = fields.Date()
    date_assign = fields.Datetime()
    date_end = fields.Datetime()
    
    # Parent/Child
    parent_id = fields.Many2one('project.task', string='Parent Task')
    child_ids = fields.One2many('project.task', 'parent_id', string='Sub-tasks')
    
    # Depends on
    depend_on_ids = fields.Many2many('project.task', relation='task_dependencies_rel',
                                     column1='task_id', column2='depends_on_id')
```

#### project.task.type (Stage)
```python
class TaskType(models.Model):
    _name = 'project.task.type'
    _order = 'sequence, id'
    
    name = fields.Char(required=True)
    description = fields.Text()
    sequence = fields.Integer(default=1)
    
    project_ids = fields.Many2many('project.project')
    
    fold = fields.Boolean(string='Folded in Kanban')
```

---

## Website

**Location**: `addons/website/`  
**Dependencies**: `web`, `web_editor`, `http_routing`, `portal`

### Purpose
Public-facing website, CMS, e-commerce.

### Key Models

#### website (Website)
```python
class Website(models.Model):
    _name = 'website'
    
    name = fields.Char(required=True)
    domain = fields.Char()
    
    # Multi-website
    company_id = fields.Many2one('res.company')
    
    # Theme
    theme_id = fields.Many2one('ir.module.module')
    
    # SEO
    google_analytics_key = fields.Char()
    
    # Social
    social_facebook = fields.Char()
    social_twitter = fields.Char()
    social_linkedin = fields.Char()
```

#### website.page (Web Page)
```python
class Page(models.Model):
    _name = 'website.page'
    _inherit = ['website.seo.metadata', 'website.published.multi.mixin']
    
    name = fields.Char(required=True)
    url = fields.Char(required=True)
    view_id = fields.Many2one('ir.ui.view', required=True)
    
    website_id = fields.Many2one('website')
    
    # SEO
    website_meta_title = fields.Char()
    website_meta_description = fields.Text()
    website_meta_keywords = fields.Char()
    
    # Publishing
    is_published = fields.Boolean(default=True)
    date_publish = fields.Datetime()
```

---

## Mail & Activity

**Location**: `addons/mail/`  
**Dependencies**: `base`, `bus` (websocket)

### Purpose
Messaging, activity tracking, followers.

### Key Mixins

#### mail.thread (Chatter Mixin)
```python
class MailThread(models.AbstractModel):
    _name = 'mail.thread'
    
    message_ids = fields.One2many('mail.message', 'res_id')
    message_follower_ids = fields.One2many('mail.followers', 'res_id')
    message_partner_ids = fields.Many2many('res.partner', compute='_compute_message_partner_ids')
    
    # Methods
    def message_post(self, body='', subject=None, **kwargs):
        """Post a message"""
        
    def message_subscribe(self, partner_ids):
        """Add followers"""
        
    def activity_schedule(self, act_type_xmlid='', **kwargs):
        """Schedule an activity"""
```

#### mail.activity.mixin
```python
class ActivityMixin(models.AbstractModel):
    _name = 'mail.activity.mixin'
    _inherit = ['mail.thread']
    
    activity_ids = fields.One2many('mail.activity', 'res_id')
    activity_state = fields.Selection([
        ('overdue', 'Overdue'),
        ('today', 'Today'),
        ('planned', 'Planned')
    ], compute='_compute_activity_state')
```

---

## Module Integration Summary

### Data Flow Example: Sale Order to Invoice

```
1. Create Quotation (sale.order, state='draft')
   └─> Partner: res.partner
   └─> Lines: sale.order.line
        └─> Products: product.product

2. Confirm Order (state='sale')
   └─> Triggers: Delivery Order creation
        └─> stock.picking (Stock module)
             └─> stock.move for each line
             └─> Updates: stock.quant (inventory levels)

3. Deliver (stock.picking, state='done')
   └─> Updates: sale.order.line.qty_delivered

4. Create Invoice
   └─> account.move (type='out_invoice')
        └─> account.move.line for each sale line
        └─> Links: invoice_origin = 'SO001'

5. Post Invoice (state='posted')
   └─> Creates journal entries (debit/credit)
   └─> Updates: General Ledger

6. Register Payment
   └─> account.payment
        └─> Reconciles with invoice
        └─> Updates: payment_state = 'paid'
```

### Cross-Module References

Most modules extend **res.partner**:
- CRM: `opportunity_ids`, `team_id`
- Sales: `sale_order_ids`, `sale_order_count`
- Purchase: `purchase_order_ids`
- Accounting: `property_account_receivable_id`, `property_account_payable_id`
- Projects: `project_ids`
- HR: `employee_ids`

This makes **res.partner** the central hub of business data.

---

## Next Steps

See [DATA_MODEL.md](DATA_MODEL.md) for detailed entity relationship diagrams and [BUILD_OUR_OWN.md](BUILD_OUR_OWN.md) for recommendations on building a similar system.
