import type { PrismaClient } from '@prisma/client'

type TaxSeed = {
  code: string
  name: string
  kind: string
  amount: number
  priceInclude?: boolean
  compound?: boolean
  withholding?: boolean
  sequence: number
}

const taxes: TaxSeed[] = [
  { code: 'VAT', name: 'VAT 13%', kind: 'percent', amount: 13, sequence: 10 },
  { code: 'VAT-IN', name: 'VAT included 13%', kind: 'percent', amount: 13, priceInclude: true, sequence: 11 },
  { code: 'ZERO', name: 'Zero rate', kind: 'percent', amount: 0, sequence: 12 },
  { code: 'STAMP', name: 'Stamp', kind: 'fixed', amount: 1, sequence: 20 },
  { code: 'SUR', name: 'Surcharge', kind: 'percent', amount: 2, compound: true, sequence: 30 },
  { code: 'WHT', name: 'Withholding', kind: 'percent', amount: 5, withholding: true, sequence: 40 },
]

async function ensureTax(client: PrismaClient, companyId: number, tax: TaxSeed) {
  return client.companyTax.upsert({
    where: { companyId_code: { companyId, code: tax.code } },
    update: {
      name: tax.name,
      kind: tax.kind,
      amount: tax.amount,
      priceInclude: tax.priceInclude ?? false,
      compound: tax.compound ?? false,
      withholding: tax.withholding ?? false,
      sequence: tax.sequence,
      active: true,
    },
    create: {
      companyId,
      code: tax.code,
      name: tax.name,
      kind: tax.kind,
      amount: tax.amount,
      priceInclude: tax.priceInclude ?? false,
      compound: tax.compound ?? false,
      withholding: tax.withholding ?? false,
      sequence: tax.sequence,
    },
  })
}

async function ensureTerm(client: PrismaClient, companyId: number, name: string, lines: Array<{ sequence: number; percent: number; days: number }>) {
  const term = await client.paymentTerm.upsert({
    where: { companyId_name: { companyId, name } },
    update: {},
    create: { companyId, name },
  })
  for (const line of lines) {
    await client.paymentTermLine.upsert({
      where: { termId_sequence: { termId: term.id, sequence: line.sequence } },
      update: { percent: line.percent, days: line.days },
      create: { termId: term.id, sequence: line.sequence, percent: line.percent, days: line.days },
    })
  }
  return term
}

async function ensureGroup(client: PrismaClient, companyId: number, name: string, taxIds: number[], isDefault = false) {
  const group = await client.taxGroup.upsert({
    where: { companyId_name: { companyId, name } },
    update: { isDefault },
    create: { companyId, name, isDefault },
  })
  for (const [index, taxId] of taxIds.entries()) {
    await client.taxGroupTax.upsert({
      where: { groupId_taxId: { groupId: group.id, taxId } },
      update: { sequence: index + 1 },
      create: { groupId: group.id, taxId, sequence: index + 1 },
    })
  }
  return group
}

