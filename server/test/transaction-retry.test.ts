import { strict as assert } from 'node:assert';
import { runSerializable } from '../src/common/database/serializable-transaction';

async function main() {
  let attempts = 0;
  const prisma = {
    $transaction: async (operation: (tx: object) => Promise<string>) => {
      attempts++;
      if (attempts < 3) throw { code: 'P2034' };
      return operation({});
    },
  };
  const result = await runSerializable(prisma as any, async () => 'committed');
  assert.equal(result, 'committed');
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    () => runSerializable({ $transaction: async () => { attempts++; throw { code: 'P2034' }; } } as any, async () => 'never'),
    (error: any) => error.code === 'P2034',
  );
  assert.equal(attempts, 3, 'retry attempts must be bounded');
  console.log('Transaction retry tests passed');
}

void main();
