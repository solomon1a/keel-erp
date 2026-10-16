import { Prisma, type PrismaClient } from '@prisma/client'
import { deskScreens } from '../shared/desk-screens.ts'

type DeskDb = PrismaClient | Prisma.TransactionClient

export async function seedDeskForCompany(client: DeskDb, companyId: number) {
  const company = await client.company.findUnique({ where: { id: companyId }, select: { countryCode: true } })
  const country = company?.countryCode || 'CN'
  const screens = deskScreens.filter((screen) => !screen.countries || screen.countries.includes(country))
  const existing = await client.deskRecord.findMany({
    where: { companyId },
    select: { module: true, screen: true, name: true },
  })
  const have = new Set(existing.map((row) => `${row.module}\0${row.screen}\0${row.name}`))
  const missing = []
  for (const screen of screens) {
    for (const row of screen.rows) {
      const key = `${screen.module}\0${screen.screen}\0${row.name}`
      if (have.has(key)) continue
      missing.push({
        companyId,
        module: screen.module,
        screen: screen.screen,
        name: row.name,
        state: row.state,
        partner: row.partner ?? '',
        owner: row.owner ?? '',
        bucket: row.bucket ?? '',
        amount: row.amount ?? 0,
        notes: row.notes ?? '',
        recordDate: row.recordDate ? new Date(row.recordDate) : new Date(),
      })
    }
  }
  if (missing.length > 0) await client.deskRecord.createMany({ data: missing, skipDuplicates: true })

  const settings = await client.moduleSetting.findMany({
    where: { companyId },
    select: { module: true, key: true },
  })
  const haveSettings = new Set(settings.map((row) => `${row.module}\0${row.key}`))
  const settingRows = []
  for (const screen of screens) {
    for (const field of screen.settings) {
      const key = `${screen.module}\0${field.key}`
      if (haveSettings.has(key)) continue
      settingRows.push({ companyId, module: screen.module, key: field.key, value: field.byCountry?.[country] ?? field.value })
    }
  }
  if (settingRows.length > 0) await client.moduleSetting.createMany({ data: settingRows, skipDuplicates: true })
}

export async function seedDesk(client: PrismaClient) {
  const companies = await client.company.findMany({ select: { id: true } })
  for (const company of companies) await seedDeskForCompany(client, company.id)
}
