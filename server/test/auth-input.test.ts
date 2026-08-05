import { strict as assert } from 'node:assert';
import { validate } from 'class-validator';
import { EmailRequestDto, LoginDto, RegisterDto } from '../src/auth/dto';

async function errors<T extends object>(type: new () => T, value: Partial<T>) {
  return validate(Object.assign(new type(), value));
}

async function main() {
  assert.equal((await errors(LoginDto, { email: 'person@example.com', password: 'Password1' })).length, 0);
  assert.ok((await errors(LoginDto, { email: 'person@example.com', password: 'x'.repeat(65) })).some((error) => error.property === 'password'));
  assert.ok((await errors(LoginDto, { email: `${'a'.repeat(245)}@example.com`, password: 'Password1' })).some((error) => error.property === 'email'));
  assert.ok((await errors(EmailRequestDto, { email: `${'a'.repeat(245)}@example.com` })).some((error) => error.property === 'email'));
  assert.ok((await errors(RegisterDto, { email: 'person@example.com', username: 'Bad  Double', password: 'Password1' })).some((error) => error.property === 'username'));
  console.log('Authentication input-bound tests passed');
}

void main();
