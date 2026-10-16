import { useEffect, useRef, useState } from 'react';
import {
  ButtonIcon,
  Card,
  CardBody,
  Flex,
  Skeleton,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import type { ExecutionMetrics } from '@abayramli/backstage-plugin-template-pulse-common';
import { formatDuration, formatRate } from './history';

export function AnalyticsSkeleton() {
  return (
    <Flex
      className="template-pulse-analytics-skeleton"
      direction="column"
      gap="3"
      aria-hidden="true"
    >
      <div className="template-pulse-analytics-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="template-pulse-analytics-metric" key={index}>
            <CardBody>
              <Skeleton width="55%" height={24} />
              <Skeleton width="40%" height={36} />
              <Skeleton width="85%" height={20} />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardBody>
          <Flex direction="column" gap="3">
            <Skeleton width="45%" height={24} />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} width="100%" height={32} />
            ))}
          </Flex>
        </CardBody>
      </Card>
      <Card className="template-pulse-analytics-activity">
        <CardBody>
          <Flex direction="column" gap="2">
            <Skeleton width="25%" height={24} />
            <Skeleton width="100%" height={124} />
            <Skeleton width="60%" height={20} />
          </Flex>
        </CardBody>
      </Card>
    </Flex>
  );
}

function Metric({
  label,
  value,
  hint,
  explanation,
}: {
  label: string;
  value: string;
  hint: string;
  explanation: string;
}) {
  const [isExplanationOpen, setExplanationOpen] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExplanationOpen) return undefined;

    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !infoRef.current?.contains(event.target) &&
        !explanationRef.current?.contains(event.target)
      ) {
        setExplanationOpen(false);
      }
    };

    document.addEventListener('pointerdown', dismissOnOutsidePress, true);
    return () =>
      document.removeEventListener('pointerdown', dismissOnOutsidePress, true);
  }, [isExplanationOpen]);

  return (
    <Card className="template-pulse-analytics-metric">
      <CardBody>
        <div className="template-pulse-analytics-metric-label">
          <span>{label}</span>
          <TooltipTrigger
            delay={200}
            isOpen={isExplanationOpen}
            onOpenChange={setExplanationOpen}
            shouldCloseOnPress={false}
          >
            <ButtonIcon
              ref={infoRef}
              className="template-pulse-analytics-metric-info"
              size="small"
              variant="tertiary"
              aria-label={`About ${label}`}
              icon={<span aria-hidden="true">ⓘ</span>}
              onPress={() => setExplanationOpen(open => !open)}
            />
            <Tooltip ref={explanationRef}>{explanation}</Tooltip>
          </TooltipTrigger>
        </div>
        <Text className="template-pulse-analytics-metric-value" weight="bold">
          {value}
        </Text>
        <Text variant="body-small" color="secondary">
          {hint}
        </Text>
      </CardBody>
    </Card>
  );
}

export function AnalyticsSummary({ metrics }: { metrics: ExecutionMetrics }) {
  return (
    <div className="template-pulse-analytics-metrics">
      <Metric
        label="Runs"
        value={String(metrics.total)}
        hint={`${metrics.templates} templates · ${metrics.active} active · ${metrics.cancelled} cancelled`}
        explanation="All runs for the selected dates, templates and users."
      />
      <Metric
        label="Template users"
        value={String(metrics.users)}
        hint="Users who ran a template"
        explanation="Number of users who ran these templates."
      />
      <Metric
        label="Success rate"
        value={formatRate(metrics.successRate)}
        hint={`${metrics.completed} completed · ${metrics.failed} failed`}
        explanation="Successful runs out of completed and failed runs."
      />
      <Metric
        label="Average successful run time"
        value={formatDuration(metrics.averageMs)}
        hint={`P95 ${formatDuration(metrics.p95Ms)} · ${
          metrics.timedCompleted
        } runs with timing data`}
        explanation="Includes waiting time. P95: 95% of measured successful runs finished within this time. — means no timing data."
      />
    </div>
  );
}
