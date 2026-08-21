import { AdminAuthProvider } from "@/components/AdminAuthContext";
import { AdminShell } from "@/components/AdminShell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
