import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { sampleStatementCsv } from '../shared/sample-statement.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('bank import', () => {
  it('leaves the seeded statement unmatched so the books stay put', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const listed = await call('/api/bank/statements', maya)
    const statement = (listed.body as unknown as Array<{ id: number; name: string; lines: Array<{ reconciled: number }> }>).find((row) => row.name === 'Jiangbei October statement')
    expect(statement?.lines.length).toBe(8)
    expect(statement?.lines.every((line) => line.reconciled === 0)).toBe(true)
    const detail = await call(`/api/bank/statements/${statement?.id}`, maya)
    expect(detail.status).toBe(200)
    const body = detail.body as {
      suggestions: Record<string, Array<{ kind: string; invoiceName?: string; label: string }>>
      difference: number
      statement: { lines: Array<{ id: number; reference: string }> }
    }
    const milo = body.statement.lines.find((line) => line.reference === 'INV-S2003')
    const ideas = body.suggestions[String(milo?.id)] ?? []
    expect(ideas.some((idea) => idea.kind === 'invoice' && idea.invoiceName === 'INV-S2003')).toBe(true)
    const fee = body.statement.lines.find((line) => line.reference === 'FEE-OCT')
    const feeIdeas = body.suggestions[String(fee?.id)] ?? []
    expect(feeIdeas.some((idea) => idea.kind === 'rule')).toBe(true)
    const paid = body.statement.lines.find((line) => line.reference === 'INV-S2001')
    const paidIdeas = body.suggestions[String(paid?.id)] ?? []
    expect(paidIdeas.some((idea) => idea.kind === 'payment')).toBe(true)
    expect((await call(`/api/bank/statements/${statement?.id}`, amira)).status).toBe(404)
    expect(typeof body.difference).toBe('number')
  })

  it('skips a file whose lines were already imported and reads OFX', async () => {
    const again = await call('/api/bank/statements', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'October again',
        csv: sampleStatementCsv,
        mapping: { date: 'date', description: 'description', amount: 'amount', reference: 'reference' },
      }),
    })
    expect(again.status).toBe(409)
    const ofx = await call('/api/bank/statements', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'OFX October',
        ofx: '<STMTTRN><DTPOSTED>20261018<TRNAMT>-12.50<FITID>OFX-1<NAME>CARD FEE</NAME><MEMO>OFX-1</MEMO></STMTTRN>',
      }),
    })
    expect(ofx.status).toBe(201)
    const line = (ofx.body as { lines: Array<{ amount: number; label: string; reference: string }> }).lines[0]
    expect(line?.amount).toBe(-12.5)
    expect(line?.reference).toBe('OFX-1')
  })

  it('posts a bank fee from a rule and matches part of an open invoice', async () => {
    const listed = await call('/api/bank/statements', maya)
    const statement = (listed.body as unknown as Array<{ id: number; name: string }>).find((row) => row.name === 'Jiangbei October statement')
    const detail = await call(`/api/bank/statements/${statement?.id}`, maya)
    const body = detail.body as { statement: { lines: Array<{ id: number; reference: string }> } }
    const fee = body.statement.lines.find((line) => line.reference === 'FEE-OCT')
    const applied = await call(`/api/bank/lines/${fee?.id}/apply`, maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'rule', action: 'fee', accountCode: '6607' }),
    })
    expect(applied.status).toBe(200)
    expect((applied.body as { reconciled: number }).reconciled).toBe(15)
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { company: { name: 'Jiangbei Goods Co.' }, lines: { some: { label: { contains: 'BANK FEE' } } } },
      include: { lines: { include: { account: true } } },
    })
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(15)
    expect(entry.lines.some((line) => line.account.code === '6607' && line.debit === 15)).toBe(true)
    expect(entry.lines.some((line) => line.account.code === '1002' && line.credit === 15)).toBe(true)
    const partial = body.statement.lines.find((line) => line.reference === 'INV-S2005' && line.id !== fee?.id)
    const harbor = (detail.body as { statement: { lines: Array<{ id: number; reference: string; amount: number }> } }).statement.lines.find((line) => line.amount === 1000)
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { name: 'INV-S2005', company: { name: 'Jiangbei Goods Co.' } } })
    const matched = await call(`/api/bank/lines/${harbor?.id}/apply`, maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'invoice', invoiceId: invoice.id, amount: 1000 }),
    })
    expect(matched.status).toBe(200)
    const open = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(open.residual).toBe(6797)
    expect(partial?.id).toBeTruthy()
  })
})
