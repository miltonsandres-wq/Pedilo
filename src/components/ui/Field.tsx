import { inputClass, labelClass, cn } from "@/lib/ui";

type BaseProps = {
  label: string;
  name: string;
  full?: boolean;
  className?: string;
};

export function Field({
  label,
  full,
  className,
  ...props
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={full ? "col-span-full" : undefined}>
      <label className={labelClass}>{label}</label>
      <input {...props} name={props.name} className={cn(inputClass, className)} />
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
  return (
    <div className={full ? "col-span-full" : undefined}>
      <label className={labelClass}>{label}</label>
      <select {...props} className={cn(inputClass, className)}>
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
  return (
    <div className={full ? "col-span-full" : undefined}>
      <label className={labelClass}>{label}</label>
      <textarea {...props} className={cn(inputClass, "min-h-20", className)} />
    </div>
  );
}
