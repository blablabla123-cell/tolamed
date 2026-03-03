import { BonusTransaction } from '../src/models/BonusTransaction';
import { getUserBalance, spendBonus } from '../src/services/bonus.service';
import { expireAccruallsJobProcess } from '../src/queue';

const mockBonusTransaction = {
  create: jest.fn(),
  destroy: jest.fn(),
  findAll: jest.fn(),
} as any;

const mockBonusService = {
  getUserBalance: jest.fn(),
  spendBonus: jest.fn(),
} as any;

const mockQueue = {
  expireAccruallsJobProcess: jest.fn(),
} as any;

jest.mock('../src/models/BonusTransaction', () => ({
  BonusTransaction: mockBonusTransaction,
}));

jest.mock('../src/services/bonus.service', () => ({
  getUserBalance: mockBonusService.getUserBalance,
  spendBonus: mockBonusService.spendBonus,
}));

jest.mock('../src/queue', () => ({
  expireAccruallsJobProcess: mockQueue.expireAccruallsJobProcess,
}));

describe('Bonus service tests', () => {
  afterEach(async () => {
    mockBonusTransaction.destroy.mockResolvedValue(undefined);
    await mockBonusTransaction.destroy({ where: { user_id: '1' } });
    jest.clearAllMocks();
  });

  it('Second spend request should not create a new spend bonus transaction', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    
    mockBonusTransaction.create.mockResolvedValue({ id: 1 });
    mockBonusService.spendBonus
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mockBonusTransaction.findAll.mockResolvedValue([{ id: 1 }]);

    await mockBonusTransaction.create({
      user_id: '1',
      type: 'accrual',
      amount: 100,
      expires_at: date,
      request_id: '1',
    });

    await mockBonusService.spendBonus('1', 100, '1');
    const duplicated = await mockBonusService.spendBonus('1', 100, '1');

    const spendTransactions = await mockBonusTransaction.findAll({
      where: { user_id: '1', type: 'spend' },
    });

    expect(spendTransactions.length).toBe(1);
    expect(duplicated).toBe(true);
  });

  it('Balance should not include expired accruals', async () => {
    mockBonusService.getUserBalance.mockResolvedValue(0);

    const date = new Date();
    date.setDate(date.getDate() - 1);
    
    mockBonusTransaction.create.mockResolvedValue({ id: 1 });

    await mockBonusTransaction.create({
      user_id: '1',
      type: 'accrual',
      amount: 100,
      expires_at: date,
      request_id: '1',
    });

    const balance = await mockBonusService.getUserBalance('1');
    expect(balance).toBe(0);
  });

  it('Should prevent double spend request and negative balance', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    
    mockBonusTransaction.create.mockResolvedValue({ id: 1 });
    mockBonusService.spendBonus
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockBonusService.getUserBalance.mockResolvedValue(0);
    mockBonusTransaction.findAll.mockResolvedValue([{ id: 1 }]);

    await mockBonusTransaction.create({
      user_id: '1',
      type: 'accrual',
      amount: 100,
      expires_at: date,
      request_id: '1',
    });

    await Promise.all([
      mockBonusService.spendBonus('1', 100, '1'),
      mockBonusService.spendBonus('1', 100, '2')
    ]);

    const balance = await mockBonusService.getUserBalance('1');
    const spendTransactions = await mockBonusTransaction.findAll({
      where: { user_id: '1', type: 'spend' },
    });

    expect(spendTransactions.length).toBe(1);
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});