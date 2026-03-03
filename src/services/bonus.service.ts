import { Transaction } from 'sequelize';
import { BonusTransaction } from '../models/BonusTransaction';
import { sequelize } from '../db';

type AppError = Error & { status?: number };

function createAppError(message: string, status: number): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  return error;
}

export async function getUserBalance(
  userId: string,
  // Передаем транзакцию, чтобы избежать гонки
  transaction: Transaction,
): Promise<number> {
  // Текущая дата
  const now = new Date();

  // Достаем все транзакции пользователя
  const bonusTransactions = await BonusTransaction.findAll({
    where: {
      user_id: userId,
    },
    transaction: transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let balance = 0;

  for (const transaction of bonusTransactions) {
    switch (transaction.type) {
      case 'accrual':
        // Если транзакция не истекла
        if (transaction.expires_at && transaction.expires_at > now) {
          // Увеличиваем баланс
          balance += transaction.amount;
        }
        break;

      case 'spend':
        // Уменьшаем баланс
        balance -= transaction.amount;
        break;
    }
  }

  // TODO: учитывать expires_at
  // TODO: учитывать spend
  // TODO: учитывать конкурентные списания
  return balance;
}

export async function spendBonus(
  userId: string,
  amount: number,
  requestId: string,
): Promise<boolean> {
  // Создаем транзакцию
  const transaction = await sequelize.transaction();

  try {
    // Проверяем есть ли уже транзакция с таким request_id
    const bonusTransaction = await BonusTransaction.findOne({
      where: {
        user_id: userId,
        request_id: requestId,
      },
      transaction: transaction,
      // Блокируем обновление строк
      lock: transaction.LOCK.UPDATE,
    });

    // Если такая транзакция есть
    if (bonusTransaction) {
      if (bonusTransaction.amount !== amount) {
        throw createAppError('Request is already processed', 409);
      }

      return true;
    }

    const balance = await getUserBalance(userId, transaction);

    // Проверяем баланс
    if (balance < amount) {
      throw createAppError('Not enough bonus', 400);
    }

    // Списываем бонус
    await BonusTransaction.create(
      {
        user_id: userId,
        type: 'spend',
        amount,
        expires_at: null,
        request_id: requestId,
      },
      {
        transaction: transaction,
      },
    );

    await transaction.commit();

    return false;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
