const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Seed: SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD devem ser definidos como variáveis de ambiente.');
    process.exit(1);
  }
  const name = 'Super Admin';

  console.log('Seed: verificando SUPER_ADMIN...');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: SUPER_ADMIN já existe (${email}). Pulando.`);
    return;
  }

  // Criar company "system" para o SUPER_ADMIN
  let systemCompany = await prisma.company.findFirst({ where: { cnpj: '00000000000000' } });
  if (!systemCompany) {
    systemCompany = await prisma.company.create({
      data: {
        name: 'Ponto Digital (Sistema)',
        cnpj: '00000000000000',
        plan: 'enterprise',
        subscriptionStatus: 'ACTIVE',
      },
    });
    console.log('Seed: Company "Sistema" criada.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      companyId: systemCompany.id,
    },
  });

  console.log(`Seed: SUPER_ADMIN criado - ${email}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
