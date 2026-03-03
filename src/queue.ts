import { Queue, Worker } from 'bullmq';

import { redis } from './redis';
import { BonusTransaction } from './models/BonusTransaction';
import { sequelize } from './db';

const queueConnection = redis.duplicate();

export const bonusQueue = new Queue('bonusQueue', {
  connection: queueConnection,
});

let expireAccrualsWorker: Worker | null = null;

export function startExpireAccrualsWorker(): Worker {
  if (expireAccrualsWorker) {
    return expireAccrualsWorker;
  }

  expireAccrualsWorker = new Worker(
    'bonusQueue',
    async (job) => {
      if (job.name === 'expireAccruals') {
        console.log(`[worker] expireAccruals started, jobId=${job.id}`);

        await expireAccruallsJobProcess();
      }
    },
    {
      connection: redis.duplicate(),
    },
  );

  expireAccrualsWorker.on('failed', (job, err) => {
    console.error(`[worker] failed, jobId=${job?.id}`, err);
  });

  return expireAccrualsWorker;
}
export async function expireAccruallsJobProcess() {
  await sequelize.transaction(async (transaction) => {
    // Достаем все просрочыенные начисления
    const accrualTransactions = await BonusTransaction.findAll({
      where: {
        type: 'accrual',
        expires_at: {
          lt: new Date(),
        },
      },
      transaction: transaction,
      lock: transaction.LOCK.UPDATE,
    });

    for (const acrualTransaction of accrualTransactions) {
      // Создаем по ним expire requestId
      const requestId = `expire:${acrualTransaction.id}`;

      // Проверяем наличие уже списанной просроченной транзакции
      const spendTransaction = await BonusTransaction.findOne({
        where: {
          request_id: requestId,
          user_id: acrualTransaction.user_id,
        },
        transaction: transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // Если есть, то пропускаем
      if (spendTransaction) {
        continue;
      }

      // Создаем списание
      await BonusTransaction.create(
        {
          user_id: acrualTransaction.user_id,
          type: 'spend',
          amount: acrualTransaction.amount,
          request_id: requestId,
          expires_at: null,
        },
        {
          transaction: transaction,
        }
      );
    }
  });
}

