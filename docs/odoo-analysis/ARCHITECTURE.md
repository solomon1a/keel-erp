# Odoo Community Edition - Architecture Analysis

**Analyzed Version**: Odoo 17.0 (latest stable branch)  
**Analysis Date**: October 14, 2026  
**Source**: https://github.com/odoo/odoo (LGPL-3 License)

> **Note**: This analysis covers Odoo Community Edition only. Odoo Enterprise features are not included.

## REA Analysis Summary

**Tools Used**:
- REA `analyze-javascript-application` was used to analyze the web client JavaScript codebase (`addons/web/static/src`)
- Direct code reading and exploration for Python backend architecture
- Manifest file analysis for module structure

The web client contains **449 JavaScript modules** including views, widgets, services, and OWL components.

---

## Table of Contents

1. [Server Architecture](#server-architecture)
2. [Module System](#module-system)
3. [ORM (Object-Relational Mapping)](#orm-object-relational-mapping)
4. [Security Model](#security-model)
5. [View System](#view-system)
6. [Web Client (OWL Framework)](#web-client-owl-framework)
7. [RPC Communication](#rpc-communication)
8. [QWeb Reports](#qweb-reports)
9. [Database Layer](#database-layer)

---

## Server Architecture

### Entry Point: odoo-bin

**Location**: `./odoo-bin`

```python
#!/usr/bin/env python3
# set server timezone in UTC before time module imported
__import__('os').environ['TZ'] = 'UTC'
import odoo

if __name__ == "__main__":
    odoo.cli.main()
```

**Key aspects**:
- Forces UTC timezone globally
- Delegates to `odoo.cli.main()` for CLI handling
- Simple wrapper around the core framework

### Core Framework Structure

**Location**: `./odoo/`

```
odoo/
├── api.py              # Decorator-based API system (@api.model, @api.depends, etc.)
├── models.py           # Base ORM classes (Model, TransientModel, AbstractModel)
├── fields.py           # Field types (Char, Integer, Many2one, etc.)
├── http.py             # HTTP controllers, routing, request/response
├── sql_db.py           # Database connection pooling
├── cli/                # Command-line interface handlers
├── service/            # Server services (HTTP, cron, etc.)
├── modules/            # Module loading and registry
├── tools/              # Utilities (translation, caching, etc.)
└── addons/             # Built-in modules (base, web, etc.)
```

### HTTP Server & Controllers

**Location**: `odoo/http.py`

**Architecture**:
1. **Built on Werkzeug** - WSGI-based web framework
2. **Route decorators** - `@http.route('/path', auth='user', type='json')`
3. **Request context** - Thread-local request object with database cursor, user, session
4. **Controller inheritance** - Controllers can be extended/overridden

**Example Controller**:
```python
from odoo import http
from odoo.http import request

class MyController(http.Controller):
    @http.route('/my/endpoint', type='json', auth='user')
    def my_method(self, **kwargs):
        # Access current user, database
        user = request.env.user
        # Return JSON response
        return {'result': 'success'}
```

**Authentication modes**:
- `auth='user'` - Requires logged-in user
- `auth='public'` - Public access (anonymous user)
- `auth='none'` - No session/database access

**Response types**:
- `type='http'` - Standard HTTP response (HTML, files)
- `type='json'` - JSON-RPC response (for API calls)

### Module Registry

**Location**: `odoo/modules/registry.py`

**Key concepts**:
1. **Registry per database** - Each database has its own module registry
2. **Lazy loading** - Modules loaded on first request
3. **Model registration** - All models registered in registry by name
4. **Signal system** - Registry signals for module updates (install/upgrade/uninstall)

**Registry lifecycle**:
```
1. Database connection
2. Load installed modules from ir_module_module table
3. Import Python code (models, controllers)
4. Load data files (XML, CSV)
5. Build model registry
6. Initialize ORM relationships
```

---

## Module System

### Module Structure

**Required files**:
```
my_module/
├── __init__.py              # Python package init (imports models/)
├── __manifest__.py          # Module metadata and dependencies
├── models/                  # Python models
│   ├── __init__.py
│   └── my_model.py
├── views/                   # XML view definitions
│   └── my_views.xml
├── security/                # Access control
│   ├── ir.model.access.csv  # Model access rights
│   └── security.xml         # Record rules, groups
├── data/                    # Initial data
│   └── data.xml
└── static/                  # Web assets (JS, CSS, images)
    └── src/
```

### Manifest File (__manifest__.py)

**Example** from `odoo/addons/base/__manifest__.py`:

```python
{
    'name': 'Base',
    'version': '1.3',
    'category': 'Hidden',
    'description': """The kernel of Odoo""",
    
    # Dependencies - modules that must be installed first
    'depends': [],
    
    # Data files loaded in order
    'data': [
        'security/base_groups.xml',
        'security/base_security.xml',
        'security/ir.model.access.csv',
        'views/res_partner_views.xml',
        'data/res_country_data.xml',
    ],
    
    # Demo data (only loaded in demo mode)
    'demo': [
        'data/res_partner_demo.xml',
    ],
    
    # Web assets (JS/CSS bundles)
    'assets': {
        'web.assets_backend': [
            'base/static/src/**/*.js',
            'base/static/src/**/*.xml',
        ],
    },
    
    'installable': True,
    'auto_install': False,  # Install automatically if dependencies met
    'application': False,   # Top-level application (shows in app menu)
    'license': 'LGPL-3',
}
```

### Module Dependencies

**Resolution**:
- Topological sort based on `depends` field
- Cyclic dependencies are forbidden
- Base module is root of dependency tree

**Installation order**:
1. Check dependencies
2. Load Python code
3. Create database tables (from models)
4. Load data files (XML, CSV)
5. Update views and menus
6. Mark module as installed in `ir_module_module`

### Module States

```python
# From ir_module_module model
STATES = [
    ('uninstallable', 'Uninstallable'),
    ('uninstalled', 'Not Installed'),
    ('installed', 'Installed'),
    ('to upgrade', 'To be upgraded'),
    ('to remove', 'To be removed'),
    ('to install', 'To be installed'),
]
```

---

## ORM (Object-Relational Mapping)

### Model Types

**Location**: `odoo/models.py`

1. **Model** - Persistent database table
   ```python
   class Partner(models.Model):
       _name = 'res.partner'
       _description = 'Contact'
   ```

2. **TransientModel** - Temporary table (wizards, cleaned periodically)
   ```python
   class Wizard(models.TransientModel):
       _name = 'my.wizard'
   ```

3. **AbstractModel** - No table, mixin for inheritance
   ```python
   class MailThread(models.AbstractModel):
       _name = 'mail.thread'
   ```

### Field Types

**Location**: `odoo/fields.py`

**Basic fields**:
- `Char(string, size, required, readonly, index)`
- `Text(string)`
- `Integer(string)`
- `Float(string, digits)`
- `Boolean(string)`
- `Date(string)`
- `Datetime(string)`
- `Selection([('key', 'Label')], string)`
- `Html(string, sanitize)`
- `Binary(string, attachment)`

**Relational fields**:
- `Many2one('other.model', string, ondelete='cascade')`
- `One2many('other.model', 'inverse_field', string)`
- `Many2many('other.model', 'relation_table', 'column1', 'column2', string)`

**Special fields**:
- `Monetary(string, currency_field='currency_id')` - Amount with currency
- `Reference(selection, string)` - Generic relation
- `Properties(definition_property='properties_definition')` - JSON properties

### Model Inheritance

**Three types**:

1. **Classical inheritance** (`_inherit` + new `_name`)
   ```python
   class MyModel(models.Model):
       _name = 'my.model'
       _inherit = 'mail.thread'  # Copies all fields/methods
   ```

2. **Extension** (`_inherit` only, no new `_name`)
   ```python
   class PartnerExtension(models.Model):
       _inherit = 'res.partner'  # Extends existing model
       new_field = fields.Char('New Field')
   ```

3. **Delegation** (`_inherits`)
   ```python
   class User(models.Model):
       _name = 'res.users'
       _inherits = {'res.partner': 'partner_id'}  # Delegates to partner
       partner_id = fields.Many2one('res.partner', required=True)
   ```

### Recordsets & CRUD

**Recordset API** - All database operations return recordsets:

```python
# Recordset is a collection of records (can be empty)
partners = env['res.partner']

# Search returns recordset
found = partners.search([('name', 'like', 'John')])

# Create returns new record
new = partners.create({'name': 'John Doe'})

# Write modifies in-place
found.write({'phone': '123456'})

# Unlink deletes
found.unlink()

# Browse by ID(s)
partner = partners.browse(42)

# Iteration
for partner in found:
    print(partner.name)

# Access fields
name = partner.name
emails = partner.email  # Many2one returns recordset
```

### Computed Fields

**With @api.depends**:
```python
class Order(models.Model):
    _name = 'sale.order'
    
    line_ids = fields.One2many('sale.order.line', 'order_id')
    
    total = fields.Float(compute='_compute_total', store=True)
    
    @api.depends('line_ids.price')
    def _compute_total(self):
        for order in self:
            order.total = sum(line.price for line in order.line_ids)
```

**Key aspects**:
- `store=True` - Save to database (indexed, searchable)
- `store=False` - Computed on-the-fly (default)
- Dependencies trigger recomputation automatically
- Can depend on related field paths: `'partner_id.country_id.code'`

### Constraints

**SQL constraints**:
```python
class Partner(models.Model):
    _name = 'res.partner'
    _sql_constraints = [
        ('email_uniq', 'unique(email)', 'Email must be unique!'),
    ]
```

**Python constraints**:
```python
from odoo.exceptions import ValidationError

class Order(models.Model):
    _name = 'sale.order'
    
    @api.constrains('date', 'partner_id')
    def _check_date(self):
        for order in self:
            if order.date < fields.Date.today():
                raise ValidationError("Cannot create order in the past")
```

### ORM Methods & Decorators

**Common decorators**:
- `@api.model` - Class method (no self recordset)
- `@api.depends('field')` - Computed field dependencies
- `@api.constrains('field')` - Constraint validation
- `@api.onchange('field')` - UI onchange handler
- `@api.returns('model')` - Specify return model

**Lifecycle hooks**:
- `create(vals)` - Override creation
- `write(vals)` - Override updates
- `unlink()` - Override deletion
- `_compute_*` - Computed field methods
- `_inverse_*` - Inverse of computed field (for write)
- `_search_*` - Custom search for computed field

---

## Security Model

### Four Layers of Security

1. **Module ACL** - Control module installation
2. **Model Access Rights** - CRUD permissions per model per group
3. **Record Rules** - Row-level security (domain filters)
4. **Field-level Access** - Individual field permissions

### Groups

**Location**: `security/*.xml`

```xml
<odoo>
    <record id="group_sale_manager" model="res.groups">
        <field name="name">Sales Manager</field>
        <field name="category_id" ref="base.module_category_sales"/>
        <field name="implied_ids" eval="[(4, ref('group_sale_user'))]"/>
    </record>
</odoo>
```

**Key concepts**:
- Groups organized by category (module)
- Implied groups (hierarchy)
- Users can have multiple groups
- `base.group_user` - Internal user (employee)
- `base.group_public` - Public/portal user

### Model Access Rights (ACL)

**Location**: `security/ir.model.access.csv`

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_sale_order_user,sale.order.user,model_sale_order,group_sale_user,1,1,1,0
access_sale_order_manager,sale.order.manager,model_sale_order,group_sale_manager,1,1,1,1
```

**Columns**:
- `perm_read` - Can read records
- `perm_write` - Can update records  
- `perm_create` - Can create records
- `perm_unlink` - Can delete records

**Rules**:
- If no access rule defined → no access (deny by default)
- Multiple rules for same group → OR logic (most permissive wins)
- SuperUser bypasses all access checks

### Record Rules

**Location**: `security/*.xml`

```xml
<record id="sale_order_comp_rule" model="ir.rule">
    <field name="name">Sales Order: multi-company</field>
    <field name="model_id" ref="model_sale_order"/>
    <field name="domain_force">
        ['|', ('company_id', '=', False), ('company_id', 'in', company_ids)]
    </field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
</record>
```

**Key aspects**:
- Domain filter applied to all queries
- `domain_force` - Python domain expression
- `global` flag - Apply to all users (if True) or specific groups
- Multiple rules for user → AND logic (intersection)
- Variables available: `user`, `company_ids`, `time`

### Field-Level Security

```python
class SaleOrder(models.Model):
    _name = 'sale.order'
    
    secret_data = fields.Char(
        groups='base.group_system'  # Only system admin can see
    )
```

**Behavior**:
- Field not visible/accessible to unauthorized users
- Attempts to read/write raise AccessError
- Can specify multiple groups (comma-separated)

---

## View System

### View Types

**Location**: `views/*.xml`

1. **Form** - Detail view (single record)
2. **List** (Tree) - Table view (multiple records)
3. **Kanban** - Card/board view
4. **Graph** - Charts (bar, line, pie)
5. **Pivot** - Pivot table
6. **Calendar** - Calendar view
7. **Gantt** - Gantt chart
8. **Map** - Geographic map
9. **Activity** - Activity timeline
10. **Search** - Search filters and groupby

### Form View

```xml
<record id="view_partner_form" model="ir.ui.view">
    <field name="name">res.partner.form</field>
    <field name="model">res.partner</field>
    <field name="arch" type="xml">
        <form string="Contact">
            <sheet>
                <field name="image" widget="image"/>
                <group>
                    <group>
                        <field name="name" required="1"/>
                        <field name="email" widget="email"/>
                    </group>
                    <group>
                        <field name="phone"/>
                        <field name="mobile"/>
                    </group>
                </group>
                <notebook>
                    <page string="Sales">
                        <field name="opportunity_ids"/>
                    </page>
                </notebook>
            </sheet>
            <div class="oe_chatter">
                <field name="message_follower_ids"/>
                <field name="message_ids"/>
            </div>
        </form>
    </field>
</record>
```

**Form elements**:
- `<sheet>` - Main content area
- `<header>` - Status bar and buttons
- `<group>` - Column layout
- `<notebook>` / `<page>` - Tabs
- `<field>` - Field widget
- `<button>` - Action button
- `<div class="oe_chatter">` - Activity/message feed

### List View

```xml
<record id="view_partner_tree" model="ir.ui.view">
    <field name="name">res.partner.tree</field>
    <field name="model">res.partner</field>
    <field name="arch" type="xml">
        <tree string="Contacts" multi_edit="1">
            <field name="name"/>
            <field name="email"/>
            <field name="phone"/>
            <field name="country_id"/>
        </tree>
    </field>
</record>
```

**Attributes**:
- `editable="bottom"` - Inline edit (new row at bottom)
- `editable="top"` - Inline edit (new row at top)
- `multi_edit="1"` - Bulk edit multiple rows
- `decoration-*` - Conditional row styling

### Kanban View

```xml
<kanban default_group_by="stage_id">
    <field name="color"/>
    <templates>
        <t t-name="kanban-box">
            <div class="oe_kanban_card">
                <div class="oe_kanban_content">
                    <strong><field name="name"/></strong>
                    <div><field name="partner_id"/></div>
                </div>
            </div>
        </t>
    </templates>
</kanban>
```

**QWeb templates** - Kanban uses QWeb templating for card layout

### Actions & Menus

**Window Action**:
```xml
<record id="action_partner" model="ir.actions.act_window">
    <field name="name">Contacts</field>
    <field name="res_model">res.partner</field>
    <field name="view_mode">kanban,tree,form</field>
    <field name="context">{'default_type': 'contact'}</field>
    <field name="domain">[('customer_rank', '>', 0)]</field>
</record>
```

**Menu Item**:
```xml
<menuitem id="menu_partner" 
          name="Contacts" 
          action="action_partner"
          parent="base.menu_custom"
          sequence="10"/>
```

**Menu hierarchy**:
```
Apps (root)
├── Sales
│   ├── Orders
│   ├── Customers
│   └── Products
├── Invoicing
└── ...
```

---

## Web Client (OWL Framework)

### OWL (Odoo Web Library)

**Location**: `addons/web/static/src/`

**OWL** is Odoo's reactive component framework (similar to React/Vue):
- Class-based components
- Reactive state with hooks
- Template-based (XML)
- Built-in services (RPC, user, company, etc.)

### Component Structure

```javascript
/** @odoo-module **/
import { Component } from "@odoo/owl";

export class MyComponent extends Component {
    static template = "my_module.MyTemplate";
    static props = {
        value: String,
        onChange: Function,
    };
    
    setup() {
        // Lifecycle: runs once on creation
        this.state = useState({ count: 0 });
    }
    
    increment() {
        this.state.count++;
    }
}
```

**Template (XML)**:
```xml
<t t-name="my_module.MyTemplate">
    <div class="my-component">
        <span t-esc="props.value"/>
        <button t-on-click="increment">
            Count: <t t-esc="state.count"/>
        </button>
    </div>
</t>
```

### Web Client Architecture

```
Web Client
├── WebClient (root component)
├── NavBar (top navigation)
├── ActionContainer
│   └── Views (Form, List, Kanban, etc.)
├── ControlPanel (search, filters, buttons)
└── Services
    ├── rpc (server communication)
    ├── orm (ORM methods)
    ├── action (execute actions)
    ├── notification (show messages)
    ├── dialog (modal dialogs)
    └── user (current user info)
```

### Key Services

**RPC Service**:
```javascript
import { useService } from "@web/core/utils/hooks";

setup() {
    this.rpc = useService("rpc");
}

async loadData() {
    const result = await this.rpc("/web/dataset/call_kw", {
        model: "res.partner",
        method: "search_read",
        args: [[], ["name", "email"]],
        kwargs: {},
    });
}
```

**ORM Service** (higher-level):
```javascript
this.orm = useService("orm");

// Search
const partners = await this.orm.searchRead(
    "res.partner",
    [["customer_rank", ">", 0]],
    ["name", "email"]
);

// Create
const id = await this.orm.create("res.partner", {
    name: "John Doe",
});

// Update
await this.orm.write("res.partner", [id], {
    phone: "123456",
});

// Delete
await this.orm.unlink("res.partner", [id]);
```

### Views (Client-Side)

Each view type has:
1. **Controller** - Orchestrates view logic
2. **Renderer** - Renders the view (component)
3. **Model** - Manages data and state
4. **Arch Parser** - Parses XML view definition

**Example: List View**
```
ListController
├── ListRenderer (displays table)
├── ListModel (loads/manages records)
└── SearchPanel (optional)
```

---

## RPC Communication

### JSON-RPC Protocol

**Endpoint**: `/web/dataset/call_kw`

**Request**:
```json
{
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "model": "res.partner",
        "method": "search_read",
        "args": [
            [["customer_rank", ">", 0]],
            ["name", "email", "phone"]
        ],
        "kwargs": {
            "limit": 80,
            "offset": 0,
            "context": {"lang": "en_US"}
        }
    },
    "id": 123
}
```

**Response**:
```json
{
    "jsonrpc": "2.0",
    "id": 123,
    "result": [
        {"id": 1, "name": "John Doe", "email": "john@example.com", "phone": "123"},
        {"id": 2, "name": "Jane Smith", "email": "jane@example.com", "phone": "456"}
    ]
}
```

### Common RPC Methods

**Model methods**:
- `search` - Search for record IDs
- `read` - Read fields by ID
- `search_read` - Combined search + read
- `create` - Create new record
- `write` - Update records
- `unlink` - Delete records
- `name_search` - Search for display names (autocomplete)
- `name_get` - Get display names by IDs
- `fields_get` - Get model field definitions
- `default_get` - Get default values for fields

**Custom methods** - Any public model method can be called via RPC

### Session & Authentication

**Session management**:
- Session stored in cookie
- Session data in PostgreSQL (`ir_http.get_session()`)
- Includes: user ID, database, context (lang, tz)

**Authentication flow**:
1. POST to `/web/session/authenticate`
2. Server validates credentials
3. Creates session, returns session ID
4. Subsequent requests include session cookie
5. Server validates session on each request

---

## QWeb Reports

### QWeb Template Engine

**QWeb** is Odoo's XML-based templating engine:
- Used for reports (PDF)
- Used for web views
- Used for emails

### Report Definition

```xml
<record id="action_report_invoice" model="ir.actions.report">
    <field name="name">Invoice</field>
    <field name="model">account.move</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">account.report_invoice</field>
    <field name="report_file">account.report_invoice</field>
    <field name="binding_model_id" ref="model_account_move"/>
</record>
```

### Report Template

```xml
<template id="report_invoice">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="doc">
            <t t-call="web.external_layout">
                <div class="page">
                    <h2>Invoice: <span t-field="doc.name"/></h2>
                    <div>
                        <strong>Customer:</strong>
                        <span t-field="doc.partner_id"/>
                    </div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            <t t-foreach="doc.invoice_line_ids" t-as="line">
                                <tr>
                                    <td><span t-field="line.product_id"/></td>
                                    <td><span t-field="line.quantity"/></td>
                                    <td><span t-field="line.price_unit"/></td>
                                </tr>
                            </t>
                        </tbody>
                    </table>
                </div>
            </t>
        </t>
    </t>
</template>
```

**QWeb directives**:
- `t-field` - Display field value with formatting
- `t-esc` - Escape and display value
- `t-raw` - Display raw HTML (dangerous)
- `t-if` - Conditional rendering
- `t-foreach` / `t-as` - Loop over collection
- `t-call` - Include another template

### Report Generation

**PDF generation**:
1. Render QWeb template to HTML
2. Convert HTML to PDF using wkhtmltopdf
3. Return PDF file to user

**Formats**:
- `qweb-pdf` - PDF output
- `qweb-html` - HTML output (preview)
- `qweb-text` - Plain text output

---

## Database Layer

### PostgreSQL

**Odoo requires PostgreSQL** (9.6+ recommended, 12+ preferred)

**Key aspects**:
- One database per Odoo instance (multi-tenant possible with multiple DBs)
- Heavy use of PostgreSQL features (JSONB, arrays, full-text search, CTEs)
- Connection pooling (`sql_db.py`)

### Database Schema

**Generated automatically** from model definitions:
- One table per `Model` class
- Column per field
- Foreign key constraints for Many2one
- Junction tables for Many2many
- Indexes on foreign keys and `index=True` fields

**Example table** (from `res.partner` model):
```sql
CREATE TABLE res_partner (
    id SERIAL PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    country_id INTEGER REFERENCES res_country(id),
    create_date TIMESTAMP,
    create_uid INTEGER REFERENCES res_users(id),
    write_date TIMESTAMP,
    write_uid INTEGER REFERENCES res_users(id)
);
```

### Meta Tables

Odoo stores metadata in special tables:

1. **ir_model** - Registered models
2. **ir_model_fields** - Model fields (dynamic fields)
3. **ir_model_data** - External IDs (XML IDs)
4. **ir_module_module** - Installed modules
5. **ir_ui_view** - View definitions
6. **ir_ui_menu** - Menu structure
7. **ir_actions*** - Actions (window, server, etc.)
8. **ir_cron** - Scheduled jobs

### Cursor Management

**Database cursors** are context-managed:
```python
# In a model method
self.env.cr.execute("SELECT id, name FROM res_partner WHERE active = %s", (True,))
results = self.env.cr.fetchall()
```

**Automatic transaction management**:
- Each HTTP request = one transaction
- Commit on success, rollback on exception
- Manual savepoints for complex operations

### Performance Optimization

**Odoo ORM optimizations**:
1. **Prefetching** - Batch load related records
2. **Caching** - LRU cache for fields
3. **Lazy loading** - Load on first access
4. **Bulk operations** - `create([...])`, `write([ids], vals)`

**PostgreSQL optimizations**:
- Indexes on foreign keys
- Partial indexes for filtered queries
- GIN indexes for JSONB and arrays
- `VACUUM` and `ANALYZE` for maintenance

---

## Summary

Odoo's architecture is built on several key principles:

1. **Modular Design** - Everything is a module, modules extend each other
2. **Rich ORM** - Declarative models with automatic migrations
3. **Multi-layer Security** - Groups, ACL, record rules, field-level
4. **View-Driven UI** - XML view definitions, rendered by web client
5. **Service-Oriented** - Controllers provide JSON-RPC API
6. **Component-Based Frontend** - OWL framework for reactive UIs
7. **PostgreSQL-Native** - Leverages advanced PostgreSQL features

The architecture enables:
- **Extensibility** - Modules can extend any part of the system
- **Customizability** - Views, models, logic all overrideable
- **Multi-tenancy** - Multiple databases on one instance
- **Scalability** - Horizontal scaling via load balancing, vertical via PostgreSQL tuning

**Next Steps**: See [MODULES.md](MODULES.md) for business module architecture and [DATA_MODEL.md](DATA_MODEL.md) for entity relationships.
