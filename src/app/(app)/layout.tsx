import Nav from "@/components/Nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      <div className="flex w-full flex-1 flex-col">{children}</div>
    </>
  );
}
