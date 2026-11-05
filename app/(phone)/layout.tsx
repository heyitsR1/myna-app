import "./phone.css";

/**
 * The owner's phone app: single column, no rail, safe-area aware. Opened
 * from the Home Screen icon (manifest start_url /m) and from notifications.
 */
export default function PhoneLayout({ children }: LayoutProps<"/">) {
  return children;
}
