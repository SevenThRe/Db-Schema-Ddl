import type { DbSqlCopilotRuntimeState } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  formatRuntimeLabel,
  numberValue,
} from "./sql-copilot-dialog-model";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";

export interface SqlCopilotRuntimeSettingsSectionProps {
  settings: SqlCopilotSettingsDraft;
  isSavingSettings: boolean;
  onSettingChange: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  onSaveSettings: () => void;
}

export function SqlCopilotRuntimeSettingsSection({
  settings,
  isSavingSettings,
  onSettingChange,
  onSaveSettings,
}: SqlCopilotRuntimeSettingsSectionProps) {
  return (
    <section className="space-y-3 rounded-sm border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Runtime settings</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure only local providers. No remote endpoint is supported in this phase.
          </p>
        </div>
        <Switch
          checked={settings.sqlCopilotEnabled}
          onCheckedChange={(checked) => onSettingChange("sqlCopilotEnabled", checked)}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Provider</Label>
        <Select
          value={settings.sqlCopilotProvider}
          onValueChange={(value) =>
            onSettingChange(
              "sqlCopilotProvider",
              value as SqlCopilotSettingsDraft["sqlCopilotProvider"],
            )
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ollama">Ollama service</SelectItem>
            <SelectItem value="llama_cpp_cli">llama.cpp CLI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {settings.sqlCopilotProvider === "ollama" ? (
        <SqlCopilotOllamaSettings settings={settings} onSettingChange={onSettingChange} />
      ) : (
        <SqlCopilotLlamaCppSettings settings={settings} onSettingChange={onSettingChange} />
      )}

      <SqlCopilotGenerationSettings settings={settings} onSettingChange={onSettingChange} />
      <SqlCopilotGroundingSettings settings={settings} onSettingChange={onSettingChange} />

      <div className="space-y-2">
        <Label htmlFor="sql-copilot-timeout" className="text-xs">
          Request timeout (ms)
        </Label>
        <Input
          id="sql-copilot-timeout"
          type="number"
          value={numberValue(settings.sqlCopilotRequestTimeoutMs)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotRequestTimeoutMs",
              Math.max(1_000, Number(event.target.value) || 1_000),
            )
          }
          className="h-8 text-xs"
        />
      </div>

      <Button type="button" className="w-full" onClick={onSaveSettings} disabled={isSavingSettings}>
        {isSavingSettings ? "Saving runtime settings..." : "Save runtime settings"}
      </Button>
    </section>
  );
}

function SqlCopilotOllamaSettings({
  settings,
  onSettingChange,
}: Pick<SqlCopilotRuntimeSettingsSectionProps, "settings" | "onSettingChange">) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-ollama-url" className="text-xs">
          Ollama base URL
        </Label>
        <Input
          id="sql-copilot-ollama-url"
          value={settings.sqlCopilotOllamaBaseUrl}
          onChange={(event) => onSettingChange("sqlCopilotOllamaBaseUrl", event.target.value)}
          placeholder="http://127.0.0.1:11434"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-ollama-model" className="text-xs">
          Ollama model
        </Label>
        <Input
          id="sql-copilot-ollama-model"
          value={settings.sqlCopilotOllamaModel ?? ""}
          onChange={(event) =>
            onSettingChange("sqlCopilotOllamaModel", event.target.value || undefined)
          }
          placeholder="qwen2.5-coder:3b"
          className="h-8 text-xs"
        />
      </div>
    </>
  );
}

function SqlCopilotLlamaCppSettings({
  settings,
  onSettingChange,
}: Pick<SqlCopilotRuntimeSettingsSectionProps, "settings" | "onSettingChange">) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-llama-cli" className="text-xs">
          llama.cpp CLI path
        </Label>
        <Input
          id="sql-copilot-llama-cli"
          value={settings.sqlCopilotLlamaCliPath ?? ""}
          onChange={(event) =>
            onSettingChange("sqlCopilotLlamaCliPath", event.target.value || undefined)
          }
          placeholder="C:\\models\\llama-cli.exe"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-llama-model" className="text-xs">
          GGUF model path
        </Label>
        <Input
          id="sql-copilot-llama-model"
          value={settings.sqlCopilotLlamaModelPath ?? ""}
          onChange={(event) =>
            onSettingChange("sqlCopilotLlamaModelPath", event.target.value || undefined)
          }
          placeholder="C:\\models\\sql-coder.gguf"
          className="h-8 text-xs"
        />
      </div>
    </>
  );
}

