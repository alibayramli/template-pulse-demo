import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardBody, Flex, Text } from '@backstage/ui';
import type { DailyActivity } from '@abayramli/backstage-plugin-template-pulse-common';

export function ActivityChart({
  days,
  allHistory = false,
}: {
  days: DailyActivity[];
  allHistory?: boolean;
}) {
  const chartRef = useRef<SVGSVGElement>(null);
  const instructionsId = useId();
  const [width, setWidth] = useState(960);
  const [selectedDate, setSelectedDate] = useState<string>();
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const peak = Math.max(0, ...days.map(day => day.total));
  const max = Math.max(1, peak);
  const plotWidth = Math.max(1, width - 40);
  const step = plotWidth / Math.max(1, days.length);
  const selectedIndex = days.findIndex(day => day.date === selectedDate);
  const selectedDay = days[selectedIndex];
  const describeDay = (day: DailyActivity) =>
    `${day.date} UTC: ${day.total} runs, ${day.completed} completed, ${day.failed} failed, ${day.other} active or cancelled`;
  const emptyMessage = days.length
    ? 'Select a day to see totals.'
    : 'No daily activity in this selection.';
  const ticks = days.length
    ? [
        ...new Set([
          0,
          Math.floor(days.length / 4),
          Math.floor(days.length / 2),
          Math.floor((3 * days.length) / 4),
          days.length - 1,
        ]),
      ]
    : [];
  return (
    <Card className="template-pulse-analytics-activity">
      <CardBody>
        <Flex direction="column" gap="2">
          <Flex justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
            <Text as="h2" variant="title-small">
              Daily activity
            </Text>
            <Flex gap="3" style={{ flexWrap: 'wrap' }}>
              <Text variant="body-small" color="success">
                ● Completed
              </Text>
              <Text variant="body-small" color="danger">
                ● Failed
              </Text>
              <Text variant="body-small" color="secondary">
                ● Active / cancelled
              </Text>
            </Flex>
          </Flex>
          <svg
            ref={chartRef}
            viewBox={`0 0 ${width} 124`}
            role={days.length ? 'slider' : 'img'}
            aria-label={
              days.length
                ? `Daily executions from ${days[0].date} to ${
                    days[days.length - 1].date
                  }, UTC. Peak ${peak} runs in a day.`
                : 'No daily activity in this selection.'
            }
            aria-describedby={instructionsId}
            aria-valuemin={days.length ? 0 : undefined}
            aria-valuemax={days.length ? days.length - 1 : undefined}
            aria-valuenow={days.length ? Math.max(0, selectedIndex) : undefined}
            aria-valuetext={
              days.length ? describeDay(selectedDay ?? days[0]) : undefined
            }
            tabIndex={days.length ? 0 : undefined}
            onFocus={() =>
              setSelectedDate(current =>
                days.some(day => day.date === current) ? current : days[0]?.date,
              )
            }
            onBlur={() => setSelectedDate(undefined)}
            onPointerLeave={event => {
              if (
                event.pointerType === 'mouse' &&
                document.activeElement !== chartRef.current
              )
                setSelectedDate(undefined);
            }}
            onKeyDown={event => {
              if (!days.length) return;
              let index = Math.max(0, selectedIndex);
              if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
                index -= 1;
              else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
                index += 1;
              else if (event.key === 'Home') index = 0;
              else if (event.key === 'End') index = days.length - 1;
              else return;
              event.preventDefault();
              setSelectedDate(
                days[Math.max(0, Math.min(days.length - 1, index))].date,
              );
            }}
            className="template-pulse-analytics-activity-chart"
          >
            <text x="0" y="15" fontSize="12" fill="var(--bui-fg-secondary)">
              {max}
            </text>
            <line
              x1="28"
              x2={width - 12}
              y1="18"
              y2="18"
              stroke="var(--bui-border-1)"
            />
            <line
              x1="28"
              x2={width - 12}
              y1="94"
              y2="94"
              stroke="var(--bui-border-1)"
            />
            {selectedDay && (
              <rect
                x={28 + selectedIndex * step}
                y="18"
                width={step}
                height="76"
                fill="var(--bui-bg-neutral-2)"
                pointerEvents="none"
              />
            )}
            {days.map((day, index) => {
              let y = 94;
              return (
                <g
                  key={day.date}
                  onPointerEnter={() => setSelectedDate(day.date)}
                  onPointerDown={() => setSelectedDate(day.date)}
                >
                  <title>{describeDay(day)}</title>
                  <rect
                    x={28 + index * step}
                    y="18"
                    width={step}
                    height="76"
                    fill="transparent"
                  />
                  {(['completed', 'failed', 'other'] as const).map(status => {
                    const height = (day[status] * 76) / max;
                    const color = {
                      completed: 'success',
                      failed: 'danger',
                      other: 'secondary',
                    }[status];
                    y -= height;
                    return (
                      <rect
                        key={status}
                        x={28 + index * step + step * 0.15}
                        y={y}
                        width={step * 0.7}
                        height={height}
                        fill={`var(--bui-fg-${color})`}
                        rx="2"
                      />
                    );
                  })}
                </g>
              );
            })}
            {ticks.map(index => (
              <text
                key={index}
                x={28 + index * step + step / 2}
                y="118"
                fontSize="12"
                textAnchor="middle"
                fill="var(--bui-fg-secondary)"
              >
                {days[index]?.date.slice(5)}
              </text>
            ))}
          </svg>
          <Text
            className="template-pulse-analytics-activity-details"
            variant="body-small"
            color="secondary"
          >
            {selectedDay ? describeDay(selectedDay) : emptyMessage}
          </Text>
          <Text id={instructionsId} variant="body-small" color="secondary">
            {allHistory
              ? 'Last 30 days (UTC). Totals include all history. '
              : 'Dates use UTC. '}
            Hover, tap or use arrow keys on the chart for details.
          </Text>
        </Flex>
      </CardBody>
    </Card>
  );
}

