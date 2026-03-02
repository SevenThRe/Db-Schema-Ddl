import type {
  LengthOverflowStrategy,
  NameFixConflictStrategy,
  ReservedWordStrategy,
} from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";

interface NameFixOption<T extends string> {
  value: T;
  label: string;
}

interface NameFixDialogOptions {
  conflictStrategyOptions: NameFixOption<NameFixConflictStrategy>[];
  reservedWordStrategyOptions: NameFixOption<ReservedWordStrategy>[];
  lengthOverflowStrategyOptions: NameFixOption<LengthOverflowStrategy>[];
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function buildNameFixDialogOptions(t: TranslateFn): NameFixDialogOptions {
  return {
    conflictStrategyOptions: [
      {
        value: "suffix_increment",
        label: t("ddl.nameFix.optionConflictSuffixIncrement", {
          defaultValue: "Append number suffix (_1, _2, ...)",
        }),
      },
      {
        value: "hash_suffix",
        label: t("ddl.nameFix.optionConflictHashSuffix", {
          defaultValue: "Append short hash suffix",
        }),
      },
      {
        value: "abort",
        label: t("ddl.nameFix.optionAbort", {
          defaultValue: "Stop and report",
        }),
      },
    ],
    reservedWordStrategyOptions: [
      {
        value: "prefix",
        label: t("ddl.nameFix.optionReservedPrefix", {
          defaultValue: "Add prefix (tbl_/col_)",
        }),
      },
      {
        value: "abort",
        label: t("ddl.nameFix.optionAbort", {
          defaultValue: "Stop and report",
        }),
      },
    ],
    lengthOverflowStrategyOptions: [
      {
        value: "truncate_hash",
        label: t("ddl.nameFix.optionLengthTruncateHash", {
          defaultValue: "Trim and append hash",
        }),
      },
      {
        value: "abort",
        label: t("ddl.nameFix.optionAbort", {
          defaultValue: "Stop and report",
        }),
      },
    ],
  };
}

export function NameFixLabelWithHelp({
  label,
  helpText,
}: {
  label: string;
  helpText: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Tooltip delayDuration={350}>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-4 w-4 cursor-help items-center justify-center text-muted-foreground/80 hover:text-foreground"
            aria-hidden="true"
          >
            <CircleHelp className="w-3.5 h-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[1300] max-w-[320px] text-xs leading-5">
          {helpText}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

