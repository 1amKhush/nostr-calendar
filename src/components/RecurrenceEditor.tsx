import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Radio,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useState } from "react";
import { useIntl } from "react-intl";
import { RRule } from "rrule";
import { RepeatingFrequency } from "../utils/types";
import {
  frequencyToRRule,
  getEventRRules,
} from "../utils/repeatingEventsHelper";

interface RecurrenceEditorProps {
  rules: string[];
  onChange: (rules: string[]) => void;
}

const NO_REPEAT_VALUE = "__does_not_repeat__";
const SELECT_RULE_VALUE = "__select_recurrence_rule__";
const CUSTOM_RULE_VALUE = "__custom_recurrence_rule__";

type CustomUnit = "day" | "week";
type CustomEndMode = "never" | "until" | "count";

interface CustomRuleDraft {
  interval: number;
  unit: CustomUnit;
  weekDays: string[];
  endMode: CustomEndMode;
  endDate: Dayjs | null;
  count: number;
}

interface CustomDialogTarget {
  kind: "initial" | "existing" | "pending";
  index?: number;
}

const WEEKDAY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "SU", label: "S" },
  { code: "MO", label: "M" },
  { code: "TU", label: "T" },
  { code: "WE", label: "W" },
  { code: "TH", label: "T" },
  { code: "FR", label: "F" },
  { code: "SA", label: "S" },
];

function toRRuleBody(rule: string): string {
  const trimmed = rule.trim();
  if (trimmed.toUpperCase().startsWith("RRULE:")) {
    return trimmed.slice(6).trim();
  }

  return trimmed;
}

function summarizeRecurrenceRule(rule: string): string {
  const normalizedRule = toRRuleBody(rule);
  if (!normalizedRule) {
    return rule;
  }

  try {
    const semanticLabel = RRule.fromString(`RRULE:${normalizedRule}`).toText();
    if (!semanticLabel) {
      return normalizedRule;
    }

    return semanticLabel.charAt(0).toUpperCase() + semanticLabel.slice(1);
  } catch {
    return normalizedRule;
  }
}

function parseRuleParts(rule: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const part of toRRuleBody(rule).split(";")) {
    const [rawKey, rawValue] = part.split("=", 2);
    if (!rawKey || !rawValue) {
      continue;
    }

    parsed[rawKey.toUpperCase()] = rawValue.toUpperCase();
  }

  return parsed;
}

function parseUntilDate(untilValue?: string): Dayjs | null {
  if (!untilValue) {
    return null;
  }

  const value = untilValue.trim().toUpperCase();

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return dayjs(
      new Date(
        Date.UTC(
          Number.parseInt(value.slice(0, 4), 10),
          Number.parseInt(value.slice(4, 6), 10) - 1,
          Number.parseInt(value.slice(6, 8), 10),
          Number.parseInt(value.slice(9, 11), 10),
          Number.parseInt(value.slice(11, 13), 10),
          Number.parseInt(value.slice(13, 15), 10),
        ),
      ),
    ).startOf("day");
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
        Number.parseInt(value.slice(9, 11), 10),
        Number.parseInt(value.slice(11, 13), 10),
        Number.parseInt(value.slice(13, 15), 10),
      ),
    ).startOf("day");
  }

  if (/^\d{8}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
      ),
    ).startOf("day");
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf("day") : null;
}

function formatUntilDate(date: Dayjs): string {
  return `${
    date.endOf("day").toDate().toISOString().replace(/[-:]/g, "").split(".")[0]
  }Z`;
}

function createDefaultCustomDraft(): CustomRuleDraft {
  return {
    interval: 1,
    unit: "week",
    weekDays: ["MO"],
    endMode: "never",
    endDate: dayjs().startOf("day"),
    count: 1,
  };
}

function getDraftFromRule(rule: string): CustomRuleDraft {
  const draft = createDefaultCustomDraft();
  const parsed = parseRuleParts(rule);

  if (parsed.FREQ === "DAILY") {
    draft.unit = "day";
  } else if (parsed.FREQ === "WEEKLY") {
    draft.unit = "week";
  }

  const interval = Number.parseInt(parsed.INTERVAL ?? "1", 10);
  draft.interval = Number.isFinite(interval) && interval > 0 ? interval : 1;

  if (draft.unit === "week") {
    const weekDays = (parsed.BYDAY ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) =>
        WEEKDAY_OPTIONS.some((weekday) => weekday.code === part),
      );

    if (weekDays.length > 0) {
      draft.weekDays = Array.from(new Set(weekDays));
    }
  }

  const count = Number.parseInt(parsed.COUNT ?? "", 10);
  if (Number.isFinite(count) && count > 0) {
    draft.endMode = "count";
    draft.count = count;
  } else {
    const untilDate = parseUntilDate(parsed.UNTIL);
    if (untilDate) {
      draft.endMode = "until";
      draft.endDate = untilDate;
    }
  }

  return draft;
}

