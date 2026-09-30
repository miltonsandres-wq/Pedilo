import { PageHeader } from "@/components/ui/Card";
import { FiscalTabs } from "@/components/admin/fiscal/FormulariosFiscales";

export default function FiscalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Facturación fiscal"
        subtitle="CAI y rangos autorizados por el SAR, cajas, datos del emisor y libro de ventas."
      />
      <FiscalTabs />
      {children}
    </div>
  );
}
