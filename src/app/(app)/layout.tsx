import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Демо-версия интерфейса: данные условные, изменения не сохраняются
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
