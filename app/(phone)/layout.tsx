import { dela } from "@/app/fonts/dela";
import "./phone.css";

/**
 * The owner's phone app: single column, no rail, safe-area aware. Opened
 * from the Home Screen icon (manifest start_url /m) and from notifications.
 */
export default function PhoneLayout({ children }: LayoutProps<"/">) {
  return <div className={`ph-font ${dela.variable}`}>{children}</div>;
}