export async function seedPhase(client: PrismaClient) {
  const company = await client.company.findFirst({ where: { name: 'Jiangbei Goods Co.' } })
  if (!company) return
  const companyId = company.id
  await client.$executeRaw`UPDATE "Invoice" SET "dueDate" = "invoiceDate" WHERE "companyId" = ${companyId} AND "dueDate" IS NULL`
  const saved = []
  for (const tax of taxes) saved.push(await ensureTax(client, companyId, tax))
  const byCode = new Map(saved.map((tax) => [tax.code, tax]))
  const vat = byCode.get('VAT')
  const zero = byCode.get('ZERO')
  const stamp = byCode.get('STAMP')
  const surcharge = byCode.get('SUR')
  const withholding = byCode.get('WHT')
  if (!vat || !zero || !stamp || !surcharge || !withholding) return

  await ensureGroup(client, companyId, 'Standard', [vat.id], true)
  await ensureGroup(client, companyId, 'Standard plus surcharge', [vat.id, surcharge.id])
  await ensureGroup(client, companyId, 'Withholding', [vat.id, withholding.id])
  const included = byCode.get('VAT-IN')
  if (included) await ensureGroup(client, companyId, 'Included', [included.id])

  const position = await client.fiscalPosition.upsert({
    where: { companyId_name: { companyId, name: 'Export' } },
    update: { countryCode: '', partnerKind: 'company' },
    create: { companyId, name: 'Export', countryCode: '', partnerKind: 'company' },
  })
  await client.fiscalPositionMap.upsert({
    where: { positionId_taxId: { positionId: position.id, taxId: vat.id } },
    update: { replacementId: zero.id },
    create: { positionId: position.id, taxId: vat.id, replacementId: zero.id },
  })

  const immediate = await ensureTerm(client, companyId, 'Immediate', [{ sequence: 1, percent: 100, days: 0 }])
  await ensureTerm(client, companyId, 'Net 15', [{ sequence: 1, percent: 100, days: 15 }])
  const net30 = await ensureTerm(client, companyId, 'Net 30', [{ sequence: 1, percent: 100, days: 30 }])
  await ensureTerm(client, companyId, 'Net 60', [{ sequence: 1, percent: 100, days: 60 }])
  await ensureTerm(client, companyId, '50/50', [
    { sequence: 1, percent: 50, days: 0 },
    { sequence: 2, percent: 50, days: 30 },
  ])
  await client.followUpLevel.upsert({
    where: { companyId_name: { companyId, name: 'First reminder' } },
    update: { daysOverdue: 7, sequence: 1 },
    create: { companyId, name: 'First reminder', daysOverdue: 7, sequence: 1 },
  })
  await client.followUpLevel.upsert({
    where: { companyId_name: { companyId, name: 'Second reminder' } },
    update: { daysOverdue: 21, sequence: 2 },
    create: { companyId, name: 'Second reminder', daysOverdue: 21, sequence: 2 },
  })

  const trade = await client.priceList.findFirst({ where: { companyId, name: 'Trade' } })
  const cedar = await client.contact.findFirst({ where: { companyId, name: 'Cedar & Co' } })
  if (trade && cedar) {
    await client.contact.update({
      where: { id: cedar.id },
      data: { salePriceListId: trade.id, paymentTermId: net30.id, fiscalPositionId: position.id },
    })
  }

  const yarn = await client.product.findFirst({ where: { companyId, sku: 'RM-YN' } })
  const mill = await client.contact.findFirst({ where: { companyId, name: 'Brightmill Supply' } })
  if (yarn && mill) {
    const list = await client.priceList.upsert({
      where: { companyId_name: { companyId, name: 'Mill' } },
      update: { side: 'purchase' },
      create: { companyId, name: 'Mill', side: 'purchase' },
    })
    await client.priceListItem.upsert({
      where: { priceListId_productId_minQty: { priceListId: list.id, productId: yarn.id, minQty: 10 } },
      update: { price: 6 },
      create: { priceListId: list.id, productId: yarn.id, minQty: 10, price: 6 },
    })
    await client.contact.update({ where: { id: mill.id }, data: { purchasePriceListId: list.id, paymentTermId: immediate.id } })
  }

  if (cedar) {
    await client.recurringInvoice.upsert({
      where: { companyId_name: { companyId, name: 'Cedar retainer' } },
      update: { active: true },
      create: {
        companyId,
        partnerId: cedar.id,
        name: 'Cedar retainer',
        intervalDays: 30,
        nextDate: new Date('2027-01-15T00:00:00.000Z'),
        description: 'Monthly studio retainer',
        quantity: 1,
        unitPrice: 800,
        taxRate: 13,
      },
    })
  }

  const marked = await client.documentTax.findFirst({ where: { companyId, model: 'phase.seed' } })
  if (!marked) {
    await client.documentTax.create({
      data: { companyId, taxId: vat.id, model: 'phase.seed', recordId: 0, base: 100, amount: 13, withheld: false },
    })
    await client.documentTax.create({
      data: { companyId, taxId: withholding.id, model: 'phase.seed', recordId: 0, base: 100, amount: 5, withheld: true },
    })
  }
}
