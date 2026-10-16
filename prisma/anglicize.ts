import type { PrismaClient } from '@prisma/client'

async function renameLocation(client: PrismaClient, companyId: number, from: string, to: string) {
  await client.stockLocation.updateMany({ where: { companyId, name: from }, data: { name: to } })
}

export async function anglicizeJiangbei(client: PrismaClient, companyId: number) {
  await client.company.update({
    where: { id: companyId },
    data: {
      name: 'Jiangbei Goods Co.',
      city: 'Shanghai',
      address: '88 Jiangbei Road, Shanghai',
      currency: 'CNY',
      defaultTaxRate: 13,
    },
  })
  await client.tax.updateMany({ where: { name: '增值税' }, data: { name: 'China VAT 13%' } })
  await client.warehouse.updateMany({ where: { companyId, code: 'SH' }, data: { name: 'Shanghai Warehouse' } })
  await client.warehouse.updateMany({ where: { companyId, code: 'SZ' }, data: { name: 'Shenzhen Store' } })
  await renameLocation(client, companyId, '主库', 'Main stock')
  await renameLocation(client, companyId, '成品区', 'Finished goods')
  await renameLocation(client, companyId, '店面', 'Shop floor')
  await client.productCategory.updateMany({ where: { companyId, name: '文具' }, data: { name: 'Stationery' } })
  await client.productCategory.updateMany({ where: { companyId, name: '家居' }, data: { name: 'Home' } })
  await client.product.updateMany({
    where: { companyId, sku: 'RM-CV' },
    data: { name: 'Greige canvas', description: 'Unbleached cloth for later totes.' },
  })
  await client.product.updateMany({
    where: { companyId, sku: 'RM-YN' },
    data: { name: 'Wool yarn', description: 'Yarn for the wool blanket.' },
  })
  await client.contact.updateMany({
    where: { companyId, email: 'orders@suhang.example' },
    data: { name: 'Suhang Weaving', street: '18 Textile Road, Wuzhong', city: 'Suzhou', notes: 'Canvas and greige cloth.' },
  })
  await client.contact.updateMany({
    where: { companyId, email: 'sales@qingpu-yarn.example' },
    data: { name: 'Qingpu Yarn', street: '88 Yinggang Road, Qingpu', city: 'Shanghai', notes: 'Wool yarn.' },
  })
  await client.contact.updateMany({
    where: { companyId, email: 'lin@northline.example' },
    data: { name: 'Lin Xiao', street: '18 Jiangbei Road', city: 'Shanghai' },
  })
  await client.contact.updateMany({ where: { companyId, name: '散客' }, data: { name: 'Walk-in' } })
  await client.invoice.updateMany({
    where: { companyId, buyerName: '林晓' },
    data: { buyerName: 'Lin Xiao', buyerAddress: '18 Jiangbei Road, Shanghai' },
  })
  await client.shopCustomer.updateMany({ where: { companyId, email: 'lin@northline.example' }, data: { name: 'Lin Xiao' } })
  const fair = await client.lead.findFirst({ where: { companyId, name: '春季展会 — 帆布袋' } })
  if (fair) {
    await client.lead.update({
      where: { id: fair.id },
      data: { name: 'Spring fair — canvas totes', contactName: 'Chen Wei' },
    })
    await client.activity.updateMany({ where: { leadId: fair.id, summary: '回访报价' }, data: { summary: 'Call back with the quote' } })
  }
  const restock = await client.lead.findFirst({ where: { companyId, name: '门店补货咨询' } })
  if (restock) {
    await client.lead.update({ where: { id: restock.id }, data: { name: 'Store restock enquiry', contactName: 'Zhao Lei' } })
  }
  const sales = await client.department.findFirst({ where: { companyId, name: '销售部' } })
  if (sales) await client.department.update({ where: { id: sales.id }, data: { name: 'Sales' } })
  const plant = await client.department.findFirst({ where: { companyId, name: '生产部' } })
  if (plant) await client.department.update({ where: { id: plant.id }, data: { name: 'Production' } })
  await client.employee.updateMany({
    where: { companyId, email: 'zhou.ning@northline.example' },
    data: { name: 'Zhou Ning', jobTitle: 'Sales' },
  })
  await client.employee.updateMany({ where: { companyId, name: '何工' }, data: { name: 'He Gong', jobTitle: 'Shift lead' } })
  await client.leaveRequest.updateMany({ where: { employee: { companyId }, reason: '发烧' }, data: { reason: 'Fever' } })
  await client.leaveRequest.updateMany({ where: { employee: { companyId }, reason: '劳动节' }, data: { reason: 'Labour Day' } })
  const journals = [
    ['SAL', 'Sales'],
    ['PUR', 'Purchases'],
    ['BNK', 'Bank'],
    ['GEN', 'General'],
  ] as const
  for (const [code, name] of journals) {
    await client.journal.updateMany({ where: { companyId, code }, data: { name } })
  }
  const accounts = [
    ['1001', 'Cash'],
    ['1002', 'Bank'],
    ['1122', 'Accounts receivable'],
    ['1405', 'Inventory'],
    ['2202', 'Accounts payable'],
    ['222101', 'Output VAT'],
    ['222102', 'Input VAT'],
    ['6001', 'Sales income'],
    ['6401', 'Cost of sales'],
  ] as const
  for (const [code, name] of accounts) {
    await client.account.updateMany({ where: { companyId, code }, data: { name } })
  }
  await client.billOfMaterials.updateMany({
    where: { companyId, notes: { contains: '帆布' } },
    data: { notes: 'One tote: the body is greige canvas and the handles are wool yarn.' },
  })
  const lines = [
    ['本色帆布', 'Greige canvas'],
    ['羊毛纱', 'Wool yarn'],
  ] as const
  for (const [from, to] of lines) {
    await client.purchaseOrderLine.updateMany({ where: { order: { companyId }, description: from }, data: { description: to } })
    await client.salesOrderLine.updateMany({ where: { order: { companyId }, description: from }, data: { description: to } })
    await client.posOrderLine.updateMany({ where: { order: { companyId }, description: from }, data: { description: to } })
    await client.invoiceLine.updateMany({ where: { invoice: { companyId }, description: from }, data: { description: to } })
  }
}
