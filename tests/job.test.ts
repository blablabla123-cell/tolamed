const mockBonusTransaction = {
  create: jest.fn(),
  destroy: jest.fn(),
  findAll: jest.fn(),
} as any;

const mockQueue = {
  expireAccruallsJobProcess: jest.fn(),
} as any;


jest.mock('../src/queue', () => ({
  expireAccruallsJobProcess: mockQueue.expireAccruallsJobProcess,
}));
describe('Queue job request test', () => {
  it('Second job request should not create a new job', async () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    const accrualTransaction = { id: 1 };
    mockBonusTransaction.create.mockResolvedValue(accrualTransaction);
    mockQueue.expireAccruallsJobProcess
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    mockBonusTransaction.findAll.mockResolvedValue([{ id: 1 }]);

    await mockBonusTransaction.create({
      user_id: '1',
      type: 'accrual',
      amount: 100,
      expires_at: date,
      request_id: '1',
    });

    await mockQueue.expireAccruallsJobProcess();
    await mockQueue.expireAccruallsJobProcess();

    const spendTransactions = await mockBonusTransaction.findAll({
      where: { user_id: '1', request_id: `expire:${accrualTransaction.id}` },
    });

    expect(spendTransactions.length).toBe(1);
  });
});
