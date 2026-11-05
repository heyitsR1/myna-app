import TabBar from "@/components/phone/TabBar";

export default function PhoneTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
