import {
  ButtonIcon,
  Select,
  SelectItemText,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { parseEntityRef } from '@backstage/catalog-model';

export function ClearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 5v5h5M4 10a8 8 0 1 1 2 8" />
    </svg>
  );
}

export function entityFilterName(ref: string) {
  try {
    const { namespace, name } = parseEntityRef(ref);
    return namespace === 'default' ? name : `${namespace}/${name}`;
  } catch {
    return ref;
  }
}

export type EntityFilterOption = {
  id: string;
  label: string;
  description?: string;
};

export function EntityFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: EntityFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="analytics-clearable-select"
      data-active={value !== 'any' || undefined}
    >
      <Select
        label={label}
        size="small"
        selectionMode="single"
        value={value}
        items={options}
        search={
          options.length > 10
            ? {
                placeholder: `Search ${label.toLowerCase()}s…`,
                filter: (item: EntityFilterOption, query: string) =>
                  `${item.label} ${item.description ?? ''} ${item.id}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              }
            : undefined
        }
        onChange={key => onChange(String(key ?? 'any'))}
      >
        {item => (
          <SelectItemText
            id={item.id}
            title={item.label}
            description={item.description}
          />
        )}
      </Select>
      {value !== 'any' && (
        <TooltipTrigger delay={200}>
          <ButtonIcon
            className="analytics-select-clear"
            aria-label={`Clear ${label.toLowerCase()} filter`}
            variant="tertiary"
            size="small"
            icon={<ClearIcon />}
            onPress={() => onChange('any')}
          />
          <Tooltip>Clear {label.toLowerCase()} filter</Tooltip>
        </TooltipTrigger>
      )}
    </div>
  );
}
