import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion — Myna",
  description: "How to request deletion of your data from Myna.",
};

export default function DataDeletionPage() {
  return (
    <>
      <h1>Data Deletion Instructions</h1>
      <div className="legal-updated">Last updated: 30 August 2026</div>

      <p>
        Myna stores messages that customers send to a business&rsquo;s Instagram, WhatsApp or
        Facebook account, along with documents the business uploads. You can ask us to delete
        that data at any time, and we will do it.
      </p>

      <h2>If you are a business using Myna</h2>
      <p>You have two options:</p>
      <ul>
        <li>
          <b>Disconnect the account yourself.</b> Remove Myna from your Instagram, Facebook Page
          or WhatsApp Business settings. This immediately stops any further data reaching us. To
          also erase what is already stored, email us as described below.
        </li>
        <li>
          <b>Ask us to delete everything.</b> Email{" "}
          <a href="mailto:toolsmxpo@gmail.com">toolsmxpo@gmail.com</a> from the address on your
          Myna account, with the subject line <b>Data deletion request</b>. Include the Instagram
          handle, Facebook Page name or WhatsApp business number you connected.
        </li>
      </ul>

      <h2>If you are a customer who messaged a business</h2>
      <p>
        Email <a href="mailto:toolsmxpo@gmail.com">toolsmxpo@gmail.com</a> with the subject line{" "}
        <b>Data deletion request</b>, and tell us:
      </p>
      <ul>
        <li>The Instagram handle, Facebook Page or WhatsApp number of the business you messaged</li>
        <li>Your own Instagram handle, Facebook name or WhatsApp number, so we can find the conversation</li>
      </ul>
      <p>
        You can also ask the business directly — they can delete the conversation from their own
        inbox.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Every message in the conversation, in both directions</li>
        <li>The customer&rsquo;s platform-assigned ID and display name</li>
        <li>For a business account: uploaded documents, their indexed contents, and stored access tokens</li>
      </ul>

      <h2>How long it takes</h2>
      <div className="legal-callout">
        <p style={{ margin: 0 }}>
          We confirm receipt within <b>7 days</b> and complete verified deletions within{" "}
          <b>30 days</b>. We reply to the same address to confirm when the data is gone.
        </p>
      </div>

      <p>
        We may need to verify that the request comes from the account holder before we act, to
        stop somebody deleting another person&rsquo;s conversation.
      </p>

      <h2>Contact</h2>
      <p>
        <b>Email:</b> <a href="mailto:toolsmxpo@gmail.com">toolsmxpo@gmail.com</a>
        <br />
        See also our <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}
