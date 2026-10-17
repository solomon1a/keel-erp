import { Prisma, type PrismaClient } from '@prisma/client'

export function renameAdminText(value: string) {
  return value
    .replaceAll('Maya Chen', 'August')
    .replaceAll('Waiting on Maya', 'Waiting on August')
    .replaceAll('Maya’s', "August's")
    .replaceAll("Maya's", "August's")
}

export async function renameDemoAdmin(client: PrismaClient) {
  await client.user.updateMany({
    where: { email: 'maya@northline.example' },
    data: { name: 'August' },
  })

  const rows = await client.deskRecord.findMany({
    where: {
      OR: [
        { name: { contains: 'Maya' } },
        { partner: { contains: 'Maya' } },
        { owner: { contains: 'Maya' } },
        { bucket: { contains: 'Maya' } },
        { notes: { contains: 'Maya' } },
      ],
    },
  })
  for (const row of rows) {
    const next = {
      name: renameAdminText(row.name),
      partner: renameAdminText(row.partner),
      owner: renameAdminText(row.owner),
      bucket: renameAdminText(row.bucket),
      notes: renameAdminText(row.notes),
    }
    const same = next.name === row.name && next.partner === row.partner && next.owner === row.owner && next.bucket === row.bucket && next.notes === row.notes
    if (same) continue
    try {
      await client.deskRecord.update({ where: { id: row.id }, data: next })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      await client.deskRecord.update({
        where: { id: row.id },
        data: { partner: next.partner, owner: next.owner, bucket: next.bucket, notes: next.notes },
      })
    }
  }

  const settings = await client.moduleSetting.findMany({ where: { value: { contains: 'Maya' } } })
  for (const setting of settings) {
    const value = renameAdminText(setting.value)
    if (value === setting.value) continue
    await client.moduleSetting.update({ where: { id: setting.id }, data: { value } })
  }

  const people = await client.employee.findMany({ where: { name: { contains: 'Maya' } }, select: { id: true, name: true } })
  for (const person of people) {
    const name = renameAdminText(person.name)
    if (name === person.name) continue
    await client.employee.update({ where: { id: person.id }, data: { name } })
  }

  const notes = await client.chatterMessage.findMany({ where: { summary: { contains: 'Maya' } }, select: { id: true, summary: true } })
  for (const note of notes) {
    const summary = renameAdminText(note.summary)
    if (summary === note.summary) continue
    await client.chatterMessage.update({ where: { id: note.id }, data: { summary } })
  }
}
