import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  label: string;
  testId: string;
}

/**
 * Non-modal menus avoid Select's automatic close on window blur/resize and its
 * page scroll lock, which can interfere with an embedded, scrollable preview.
 */
export default function LtvSelect({ value, onValueChange, options, label, testId }: Props) {
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId}
          className="inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-none focus-visible:outline-2 focus-visible:outline-amber-500"
        >
          {selectedLabel}
          <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8}
        className="z-[100] max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange} aria-label={label}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}
              className="cursor-pointer text-xs">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
