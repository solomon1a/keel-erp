function pdfEscape(text: string) {
  return text.replace(/[()\\]/g, (char) => `\\${char}`).replace(/[^\x20-\x7E]/g, '?')
}

export function simplePdf(lines: string[]) {
  const commands = ['BT', '/F1 12 Tf', '48 800 Td', '16 TL']
  lines.slice(0, 42).forEach((line, index) => {
    const text = `(${pdfEscape(line)}) Tj`
    commands.push(index === 0 ? text : `T* ${text}`)
  })
  commands.push('ET')
  const stream = commands.join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body))
    body += object
  }
  const xref = Buffer.byteLength(body)
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) {
    table += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  body += `${table}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body)
}
