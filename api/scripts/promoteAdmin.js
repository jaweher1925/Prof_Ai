/**
 * One-off CLI to promote an existing professor account to admin (or demote
 * one back). There's no self-serve "become admin" flow by design — signup
 * (api/src/functions/auth/signup.ts) always creates "professor" role
 * accounts — so the first admin has to be granted this way.
 *
 * Usage (from the api/ folder, after the account has already signed up
 * normally through /signup):
 *   node scripts/promoteAdmin.js you@example.com
 *   node scripts/promoteAdmin.js you@example.com --demote
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase()
  const demote = process.argv.includes('--demote')
  if (!email) {
    console.error('Usage: node scripts/promoteAdmin.js you@example.com [--demote]')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No account found for ${email} — sign up through the app first, then run this.`)
    process.exit(1)
  }

  const role = demote ? 'professor' : 'admin'
  await prisma.user.update({ where: { email }, data: { role } })
  console.log(`${email} is now "${role}". Log out and back in for the change to take effect (roles are baked into the session token).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
