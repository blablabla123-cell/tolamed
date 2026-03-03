import { NextFunction, Request, Response } from 'express';

import { bonusQueue } from '../queue';
import { spendBonus } from '../services/bonus.service';

type AppError = Error & { status?: number };

function createAppError(message: string, status: number): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  return error;
}

export async function spendUserBonus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bodyRequestId = req.body.requestId;

    const idempotencyKey = req.headers['Idempotency-Key'];

    const requestId = bodyRequestId || idempotencyKey;

    if (!requestId) {
      throw createAppError(
        `"requestId" or "Idempotency-Key" header is required`,
        400,
      );
    }

    const amount = Number(req.body?.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      throw createAppError('Amount must be a positive integer', 400);
    }

    const dublicated = await spendBonus(req.params.id, amount, requestId);

    res.status(200).json({ success: true, dublicated: dublicated });
  } catch (error) {
    next(error);
  }
}

export async function enqueueExpireAccrualsJob(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await bonusQueue.add(
      'expireAccruals',
      {
        createdAt: new Date().toISOString(),
      },
      {
        // job id одинаковый для каждого запроса; идемпотентность соблюдается
        jobId: 'expire-accruals',
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    );

    res.json({ queued: true });
  } catch (error) {
    next(error);
  }
}
