export interface Config {
  templatePulse?: {
    /** Service scan limit, or database detail page size. Default 200; range 1-1000. */
    maxTasks?: number;
    /** Database uses the Scaffolder history module; service uses the bounded public API. Default service. */
    historySource?: 'database' | 'service';
    /** Maximum database filter choices and rollup groups returned. Execution history is aggregated in SQL without this row cap. Default 10000; range 1-100000. */
    maxHistoryRows?: number;
  };
}
