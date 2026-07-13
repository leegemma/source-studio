import React, { useCallback } from "react";
import { TemplateField } from "../../types/templates";

const FieldInput: React.FC<{
  field: TemplateField;
  value: unknown;
  onChange: (value: string | number) => void;
}> = ({ field, value, onChange }) => {
  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      onChange(
        field.type === "number" || field.type === "slider"
          ? Number(e.currentTarget.value)
          : e.currentTarget.value,
      );
    },
    [field.type, onChange],
  );

  if (field.type === "color") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          className="h-8 w-12 shrink-0 rounded-geist border border-unfocused-border-color bg-background p-1"
          value={String(value)}
          onChange={onInputChange}
        />
        {field.palette && field.palette.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {field.palette.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => onChange(hex)}
                className={`h-6 w-6 shrink-0 rounded-full border transition-transform duration-100 ease-in-out hover:scale-110 ${
                  String(value).toLowerCase() === hex.toLowerCase()
                    ? "border-foreground"
                    : "border-unfocused-border-color"
                }`}
                style={{ background: hex }}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (field.type === "slider") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(value)}
          onChange={onInputChange}
          className="flex-1 accent-[#f97316]"
        />
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(value)}
          onChange={onInputChange}
          className="w-16 shrink-0 leading-[1.4] rounded-geist bg-background px-2 py-1 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
        />
      </div>
    );
  }

  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      autoComplete="off"
      className={`leading-[1.4] rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color transition-colors duration-150 ease-in-out focus:border-focused-border-color outline-none ${
        field.type === "number" ? "w-20" : "w-56"
      }`}
      value={String(value)}
      onChange={onInputChange}
    />
  );
};

const FieldRow: React.FC<{
  field: TemplateField;
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: string | number) => void;
  pairedColorField?: TemplateField;
}> = ({ field, values, onFieldChange, pairedColorField }) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-subtitle">{field.label}</span>
      <FieldInput
        field={field}
        value={values[field.key]}
        onChange={(value) => onFieldChange(field.key, value)}
      />
    </div>
    {pairedColorField ? (
      <div className="flex flex-col gap-1.5 pl-3 border-l border-unfocused-border-color">
        <span className="text-sm text-subtitle">{pairedColorField.label}</span>
        <FieldInput
          field={pairedColorField}
          value={values[pairedColorField.key]}
          onChange={(value) => onFieldChange(pairedColorField.key, value)}
        />
      </div>
    ) : null}
  </div>
);

const FieldGroup: React.FC<{
  title: string;
  fields: TemplateField[];
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: string | number) => void;
  fieldsByKey: Map<string, TemplateField>;
}> = ({ title, fields, values, onFieldChange, fieldsByKey }) => {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs uppercase tracking-wide text-subtitle/70">{title}</span>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            values={values}
            onFieldChange={onFieldChange}
            pairedColorField={
              field.pairColorKey ? fieldsByKey.get(field.pairColorKey) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
};

export const TemplateForm: React.FC<{
  fields: TemplateField[];
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: string | number) => void;
}> = ({ fields, values, onFieldChange }) => {
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const pairedColorKeys = new Set(
    fields.map((f) => f.pairColorKey).filter((k): k is string => Boolean(k)),
  );
  const textFields = fields.filter((f) => f.type !== "color");
  const colorFields = fields.filter(
    (f) => f.type === "color" && !pairedColorKeys.has(f.key),
  );

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup
        title="텍스트"
        fields={textFields}
        values={values}
        onFieldChange={onFieldChange}
        fieldsByKey={fieldsByKey}
      />
      <FieldGroup
        title="색상"
        fields={colorFields}
        values={values}
        onFieldChange={onFieldChange}
        fieldsByKey={fieldsByKey}
      />
    </div>
  );
};
