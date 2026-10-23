// Prints a new encryption key for config.php ("encryptionKey"): the key that
// encrypts the names, email, phone and address of members in the database
// (model/members.md, "Encryption"). Run on a computer:
//
//     npm run encryption:key
//
// One key per instance (beta and production each their own), made once and
// never changed: what it encrypted cannot be read with another one. Keep a
// copy apart from the backups of the database, in a password manager: a lost
// key is lost data. Never commit it, never send it by email.
import { randomBytes } from 'node:crypto';

console.log(`    'encryptionKey' => '${randomBytes(32).toString('base64')}',`);
