/**
 * The Mastra instance: LibSQL storage + observability with the storage
 * exporter, so every run leaves per-item traces and token usage (the cost scorer's
 * source). Agents and scorers are registered in later build steps — this file stays
 * the single assembly point.
 */
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { buildAgents } from './agents.js';
import { capturedScorer } from './scorers.js';
import { exactIR, exactISO } from '../scorers/translation-scorers.js';
import { temporalSanityScorer } from '../scorers/production.js';
import { DB_URL } from './db.js';

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'temporal', url: DB_URL }),
  agents: buildAgents(),
  scorers: { captured: capturedScorer, exactISO, exactIR, temporalSanity: temporalSanityScorer },
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'temporal-research',
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
