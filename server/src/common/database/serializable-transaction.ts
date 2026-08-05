import { Prisma, PrismaClient } from '@prisma/client';
import { randomInt } from 'node:crypto';

const MAX_ATTEMPTS = 3;

export async function runSerializable<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === MAX_ATTEMPTS) throw error;
      const delayMilliseconds = 25 * 2 ** (attempt - 1) + randomInt(25);
      await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
    }
  }
  throw new Error('Serializable transaction retry loop exhausted');
}

function isRetryableConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2034');
}
