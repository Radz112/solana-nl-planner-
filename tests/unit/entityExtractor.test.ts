import { extractEntities } from '../../src/services/entityExtractor';

const mockCreate = jest.fn();

// Mock so every `new Anthropic()` shares the same mockCreate
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

function makeResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('entityExtractor', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('extracts a simple swap intent', async () => {
    const extraction = {
      action_type: 'swap',
      tokens: [
        { ticker: 'SOL', role: 'source' },
        { ticker: 'USDC', role: 'destination' },
      ],
      amounts: [{ value: 2.0, ticker: 'SOL' }],
      destination: null,
      slippage_bps: 100,
      priority_fee_lamports: null,
      protocol_preference: 'jupiter',
      raw_confidence: 0.95,
    };

    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(extraction)));

    const result = await extractEntities(
      'Swap 2 SOL to USDC on Jupiter with 1% slippage',
      undefined,
      'test-key',
    );

    expect('entities' in result).toBe(true);
    if ('entities' in result) {
      expect(result.entities.action_type).toBe('swap');
      expect(result.entities.tokens).toHaveLength(2);
      expect(result.entities.amounts[0].value).toBe(2.0);
      expect(result.entities.slippage_bps).toBe(100);
      expect(result.entities.protocol_preference).toBe('jupiter');
    }
  });

  it('extracts a transfer intent', async () => {
    const extraction = {
      action_type: 'transfer',
      tokens: [{ ticker: 'USDC', role: 'source' }],
      amounts: [{ value: 100, ticker: 'USDC' }],
      destination: '7xKXabc123',
      slippage_bps: null,
      priority_fee_lamports: null,
      protocol_preference: null,
      raw_confidence: 0.9,
    };

    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(extraction)));

    const result = await extractEntities('Send 100 USDC to 7xKXabc123', undefined, 'test-key');

    expect('entities' in result).toBe(true);
    if ('entities' in result) {
      expect(result.entities.action_type).toBe('transfer');
      expect(result.entities.destination).toBe('7xKXabc123');
    }
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    const validExtraction = {
      action_type: 'swap',
      tokens: [{ ticker: 'SOL', role: 'source' }],
      amounts: [{ value: 1, ticker: 'SOL' }],
      destination: null,
      slippage_bps: null,
      priority_fee_lamports: null,
      protocol_preference: null,
      raw_confidence: 0.8,
    };

    // First call returns invalid text, second returns valid JSON
    mockCreate
      .mockResolvedValueOnce(makeResponse('Sure! Here is the plan...'))
      .mockResolvedValueOnce(makeResponse(JSON.stringify(validExtraction)));

    const result = await extractEntities('Swap 1 SOL', undefined, 'test-key');

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect('entities' in result).toBe(true);
  });

  it('returns error after two invalid JSON attempts', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResponse('not json'))
      .mockResolvedValueOnce(makeResponse('still not json'));

    const result = await extractEntities('Swap 1 SOL', undefined, 'test-key');

    expect('error' in result).toBe(true);
  });

  it('returns error on API failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'));

    const result = await extractEntities('Swap 1 SOL', undefined, 'test-key');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('API rate limit');
    }
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    const extraction = {
      action_type: 'stake',
      tokens: [{ ticker: 'SOL', role: 'source' }],
      amounts: [{ value: 5, ticker: 'SOL' }],
      destination: null,
      slippage_bps: null,
      priority_fee_lamports: null,
      protocol_preference: 'marinade',
      raw_confidence: 0.85,
    };

    const wrapped = '```json\n' + JSON.stringify(extraction) + '\n```';
    mockCreate.mockResolvedValueOnce(makeResponse(wrapped));

    const result = await extractEntities('Stake 5 SOL with Marinade', undefined, 'test-key');

    expect('entities' in result).toBe(true);
    if ('entities' in result) {
      expect(result.entities.action_type).toBe('stake');
    }
  });

  it('passes constraints to the model', async () => {
    const extraction = {
      action_type: 'swap',
      tokens: [{ ticker: 'SOL', role: 'source' }],
      amounts: [{ value: 1, ticker: 'SOL' }],
      destination: null,
      slippage_bps: 50,
      priority_fee_lamports: null,
      protocol_preference: null,
      raw_confidence: 0.9,
    };

    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(extraction)));

    await extractEntities('Swap 1 SOL', { max_slippage_bps: 50 }, 'test-key');

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain('max_slippage_bps');
  });

  it('truncates very long prompts', async () => {
    const extraction = {
      action_type: 'unknown',
      tokens: [],
      amounts: [],
      destination: null,
      slippage_bps: null,
      priority_fee_lamports: null,
      protocol_preference: null,
      raw_confidence: 0.1,
    };

    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(extraction)));

    const longPrompt = 'a'.repeat(10_000);
    await extractEntities(longPrompt, undefined, 'test-key');

    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    // The prompt inside the user message should be truncated
    expect(userMsg.length).toBeLessThan(10_000);
  });
});
