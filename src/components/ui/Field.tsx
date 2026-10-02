import { useId } from "react";
import { inputClass, labelClass, cn } from "@/lib/ui";

type BaseProps = {
  label: string;
  name: string;
  full?: boolean;
  className?: string;
};

// Cada campo asocia su etiqueta con el control (for/id): así se puede tocar la
// etiqueta para enfocar el campo y los lectores de pantalla lo anuncian bien.

export function Field({
  label,
  full,
  className,
  ...props
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <div className={full ? "col-span-full min-w-0" : "min-w-0"}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input {...props} id={id} name={props.name} className={cn(inputClass, className)} />
    </div>
  );
}

export function SelectField({
  label,
  full,
  className,
  children,
  ...props
}: BaseProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <div className={full ? "col-span-full min-w-0" : "min-w-0"}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select {...props} id={id} className={cn(inputClass, className)}>
        {children}
      </select>
    </div>
  );
}

export function TextareaField({
  label,
  full,
  className,
  ...props
}: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <div className={full ? "col-span-full min-w-0" : "min-w-0"}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea {...props} id={id} className={cn(inputClass, "min-h-20", className)} />
    </div>
  );
}
