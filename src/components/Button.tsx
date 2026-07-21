import React, { forwardRef } from "react";
import { cn } from "../lib/utils";
import { Spacing } from "./Spacing";
import { Spinner } from "./Spinner";

const ButtonForward: React.ForwardRefRenderFunction<
  HTMLButtonElement,
  {
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    loading?: boolean;
    secondary?: boolean;
    // A1111 WebUI-style "Generate" button: full-width, bold orange, no border.
    primary?: boolean;
  }
> = ({ onClick, disabled, children, loading, secondary, primary }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        primary
          ? "w-full h-12 rounded-geist bg-[#f97316] text-white font-semibold text-base whitespace-nowrap transition-colors duration-150 ease-in-out inline-flex items-center justify-center appearance-none hover:bg-[#ea580c] disabled:bg-button-disabled-color disabled:text-disabled-text-color disabled:cursor-not-allowed"
          : cn(
              "shrink-0 border-foreground border rounded-geist bg-foreground text-background px-geist-half font-geist h-10 font-medium whitespace-nowrap transition-all duration-150 ease-in-out inline-flex items-center appearance-none text-sm hover:bg-background hover:text-foreground hover:border-focused-border-color disabled:bg-button-disabled-color disabled:text-disabled-text-color disabled:border-unfocused-border-color disabled:cursor-not-allowed",
              secondary
                ? "bg-background text-foreground border-unfocused-border-color"
                : undefined,
            ),
      )}
      style={primary ? { fontFamily: "'Helvetica Neue', Arial, sans-serif" } : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {loading && (
        <>
          <Spinner size={20}></Spinner>
          <Spacing></Spacing>
        </>
      )}
      {children}
    </button>
  );
};

export const Button = forwardRef(ButtonForward);
