function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStore(files: Array<{ name: string; data: Buffer }>) {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name)
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, file.data)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(file.data.length, 20)
    head.writeUInt32LE(file.data.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, name)
    offset += local.length + name.length + file.data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

function unzip(bytes: Buffer) {
  const files = new Map<string, Buffer>()
  let offset = 0
  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset)
    if (signature !== 0x04034b50) break
    const method = bytes.readUInt16LE(offset + 8)
    const size = bytes.readUInt32LE(offset + 18)
    const nameLength = bytes.readUInt16LE(offset + 26)
    const extra = bytes.readUInt16LE(offset + 28)
    const start = offset + 30 + nameLength + extra
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    if (method !== 0) throw new Error('Only uncompressed workbooks can be read here.')
    files.set(name, bytes.subarray(start, start + size))
    offset = start + size
  }
  return files
}

function xml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function columnName(index: number) {
  let name = ''
  let current = index + 1
  while (current > 0) {
    const rem = (current - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

export function rowsToXlsx(rows: string[][]) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      const ref = `${columnName(column)}${rowIndex + 1}`
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ]
  return zipStore(files)
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function xlsxToRows(bytes: Buffer) {
  const files = unzip(bytes)
  const sheet = files.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
  const rows: string[][] = []
  const rowMatches = sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)
  for (const match of rowMatches) {
    const cells: string[] = []
    const cellMatches = match[1]?.matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g) ?? []
    for (const cell of cellMatches) {
      const text = cell[1]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)
      cells.push(decodeXml(text?.[1] ?? ''))
    }
    if (cells.some((value) => value.length > 0)) rows.push(cells)
  }
  return rows
}
