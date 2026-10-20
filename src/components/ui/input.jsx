import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

import { usePersianDigitsInput } from "@/hooks/use-persian-digits-input"

function Input({
  className,
  type,
  inputMode,
  dir,
  lang,
  name,
  value,
  defaultValue,
  onChange,
  onValueChange,
  placeholder,
  persianDigits = "auto",
  ref,
  ...props
}) {
  const dataPersianDigits =
    typeof props["data-persian-digits"] === "string"
      ? props["data-persian-digits"]
      : null

  const {
    enabled,
    isNumeric,
    setInputRef,
    inputProps,
    hiddenInput,
    formatPlaceholder,
    toLatinValue,
  } = usePersianDigitsInput({
    persianDigits,
    type,
    inputMode,
    dir,
    lang,
    name,
    value,
    defaultValue,
    onChange,
    "data-persian-digits": dataPersianDigits,
  })

  const composedRef = React.useCallback(
    (node) => {
      setInputRef(node)
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ;(ref).current = node
      }
    },
    [ref, setInputRef]
  )

  return (
    <>
      {hiddenInput ? <input {...hiddenInput} readOnly tabIndex={-1} /> : null}
      <InputPrimitive
        data-slot="input"
        className={cn(
          "h-9.5 w-full min-w-0 !rounded-[var(--radius-field)] rounded-[var(--radius-field)] border !border-[var(--field-border)] border-[var(--field-border)] !bg-[var(--field)] bg-[var(--field)] px-3.5 py-1 text-base text-[var(--foreground)] !shadow-[var(--field-shadow)] shadow-[var(--field-shadow)] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
        {...inputProps}
        placeholder={formatPlaceholder(placeholder)}
        ref={composedRef}
        onValueChange={(next, eventDetails) => {
          const latin =
            enabled || isNumeric
              ? toLatinValue(String(next ?? ""))
              : String(next ?? "")
          onValueChange?.(latin, eventDetails)
        }}
      />
    </>
  )
}

export { Input }
