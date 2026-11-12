import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  label: string;
  testId: string;
}

/** Render menus inside the app rather than relying on native select popups in an iframe. */
export default function LtvSelect({ value, onValueChange, options, label, testId }: Props) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        data-testid={testId}
        className="h-auto w-auto gap-2 rounded-lg border-gray-200 bg-white px-2 py-1.5 text-xs shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
