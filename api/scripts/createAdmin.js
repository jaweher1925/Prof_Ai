/**
 * Creates (or upgrades) a ready-to-use admin account in one step — combines
 * what would otherwise be "sign up through /signup, then run
 * promoteAdmin.js" into a single command, for standing up the very first
 * admin account on a fresh DB.
 *
 * Usage (from the api/ folder):
 *   node scripts/createAdmin.js [email] [password] [name]
 *
 * Defaults to the admin account requested for this project:
 *   email: admin@gmail.com   password: admin123   name: admin
 *
 * If the email already exists, this just promotes it to role "admin" and
 * leaves its existing password alone (never overwrites a real password
 * silently).
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function main() {
  const email = (process.argv[2] || 'admin@gmail.com').trim().toLowerCase()
  const password = process.argv[3] || 'admin123'
  const name = process.argv[4] || 'admin'

  if (!EMAIL_RE.test(email)) {
    console.error(`"${email}" isn't a valid email address.`)
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters (same rule as the signup form).')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`${email} already exists and is already an admin — nothing to do.`)
      return
    }
    await prisma.user.update({ where: { email }, data: { role: 'admin' } })
    console.log(`${email} already existed as "${existing.role}" — promoted to "admin". Existing password unchanged.`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { email, passwordHash, name, role: 'admin' } })
  console.log(`Created admin account:`)
  console.log(`  email:    ${email}`)
  console.log(`  password: ${password}`)
  console.log(`  name:     ${name}`)
  console.log(`Log in at /login with these credentials — you'll land on /admin.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
