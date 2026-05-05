// Must run before any module import — sets telemetry DB to in-memory SQLite
process.env.TELEMETRY_DB = ':memory:';
