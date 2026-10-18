import net from 'node:net'
import tls from 'node:tls'
import { AppError } from '../errors.ts'

export type Mail = { to: string; subject: string; text: string }

export type MailChannel = 'resend' | 'smtp' | 'log'

export type MailResult = { emailed: boolean; channel: MailChannel }

function mailbox(from: string) {
  const wrapped = from.match(/<([^>]+)>/)
  return (wrapped?.[1] ?? from).trim()
}

function requireFrom() {
  const from = process.env.MAIL_FROM?.trim()
  if (!from) throw new AppError(500, 'MAIL_FROM is required to send invite email.')
  return from
}

async function sendResend(mail: Mail): Promise<void> {
  const from = requireFrom()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
  })
  if (!response.ok) throw new AppError(502, 'The invite email could not be sent.')
}

function readSmtp(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let data = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new AppError(502, 'The mail server did not answer.'))
    }, 12_000)
    const onData = (chunk: Buffer) => {
      data += chunk.toString('utf8')
      const lines = data.split(/\r?\n/).filter((line) => line.length > 0)
      const last = lines[lines.length - 1] ?? ''
      if (/^\d{3} /.test(last)) {
        clearTimeout(timer)
        socket.off('data', onData)
        resolve(data)
      }
    }
    socket.on('data', onData)
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function command(socket: net.Socket, line: string | null) {
  if (line != null) socket.write(`${line}\r\n`)
  const reply = await readSmtp(socket)
  const code = Number(reply.trim().split(/\s/)[0])
  if (code >= 400) throw new AppError(502, 'The mail server refused the invite.')
  return reply
}

async function sendSmtp(mail: Mail): Promise<void> {
  const from = requireFrom()
  const host = process.env.SMTP_HOST ?? ''
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER ?? ''
  const pass = process.env.SMTP_PASS ?? ''
  const socket = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port })
  try {
    await command(socket, null)
    await command(socket, 'EHLO keel')
    let current: net.Socket = socket
    if (port !== 465) {
      await command(socket, 'STARTTLS')
      const secure = tls.connect({ socket, servername: host })
      await new Promise<void>((resolve, reject) => {
        secure.once('secureConnect', () => resolve())
        secure.once('error', reject)
      })
      current = secure
      await command(current, 'EHLO keel')
    }
    if (user) {
      await command(current, 'AUTH LOGIN')
      await command(current, Buffer.from(user).toString('base64'))
      await command(current, Buffer.from(pass).toString('base64'))
    }
    await command(current, `MAIL FROM:<${mailbox(from)}>`)
    await command(current, `RCPT TO:<${mail.to}>`)
    await command(current, 'DATA')
    const body = [
      `From: ${from}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      mail.text,
      '.',
    ].join('\r\n')
    await command(current, body)
    await command(current, 'QUIT')
    current.end()
  } catch (error) {
    socket.destroy()
    if (error instanceof AppError) throw error
    throw new AppError(502, 'The invite email could not be sent.')
  }
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (process.env.RESEND_API_KEY) {
    await sendResend(mail)
    return { emailed: true, channel: 'resend' }
  }
  if (process.env.SMTP_HOST) {
    await sendSmtp(mail)
    return { emailed: true, channel: 'smtp' }
  }
  console.log(`KEEL INVITE\nTo: ${mail.to}\n${mail.text}`)
  return { emailed: false, channel: 'log' }
}
