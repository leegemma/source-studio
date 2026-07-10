import React, { useCallback } from "react";
import { TemplateField } from "../../types/templates";

const FieldInput: React.FC<{
  field: TemplateField;
  value: unknown;
  onChange: (value: string | number) => void;
}> = ({ field, value, onChange }) => {
  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      onChange(field.type === "number" ? Number(e.currentTarget.value) : e.currentTarget.value);
    },
    [field.type, onChange],
  );

  if (field.type === "color") {
    return (
      <input
        type="color"
        className="h-8 w-12 rounded-geist border border-unfocused-border-color bg-background p-1"
        value={String(value)}
        onChange={onInputChange}
      />
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

export const TemplateForm: React.FC<{
  fields: TemplateField[];
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: string | number) => void;
}> = ({ fields, values, onFieldChange }) => {
  return (
    <div className="flex flex-col gap-2">
      {fields.map((field) => (
        <label key={field.key} className="flex items-center gap-3">
          <span className="text-sm text-subtitle w-16 shrink-0">{field.label}</span>
          <FieldInput
            field={field}
            value={values[field.key]}
            onChange={(value) => onFieldChange(field.key, value)}
          />
        </label>
      ))}
    </div>
  );
};
