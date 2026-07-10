import { createLogger } from '../utils/logger';

describe('createLogger', () => {
  afterEach(() => {
    delete process.env.DEBUG;
    jest.restoreAllMocks();
  });

  it('suppresses log() when DEBUG is not "true"', () => {
    process.env.DEBUG = 'false';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const logger = createLogger('Test');

    logger.log('hello');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits log() with the tagged prefix when DEBUG is "true"', () => {
    process.env.DEBUG = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const logger = createLogger('Test');

    logger.log('hello', 42);

    expect(logSpy).toHaveBeenCalledWith('[Kaggle Linter Test]', 'hello', 42);
  });

  it('always emits warn() and error() regardless of DEBUG', () => {
    process.env.DEBUG = 'false';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logger = createLogger();

    logger.warn('careful');
    logger.error('broken');

    expect(warnSpy).toHaveBeenCalledWith('[Kaggle Linter]', 'careful');
    expect(errorSpy).toHaveBeenCalledWith('[Kaggle Linter]', 'broken');
  });
});