function buildCustomRule(draft: CustomRuleDraft): string {
  const parts = [draft.unit === "day" ? "FREQ=DAILY" : "FREQ=WEEKLY"];

  if (draft.interval > 1) {
    parts.push(`INTERVAL=${draft.interval}`);
  }

  if (draft.unit === "week") {
    const weekDays = (draft.weekDays.length > 0 ? draft.weekDays : ["MO"]).join(
      ",",
    );
    parts.push(`BYDAY=${weekDays}`);
  }

  if (draft.endMode === "count") {
    parts.push(`COUNT=${Math.max(1, draft.count)}`);
  } else if (draft.endMode === "until" && draft.endDate) {
    parts.push(`UNTIL=${formatUntilDate(draft.endDate)}`);
  }

  return parts.join(";");
}

const recurrenceOptions: Array<{ value: string; labelId: string }> = [
  {
    value: frequencyToRRule(RepeatingFrequency.Daily)!,
    labelId: "event.daily",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Weekly)!,
    labelId: "event.weekly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Weekday)!,
    labelId: "event.weekdays",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Monthly)!,
    labelId: "event.monthly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Quarterly)!,
    labelId: "event.quarterly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Yearly)!,
    labelId: "event.yearly",
  },
];

export function RecurrenceEditor({ rules, onChange }: RecurrenceEditorProps) {
  const intl = useIntl();
  const [pendingRuleSlots, setPendingRuleSlots] = useState(0);
  const [customDialogTarget, setCustomDialogTarget] =
    useState<CustomDialogTarget | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomRuleDraft>(() =>
    createDefaultCustomDraft(),
  );

  const normalizedRules = getEventRRules({ rrules: rules });

  const updateRules = (nextRules: string[]) => {
    onChange(getEventRRules({ rrules: nextRules }));
  };

  const openCustomDialog = (target: CustomDialogTarget, seedRule?: string) => {
    setCustomDialogTarget(target);
    setCustomDraft(
      seedRule ? getDraftFromRule(seedRule) : createDefaultCustomDraft(),
    );
  };

  const closeCustomDialog = () => {
    setCustomDialogTarget(null);
  };

  const applyCustomRule = () => {
    if (!customDialogTarget) {
      return;
    }

    const customRule = buildCustomRule(customDraft);

    if (
      customDialogTarget.kind === "existing" &&
      typeof customDialogTarget.index === "number"
    ) {
      replaceRuleAt(customDialogTarget.index, customRule);
    } else if (customDialogTarget.kind === "pending") {
      updateRules([...normalizedRules, customRule]);
      setPendingRuleSlots(0);
    } else {
      updateRules([customRule]);
      setPendingRuleSlots(0);
    }

    closeCustomDialog();
  };

  const replaceRuleAt = (index: number, value: string) => {
    const nextRules = [...normalizedRules];
    nextRules[index] = value;
    updateRules(nextRules);
  };

  const removeRuleAt = (index: number) => {
    const nextRules = normalizedRules.filter(
      (_rule, currentIndex) => currentIndex !== index,
    );
    updateRules(nextRules);
    if (nextRules.length === 0) {
      setPendingRuleSlots(0);
    }
  };

  const handleExistingRuleChange = (
    index: number,
    event: SelectChangeEvent<string>,
  ) => {
    const selectedValue = event.target.value;

    if (selectedValue === NO_REPEAT_VALUE) {
      removeRuleAt(index);
      return;
    }

    if (selectedValue === CUSTOM_RULE_VALUE) {
      openCustomDialog({ kind: "existing", index }, normalizedRules[index]);
      return;
    }

    replaceRuleAt(index, selectedValue);
  };

  const handleInitialRuleChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;

    if (selectedValue === NO_REPEAT_VALUE) {
      updateRules([]);
      return;
    }

    if (selectedValue === CUSTOM_RULE_VALUE) {
      openCustomDialog({ kind: "initial" });
      return;
    }

    updateRules([selectedValue]);
    setPendingRuleSlots(0);
  };

  const handlePendingRuleChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;

    if (selectedValue === SELECT_RULE_VALUE) {
      return;
    }

    if (selectedValue === CUSTOM_RULE_VALUE) {
      openCustomDialog({ kind: "pending" });
      return;
    }

    updateRules([...normalizedRules, selectedValue]);
    setPendingRuleSlots(0);
  };

  const handleAddRule = () => {
    if (normalizedRules.length === 0 || pendingRuleSlots > 0) {
      return;
    }

    setPendingRuleSlots(1);
  };

  const selectedRules = new Set(normalizedRules);
  const canAddRule = normalizedRules.length > 0 && pendingRuleSlots === 0;
  const customDialogOpen = customDialogTarget !== null;
  const customDraftValid =
    customDraft.interval >= 1 &&
    (customDraft.unit !== "week" || customDraft.weekDays.length > 0) &&
    (customDraft.endMode !== "until" || !!customDraft.endDate) &&
    (customDraft.endMode !== "count" || customDraft.count >= 1);

  return (
    <>
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
        }}
      >
        {normalizedRules.length === 0 ? (
          <Box style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "event.selectRecurrence" })}
              </InputLabel>
              <Select
                value={NO_REPEAT_VALUE}
                label={intl.formatMessage({ id: "event.selectRecurrence" })}
                onChange={handleInitialRuleChange}
                renderValue={(selected) => {
                  if (selected === NO_REPEAT_VALUE) {
                    return intl.formatMessage({ id: "event.doesNotRepeat" });
                  }

                  return summarizeRecurrenceRule(String(selected));
                }}
              >
                <MenuItem value={NO_REPEAT_VALUE}>
                  {intl.formatMessage({ id: "event.doesNotRepeat" })}
                </MenuItem>
                {recurrenceOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {summarizeRecurrenceRule(option.value)}
                  </MenuItem>
                ))}
                <MenuItem value={CUSTOM_RULE_VALUE}>
                  {intl.formatMessage({ id: "event.customRecurrence" })}
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        ) : null}

        {normalizedRules.map((rule, index) => {
          const isCustomRule =
            !!rule &&
            !recurrenceOptions.some((option) => option.value === rule);

          return (
            <Box
              key={`rule-${index}-${rule}`}
              style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
            >
              <FormControl fullWidth size="small">
                <InputLabel>
                  {intl.formatMessage({ id: "event.selectRecurrence" })}
                </InputLabel>
                <Select
                  value={rule}
                  label={intl.formatMessage({ id: "event.selectRecurrence" })}
                  onChange={(event) => handleExistingRuleChange(index, event)}
                  renderValue={(selected) =>
                    summarizeRecurrenceRule(String(selected))
                  }
                >
                  <MenuItem value={NO_REPEAT_VALUE}>
                    {intl.formatMessage({ id: "event.doesNotRepeat" })}
                  </MenuItem>
                  {recurrenceOptions.map((option) => (
                    <MenuItem
                      key={option.value}
                      value={option.value}
                      disabled={
                        option.value !== rule && selectedRules.has(option.value)
                      }
                    >
                      {summarizeRecurrenceRule(option.value)}
                    </MenuItem>
                  ))}
                  <MenuItem value={CUSTOM_RULE_VALUE}>
                    {intl.formatMessage({ id: "event.customRecurrence" })}
                  </MenuItem>
                  {isCustomRule && (
                    <MenuItem value={rule}>
                      {summarizeRecurrenceRule(rule)}
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
              {normalizedRules.length > 1 && (
                <Button
                  color="error"
                  onClick={() => removeRuleAt(index)}
                  sx={{ mt: 0.5 }}
                >
                  {intl.formatMessage({ id: "navigation.remove" })}
                </Button>
              )}
            </Box>
          );
        })}

        {pendingRuleSlots > 0 && (
          <Box style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "event.selectRecurrenceRule" })}
              </InputLabel>
              <Select
                value={SELECT_RULE_VALUE}
                label={intl.formatMessage({ id: "event.selectRecurrenceRule" })}
                onChange={handlePendingRuleChange}
                renderValue={(selected) => {
                  if (selected === SELECT_RULE_VALUE) {
                    return intl.formatMessage({
                      id: "event.selectRecurrenceRule",
                    });
                  }

                  return summarizeRecurrenceRule(String(selected));
                }}
              >
                <MenuItem value={SELECT_RULE_VALUE}>
                  {intl.formatMessage({ id: "event.selectRecurrenceRule" })}
                </MenuItem>
                {recurrenceOptions.map((option) => (
                  <MenuItem
                    key={`pending-${option.value}`}
                    value={option.value}
                    disabled={selectedRules.has(option.value)}
                  >
                    {summarizeRecurrenceRule(option.value)}
                  </MenuItem>
                ))}
                <MenuItem value={CUSTOM_RULE_VALUE}>
                  {intl.formatMessage({ id: "event.customRecurrence" })}
                </MenuItem>
              </Select>
            </FormControl>
            <Button
              color="error"
              onClick={() => setPendingRuleSlots(0)}
              sx={{ mt: 0.5 }}
            >
              {intl.formatMessage({ id: "navigation.remove" })}
            </Button>
          </Box>
        )}

        <Box>
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddRule}
            disabled={!canAddRule}
          >
            {intl.formatMessage({ id: "event.addMoreRecurrenceRules" })}
          </Button>
        </Box>
      </Box>

      <Dialog
        open={customDialogOpen}
        onClose={closeCustomDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {intl.formatMessage({ id: "event.customRecurrenceTitle" })}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "8px !important",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.repeatEvery" })}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                size="small"
                type="number"
                value={customDraft.interval}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setCustomDraft((prev) => ({
                    ...prev,
                    interval:
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                  }));
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 84 }}
              />
              <FormControl size="small" sx={{ minWidth: 116 }}>
                <Select
                  value={customDraft.unit}
                  onChange={(event) => {
                    const nextUnit = event.target.value as CustomUnit;
                    setCustomDraft((prev) => ({
                      ...prev,
                      unit: nextUnit,
                      weekDays:
                        nextUnit === "week" && prev.weekDays.length === 0
                          ? ["MO"]
                          : prev.weekDays,
                    }));
                  }}
                >
                  <MenuItem value="day">
                    {intl.formatMessage({ id: "navigation.day" })}
                  </MenuItem>
                  <MenuItem value="week">
                    {intl.formatMessage({ id: "navigation.week" })}
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {customDraft.unit === "week" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "event.repeatOn" })}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {WEEKDAY_OPTIONS.map((weekday) => {
                  const selected = customDraft.weekDays.includes(weekday.code);

                  return (
                    <Button
                      key={weekday.code}
                      variant={selected ? "contained" : "outlined"}
                      onClick={() => {
                        setCustomDraft((prev) => {
                          const hasDay = prev.weekDays.includes(weekday.code);
                          const nextDays = hasDay
                            ? prev.weekDays.filter(
                                (day) => day !== weekday.code,
                              )
                            : [...prev.weekDays, weekday.code];

                          return {
                            ...prev,
                            weekDays: nextDays,
                          };
                        });
                      }}
                      sx={{
                        minWidth: 34,
                        width: 34,
                        height: 34,
                        borderRadius: "999px",
                        p: 0,
                        textTransform: "none",
                      }}
                    >
                      {weekday.label}
                    </Button>
                  );
                })}
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.recurrenceEnds" })}
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Radio
                size="small"
                checked={customDraft.endMode === "never"}
                onChange={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "never" }));
                }}
              />
              <Typography variant="body2">
                {intl.formatMessage({ id: "event.recurrenceEndsNever" })}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Radio
                size="small"
                checked={customDraft.endMode === "until"}
                onChange={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "until" }));
                }}
              />
              <Typography variant="body2" sx={{ minWidth: 24 }}>
                {intl.formatMessage({ id: "event.recurrenceEndsOnDate" })}
              </Typography>
              <DatePicker
                value={customDraft.endDate}
                disabled={customDraft.endMode !== "until"}
                onChange={(value) => {
                  setCustomDraft((prev) => ({
                    ...prev,
                    endMode: "until",
                    endDate: value ? value.startOf("day") : prev.endDate,
                  }));
                }}
                slotProps={{
                  textField: {
                    size: "small",
                    sx: { width: 152 },
                  },
                }}
              />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Radio
                size="small"
                checked={customDraft.endMode === "count"}
                onChange={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "count" }));
                }}
              />
              <Typography variant="body2" sx={{ minWidth: 36 }}>
                {intl.formatMessage({ id: "event.recurrenceEndsAfter" })}
              </Typography>
              <TextField
                size="small"
                type="number"
                value={customDraft.count}
                disabled={customDraft.endMode !== "count"}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setCustomDraft((prev) => ({
                    ...prev,
                    endMode: "count",
                    count: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                  }));
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 86 }}
              />
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "event.recurrenceOccurrences" })}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeCustomDialog}>
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            variant="contained"
            onClick={applyCustomRule}
            disabled={!customDraftValid}
          >
            {intl.formatMessage({ id: "navigation.save" })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
