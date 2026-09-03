import Rail from "@/components/Rail";

/**
 * The signed-in app shell. Public legal pages live outside this group so
 * Meta's App Review team sees a plain document, not the product chrome.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app">
      <Rail />
      {children}
    </div>
  );
}