function SqlCopilotGenerationSettings({
  settings,
  onSettingChange,
}: Pick<SqlCopilotRuntimeSettingsSectionProps, "settings" | "onSettingChange">) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-max-output" className="text-xs">
          Max output tokens
        </Label>
        <Input
          id="sql-copilot-max-output"
          type="number"
          value={numberValue(settings.sqlCopilotMaxOutputTokens)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotMaxOutputTokens",
              Math.max(32, Number(event.target.value) || 32),
            )
          }
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-temperature" className="text-xs">
          Temperature
        </Label>
        <Input
          id="sql-copilot-temperature"
          type="number"
          step="0.1"
          value={numberValue(settings.sqlCopilotTemperature)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotTemperature",
              Math.max(0, Number(event.target.value) || 0),
            )
          }
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function SqlCopilotGroundingSettings({
  settings,
  onSettingChange,
}: Pick<SqlCopilotRuntimeSettingsSectionProps, "settings" | "onSettingChange">) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-max-tables" className="text-xs">
          Tables/views
        </Label>
        <Input
          id="sql-copilot-max-tables"
          type="number"
          value={numberValue(settings.sqlCopilotGroundingMaxTables)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotGroundingMaxTables",
              Math.max(1, Number(event.target.value) || 1),
            )
          }
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-max-patterns" className="text-xs">
          Memory patterns
        </Label>
        <Input
          id="sql-copilot-max-patterns"
          type="number"
          value={numberValue(settings.sqlCopilotGroundingMaxPatterns)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotGroundingMaxPatterns",
              Math.max(0, Number(event.target.value) || 0),
            )
          }
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-max-profiles" className="text-xs">
          Value profiles
        </Label>
        <Input
          id="sql-copilot-max-profiles"
          type="number"
          value={numberValue(settings.sqlCopilotGroundingMaxValueProfiles)}
          onChange={(event) =>
            onSettingChange(
              "sqlCopilotGroundingMaxValueProfiles",
              Math.max(0, Number(event.target.value) || 0),
            )
          }
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

export function SqlCopilotDiscoveredRuntimesSection({
  runtimeCards,
}: {
  runtimeCards: DbSqlCopilotRuntimeState["discoveredRuntimes"];
}) {
  return (
    <section className="space-y-3 rounded-sm border border-border bg-background p-3">
      <div>
        <div className="text-sm font-semibold">Discovered runtimes</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Availability, model presence, and transport posture are probed locally.
        </p>
      </div>
      <div className="space-y-2">
        {runtimeCards.length > 0 ? (
          runtimeCards.map((runtime) => (
            <div key={runtime.provider} className="rounded-sm border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{runtime.label}</span>
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {formatRuntimeLabel(runtime.availability)}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  resource {formatRuntimeLabel(runtime.resourceState)}
                </Badge>
              </div>
              <div className="mt-2 space-y-1">
                <RuntimeDetail label="model" value={runtime.modelId} />
                <RuntimeDetail label="endpoint" value={runtime.endpoint} />
                <RuntimeDetail label="executable" value={runtime.executablePath} />
                {runtime.discoveredModels.length > 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">discovered:</span>{" "}
                    {runtime.discoveredModels.join(", ")}
                  </div>
                ) : null}
                <RuntimeDetail label="note" value={runtime.message} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            Open the dialog with saved runtime settings to inspect local provider availability.
          </div>
        )}
      </div>
    </section>
  );
}

function RuntimeDetail({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}): JSX.Element | null {
  if (!value?.trim()) return null;
  return (
    <div className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  );
}
