// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { AdminNav } from "@/components/admin/AdminNav";

afterEach(cleanup);

describe("menú del panel: Delivery solo si la plataforma lo habilitó", () => {
  it("sin habilitar, no aparece", () => {
    render(<AdminNav />);
    expect(screen.queryByText("Delivery")).toBeNull();
    expect(screen.getByText("Menú digital")).toBeTruthy();
  });

  it("habilitado, aparece", () => {
    render(<AdminNav delivery />);
    expect(screen.getByText("Delivery")).toBeTruthy();
  });
});
