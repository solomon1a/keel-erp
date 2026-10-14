# Odoo Community Edition - Data Model & Entity Relationships

**Analyzed Version**: Odoo 17.0  
**Analysis Date**: October 14, 2026

This document visualizes the core data model of Odoo CE using Entity Relationship Diagrams.

---

## Table of Contents

1. [Core Entities](#core-entities)
2. [CRM Module](#crm-module)
3. [Sales Module](#sales-module)
4. [Purchase Module](#purchase-module)
5. [Inventory Module](#inventory-module)
6. [Accounting Module](#accounting-module)
7. [HR Module](#hr-module)
8. [Project Module](#project-module)
9. [Cross-Module Integration](#cross-module-integration)

---

## Core Entities

### Base System

```mermaid
erDiagram
    res_partner ||--o{ res_partner : "parent/child"
    res_partner ||--o{ res_users : "has"
    res_partner }o--|| res_country : "located in"
    res_partner }o--o| res_company : "is a"
    
    res_users ||--o{ res_groups : "belongs to"
    res_users }o--|| res_partner : "is a"
    res_users }o--|| res_company : "works for"
    
    res_company }o--|| res_partner : "is a"
    res_company }o--|| res_currency : "uses"
    res_company ||--o{ res_company : "parent/child"
    
    res_partner {
        int id PK
        string name
        string email
        string phone
        int parent_id FK
        int country_id FK
        int company_id FK
        boolean is_company
        int customer_rank
        int supplier_rank
    }
    
    res_users {
        int id PK
        int partner_id FK
        string login
        string password
        string lang
        string tz
    }
    
    res_company {
        int id PK
        int partner_id FK
        string name
        int currency_id FK
        int parent_id FK
        binary logo
    }
    
    res_country {
        int id PK
        string name
        string code
    }
    
    res_currency {
        int id PK
        string name
        string symbol
        float rate
    }
    
    res_groups {
        int id PK
        string name
        string category_id
    }
```

---

## CRM Module

```mermaid
erDiagram
    crm_lead }o--|| res_partner : "customer"
    crm_lead }o--|| crm_stage : "in stage"
    crm_lead }o--|| crm_team : "assigned to"
    crm_lead }o--|| res_users : "owned by"
    crm_lead }o--o| utm_campaign : "tracked by"
    crm_lead }o--o| utm_source : "came from"
    crm_lead }o--o| utm_medium : "via"
    
    crm_team ||--o{ res_users : "has members"
    crm_team }o--|| res_users : "led by"
    
    crm_lead {
        int id PK
        string name
        string type "lead/opportunity"
        int partner_id FK
        int stage_id FK
        int team_id FK
        int user_id FK
        float expected_revenue
        float probability
        int campaign_id FK
        int source_id FK
        int medium_id FK
        datetime date_deadline
    }
    
    crm_stage {
        int id PK
        string name
        int sequence
        boolean is_won
        boolean fold
    }
    
    crm_team {
        int id PK
        string name
        int user_id FK "team leader"
        boolean assignment_enabled
    }
    
    utm_campaign {
        int id PK
        string name
    }
    
    utm_source {
        int id PK
        string name
    }
    
    utm_medium {
        int id PK
        string name
    }
```

---

## Sales Module

```mermaid
erDiagram
    sale_order }o--|| res_partner : "customer"
    sale_order }o--o| res_partner : "invoice address"
    sale_order }o--o| res_partner : "shipping address"
    sale_order ||--o{ sale_order_line : "contains"
    sale_order ||--o{ stock_picking : "generates"
    sale_order ||--o{ account_move : "invoices"
    sale_order }o--|| res_users : "salesperson"
    sale_order }o--|| crm_team : "sales team"
    
    sale_order_line }o--|| sale_order : "part of"
    sale_order_line }o--|| product_product : "sells"
    sale_order_line }o--|| uom_uom : "unit"
    sale_order_line }o--o{ account_tax : "applies taxes"
    
    product_product }o--|| product_template : "variant of"
    product_template }o--|| uom_uom : "sold in"
    product_template }o--|| product_category : "categorized"
    
    sale_order {
        int id PK
        string name
        int partner_id FK
        int partner_invoice_id FK
        int partner_shipping_id FK
        string state "draft/sent/sale/done/cancel"
        float amount_total
        float amount_untaxed
        float amount_tax
        datetime date_order
        int user_id FK
        int team_id FK
    }
    
    sale_order_line {
        int id PK
        int order_id FK
        int product_id FK
        float product_uom_qty
        int product_uom FK
        float price_unit
        float discount
        float price_subtotal
        float qty_delivered
        float qty_invoiced
    }
    
    product_product {
        int id PK
        int product_tmpl_id FK
        string default_code "SKU"
        string barcode
    }
    
    product_template {
        int id PK
        string name
        string type "consu/service/product"
        float list_price
        float standard_price "cost"
        int uom_id FK
        int categ_id FK
        boolean sale_ok
        boolean purchase_ok
    }
    
    uom_uom {
        int id PK
        string name "Units/Hours/kg"
    }
```

---

## Purchase Module

```mermaid
erDiagram
    purchase_order }o--|| res_partner : "vendor"
    purchase_order ||--o{ purchase_order_line : "contains"
    purchase_order ||--o{ stock_picking : "generates"
    purchase_order ||--o{ account_move : "bills"
    purchase_order }o--|| res_users : "responsible"
    
    purchase_order_line }o--|| purchase_order : "part of"
    purchase_order_line }o--|| product_product : "purchases"
    purchase_order_line }o--|| uom_uom : "unit"
    purchase_order_line }o--o{ account_tax : "applies taxes"
    
    purchase_order {
        int id PK
        string name
        int partner_id FK
        string state "draft/sent/to_approve/purchase/done/cancel"
        float amount_total
        float amount_untaxed
        datetime date_order
        datetime date_planned
        int user_id FK
    }
    
    purchase_order_line {
        int id PK
        int order_id FK
        int product_id FK
        float product_qty
        int product_uom FK
        float price_unit
        float price_subtotal
        float qty_received
        float qty_invoiced
    }
```

---

## Inventory Module

```mermaid
erDiagram
    stock_picking }o--|| stock_picking_type : "type"
    stock_picking }o--|| stock_location : "from"
    stock_picking }o--|| stock_location : "to"
    stock_picking }o--o| res_partner : "customer/vendor"
    stock_picking ||--o{ stock_move : "contains"
    stock_picking }o--o| sale_order : "linked to"
    stock_picking }o--o| purchase_order : "linked to"
    
    stock_move }o--|| stock_picking : "part of"
    stock_move }o--|| product_product : "moves"
    stock_move }o--|| stock_location : "from"
    stock_move }o--|| stock_location : "to"
    stock_move }o--|| uom_uom : "unit"
    stock_move }o--o| stock_move : "parent/child"
    
    stock_quant }o--|| product_product : "quantity of"
    stock_quant }o--|| stock_location : "stored at"
    stock_quant }o--o| stock_lot : "lot/serial"
    stock_quant }o--o| stock_quant_package : "in package"
    
    stock_location ||--o{ stock_location : "parent/child"
    stock_location }o--|| stock_warehouse : "belongs to"
    
    stock_warehouse }o--|| stock_location : "stock location"
    stock_warehouse }o--|| res_company : "company"
    
    stock_picking {
        int id PK
        string name
        int picking_type_id FK
        int location_id FK
        int location_dest_id FK
        int partner_id FK
        string state "draft/waiting/confirmed/assigned/done/cancel"
        string origin "SO001/PO001"
        datetime scheduled_date
        datetime date_done
    }
    
    stock_move {
        int id PK
        string name
        int picking_id FK
        int product_id FK
        float product_uom_qty
        int product_uom FK
        int location_id FK
        int location_dest_id FK
        string state "draft/confirmed/assigned/done/cancel"
        float quantity_done
        int move_dest_ids FK "chained moves"
    }
    
    stock_quant {
        int id PK
        int product_id FK
        int location_id FK
        float quantity
        float reserved_quantity
        int lot_id FK
        int package_id FK
    }
    
    stock_location {
        int id PK
        string name
        int location_id FK "parent"
        string usage "supplier/internal/customer/inventory/production/transit"
        int warehouse_id FK
    }
    
    stock_warehouse {
        int id PK
        string name
        string code
        int lot_stock_id FK
        int company_id FK
    }
    
    stock_picking_type {
        int id PK
        string name "Receipts/Delivery Orders/Internal"
        string code "incoming/outgoing/internal"
        int warehouse_id FK
    }
    
    stock_lot {
        int id PK
        string name "serial/lot number"
        int product_id FK
    }
```

---

## Accounting Module

```mermaid
erDiagram
    account_move }o--|| res_partner : "partner"
    account_move }o--|| account_journal : "posted in"
    account_move ||--o{ account_move_line : "contains"
    account_move }o--o| sale_order : "from"
    account_move }o--o| purchase_order : "from"
    account_move }o--|| res_company : "company"
    
    account_move_line }o--|| account_move : "part of"
    account_move_line }o--|| account_account : "account"
    account_move_line }o--o| res_partner : "partner"
    account_move_line }o--o| product_product : "product"
    account_move_line }o--o{ account_tax : "taxes"
    account_move_line }o--o| account_full_reconcile : "reconciled"
    
    account_account }o--|| account_account : "parent/child"
    account_account }o--|| res_company : "company"
    account_account }o--o| res_currency : "currency"
    
    account_journal }o--|| res_company : "company"
    account_journal }o--|| account_account : "default debit account"
    account_journal }o--|| account_account : "default credit account"
    
    account_payment }o--|| res_partner : "partner"
    account_payment }o--|| account_journal : "journal"
    account_payment ||--o{ account_move : "generates"
    account_payment }o--o{ account_move : "reconciles"
    
    account_move {
        int id PK
        string name "INV/2024/0001"
        string move_type "entry/out_invoice/in_invoice/out_refund/in_refund"
        int partner_id FK
        int journal_id FK
        string state "draft/posted/cancel"
        float amount_total
        float amount_untaxed
        float amount_tax
        float amount_residual "amount due"
        date date
        date invoice_date
        date invoice_date_due
        string invoice_origin "SO001"
        string payment_state "not_paid/in_payment/paid"
    }
    
    account_move_line {
        int id PK
        int move_id FK
        int account_id FK
        int partner_id FK
        int product_id FK
        string name "description"
        float debit
        float credit
        float balance
        float quantity
        float price_unit
        int full_reconcile_id FK
    }
    
    account_account {
        int id PK
        string code "100000"
        string name "Cash"
        string account_type "asset_cash/liability_payable/income/expense"
        boolean reconcile
        int company_id FK
        int currency_id FK
    }
    
    account_journal {
        int id PK
        string name "Bank/Cash/Sales/Purchases"
        string type "sale/purchase/cash/bank/general"
        int company_id FK
        int default_account_id FK
    }
    
    account_payment {
        int id PK
        string payment_type "inbound/outbound"
        string partner_type "customer/supplier"
        int partner_id FK
        float amount
        int journal_id FK
        string state "draft/posted/reconciled/cancel"
    }
    
    account_tax {
        int id PK
        string name "Sales Tax 10%"
        float amount
        string amount_type "percent/fixed"
        string type_tax_use "sale/purchase/none"
    }
    
    account_full_reconcile {
        int id PK
        string name "REC001"
    }
```

---

## HR Module

```mermaid
erDiagram
    hr_employee ||--o{ hr_employee : "manager/subordinates"
    hr_employee }o--o| res_users : "user"
    hr_employee }o--|| hr_department : "works in"
    hr_employee }o--|| hr_job : "position"
    hr_employee }o--|| res_partner : "private address"
    hr_employee }o--|| res_company : "company"
    hr_employee }o--o| hr_employee : "coach"
    
    hr_department ||--o{ hr_department : "parent/child"
    hr_department }o--|| hr_employee : "managed by"
    hr_department }o--|| res_company : "company"
    
    hr_job }o--|| hr_department : "department"
    hr_job }o--|| res_company : "company"
    
    hr_employee {
        int id PK
        string name
        int user_id FK
        int address_home_id FK
        string work_email
        string work_phone
        string mobile_phone
        int job_id FK
        string job_title
        int department_id FK
        int parent_id FK "manager"
        int coach_id FK
        int company_id FK
        string employee_type "employee/student/trainee/contractor"
        boolean active
        date departure_date
    }
    
    hr_department {
        int id PK
        string name
        int parent_id FK
        int manager_id FK
        int company_id FK
    }
    
    hr_job {
        int id PK
        string name
        int department_id FK
        int no_of_recruitment "open positions"
        int no_of_employee "current count"
        text description
        text requirements
    }
```

---

## Project Module

```mermaid
erDiagram
    project_project ||--o{ project_task : "contains"
    project_project }o--|| res_users : "managed by"
    project_project }o--o| res_partner : "customer"
    project_project }o--o{ project_task_type : "stages"
    
    project_task }o--|| project_project : "belongs to"
    project_task }o--o{ res_users : "assigned to"
    project_task }o--o| res_partner : "customer"
    project_task }o--|| project_task_type : "stage"
    project_task ||--o{ project_task : "parent/subtasks"
    project_task }o--o{ project_task : "depends on"
    
    project_project {
        int id PK
        string name
        text description
        int user_id FK "project manager"
        int partner_id FK "customer"
        string privacy_visibility
        date date_start
        date date "expiration"
        boolean active
    }
    
    project_task {
        int id PK
        string name
        text description
        int project_id FK
        int stage_id FK
        int partner_id FK
        string priority "0/1"
        string kanban_state "normal/done/blocked"
        date date_deadline
        datetime date_assign
        datetime date_end
        int parent_id FK
    }
    
    project_task_type {
        int id PK
        string name "Todo/In Progress/Done"
        text description
        int sequence
        boolean fold
    }
```

---

## Cross-Module Integration

### Full Sales-to-Cash Flow

```mermaid
erDiagram
    crm_lead ||--o| sale_order : "converts to"
    sale_order ||--o{ sale_order_line : "has lines"
    sale_order_line }o--|| product_product : "sells"
    
    sale_order ||--|| stock_picking : "triggers delivery"
    stock_picking ||--o{ stock_move : "contains moves"
    stock_move }o--|| product_product : "moves"
    stock_move }o--|| stock_location : "from/to"
    
    stock_move ||--o| stock_quant : "updates inventory"
    stock_quant }o--|| product_product : "quantity of"
    stock_quant }o--|| stock_location : "at"
    
    sale_order ||--o{ account_move : "creates invoices"
    account_move ||--o{ account_move_line : "has lines"
    account_move_line }o--|| account_account : "posts to"
    
    account_move ||--o| account_payment : "paid by"
    account_payment ||--o| account_full_reconcile : "reconciles"
    
    crm_lead {
        int id PK
        string name
        int partner_id FK
    }
    
    sale_order {
        int id PK
        string name
        int partner_id FK
        string state
    }
    
    stock_picking {
        int id PK
        string origin "SO001"
        string state
    }
    
    account_move {
        int id PK
        string invoice_origin "SO001"
        string payment_state
    }
```

### Full Purchase-to-Pay Flow

```mermaid
erDiagram
    res_partner ||--o{ purchase_order : "vendor"
    purchase_order ||--o{ purchase_order_line : "has lines"
    purchase_order_line }o--|| product_product : "purchases"
    
    purchase_order ||--|| stock_picking : "triggers receipt"
    stock_picking ||--o{ stock_move : "contains moves"
    stock_move ||--o| stock_quant : "updates inventory"
    
    purchase_order ||--o{ account_move : "creates bills"
    account_move ||--o{ account_move_line : "has lines"
    
    account_move ||--o| account_payment : "paid by"
    
    purchase_order {
        int id PK
        string name
        int partner_id FK
        string state
    }
    
    stock_picking {
        int id PK
        string origin "PO001"
        string state
    }
    
    account_move {
        int id PK
        string invoice_origin "PO001"
        string move_type "in_invoice"
    }
```

### res.partner as Central Hub

```mermaid
erDiagram
    res_partner ||--o{ crm_lead : "customer in CRM"
    res_partner ||--o{ sale_order : "customer in Sales"
    res_partner ||--o{ purchase_order : "vendor in Purchase"
    res_partner ||--o{ stock_picking : "delivery/receipt address"
    res_partner ||--o{ account_move : "customer/vendor invoice"
    res_partner ||--o{ account_payment : "pays/receives"
    res_partner ||--o{ project_project : "customer"
    res_partner ||--o{ project_task : "customer contact"
    res_partner ||--o{ hr_employee : "private address"
    res_partner ||--o{ res_users : "is a user"
    res_partner ||--o{ res_company : "is a company"
    res_partner ||--o{ res_partner : "parent company"
    
    res_partner {
        int id PK
        string name
        string email
        string phone
        boolean is_company
        int parent_id FK
        int country_id FK
        int customer_rank
        int supplier_rank
    }
```

---

## Database Schema Notes

### Table Naming Convention
- Model `res.partner` → Table `res_partner`
- Model `sale.order` → Table `sale_order`
- Underscores replace dots

### Standard Columns (All Models)
```sql
id SERIAL PRIMARY KEY
create_uid INTEGER REFERENCES res_users(id)
create_date TIMESTAMP WITHOUT TIME ZONE
write_uid INTEGER REFERENCES res_users(id)
write_date TIMESTAMP WITHOUT TIME ZONE
```

### Many2many Relationship Tables
Automatically created with naming pattern: `{model1}_{model2}_rel`

Example: `sale_order_line` ↔ `account_tax`
```sql
CREATE TABLE sale_order_line_account_tax_rel (
    sale_order_line_id INTEGER REFERENCES sale_order_line(id) ON DELETE CASCADE,
    account_tax_id INTEGER REFERENCES account_tax(id) ON DELETE CASCADE,
    PRIMARY KEY (sale_order_line_id, account_tax_id)
);
```

### Inheritance Implementation
- **Classical inheritance**: Separate tables, copy fields
- **Extension**: Same table, add columns
- **Delegation (_inherits)**: Separate tables with foreign key

Example: `res.users` inherits from `res.partner` via delegation
```sql
-- res_partner table exists
CREATE TABLE res_users (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER REFERENCES res_partner(id) ON DELETE CASCADE,
    login VARCHAR NOT NULL,
    password VARCHAR,
    -- ... other user-specific fields
);
```

### Indexes
Odoo automatically creates indexes on:
- Primary keys (id)
- Foreign keys (Many2one fields)
- Fields with `index=True`
- Fields marked `required=True` if frequently queried

---

## Summary Statistics

**Total Core Tables**: ~400+ tables across all modules

**Key Relationships**:
- res.partner: Central hub, referenced by ~50+ models
- product.product: Referenced by sales, purchase, stock, accounting
- account.move: Links to sales, purchase, stock (invoice_origin)
- stock.picking: Links to sales, purchase (origin field)

**Cross-Module Foreign Keys**:
- Every business module references res.partner
- Stock links to sales (sale_id) and purchase (purchase_id)
- Accounting links to sales (invoice_origin), purchase, stock
- All modules use res.company for multi-tenancy
- All transactional models use res.users for audit trail (create_uid, write_uid)

---

## Next Steps

See [BUILD_OUR_OWN.md](BUILD_OUR_OWN.md) for recommendations on implementing a similar architecture with modern technologies.
