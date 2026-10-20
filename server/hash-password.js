import bcrypt from 'bcryptjs';

const hash = bcrypt.hashSync(process.argv[2] || 'admin', 12);
console.log(hash);