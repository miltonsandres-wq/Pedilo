import { buttonClass, buttonVariants, buttonSizes, cn } from "@/lib/ui";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

export function Button({ variant = "primary", size = "md", className, ...props }: Props) {
  return <button {...props} className={cn(buttonClass(variant, size), className)} />;
}
